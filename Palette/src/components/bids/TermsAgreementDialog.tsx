import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Typography,
  Alert,
  Collapse,
} from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { supabase } from '../../lib/supabase';
import EstimateExclusionsNotice from '../../../../shared/ui/EstimateExclusionsNotice';

const TERMS_BUCKET = 'TCs';
const SIGNED_URL_TTL_SECONDS = 60 * 15;

const runtimeEnv: Record<string, string | undefined> =
  (typeof import.meta !== 'undefined' && (import.meta as any)?.env)
    ? ((import.meta as any).env as Record<string, string | undefined>)
    : ((typeof globalThis !== 'undefined' && (globalThis as any)?.process?.env) || {});

const allowTermsBypass = (() => {
  const raw = runtimeEnv?.VITE_ALLOW_TERMS_BYPASS;
  if (typeof raw !== 'string') return false;
  return ['1', 'true', 'yes', 'y', 'on'].includes(raw.trim().toLowerCase());
})();

const LOCAL_TERMS_PLACEHOLDER = {
  objectPath: 'local-dev/terms-placeholder.pdf',
  fileName: 'local-dev-terms-placeholder.pdf',
};

const slugify = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : null;
};

const unique = <T,>(input: T[]): T[] => {
  const seen = new Set<T>();
  const list: T[] = [];
  for (const item of input) {
    if (seen.has(item)) continue;
    seen.add(item);
    list.push(item);
  }
  return list;
};

const buildNameVariants = (value: string | null | undefined): string[] => {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];

  const variants = new Set<string>();
  const collapseWhitespace = (input: string) => input.replace(/\s+/g, ' ').trim();

  const enqueue = (candidate: string | null | undefined) => {
    if (!candidate) return;
    const normalized = collapseWhitespace(candidate);
    if (normalized.length === 0) return;
    variants.add(normalized);
  };

  enqueue(trimmed);

  const lowercase = trimmed.toLowerCase();
  enqueue(lowercase);

  const withoutQuotes = trimmed.replace(/['’`]/g, '');
  enqueue(withoutQuotes);
  const withoutQuotesLower = lowercase.replace(/['’`]/g, '');
  enqueue(withoutQuotesLower);

  if (trimmed.includes('&')) {
    enqueue(trimmed.replace(/&/g, 'and'));
    enqueue(lowercase.replace(/&/g, 'and'));
  }

  return Array.from(variants);
};

const buildOrgFolderCandidates = (name: string | null | undefined, orgId: string | null | undefined) => {
  const candidates: string[] = [];
  candidates.push(...buildNameVariants(name));
  const base = slugify(name);
  if (base) candidates.push(base);
  const idFragment = orgId ? orgId.replace(/-/g, '').slice(0, 8) : null;
  if (base && idFragment) candidates.push(`${base}-${idFragment}`);
  if (idFragment) candidates.push(`org-${idFragment}`);
  if (!candidates.length && idFragment) candidates.push(idFragment);
  return unique(candidates);
};

const buildBranchFolderCandidates = (name: string | null | undefined, branchId: string | null | undefined) => {
  const candidates: string[] = [];
  const lower = name?.trim().toLowerCase();
  if (lower) candidates.push(lower);
  const base = slugify(name);
  if (base) candidates.push(base);
  candidates.push(...buildNameVariants(name));
  const idFragment = branchId ? branchId.replace(/-/g, '').slice(0, 8) : null;
  if (base && idFragment) candidates.push(`${base}-${idFragment}`);
  if (idFragment) candidates.push(`branch-${idFragment}`);
  candidates.push('primary');
  return unique(candidates);
};

type StorageObject = {
  id: string;
  name: string;
  created_at: string | null;
  updated_at: string | null;
  last_accessed_at: string | null;
  metadata: Record<string, any> | null;
};

const isLikelyFolder = (entry: StorageObject): boolean => {
  if (!entry) return false;
  if (entry.name.includes('.')) return false;
  if (!entry.metadata) return true;
  // Supabase folders typically report null metadata; fall back to heuristic.
  return false;
};

const scoreNameMatch = (fileName: string, branchName: string | null, companyName: string | null): number => {
  const lower = fileName.toLowerCase();
  let score = 0;
  if (lower.includes('terms')) score += 5;
  if (lower.includes('condition')) score += 4;
  if (lower.includes('tc')) score += 2;
  const branchToken = branchName ? slugify(branchName) : null;
  if (branchToken && lower.includes(branchToken)) score += 3;
  if (branchName) {
    const branchWords = branchName.toLowerCase().split(/\s+/).filter(Boolean);
    for (const word of branchWords) {
      if (word.length >= 3 && lower.includes(word)) score += 1;
    }
  }
  if (companyName) {
    const companyToken = slugify(companyName);
    if (companyToken && lower.includes(companyToken)) score += 1;
  }
  if (lower.endsWith('.pdf')) score += 1;
  return score;
};

const pickBestPdf = (
  entries: StorageObject[],
  branchName: string | null,
  companyName: string | null
): StorageObject | null => {
  const pdfs = entries.filter(entry => entry.name.toLowerCase().endsWith('.pdf'));
  if (pdfs.length === 0) return null;
  return pdfs
    .map(entry => ({
      entry,
      score: scoreNameMatch(entry.name, branchName, companyName),
    }))
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))[0].entry;
};

const MAX_LIST_PAGES = 5;
const LIST_PAGE_SIZE = 200;

const listFolder = async (path: string): Promise<StorageObject[]> => {
  const aggregated: StorageObject[] = [];

  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const { data, error } = await supabase.storage.from(TERMS_BUCKET).list(path, {
      limit: LIST_PAGE_SIZE,
      offset: page * LIST_PAGE_SIZE,
    });

    if (error) {
      const status = (error as any)?.status ?? (error as any)?.statusCode;
      const isNotFound = status === 404 || status === '404' || error.message?.toLowerCase().includes('not found');
      if (isNotFound) {
        break;
      }
      console.warn('[TermsAgreementDialog] storage.list error', {
        path,
        message: error.message,
        status,
      });
      break;
    }

    const chunk = (data as StorageObject[]) || [];
    aggregated.push(...chunk);

    if (chunk.length < LIST_PAGE_SIZE) {
      break;
    }
  }

  if (aggregated.length > 0) {
    const dedupedMap = new Map<string, StorageObject>();
    for (const entry of aggregated) {
      const key = entry.id || `${entry.name}-${entry.created_at || 'unknown'}`;
      if (!dedupedMap.has(key)) {
        dedupedMap.set(key, entry);
      }
    }
    const deduped = Array.from(dedupedMap.values());
    console.log('[TermsAgreementDialog] Found entries', {
      path,
      names: deduped.map(entry => entry.name),
    });
    return deduped;
  }

  return [];
};

