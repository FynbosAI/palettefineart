import { supabaseAdmin } from '../../supabaseClient.js';

export interface ChatThread {
  id: string;
  quote_id: string | null;
  shipment_id: string | null;
  organization_id: string;
  shipper_branch_org_id: string | null;
  gallery_branch_org_id: string | null;
  twilio_conversation_sid: string;
  twilio_unique_name: string | null;
  status: string;
  last_message_at: string | null;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
  conversation_type: 'gallery' | 'shipper_peer';
  initiator_shipper_org_id: string | null;
}

export interface ChatThreadParticipant {
  id: string;
  thread_id: string;
  user_id: string;
  organization_id: string | null;
  role: string;
  twilio_identity: string;
  twilio_role_sid: string;
  joined_at: string;
  left_at: string | null;
  last_read_message_index: number | null;
  last_read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteContext {
  id: string;
  title: string | null;
  owner_org_id: string;
  shipment_id: string | null;
  submitted_by: string | null;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  type: 'client' | 'partner';
  logoUrl?: string | null;
  branchName?: string | null;
}

export interface ProfileSummary {
  id: string;
  full_name: string | null;
  default_org: string | null;
}

export interface MembershipRecord {
  org_id: string;
  role: string;
}

export interface OrganizationMemberRecord {
  user_id: string;
  role: string;
}

export interface QuoteIdentifier {
  id: string;
}

export interface ChatThreadShipper {
  id: string;
  thread_id: string;
  shipper_branch_org_id: string;
  role: string;
  created_at: string;
}

const throwIfError = <T>(label: string, result: { data: T; error: any }) => {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message || 'Unknown error'}`);
  }
  return result.data;
};

export const getThreadById = async (
  threadId: string
): Promise<ChatThread | null> => {
  const result = await supabaseAdmin
    .from('chat_threads')
    .select('*')
    .eq('id', threadId)
    .maybeSingle();

  if (result.error) {
    throw new Error(`chatRepository.getThreadById: ${result.error.message}`);
  }

  return (result.data as ChatThread | null) ?? null;
};

export const getThreadByQuoteId = async (
  quoteId: string
): Promise<ChatThread | null> => {
  const result = await supabaseAdmin
    .from('chat_threads')
    .select('*')
    .eq('quote_id', quoteId)
    .eq('conversation_type', 'gallery')
    .is('shipper_branch_org_id', null)
    .is('gallery_branch_org_id', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new Error(`chatRepository.getThreadByQuoteId: ${result.error.message}`);
  }

  return (result.data as ChatThread | null) ?? null;
};

export const getThreadByQuoteScope = async (
  quoteId: string,
  shipperBranchOrgId?: string | null,
  galleryBranchOrgId?: string | null
): Promise<ChatThread | null> => {
  let query = supabaseAdmin
    .from('chat_threads')
    .select('*')
    .eq('quote_id', quoteId)
    .eq('conversation_type', 'gallery')
    .order('created_at', { ascending: false })
    .limit(1);

  if (shipperBranchOrgId !== undefined) {
    query =
      shipperBranchOrgId === null
        ? query.is('shipper_branch_org_id', null)
        : query.eq('shipper_branch_org_id', shipperBranchOrgId);
  }

  if (galleryBranchOrgId !== undefined) {
    query =
      galleryBranchOrgId === null
        ? query.is('gallery_branch_org_id', null)
        : query.eq('gallery_branch_org_id', galleryBranchOrgId);
  }

  const result = await query.maybeSingle();

  if (result.error) {
    throw new Error(`chatRepository.getThreadByQuoteScope: ${result.error.message}`);
  }

  return (result.data as ChatThread | null) ?? null;
};

export const getThreadByShipmentScope = async (
  shipmentId: string,
  shipperBranchOrgId?: string | null,
  galleryBranchOrgId?: string | null
): Promise<ChatThread | null> => {
  let query = supabaseAdmin
    .from('chat_threads')
    .select('*')
    .eq('shipment_id', shipmentId)
    .eq('conversation_type', 'gallery')
    .order('created_at', { ascending: false })
    .limit(1);

  if (shipperBranchOrgId !== undefined) {
    query =
      shipperBranchOrgId === null
        ? query.is('shipper_branch_org_id', null)
        : query.eq('shipper_branch_org_id', shipperBranchOrgId);
  }

  if (galleryBranchOrgId !== undefined) {
    query =
      galleryBranchOrgId === null
        ? query.is('gallery_branch_org_id', null)
        : query.eq('gallery_branch_org_id', galleryBranchOrgId);
  }

  const result = await query.maybeSingle();

  if (result.error) {
    throw new Error(`chatRepository.getThreadByShipmentScope: ${result.error.message}`);
  }

  return (result.data as ChatThread | null) ?? null;
};

export const getThreadByUniqueName = async (
  uniqueName: string
): Promise<ChatThread | null> => {
  const result = await supabaseAdmin
    .from('chat_threads')
    .select('*')
    .eq('twilio_unique_name', uniqueName)
    .maybeSingle();

  if (result.error) {
    throw new Error(`chatRepository.getThreadByUniqueName: ${result.error.message}`);
  }

  return (result.data as ChatThread | null) ?? null;
};

export const createThread = async (
  payload: Omit<ChatThread, 'id' | 'last_message_at' | 'created_at' | 'updated_at'>
): Promise<ChatThread> => {
  const result = await supabaseAdmin
    .from('chat_threads')
    .insert({
      quote_id: payload.quote_id,
      shipment_id: payload.shipment_id,
      organization_id: payload.organization_id,
      shipper_branch_org_id: payload.shipper_branch_org_id ?? null,
      gallery_branch_org_id: payload.gallery_branch_org_id ?? null,
      twilio_conversation_sid: payload.twilio_conversation_sid,
      twilio_unique_name: payload.twilio_unique_name,
      status: payload.status,
      metadata: payload.metadata,
      created_by: payload.created_by,
      conversation_type: payload.conversation_type,
      initiator_shipper_org_id: payload.initiator_shipper_org_id ?? null,
    })
    .select('*')
    .single();

  if (result.error) {
    throw new Error(`chatRepository.createThread: ${result.error.message}`);
  }

  return result.data as ChatThread;
};

export const ensureThreadShipper = async (
  threadId: string,
  shipperBranchOrgId: string,
  role: string
): Promise<ChatThreadShipper> => {
  const result = await supabaseAdmin
    .from('chat_thread_shippers')
    .upsert(
      {
        thread_id: threadId,
        shipper_branch_org_id: shipperBranchOrgId,
        role,
      },
      {
        onConflict: 'thread_id, shipper_branch_org_id',
      }
    )
    .select('*')
    .maybeSingle();

  if (result.error) {
    throw new Error(`chatRepository.ensureThreadShipper: ${result.error.message}`);
  }

  return result.data as ChatThreadShipper;
};

export const getThreadShippers = async (
  threadId: string
): Promise<ChatThreadShipper[]> => {
  const result = await supabaseAdmin
    .from('chat_thread_shippers')
    .select('*')
    .eq('thread_id', threadId);

  if (result.error) {
    throw new Error(`chatRepository.getThreadShippers: ${result.error.message}`);
  }

  return (result.data as ChatThreadShipper[]) ?? [];
};

export const upsertParticipant = async (
  payload: {
    thread_id: string;
    user_id: string;
    organization_id: string | null;
    role: string;
    twilio_identity: string;
    twilio_role_sid: string;
  }
): Promise<ChatThreadParticipant> => {
  const result = await supabaseAdmin
    .from('chat_thread_participants')
    .upsert(
      {
        ...payload,
        joined_at: new Date().toISOString(),
        left_at: null,
      },
      {
        onConflict: 'thread_id,user_id',
        ignoreDuplicates: false,
      }
    )
    .select('*')
    .single();

  if (result.error) {
    throw new Error(`chatRepository.upsertParticipant: ${result.error.message}`);
  }

  return result.data as ChatThreadParticipant;
};

export const getParticipantRecord = async (
  threadId: string,
  userId: string
): Promise<ChatThreadParticipant | null> => {
  const result = await supabaseAdmin
    .from('chat_thread_participants')
    .select('*')
    .eq('thread_id', threadId)
    .eq('user_id', userId)
    .maybeSingle();

  if (result.error) {
    throw new Error(`chatRepository.getParticipantRecord: ${result.error.message}`);
  }

  return (result.data as ChatThreadParticipant | null) ?? null;
};

export const getQuoteContext = async (
  quoteId: string
): Promise<QuoteContext | null> => {
  const result = await supabaseAdmin
    .from('quotes')
    .select('id, title, owner_org_id, shipment_id, submitted_by')
    .eq('id', quoteId)
    .maybeSingle();

  if (result.error) {
    throw new Error(`chatRepository.getQuoteContext: ${result.error.message}`);
  }

  if (!result.data) {
    return null;
  }

  return {
    id: result.data.id,
    title: result.data.title ?? null,
    owner_org_id: result.data.owner_org_id,
    shipment_id: result.data.shipment_id ?? null,
    submitted_by: result.data.submitted_by ?? null,
  };
};

export const updateThreadMetadata = async (
  threadId: string,
  metadata: Record<string, unknown>
) => {
  const result = await supabaseAdmin
    .from('chat_threads')
    .update({ metadata })
    .eq('id', threadId)
    .select('metadata')
    .single();

  if (result.error) {
    throw new Error(`chatRepository.updateThreadMetadata: ${result.error.message}`);
  }

  return (result.data?.metadata as Record<string, unknown>) ?? {};
};

export const updateThreadScope = async (
  threadId: string,
  updates: {
    shipper_branch_org_id?: string | null;
    gallery_branch_org_id?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<ChatThread> => {
  const payload: Record<string, unknown> = {};

  if (updates.shipper_branch_org_id !== undefined) {
    payload.shipper_branch_org_id = updates.shipper_branch_org_id ?? null;
  }

  if (updates.gallery_branch_org_id !== undefined) {
    payload.gallery_branch_org_id = updates.gallery_branch_org_id ?? null;
  }

  if (updates.metadata !== undefined) {
    payload.metadata = updates.metadata;
  }

  if (Object.keys(payload).length === 0) {
    const existing = await getThreadById(threadId);
    if (!existing) {
      throw new Error('chatRepository.updateThreadScope: thread not found');
    }
    return existing;
  }

  const result = await supabaseAdmin
    .from('chat_threads')
    .update(payload)
    .eq('id', threadId)
    .select('*')
    .single();

  if (result.error) {
    throw new Error(`chatRepository.updateThreadScope: ${result.error.message}`);
  }

  return result.data as ChatThread;
};

export const getOrganizationById = async (
  organizationId: string
): Promise<OrganizationSummary | null> => {
  const result = await supabaseAdmin
    .from('organizations')
    .select('id, name, type, img_url, branch_name')
    .eq('id', organizationId)
    .maybeSingle();

  if (result.error) {
    throw new Error(`chatRepository.getOrganizationById: ${result.error.message}`);
  }

  if (!result.data) {
    return null;
  }

  return {
    id: result.data.id,
    name: result.data.name,
    type: result.data.type,
    logoUrl: result.data.img_url ?? null,
    branchName: result.data.branch_name ?? null,
  } as OrganizationSummary;
};

export const getProfileByUserId = async (
  userId: string
): Promise<ProfileSummary | null> => {
  const result = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, default_org')
    .eq('id', userId)
    .maybeSingle();

  if (result.error) {
    throw new Error(`chatRepository.getProfileByUserId: ${result.error.message}`);
  }

  if (!result.data) {
    return null;
  }

  return {
    id: result.data.id,
    full_name: result.data.full_name ?? null,
    default_org: result.data.default_org ?? null,
  };
};

export const getMembershipForOrg = async (
  userId: string,
  organizationId: string
) => {
  const result = await supabaseAdmin
    .from('memberships')
    .select('user_id, org_id, role')
    .eq('user_id', userId)
    .eq('org_id', organizationId)
    .maybeSingle();

  if (result.error) {
    throw new Error(`chatRepository.getMembershipForOrg: ${result.error.message}`);
  }

  return result.data;
};

export const getMembershipsForUser = async (
  userId: string
): Promise<MembershipRecord[]> => {
  const result = await supabaseAdmin
    .from('memberships')
    .select('org_id, role')
    .eq('user_id', userId);

  if (result.error) {
    throw new Error(`chatRepository.getMembershipsForUser: ${result.error.message}`);
  }

  return (result.data as MembershipRecord[]) ?? [];
};

export const getMembersForOrganization = async (
  organizationId: string
): Promise<OrganizationMemberRecord[]> => {
  const result = await supabaseAdmin
    .from('memberships')
    .select('user_id, role')
    .eq('org_id', organizationId);

  if (result.error) {
    throw new Error(`chatRepository.getMembersForOrganization: ${result.error.message}`);
  }

  return (result.data as OrganizationMemberRecord[]) ?? [];
};

export const getQuoteIdsForOrganization = async (
  organizationId: string
): Promise<QuoteIdentifier[]> => {
  const result = await supabaseAdmin
    .from('quotes')
    .select('id')
    .eq('owner_org_id', organizationId);

  if (result.error) {
    throw new Error(`chatRepository.getQuoteIdsForOrganization: ${result.error.message}`);
  }

  return (result.data as QuoteIdentifier[]) ?? [];
};

export const getThreadByTwilioSid = async (
  conversationSid: string
): Promise<ChatThread | null> => {
  const result = await supabaseAdmin
    .from('chat_threads')
    .select('*')
    .eq('twilio_conversation_sid', conversationSid)
    .maybeSingle();

  if (result.error) {
    throw new Error(`chatRepository.getThreadByTwilioSid: ${result.error.message}`);
  }

  return (result.data as ChatThread | null) ?? null;
};

export interface MessageAuditInput {
  threadId: string;
  messageSid: string;
  authorIdentity: string;
  authorUserId?: string | null;
  bodyPreview?: string | null;
  media?: Record<string, unknown>[] | null;
  sentAt: string;
  deliveryStatus?: string | null;
}

export const recordMessageAudit = async (
  input: MessageAuditInput
) => {
  const result = await supabaseAdmin
    .from('chat_message_audit')
    .upsert(
      {
        thread_id: input.threadId,
        message_sid: input.messageSid,
        author_identity: input.authorIdentity,
        author_user_id: input.authorUserId ?? null,
        body_preview: input.bodyPreview ?? null,
        media: input.media ?? null,
        sent_at: input.sentAt,
        delivery_status: input.deliveryStatus ?? null,
      },
      { onConflict: 'thread_id,message_sid' }
    );

  if (result.error) {
    throw new Error(`chatRepository.recordMessageAudit: ${result.error.message}`);
  }
};

export const updateThreadLastMessageAt = async (
  threadId: string,
  isoTimestamp: string
) => {
  const result = await supabaseAdmin
    .from('chat_threads')
    .update({ last_message_at: isoTimestamp })
    .eq('id', threadId);

  if (result.error) {
    throw new Error(`chatRepository.updateThreadLastMessageAt: ${result.error.message}`);
  }
};

export const updateParticipantReadState = async (
  threadId: string,
  twilioIdentity: string,
  params: { lastReadMessageIndex?: number | null; lastReadAt?: string | null }
) => {
  const result = await supabaseAdmin
    .from('chat_thread_participants')
    .update({
      last_read_message_index: params.lastReadMessageIndex ?? null,
      last_read_at: params.lastReadAt ?? null,
    })
    .eq('thread_id', threadId)
    .eq('twilio_identity', twilioIdentity);

  if (result.error) {
    throw new Error(`chatRepository.updateParticipantReadState: ${result.error.message}`);
  }
};
export const markParticipantLeft = async (
  threadId: string,
  twilioIdentity: string,
  leftAtIso: string
) => {
  const result = await supabaseAdmin
    .from('chat_thread_participants')
    .update({ left_at: leftAtIso })
    .eq('thread_id', threadId)
    .eq('twilio_identity', twilioIdentity);

  if (result.error) {
    throw new Error(`chatRepository.markParticipantLeft: ${result.error.message}`);
  }
};
