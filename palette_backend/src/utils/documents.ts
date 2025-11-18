import type { PostgrestError } from '@supabase/supabase-js';
import { supabaseAdmin } from '../supabaseClient.js';

const ELEVATED_ROLES = ['editor', 'admin'] as const;

export type DocumentOrgType = 'owner' | 'partner';

interface DocumentRow {
  id: string;
  shipment_id: string | null;
  file_url: string | null;
  uploaded_by: string | null;
  kind: string | null;
  original_filename: string | null;
  created_at: string | null;
}

interface ShipmentRow {
  id: string;
  owner_org_id: string | null;
  logistics_partner_id: string | null;
  quote_id: string | null;
}

interface LogisticsPartnerRow {
  id: string;
  org_id: string | null;
}

interface MembershipRow {
  user_id: string;
  org_id: string;
  role: string | null;
}

interface QuoteBranchRow {
  branch_org_id: string | null;
  status?: string | null;
}

interface ShipmentOrgContext {
  shipmentId: string;
  ownerOrgId: string | null;
  partnerOrgId: string | null;
  logisticsPartnerId: string | null;
  quoteId: string | null;
  branchOrgIds: string[];
}

export interface DocumentPermission {
  document: DocumentRow;
  uploaderOrgId: string | null;
  uploaderOrgType: DocumentOrgType | null;
  requesterHasOwnerAccess: boolean;
  requesterHasPartnerAccess: boolean;
  canDelete: boolean;
}

export class DocumentAccessError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type MembershipMap = Map<string, MembershipRow[]>;

function isElevatedRole(role: string | null | undefined): boolean {
  return role ? ELEVATED_ROLES.includes(role as (typeof ELEVATED_ROLES)[number]) : false;
}

function collectOrgIds(context: ShipmentOrgContext): string[] {
  const ids = [] as string[];
  if (context.ownerOrgId) ids.push(context.ownerOrgId);
  if (context.partnerOrgId) ids.push(context.partnerOrgId);
  for (const branchId of context.branchOrgIds) {
    if (branchId) ids.push(branchId);
  }
  return Array.from(new Set(ids));
}

function buildMembershipMap(rows: MembershipRow[]): MembershipMap {
  return rows.reduce((map, row) => {
    const existing = map.get(row.user_id) || [];
    existing.push(row);
    map.set(row.user_id, existing);
    return map;
  }, new Map<string, MembershipRow[]>());
}

function requesterHasElevatedAccess(records: MembershipRow[] | undefined, orgId: string | null): boolean {
  if (!records || !orgId) return false;
  return records.some(record => record.org_id === orgId && isElevatedRole(record.role));
}

function resolveUploaderOrg(
  uploaderId: string | null,
  membershipMap: MembershipMap,
  context: ShipmentOrgContext
): { orgId: string | null; orgType: DocumentOrgType | null } {
  if (!uploaderId) {
    return { orgId: null, orgType: null };
  }

  const records = membershipMap.get(uploaderId) || [];

  const preferOrgFromList = (
    orgIds: (string | null | undefined)[],
    requireElevated: boolean
  ): MembershipRow | undefined => {
    for (const orgId of orgIds) {
      if (!orgId) continue;
      const match = records.find(record => record.org_id === orgId && (!requireElevated || isElevatedRole(record.role)));
      if (match) {
        return match;
      }
    }
    return undefined;
  };

  const ownerElevated = preferOrgFromList([context.ownerOrgId], true);
  if (ownerElevated) return { orgId: ownerElevated.org_id, orgType: 'owner' };

  const branchElevated = preferOrgFromList(context.branchOrgIds, true);
  if (branchElevated) return { orgId: branchElevated.org_id, orgType: 'partner' };

  const partnerElevated = preferOrgFromList([context.partnerOrgId], true);
  if (partnerElevated) return { orgId: partnerElevated.org_id, orgType: 'partner' };

  const ownerAny = preferOrgFromList([context.ownerOrgId], false);
  if (ownerAny) return { orgId: ownerAny.org_id, orgType: 'owner' };

  const branchAny = preferOrgFromList(context.branchOrgIds, false);
  if (branchAny) return { orgId: branchAny.org_id, orgType: 'partner' };

  const partnerAny = preferOrgFromList([context.partnerOrgId], false);
  if (partnerAny) return { orgId: partnerAny.org_id, orgType: 'partner' };

  if (context.ownerOrgId && !context.partnerOrgId && context.branchOrgIds.length === 0) {
    return { orgId: context.ownerOrgId, orgType: 'owner' };
  }

  if (context.partnerOrgId && !context.ownerOrgId && context.branchOrgIds.length === 0) {
    return { orgId: context.partnerOrgId, orgType: 'partner' };
  }

  return { orgId: null, orgType: null };
}

function handlePostgrestError(message: string, error: PostgrestError | null): never {
  const details = error?.message || 'unknown';
  throw new DocumentAccessError(500, `${message}: ${details}`);
}

