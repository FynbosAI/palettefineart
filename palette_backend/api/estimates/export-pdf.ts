import type { VercelRequest, VercelResponse } from '@vercel/node';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { supabaseAdmin } from '../../src/supabaseClient.js';
import { setCorsHeaders } from '../../src/utils/cors.js';

const LETTERHEAD_BUCKET = process.env.LETTERHEAD_BUCKET || 'letterhead';
const PDF_MARGIN = 36;
const DEFAULT_PAGE_WIDTH = 612; // 8.5in
const DEFAULT_PAGE_HEIGHT = 792; // 11in
const CONTENT_START_RATIO = 0.75; // start after first quarter to move content up
const SUMMARY_ROW_GAP = 8;

type ExportLineItem = {
  id: string;
  name: string;
  cost: number;
  subItems?: string[];
};

type ExportPayload = {
  quoteId: string;
  quoteTitle: string;
  quoteCode: string;
  currencyCode?: 'USD' | 'EUR' | 'GBP' | string;
  galleryName?: string;
  origin?: string;
  originAddress?: string | null;
  destination?: string;
  destinationAddress?: string | null;
  validUntil?: string;
  notes?: string;
  total: number;
  lineItems: ExportLineItem[];
  branchOrgId: string;
  companyOrgId?: string | null;
  branchName?: string | null;
  companyName?: string | null;
  artworkCount?: number | null;
  artworkValue?: number | null;
};

type OrgContext = {
  branchId: string;
  branchName: string | null;
  companyId: string;
  companyName: string;
};

type LetterheadResult =
  | {
      found: true;
      path: string;
      filename: string;
      kind: 'docx' | 'pdf';
      buffer: Buffer;
    }
  | {
      found: false;
      reason: string;
    };

const slugifyName = (value: string | null | undefined, fallback: string): string => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || fallback;
};

const formatCurrency = (amount: number, currency: string | undefined): string => {
  const safeCurrency = ['USD', 'EUR', 'GBP'].includes((currency || '').toUpperCase())
    ? (currency as string).toUpperCase()
    : 'USD';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: safeCurrency as any, maximumFractionDigits: 2 }).format(amount);
};

const toDisplayDate = (value: string | undefined | null): string => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
};

const sanitizeText = (value: string | null | undefined): string => {
  if (value === null || value === undefined) return '';
  return Array.from(String(value))
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if (code === 0x2013 || code === 0x2014) return '-'; // en/em dash
      if (code === 0x2192) return '->'; // arrow
      if (code === 0x20ac) return '€'; // euro
      if (code === 0x00a3) return '£'; // pound
      if (code === 0xa0) return ' ';
      if (code > 0xff) return '?';
      if (code < 32) return ' ';
      return ch;
    })
    .join('');
};

const ensureMembership = async (userId: string, branchOrgId: string): Promise<boolean> => {
  const { data, error } = await supabaseAdmin
    .from('memberships')
    .select('org_id')
    .eq('user_id', userId)
    .eq('org_id', branchOrgId)
    .maybeSingle();

  if (error) {
    console.error('[export-estimate] Membership lookup failed', error);
    return false;
  }

  return Boolean(data?.org_id);
};

const loadOrgContext = async (branchOrgId: string): Promise<OrgContext | null> => {
  const { data: branch, error: branchErr } = await supabaseAdmin
    .from('organizations')
    .select('id, name, branch_name, parent_org_id')
    .eq('id', branchOrgId)
    .maybeSingle();

  if (branchErr || !branch) {
    console.error('[export-estimate] Failed to load branch organization', branchErr);
    return null;
  }

  const companyOrgId = branch.parent_org_id || branch.id;
  const { data: company, error: companyErr } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('id', companyOrgId)
    .maybeSingle();

  if (companyErr || !company) {
    console.error('[export-estimate] Failed to load company organization', companyErr);
    return null;
  }

  return {
    branchId: branch.id,
    branchName: branch.branch_name ?? branch.name ?? null,
    companyId: company.id,
    companyName: company.name,
  };
};