const resolveTermsAsset = async (input: {
  companyName: string | null;
  companyOrgId: string | null;
  branchName: string | null;
  branchOrgId: string | null;
}): Promise<{ objectPath: string; fileName: string } | null> => {
  const companyCandidates = buildOrgFolderCandidates(input.companyName, input.companyOrgId);
  const branchCandidates = buildBranchFolderCandidates(input.branchName, input.branchOrgId);

  if (companyCandidates.length === 0) {
    companyCandidates.push('');
  }

  const triedPaths = new Set<string>();

  const attemptLookup = async (basePath: string): Promise<{ objectPath: string; fileName: string } | null> => {
    if (triedPaths.has(basePath)) return null;
    triedPaths.add(basePath);
    console.log('[TermsAgreementDialog] Checking terms folder', { basePath });
    const entries = await listFolder(basePath);
    if (!entries.length) return null;

    const pdf = pickBestPdf(entries, input.branchName, input.companyName);
    if (pdf) {
      return { objectPath: `${basePath}/${pdf.name}`.replace(/^\//, ''), fileName: pdf.name };
    }

    const subfolders = entries.filter(isLikelyFolder);
    for (const subfolder of subfolders) {
      const nested = await attemptLookup(`${basePath}/${subfolder.name}`);
      if (nested) return nested;
    }

    return null;
  };

  for (const companyFolder of companyCandidates) {
    for (const branchFolder of branchCandidates) {
      const path = `${companyFolder}/${branchFolder}`.replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '');
      const resolved = await attemptLookup(path);
      if (resolved) return resolved;
    }
  }

  for (const companyFolder of companyCandidates) {
    const resolved = await attemptLookup(companyFolder);
    if (resolved) return resolved;
  }

  return null;
};

export interface TermsAcceptancePayload {
  objectPath: string;
  fileName: string;
  bucket: string;
  companyName: string | null;
  branchName: string | null;
}

export interface TermsAgreementDialogProps {
  open: boolean;
  companyName: string | null;
  companyOrgId: string | null;
  branchName: string | null;
  branchOrgId: string | null;
  logisticsLabel?: string | null;
  confirming?: boolean;
  submissionError?: string | null;
  onClose: () => void;
  onConfirm: (payload: TermsAcceptancePayload) => void;
}

const TermsAgreementDialog: React.FC<TermsAgreementDialogProps> = ({
  open,
  companyName,
  companyOrgId,
  branchName,
  branchOrgId,
  logisticsLabel,
  confirming = false,
  submissionError = null,
  onClose,
  onConfirm,
}) => {
  const [loading, setLoading] = useState(false);
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const [pdfBaseUrl, setPdfBaseUrl] = useState<string | null>(null);
  const [objectPath, setObjectPath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showExclusions, setShowExclusions] = useState(false);
  const [bypassActive, setBypassActive] = useState(false);

  const termsTargetLabel = useMemo(() => {
    if (companyName && branchName) {
      if (branchName.toLowerCase() === 'primary' || branchName === companyName) {
        return companyName;
      }
      return `${companyName} — ${branchName}`;
    }
    return companyName || branchName || 'this partner';
  }, [companyName, branchName]);
  const partnerLabel = useMemo(() => {
    if (companyName && branchName && branchName !== companyName) {
      return `${companyName} — ${branchName}`;
    }
    if (companyName) return companyName;
    return branchName || 'Logistics partner';
  }, [companyName, branchName]);
  const termsReady = !!pdfViewerUrl || bypassActive;

  useEffect(() => {
    if (!open) {
      setPdfViewerUrl(null);
      setPdfBaseUrl(null);
      setObjectPath(null);
      setFileName(null);
      setAcknowledged(false);
      setError(null);
      setLoading(false);
      setShowExclusions(false);
      setBypassActive(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfViewerUrl(null);
    setPdfBaseUrl(null);
    setObjectPath(null);
    setFileName(null);
    setAcknowledged(false);
    setShowExclusions(false);
    setBypassActive(false);

    const companyCandidates = buildOrgFolderCandidates(companyName || null, companyOrgId || null);
    const branchCandidates = buildBranchFolderCandidates(branchName || null, branchOrgId || null);
    console.log('[TermsAgreementDialog] Candidate folder sequences', {
      companyCandidates,
      branchCandidates,
    });
    if (typeof window !== 'undefined') {
      (window as any).__paletteTermsDebug = {
        companyName,
        companyOrgId,
        branchName,
        branchOrgId,
        companyCandidates,
        branchCandidates,
        ts: new Date().toISOString(),
      };
    }

    (async () => {
      const asset = await resolveTermsAsset({
        companyName: companyName || null,
        companyOrgId: companyOrgId || null,
        branchName: branchName || null,
        branchOrgId: branchOrgId || null,
      });

      if (cancelled) return;

      if (!asset) {
        if (allowTermsBypass) {
          console.warn('[TermsAgreementDialog] No terms asset found; bypass enabled via VITE_ALLOW_TERMS_BYPASS.');
          setBypassActive(true);
          setObjectPath(LOCAL_TERMS_PLACEHOLDER.objectPath);
          setFileName(LOCAL_TERMS_PLACEHOLDER.fileName);
          setLoading(false);
          return;
        }
        setError('Terms document not found for this branch. Please contact Palette support.');
        setLoading(false);
        return;
      }

      const signOnce = () =>
        supabase.storage.from(TERMS_BUCKET).createSignedUrl(asset.objectPath, SIGNED_URL_TTL_SECONDS);

      let { data, error: signedError } = await signOnce();

      // If auth hasn’t hydrated yet in prod, the Storage API returns 401/404 that look like “Object not found”.
      const status = (signedError as any)?.status ?? (signedError as any)?.statusCode;
      const isAuthRace = status === 401 || status === 404;
      if (!cancelled && isAuthRace) {
        console.warn('[TermsAgreementDialog] Signed URL failed (auth race); refreshing session then retrying', {
          status,
          message: (signedError as any)?.message,
        });
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.warn('[TermsAgreementDialog] refreshSession error', refreshError);
        } else {
          ({ data, error: signedError } = await signOnce());
        }
      }

      if (cancelled) return;

      if (signedError || !data?.signedUrl) {
        console.warn('[TermsAgreementDialog] Failed to create signed URL', signedError);
        if (allowTermsBypass) {
          console.warn('[TermsAgreementDialog] Falling back to local terms bypass because VITE_ALLOW_TERMS_BYPASS is set.');
          setBypassActive(true);
          setObjectPath(LOCAL_TERMS_PLACEHOLDER.objectPath);
          setFileName(LOCAL_TERMS_PLACEHOLDER.fileName);
          setLoading(false);
          return;
        }
        setError('We could not generate a secure link to the terms document. Please try again.');
        setLoading(false);
        return;
      }

      const baseUrl = data.signedUrl;
      setPdfBaseUrl(baseUrl);
      setPdfViewerUrl(`${baseUrl}#toolbar=0`);
      setObjectPath(asset.objectPath);
      setFileName(asset.fileName);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, companyName, companyOrgId, branchName, branchOrgId]);

  const handleConfirm = () => {
    if (!objectPath || !fileName) return;
    onConfirm({
      objectPath,
      fileName,
      bucket: TERMS_BUCKET,
      companyName: companyName || null,
      branchName: branchName || null,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={confirming ? undefined : onClose}
      maxWidth={false}
      aria-labelledby="terms-dialog-title"
      PaperProps={{
        sx: {
          borderRadius: { xs: 0, md: '16px' },
          border: '1px solid rgba(233, 234, 235, 0.6)',
          boxShadow: '0 20px 60px rgba(10, 13, 18, 0.15)',
          width: { xs: '100%', md: 'min(1320px, calc(100vw - 64px))' },
          height: { xs: '100%', md: 'min(900px, calc(100vh - 64px))' },
          margin: { xs: 0, md: '32px auto' },
          display: 'flex',
        },
      }}
    >
      <DialogTitle id="terms-dialog-title">Review Shipper Terms &amp; Conditions</DialogTitle>
      <DialogContent
        dividers
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: { xs: 3, md: 4 },
        }}
      >
        <Stack spacing={3} sx={{ flex: 1, minHeight: 0 }}>
          <Stack spacing={0.5}>
            <Typography variant="subtitle2" color="text.secondary">
              Partner
            </Typography>
            <Typography variant="h6" fontWeight={700} color="text.primary">
              {partnerLabel}
            </Typography>
            {logisticsLabel && (
              <Typography variant="body2" color="text.secondary">
                {logisticsLabel}
              </Typography>
            )}
          </Stack>

          {loading ? (
            <Box display="flex" alignItems="center" justifyContent="center" sx={{ flexGrow: 1, minHeight: 320 }}>
              <CircularProgress size={32} />
            </Box>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : pdfViewerUrl ? (
            <Box
              sx={{
                borderRadius: '16px',
                overflow: 'hidden',
                boxShadow: '0 16px 40px rgba(23, 8, 73, 0.18)',
                border: '1px solid rgba(23, 8, 73, 0.08)',
                flexGrow: 1,
                minHeight: { xs: 360, md: 0 },
                background: '#1b1b43',
                display: 'flex',
              }}
            >
              <iframe
                title="Terms & Conditions"
                src={pdfViewerUrl}
                style={{ width: '100%', height: '100%', border: 'none', flex: 1 }}
              />
            </Box>
          ) : bypassActive ? (
            <Alert severity="info">
              Terms lookup bypass is active for local development (VITE_ALLOW_TERMS_BYPASS=true). No PDF preview will be
              shown, but your acknowledgement will still be recorded for this session.
            </Alert>
          ) : (
            <Alert severity="warning">
              We were unable to load the terms document for this shipper. Please try again shortly.
            </Alert>
          )}

          {pdfViewerUrl && (
            <Box display="flex" justifyContent="flex-end">
              <Button
                variant="outlined"
                startIcon={<PictureAsPdfIcon />}
                onClick={() => {
                  const targetUrl = pdfBaseUrl || pdfViewerUrl.replace('#toolbar=0', '');
                  window.open(targetUrl, '_blank', 'noopener');
                }}
              >
                Open in new tab
              </Button>
            </Box>
          )}

          <Box mt={2} width="100%">
            <Button
              variant="text"
              size="small"
              onClick={() => setShowExclusions((prev) => !prev)}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                color: 'var(--color-primary)',
                px: 1
              }}
            >
              {showExclusions ? 'Hide estimate exclusions' : 'View estimate exclusions'}
            </Button>
            <Collapse in={showExclusions} timeout="auto" unmountOnExit>
              <Box mt={1}>
                <EstimateExclusionsNotice
                  compact
                  title="Estimate exclusions & assumptions"
                  appearance="subtle"
                />
                <Typography variant="caption" color="text.secondary">
                  Palette shares these notes with clients each time an estimate is accepted.
                </Typography>
              </Box>
            </Collapse>
          </Box>

          <FormControlLabel
            control={
              <Checkbox
                color="primary"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                disabled={loading || !!error || !termsReady || confirming}
              />
            }
            label={
              <Typography variant="body1" color="text.primary">
                I have read and agree to the {termsTargetLabel} terms &amp; conditions for this shipment.
              </Typography>
            }
          />
          {submissionError && (
            <Alert severity="error">{submissionError}</Alert>
          )}
          <Typography variant="caption" color="text.secondary">
            Your acknowledgement will be recorded with your account and timestamp in the shipment documents list.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2.5 }}>
        <Button onClick={onClose} disabled={confirming}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!acknowledged || confirming || loading || !!error || !termsReady}
        >
          {confirming ? <CircularProgress size={18} sx={{ color: 'white' }} /> : 'Accept Estimate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TermsAgreementDialog;