async function fetchDocument(docId: string): Promise<DocumentRow> {
  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('id, shipment_id, file_url, uploaded_by, kind, original_filename, created_at')
    .eq('id', docId)
    .maybeSingle();

  if (error) {
    handlePostgrestError('[documents] Failed to load document', error);
  }

  const document = data as DocumentRow | null;

  if (!document) {
    throw new DocumentAccessError(404, 'Document not found');
  }

  return document;
}

async function fetchShipment(shipmentId: string): Promise<ShipmentRow> {
  const { data, error } = await supabaseAdmin
    .from('shipments')
    .select('id, owner_org_id, logistics_partner_id, quote_id')
    .eq('id', shipmentId)
    .maybeSingle();

  if (error) {
    handlePostgrestError('[documents] Failed to load shipment', error);
  }

  const shipment = data as ShipmentRow | null;

  if (!shipment) {
    throw new DocumentAccessError(404, 'Shipment not found');
  }

  return shipment;
}

async function fetchLogisticsPartnerOrg(logisticsPartnerId: string | null): Promise<string | null> {
  if (!logisticsPartnerId) return null;

  const { data, error } = await supabaseAdmin
    .from('logistics_partners')
    .select('id, org_id')
    .eq('id', logisticsPartnerId)
    .maybeSingle();

  if (error) {
    handlePostgrestError('[documents] Failed to load logistics partner', error);
  }

  const partner = data as LogisticsPartnerRow | null;

  if (!partner?.org_id) {
    console.warn('[documents] Logistics partner missing org mapping', { logisticsPartnerId });
    return null;
  }

  return partner.org_id;
}

async function fetchBranchOrgIdsForShipment(shipment: ShipmentRow): Promise<string[]> {
  if (!shipment.quote_id || !shipment.logistics_partner_id) {
    return [];
  }

  const branchIds = new Set<string>();

  const { data: inviteRows, error: inviteErr } = await supabaseAdmin
    .from('quote_invites')
    .select('branch_org_id')
    .eq('quote_id', shipment.quote_id)
    .eq('logistics_partner_id', shipment.logistics_partner_id)
    .not('branch_org_id', 'is', null);

  if (inviteErr) {
    handlePostgrestError('[documents] Failed to load branch invites', inviteErr);
  }

  (inviteRows as QuoteBranchRow[] | null | undefined)?.forEach(row => {
    if (row?.branch_org_id) branchIds.add(row.branch_org_id);
  });

  const { data: bidRows, error: bidErr } = await supabaseAdmin
    .from('bids')
    .select('branch_org_id, status')
    .eq('quote_id', shipment.quote_id)
    .eq('logistics_partner_id', shipment.logistics_partner_id)
    .not('branch_org_id', 'is', null)
    .neq('status', 'draft');

  if (bidErr) {
    handlePostgrestError('[documents] Failed to load branch bids', bidErr);
  }

  (bidRows as QuoteBranchRow[] | null | undefined)?.forEach(row => {
    if (row?.branch_org_id) branchIds.add(row.branch_org_id);
  });

  return Array.from(branchIds);
}

async function fetchShipmentDocuments(shipmentId: string): Promise<DocumentRow[]> {
  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('id, shipment_id, file_url, uploaded_by, kind, original_filename, created_at')
    .eq('shipment_id', shipmentId);

  if (error) {
    handlePostgrestError('[documents] Failed to load shipment documents', error);
  }

  return ((data || []) as DocumentRow[]);
}