const buildSlugCandidates = (name: string | null, id: string, fallbackPrefix: string): string[] => {
  const base = slugifyName(name, `${fallbackPrefix}-${id.slice(0, 8)}`);
  const withId = `${base}-${id.slice(0, 8)}`;
  const explicit = `${fallbackPrefix}-${id.slice(0, 8)}`;
  return Array.from(new Set([base, withId, explicit]));
};

const findLetterhead = async (context: OrgContext): Promise<LetterheadResult> => {
  const rootCandidates = buildSlugCandidates(context.companyName, context.companyId, 'org');
  const branchCandidates = buildSlugCandidates(context.branchName, context.branchId, 'branch');
  const branchFallback = context.branchName ? null : 'primary';

  const candidates: string[] = [];
  rootCandidates.forEach((root) => {
    branchCandidates.forEach((branch) => {
      candidates.push(`${root}/${branch}`);
    });
    if (branchFallback) {
      candidates.push(`${root}/${branchFallback}`);
    }
  });

  for (const path of candidates) {
    const { data, error } = await supabaseAdmin.storage.from(LETTERHEAD_BUCKET).list(path, { limit: 50 });
    if (error) {
      console.warn('[export-estimate] Failed to list letterhead path', { path, error });
      continue;
    }

    const candidate = (data || []).find((entry) => /\.(docx?|pdf)$/i.test(entry.name));
    if (!candidate) continue;

    const objectPath = `${path}/${candidate.name}`;
    const { data: file, error: downloadErr } = await supabaseAdmin.storage.from(LETTERHEAD_BUCKET).download(objectPath);
    if (downloadErr || !file) {
      console.warn('[export-estimate] Failed to download letterhead file', { objectPath, error: downloadErr });
      continue;
    }

    const arrayBuffer = await file.arrayBuffer();
    const kind: 'docx' | 'pdf' = /\.pdf$/i.test(candidate.name) ? 'pdf' : 'docx';
    return { found: true, path, filename: candidate.name, buffer: Buffer.from(arrayBuffer), kind };
  }

  return { found: false, reason: 'No letterhead template found for this branch.' };
};

const extractHeaderImage = async (
  buffer: Buffer
): Promise<{ data: Uint8Array; type: 'png' | 'jpg' } | null> => {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const mediaFiles = Object.values(zip.files).filter(
      (file) => file.name.startsWith('word/media/') && !file.dir && /\.(png|jpe?g)$/i.test(file.name)
    );

    if (!mediaFiles.length) {
      return null;
    }

    const target = mediaFiles[0];
    const imageBuffer = await target.async('nodebuffer');
    return {
      data: imageBuffer,
      type: target.name.toLowerCase().endsWith('.png') ? 'png' : 'jpg',
    };
  } catch (err) {
    console.warn('[export-estimate] Failed to extract header image from letterhead', err);
    return null;
  }
};

const wrapText = (
  text: string,
  font: any,
  size: number,
  maxWidth: number
): string[] => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const tentative = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(tentative, size);
    if (width <= maxWidth) {
      current = tentative;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
};

const drawTextBlock = (
  pdfDoc: PDFDocument,
  page: any,
  text: string,
  opts: { x: number; y: number; font: any; size: number; color?: any; maxWidth: number }
): number => {
  const lines = wrapText(text, opts.font, opts.size, opts.maxWidth);
  let cursorY = opts.y;
  lines.forEach((line) => {
    page.drawText(line, {
      x: opts.x,
      y: cursorY,
      size: opts.size,
      font: opts.font,
      color: opts.color || rgb(0.12, 0.13, 0.2),
    });
    cursorY -= opts.size + 4;
  });
  return cursorY;
};

const buildPdf = async (
  payload: ExportPayload,
  org: OrgContext,
  letterhead: { kind: 'docx' | 'pdf'; buffer: Buffer; isDummy?: boolean }
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.create();
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let page = pdfDoc.addPage([DEFAULT_PAGE_WIDTH, DEFAULT_PAGE_HEIGHT]);
  const pageWidth = page.getSize().width;
  const pageHeight = page.getSize().height;
  let cursorY = pageHeight - PDF_MARGIN;

  const ensureSpace = (heightNeeded: number) => {
    if (cursorY - heightNeeded < PDF_MARGIN) {
      page = pdfDoc.addPage([DEFAULT_PAGE_WIDTH, DEFAULT_PAGE_HEIGHT]);
      cursorY = page.getSize().height - PDF_MARGIN;
    }
  };

  // Header image or fallback text
  if (letterhead.kind === 'pdf' && !letterhead.isDummy) {
    try {
      const [embeddedPage] = await pdfDoc.embedPdf(letterhead.buffer);
      page.drawPage(embeddedPage, { x: 0, y: 0, width: pageWidth, height: pageHeight });
      cursorY = pageHeight * CONTENT_START_RATIO;
    } catch (err) {
      console.warn('[export-estimate] Failed to embed letterhead pdf, falling back to text header', err);
      ensureSpace(60);
      page.drawText(sanitizeText(org.companyName), {
        x: PDF_MARGIN,
        y: cursorY,
        size: 18,
        font: boldFont,
        color: rgb(0.17, 0.08, 0.29),
      });
      cursorY -= 20;
      page.drawText(sanitizeText(org.branchName || 'Branch'), {
        x: PDF_MARGIN,
        y: cursorY,
        size: 13,
        font: regularFont,
        color: rgb(0.18, 0.2, 0.31),
      });
      cursorY = pageHeight * CONTENT_START_RATIO;
    }
  } else {
    const headerImage = await extractHeaderImage(letterhead.buffer);
    if (headerImage) {
      const image = headerImage.type === 'png'
        ? await pdfDoc.embedPng(headerImage.data)
        : await pdfDoc.embedJpg(headerImage.data);
      const maxWidth = pageWidth - PDF_MARGIN * 2;
      const scale = image.width > maxWidth ? maxWidth / image.width : 1;
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const x = (pageWidth - drawWidth) / 2;
      const y = pageHeight - PDF_MARGIN - drawHeight;
      page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
      const belowHeader = (y - 16);
      cursorY = Math.min(pageHeight * CONTENT_START_RATIO, belowHeader);
    } else {
      ensureSpace(60);
      page.drawText(sanitizeText(org.companyName), {
        x: PDF_MARGIN,
        y: cursorY,
        size: 18,
        font: boldFont,
        color: rgb(0.17, 0.08, 0.29),
      });
      cursorY -= 20;
      page.drawText(sanitizeText(org.branchName || 'Branch'), {
        x: PDF_MARGIN,
        y: cursorY,
        size: 13,
        font: regularFont,
        color: rgb(0.18, 0.2, 0.31),
      });
      cursorY = pageHeight * CONTENT_START_RATIO;
    }
  }

  // Quote info
  const titleTop = cursorY;
  page.drawText('Estimate', { x: PDF_MARGIN, y: cursorY, size: 16, font: boldFont, color: rgb(0.1, 0.11, 0.2) });
  cursorY -= 16 + 4;
  cursorY = drawTextBlock(pdfDoc, page, sanitizeText(payload.quoteTitle), {
    x: PDF_MARGIN,
    y: cursorY,
    font: boldFont,
    size: 13,
    maxWidth: pageWidth - PDF_MARGIN * 2,
    color: rgb(0.13, 0.13, 0.24),
  }) - 2;

  const detailLines = [
    `Quote: ${sanitizeText(payload.quoteCode)}`,
    payload.galleryName ? `Gallery: ${sanitizeText(payload.galleryName)}` : null,
    payload.origin ? `Origin: ${sanitizeText(payload.origin)}` : null,
    payload.destination ? `Destination: ${sanitizeText(payload.destination)}` : null,
    `Valid until: ${sanitizeText(toDisplayDate(payload.validUntil))}`,
  ].filter(Boolean) as string[];

  detailLines.forEach((line) => {
    ensureSpace(18);
    page.drawText(line, {
      x: PDF_MARGIN,
      y: cursorY,
      size: 11,
      font: regularFont,
      color: rgb(0.18, 0.19, 0.3),
    });
    cursorY -= 15;
  });

  cursorY -= 2;

  // Summary block (route and artwork stats)
  const summaryItems = [
    { label: 'Artworks', value: payload.artworkCount ? `${payload.artworkCount}` : null },
    {
      label: 'Declared value',
      value:
        payload.artworkValue !== null && payload.artworkValue !== undefined
          ? formatCurrency(Number(payload.artworkValue) || 0, payload.currencyCode)
          : null,
    },
  ].filter((item) => item.value) as { label: string; value: string }[];

  if (summaryItems.length) {
    summaryItems.forEach((item) => {
      ensureSpace(18);
      page.drawText(`${item.label}: ${sanitizeText(item.value)}`, {
        x: PDF_MARGIN,
        y: cursorY,
        size: 11,
        font: regularFont,
        color: rgb(0.18, 0.19, 0.3),
      });
      cursorY -= 14 + SUMMARY_ROW_GAP;
    });
  }

  ensureSpace(20);
  page.drawText('Line items', { x: PDF_MARGIN, y: cursorY, size: 14, font: boldFont, color: rgb(0.1, 0.11, 0.2) });
  cursorY -= 18;

  // Line items table
  const safeLineItems = (payload.lineItems || []).map((item) => ({
    ...item,
    name: sanitizeText(item.name),
    subItems: (item.subItems || []).map((sub) => sanitizeText(sub)),
  }));

  const colDescX = PDF_MARGIN;
  const colDetailsX = PDF_MARGIN + 220;
  const colAmountX = pageWidth - PDF_MARGIN - 120;
  const detailsWidth = colAmountX - colDetailsX - 10;
  const amountWidth = 120;

  const drawHeaderRow = () => {
    ensureSpace(20);
    page.drawText('Section', {
      x: colDescX,
      y: cursorY,
      size: 11.5,
      font: boldFont,
      color: rgb(0.12, 0.13, 0.2),
    });
    page.drawText('Details', {
      x: colDetailsX,
      y: cursorY,
      size: 11.5,
      font: boldFont,
      color: rgb(0.12, 0.13, 0.2),
    });
    page.drawText('Amount', {
      x: pageWidth - PDF_MARGIN - amountWidth + 10,
      y: cursorY,
      size: 11.5,
      font: boldFont,
      color: rgb(0.12, 0.13, 0.2),
    });
    cursorY -= 14;
  };

  drawHeaderRow();

  safeLineItems.forEach((item) => {
    ensureSpace(30);
    const startY = cursorY;

    page.drawText(item.name, {
      x: colDescX,
      y: cursorY,
      size: 11,
      font: boldFont,
      color: rgb(0.12, 0.13, 0.2),
    });

    page.drawText(formatCurrency(item.cost || 0, payload.currencyCode), {
      x: pageWidth - PDF_MARGIN - amountWidth + 10,
      y: cursorY,
      size: 11,
      font: boldFont,
      color: rgb(0.12, 0.13, 0.2),
    });

    let detailBottomY = cursorY - 12;
    if (item.subItems?.length) {
      const detailText = item.subItems.map((sub) => `• ${sub}`).join('\n');
      detailBottomY = drawTextBlock(pdfDoc, page, detailText, {
        x: colDetailsX,
        y: cursorY,
        font: regularFont,
        size: 10,
        maxWidth: detailsWidth,
        color: rgb(0.23, 0.24, 0.34),
      });
    }

    cursorY = Math.min(detailBottomY - 4, startY - 16);
    cursorY -= 4;
  });

  ensureSpace(28);
  page.drawText('Total', { x: PDF_MARGIN, y: cursorY, size: 13, font: boldFont, color: rgb(0.12, 0.13, 0.2) });
  page.drawText(formatCurrency(payload.total || 0, payload.currencyCode), {
    x: pageWidth - PDF_MARGIN - 140,
    y: cursorY,
    size: 13,
    font: boldFont,
    color: rgb(0.12, 0.13, 0.2),
  });
  cursorY -= 24;

  if (payload.notes) {
    ensureSpace(60);
    page.drawText('Notes', { x: PDF_MARGIN, y: cursorY, size: 13, font: boldFont, color: rgb(0.1, 0.11, 0.2) });
    cursorY -= 16;
    cursorY = drawTextBlock(pdfDoc, page, sanitizeText(payload.notes), {
      x: PDF_MARGIN,
      y: cursorY,
      font: regularFont,
      size: 11,
      maxWidth: pageWidth - PDF_MARGIN * 2,
      color: rgb(0.2, 0.2, 0.3),
    });
  }

  return pdfDoc.save();
};