async function fetchMemberships(userIds: string[], orgIds: string[]): Promise<MembershipRow[]> {
  if (userIds.length === 0 || orgIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from('memberships')
    .select('user_id, org_id, role')
    .in('user_id', Array.from(new Set(userIds)))
    .in('org_id', Array.from(new Set(orgIds)));

  if (error) {
    handlePostgrestError('[documents] Failed to load memberships', error);
  }

  return ((data || []) as MembershipRow[]);
}

async function getShipmentContext(
  shipmentId: string,
  opts?: { shipment?: ShipmentRow }
): Promise<ShipmentOrgContext> {
  const shipment = opts?.shipment ?? (await fetchShipment(shipmentId));
  const partnerOrgId = await fetchLogisticsPartnerOrg(shipment.logistics_partner_id);
  const branchOrgIds = await fetchBranchOrgIdsForShipment(shipment);

  return {
    shipmentId,
    ownerOrgId: shipment.owner_org_id,
    partnerOrgId,
    logisticsPartnerId: shipment.logistics_partner_id,
    quoteId: shipment.quote_id,
    branchOrgIds,
  };
}

export interface ShipmentAccessResult {
  context: ShipmentOrgContext;
  ownerAccess: boolean;
  branchAccess: boolean;
  resolvedBranchOrgId: string | null;
}

export async function resolveShipmentAccessForUser(
  shipment: ShipmentRow | string,
  userId: string,
  opts?: { branchOrgId?: string | null }
): Promise<ShipmentAccessResult> {
  const shipmentRow = typeof shipment === 'string' ? await fetchShipment(shipment) : shipment;
  const context = await getShipmentContext(shipmentRow.id, { shipment: shipmentRow });
  const orgIds = collectOrgIds(context);
  const memberships = await fetchMemberships([userId], orgIds);
  const userMemberships = memberships.filter(record => record.user_id === userId);

  const ownerAccess = requesterHasElevatedAccess(userMemberships, context.ownerOrgId);

  const eligibleBranchOrgIds = context.branchOrgIds;
  const elevatedBranchMemberships = userMemberships.filter(
    record => eligibleBranchOrgIds.includes(record.org_id) && isElevatedRole(record.role)
  );

  const requestedBranchOrgId = opts?.branchOrgId ?? null;
  let resolvedBranchOrgId: string | null = null;

  if (eligibleBranchOrgIds.length > 0) {
    if (requestedBranchOrgId) {
      if (!eligibleBranchOrgIds.includes(requestedBranchOrgId)) {
        throw new DocumentAccessError(403, 'Branch is not assigned to this shipment');
      }
      const hasRequested = elevatedBranchMemberships.some(record => record.org_id === requestedBranchOrgId);
      if (!hasRequested) {
        throw new DocumentAccessError(403, 'Not authorized for the requested branch');
      }
      resolvedBranchOrgId = requestedBranchOrgId;
    } else if (elevatedBranchMemberships.length === 1) {
      resolvedBranchOrgId = elevatedBranchMemberships[0].org_id;
    } else if (elevatedBranchMemberships.length === 0) {
      if (!ownerAccess && context.logisticsPartnerId) {
        throw new DocumentAccessError(403, 'Not authorized for any branch assigned to this shipment');
      }
    } else if (!ownerAccess) {
      throw new DocumentAccessError(400, 'Ambiguous branch_org_id; supply branch_org_id in request');
    }
  }

  const branchAccess = Boolean(resolvedBranchOrgId);

  return {
    context,
    ownerAccess,
    branchAccess,
    resolvedBranchOrgId,
  };
}

export async function buildDocumentPermissionsForUser(
  shipmentId: string,
  userId: string
): Promise<{ permissionsById: Map<string, DocumentPermission>; context: ShipmentOrgContext }> {
  const context = await getShipmentContext(shipmentId);
  const documents = await fetchShipmentDocuments(shipmentId);
  const orgIds = collectOrgIds(context);

  if (documents.length === 0) {
    return { permissionsById: new Map(), context };
  }

  const uniqueUserIds = new Set<string>();
  uniqueUserIds.add(userId);
  for (const doc of documents) {
    if (doc.uploaded_by) uniqueUserIds.add(doc.uploaded_by);
  }

  const memberships = await fetchMemberships(Array.from(uniqueUserIds), orgIds);
  const membershipMap = buildMembershipMap(memberships);

  const requesterMemberships = membershipMap.get(userId) || [];
  const requesterHasOwnerAccess = requesterHasElevatedAccess(requesterMemberships, context.ownerOrgId);
  const requesterHasBranchAccess = context.branchOrgIds.some(branchId =>
    requesterMemberships.some(record => record.org_id === branchId && isElevatedRole(record.role))
  );
  const requesterHasPartnerAccess = requesterHasBranchAccess || (
    context.branchOrgIds.length === 0 && requesterHasElevatedAccess(requesterMemberships, context.partnerOrgId)
  );

  const permissions = new Map<string, DocumentPermission>();

  for (const document of documents) {
    const { orgId, orgType } = resolveUploaderOrg(document.uploaded_by, membershipMap, context);
    const isTermsAcceptance = document.kind === 'terms_acceptance';
    const canDelete = !isTermsAcceptance && Boolean(
      (orgType === 'owner' && requesterHasOwnerAccess) ||
      (orgType === 'partner' && requesterHasPartnerAccess)
    );

    permissions.set(document.id, {
      document,
      uploaderOrgId: orgId,
      uploaderOrgType: orgType,
      requesterHasOwnerAccess,
      requesterHasPartnerAccess,
      canDelete,
    });
  }

  return { permissionsById: permissions, context };
}

export async function resolveDocumentPermission(
  documentId: string,
  userId: string
): Promise<{ permission: DocumentPermission; context: ShipmentOrgContext }> {
  const document = await fetchDocument(documentId);
  if (!document.shipment_id) {
    throw new DocumentAccessError(400, 'Document is missing shipment association');
  }

  const { permissionsById, context } = await buildDocumentPermissionsForUser(document.shipment_id, userId);
  const permission = permissionsById.get(document.id);

  if (!permission) {
    throw new DocumentAccessError(404, 'Document not found in shipment scope');
  }

  return { permission, context };
}