async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res, req.headers.origin as string, 'OPTIONS, GET, POST');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    if (!token) {
      res.status(401).json({ ok: false, error: 'Missing Authorization bearer token' });
      return;
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      res.status(401).json({ ok: false, error: 'Invalid or expired token' });
      return;
    }

    const branchOrgId = req.method === 'GET'
      ? String(req.query?.branchOrgId || '')
      : String((req.body as ExportPayload | null)?.branchOrgId || '');

    if (!branchOrgId) {
      res.status(400).json({ ok: false, error: 'branchOrgId is required' });
      return;
    }

    const memberOk = await ensureMembership(authData.user.id, branchOrgId);
    if (!memberOk) {
      res.status(403).json({ ok: false, error: 'You are not authorized for this branch.' });
      return;
    }

    const org = await loadOrgContext(branchOrgId);
    if (!org) {
      res.status(404).json({ ok: false, error: 'Branch or company information is missing.' });
      return;
    }

    let letterhead = await findLetterhead(org);
    const bypassLetterhead = process.env.LETTERHEAD_BYPASS === 'true' || process.env.NODE_ENV === 'development';

    if (bypassLetterhead && !letterhead.found) {
      const dummyDoc = await PDFDocument.create();
      dummyDoc.addPage([DEFAULT_PAGE_WIDTH, DEFAULT_PAGE_HEIGHT]);
      const blank = await dummyDoc.save();
      letterhead = {
        found: true,
        path: null,
        filename: 'debug-letterhead.pdf',
        buffer: Buffer.from(blank),
        kind: 'pdf',
        isDummy: true,
      } as any;
    }

    if (req.method === 'GET') {
      res.status(200).json({
        ok: true,
        available: letterhead.found,
        reason: letterhead.found ? null : letterhead.reason,
        path: letterhead.found ? `${letterhead.path}/${letterhead.filename}` : null,
      });
      return;
    }

    if (!letterhead.found) {
      res.status(412).json({
        ok: false,
        code: 'LETTERHEAD_MISSING',
        error: letterhead.reason || 'Letterhead template not found for this branch.',
      });
      return;
    }

    const payload = req.body as ExportPayload;
    if (!payload || !payload.quoteId || !Array.isArray(payload.lineItems)) {
      res.status(400).json({ ok: false, error: 'Invalid payload' });
      return;
    }

    const pdfBytes = await buildPdf(payload, org, letterhead);

    const filename = `Estimate-${payload.quoteCode || payload.quoteId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200);
    res.end(Buffer.from(pdfBytes));
  } catch (err: any) {
    console.error('[export-estimate] Unexpected error', err);
    const message = err?.message || 'Internal Server Error';
    try {
      res.status(500);
      res.end(JSON.stringify({ ok: false, error: message }));
    } catch {
      // ignore adapter write errors
    }
  }
}

export default handler;
