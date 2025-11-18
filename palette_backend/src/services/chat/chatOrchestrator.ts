import { createHash } from 'node:crypto';
import {
  addParticipantToConversation,
  createConversation,
  fetchConversation,
  updateConversationAttributes,
} from '../twilio/conversationsClient.js';
import {
  ChatThread,
  ChatThreadParticipant,
  QuoteContext,
  OrganizationSummary,
  getMembershipForOrg,
  getOrganizationById,
  getParticipantRecord,
  getProfileByUserId,
  getQuoteContext,
  getThreadByQuoteId,
  getThreadById,
  getThreadByQuoteScope,
  getThreadByShipmentScope,
  getThreadByUniqueName,
  upsertParticipant,
  createThread,
  getMembersForOrganization,
  updateThreadMetadata,
  updateThreadScope,
  ensureThreadShipper,
  getThreadShippers,
} from './chatRepository.js';

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export interface EnsureThreadInput {
  quoteId: string;
  initiatorUserId: string;
  shipmentId?: string | null;
  shipperBranchOrgId?: string | null;
  galleryBranchOrgId?: string | null;
}

type ConversationScope = {
  shipmentId: string | null;
  shipperBranchOrgId: string | null;
  galleryBranchOrgId: string | null;
};

export interface EnsureThreadResult {
  thread: ChatThread;
  quote: QuoteContext;
}

export interface EnsureParticipantResult {
  participant: ChatThreadParticipant;
  identity: string;
  role: 'client' | 'shipper';
  thread: ChatThread;
}

export interface EnsureParticipantOptions {
  organizationId?: string;
  roleOverride?: 'client' | 'shipper';
}

export interface EnsurePeerThreadInput {
  initiatorUserId: string;
  initiatorShipperOrgId: string;
  targetShipperOrgId: string;
  quoteId?: string | null;
  shipmentId?: string | null;
  includeGallery?: boolean;
}

export interface EnsurePeerThreadResult {
  thread: ChatThread;
  created: boolean;
}

const scopeHash = (scope: ConversationScope) => {
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify({
      shipmentId: scope.shipmentId,
      shipperBranchOrgId: scope.shipperBranchOrgId,
      galleryBranchOrgId: scope.galleryBranchOrgId,
    })
  );
  return hash.digest('hex').slice(0, 24);
};

const buildQuoteConversationName = (quoteId: string, scope: ConversationScope, scoped: boolean) => {
  if (!scoped) {
    return `quote::${quoteId}`;
  }
  return `quote::${quoteId}::scope::${scopeHash(scope)}`;
};

const orderOrgIds = (a: string, b: string): [string, string] => {
  return a.localeCompare(b, undefined, { sensitivity: 'base' }) <= 0 ? [a, b] : [b, a];
};

const buildPeerConversationName = (
  initiatorOrgId: string,
  targetOrgId: string,
  quoteId?: string | null,
  shipmentId?: string | null
) => {
  const [primary, secondary] = orderOrgIds(initiatorOrgId, targetOrgId);
  const parts = ['shipper-peer', primary, secondary];
  parts.push(`quote:${quoteId ?? 'none'}`);
  parts.push(`shipment:${shipmentId ?? 'none'}`);
  return parts.join('::');
};

const resolveScope = (
  quote: QuoteContext,
  input: EnsureThreadInput
): {
  scope: ConversationScope;
  scoped: boolean;
  filters: {
    shipperBranchOrgId?: string | null;
    galleryBranchOrgId?: string | null;
    shipmentId?: string | null;
  };
} => {
  const shipperProvided = input.shipperBranchOrgId !== undefined;
  const galleryProvided = input.galleryBranchOrgId !== undefined;
  const shipmentProvided = input.shipmentId !== undefined;

  const scopeRequested = shipperProvided || galleryProvided || shipmentProvided;

  const shipperBranchOrgId = shipperProvided ? input.shipperBranchOrgId ?? null : null;
  const galleryBranchOrgId = galleryProvided
    ? input.galleryBranchOrgId ?? null
    : scopeRequested
      ? quote.owner_org_id ?? null
      : null;
  const shipmentId = shipmentProvided ? input.shipmentId ?? null : quote.shipment_id ?? null;

  const filters = {
    shipperBranchOrgId: scopeRequested ? shipperBranchOrgId : undefined,
    galleryBranchOrgId: scopeRequested ? galleryBranchOrgId : undefined,
    shipmentId: shipmentProvided ? shipmentId : undefined,
  };

  const scoped =
    scopeRequested &&
    (shipperBranchOrgId !== null || galleryBranchOrgId !== null || shipmentId !== null);

  return {
    scope: {
      shipperBranchOrgId,
      galleryBranchOrgId,
      shipmentId,
    },
    scoped,
    filters,
  };
};

const scopeValuesMatch = (
  requested: string | null | undefined,
  current: string | null | undefined
) => {
  if (requested === undefined) {
    return true;
  }

  const normalizedRequested = requested ?? null;
  const normalizedCurrent = current ?? null;
  return normalizedCurrent === normalizedRequested;
};

export const ensureThreadForQuote = async (
  input: EnsureThreadInput
): Promise<EnsureThreadResult> => {
  const quote = await getQuoteContext(input.quoteId);
  if (!quote) {
    throw new Error('Quote not found');
  }

  const { scope, scoped, filters } = resolveScope(quote, input);

  let thread: ChatThread | null = null;

  if (scoped) {
    thread = await getThreadByQuoteScope(
      input.quoteId,
      filters.shipperBranchOrgId,
      filters.galleryBranchOrgId
    );

    if (
      !thread &&
      filters.shipmentId !== undefined &&
      filters.shipmentId !== null
    ) {
      thread = await getThreadByShipmentScope(
        filters.shipmentId,
        filters.shipperBranchOrgId,
        filters.galleryBranchOrgId
      );
    }
  }

  if (!thread) {
    const fallback = await getThreadByQuoteId(input.quoteId);
    if (fallback) {
      const matchesScope =
        scopeValuesMatch(filters.shipperBranchOrgId, fallback.shipper_branch_org_id) &&
        scopeValuesMatch(filters.galleryBranchOrgId, fallback.gallery_branch_org_id) &&
        scopeValuesMatch(filters.shipmentId, fallback.shipment_id);

      if (!scoped) {
        thread = fallback;
      } else if (matchesScope) {
        thread = fallback;
      }
    }
  }

  if (thread) {
    const metadata = normaliseMetadata(thread.metadata);
    metadata.shipperBranchOrgId = scope.shipperBranchOrgId;
    metadata.galleryBranchOrgId = scope.galleryBranchOrgId;
    metadata.shipmentId = scope.shipmentId;

    if (
      scoped &&
      (thread.shipper_branch_org_id !== scope.shipperBranchOrgId ||
        thread.gallery_branch_org_id !== scope.galleryBranchOrgId)
    ) {
      thread = await updateThreadScope(thread.id, {
        shipper_branch_org_id: scope.shipperBranchOrgId,
        gallery_branch_org_id: scope.galleryBranchOrgId,
        metadata,
      });
    } else {
      await updateThreadMetadata(thread.id, metadata);
      thread.metadata = metadata;
    }

    await seedDefaultParticipants(thread, quote, input.initiatorUserId, scope);
    return { thread, quote };
  }

  const uniqueName = buildQuoteConversationName(input.quoteId, scope, scoped);

  let conversation;
  try {
    conversation = await createConversation({
      uniqueName,
      friendlyName: quote.title || `Quote ${input.quoteId}`,
      attributes: {
        quoteId: quote.id,
        organizationId: quote.owner_org_id,
        createdBy: input.initiatorUserId,
        shipperBranchOrgId: scope.shipperBranchOrgId,
        galleryBranchOrgId: scope.galleryBranchOrgId,
        shipmentId: scope.shipmentId,
      },
    });
  } catch (error: any) {
    const duplicateConversation =
      typeof error?.status === 'number' && error.status === 409;

    if (duplicateConversation) {
      conversation = await fetchConversation(uniqueName);
    } else {
      throw error;
    }
  }

  try {
    const thread = await createThread({
      quote_id: quote.id,
      shipment_id: scope.shipmentId,
      organization_id: quote.owner_org_id,
      shipper_branch_org_id: scope.shipperBranchOrgId,
      gallery_branch_org_id: scope.galleryBranchOrgId,
      twilio_conversation_sid: conversation.sid,
      twilio_unique_name: uniqueName,
      status: 'active',
      metadata: {
        quoteId: quote.id,
        quoteTitle: quote.title,
        organizationId: quote.owner_org_id,
        participants: [],
        shipperBranchOrgId: scope.shipperBranchOrgId,
        galleryBranchOrgId: scope.galleryBranchOrgId,
        shipmentId: scope.shipmentId,
        conversationType: 'gallery',
      },
      created_by: input.initiatorUserId,
      conversation_type: 'gallery',
      initiator_shipper_org_id: scope.shipperBranchOrgId ?? null,
    });

    await seedDefaultParticipants(thread, quote, input.initiatorUserId, scope);
    return { thread, quote };
  } catch (error: any) {
    const constraintViolation =
      typeof error?.message === 'string' &&
      error.message.includes('duplicate key value');

    if (constraintViolation) {
      let thread = await getThreadByQuoteScope(
        input.quoteId,
        filters.shipperBranchOrgId,
        filters.galleryBranchOrgId
      );

      if (!thread) {
        thread = await getThreadByQuoteId(input.quoteId);
      }

      if (thread) {
        await seedDefaultParticipants(thread, quote, input.initiatorUserId, scope);
        return { thread, quote };
      }
    }

    throw error;
  }
};

export const ensurePeerThread = async (
  input: EnsurePeerThreadInput
): Promise<EnsurePeerThreadResult> => {
  const initiatorOrgId = typeof input.initiatorShipperOrgId === 'string'
    ? input.initiatorShipperOrgId.trim()
    : '';
  const targetOrgId = typeof input.targetShipperOrgId === 'string'
    ? input.targetShipperOrgId.trim()
    : '';

  if (!initiatorOrgId || !targetOrgId) {
    throw new Error('Both initiator and target shipper organization IDs are required');
  }

  if (initiatorOrgId === targetOrgId) {
    throw new Error('Cannot open a shipper peer conversation with the same organization');
  }

  const uniqueName = buildPeerConversationName(
    initiatorOrgId,
    targetOrgId,
    input.quoteId ?? null,
    input.shipmentId ?? null
  );

  let thread = await getThreadByUniqueName(uniqueName);
  let created = false;
  let conversationSid: string | null = thread?.twilio_conversation_sid ?? null;

  if (!thread) {
    let conversation;
    try {
      const conversationAttributes: Record<string, unknown> = {
        shipmentId: input.shipmentId ?? null,
        initiatorUserId: input.initiatorUserId,
        initiatorShipperOrgId: initiatorOrgId,
        targetShipperOrgId: targetOrgId,
        conversationType: 'shipper_peer',
      };

      if (input.quoteId) {
        conversationAttributes.quoteId = input.quoteId;
      }

      conversation = await createConversation({
        uniqueName,
        friendlyName: 'Shipper Collaboration',
        attributes: conversationAttributes,
      });
    } catch (error: any) {
      const duplicateConversation =
        typeof error?.status === 'number' && error.status === 409;

      if (!duplicateConversation) {
        throw error;
      }

      conversation = await fetchConversation(uniqueName);
    }

    conversationSid = conversation.sid;

    thread = await createThread({
      quote_id: input.quoteId ?? null,
      shipment_id: input.shipmentId ?? null,
      organization_id: initiatorOrgId,
      shipper_branch_org_id: initiatorOrgId,
      gallery_branch_org_id: null,
      twilio_conversation_sid: conversation.sid,
      twilio_unique_name: uniqueName,
      status: 'active',
      metadata: {
        quoteId: input.quoteId ?? null,
        shipmentId: input.shipmentId ?? null,
        participants: [],
        peerShipperOrgIds: orderOrgIds(initiatorOrgId, targetOrgId),
        conversationType: 'shipper_peer',
      },
      created_by: input.initiatorUserId,
      conversation_type: 'shipper_peer',
      initiator_shipper_org_id: initiatorOrgId,
    });

    created = true;
  }

  const initiatorRole = thread.initiator_shipper_org_id === initiatorOrgId ? 'initiator' : 'peer';
  const targetRole = thread.initiator_shipper_org_id === targetOrgId ? 'initiator' : 'peer';

  await ensureThreadShipper(thread.id, initiatorOrgId, initiatorRole);
  await ensureThreadShipper(thread.id, targetOrgId, targetRole);

  const threadShippers = await getThreadShippers(thread.id);
  const sortedOrgIds = Array.from(
    new Set(threadShippers.map((shipper) => shipper.shipper_branch_org_id))
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  const orgSummaries = await Promise.all(
    sortedOrgIds.map(async (orgId) => {
      const summary = await getOrganizationById(orgId);
      const matching = threadShippers.find(
        (item) => item.shipper_branch_org_id === orgId
      );
      return {
        id: orgId,
        name: summary?.name ?? 'Logistics Partner',
        role: matching?.role ?? (orgId === thread.initiator_shipper_org_id ? 'initiator' : 'peer'),
        logoUrl: summary?.logoUrl ?? null,
      };
    })
  );

  const metadata = normaliseMetadata(thread.metadata);
  metadata.conversationType = 'shipper_peer';
  metadata.peerShipperOrgIds = sortedOrgIds;
  metadata.peerOrganizations = orgSummaries;
  metadata.initiatorShipperOrgId = thread.initiator_shipper_org_id ?? initiatorOrgId;
  metadata.quoteId = thread.quote_id ?? input.quoteId ?? null;
  metadata.shipmentId = thread.shipment_id ?? input.shipmentId ?? null;

  thread.metadata = await updateThreadMetadata(thread.id, metadata);

  if (conversationSid) {
    try {
      await updateConversationAttributes(conversationSid, {
        quoteId: metadata.quoteId ?? undefined,
        shipmentId: metadata.shipmentId ?? null,
        initiatorShipperOrgId: metadata.initiatorShipperOrgId ?? undefined,
        peerShipperOrgIds: sortedOrgIds,
        conversationType: 'shipper_peer',
      });
    } catch (error) {
      console.warn('[chat] Failed to update Twilio peer conversation attributes', {
        threadId: thread.id,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  await ensureParticipantInThread(thread.id, input.initiatorUserId, {
    organizationId: initiatorOrgId,
    roleOverride: 'shipper',
  });

  const seedBranchMembers = async (organizationId: string) => {
    try {
      const members = await getMembersForOrganization(organizationId);
      for (const member of members) {
        const userId = member.user_id;
        if (!userId || userId === input.initiatorUserId) {
          continue;
        }
        await ensureParticipantInThread(thread.id, userId, {
          organizationId,
          roleOverride: 'shipper',
        });
      }
    } catch (error) {
      console.warn('[chat] Failed to seed shipper participants', {
        threadId: thread.id,
        organizationId,
        error: error instanceof Error ? error.message : error,
      });
    }
  };

  await seedBranchMembers(initiatorOrgId);
  await seedBranchMembers(targetOrgId);

  return { thread, created };
};

const resolveParticipantRole = (organizationType: string): 'client' | 'shipper' => {
  return organizationType === 'partner' ? 'shipper' : 'client';
};

const buildIdentity = (role: 'client' | 'shipper', userId: string) =>
  `${role}:${userId}`;

type ParticipantSummary = {
  id: string;
  identity: string;
  role: 'client' | 'shipper';
  name: string;
  organizationId: string;
  organizationName: string;
  organizationLogoUrl?: string | null;
};

const deriveDisplayName = (
  profile: Awaited<ReturnType<typeof getProfileByUserId>>,
  organization: OrganizationSummary,
  role: 'client' | 'shipper'
) => {
  const formattedName = profile?.full_name?.trim();
  if (formattedName) {
    return formattedName;
  }

  if (role === 'shipper') {
    return organization.name || 'Logistics Partner Team';
  }

  return organization.name || 'Gallery Team';
};

const normaliseMetadata = (metadata: unknown): Record<string, any> => {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return { ...(metadata as Record<string, any>) };
  }
  return {};
};

const upsertParticipantMetadata = (
  metadata: Record<string, any>,
  summary: ParticipantSummary
) => {
  const participants: ParticipantSummary[] = Array.isArray(metadata.participants)
    ? [...metadata.participants]
    : [];

  const index = participants.findIndex((participant) => participant?.id === summary.id);
  if (index >= 0) {
    participants[index] = { ...participants[index], ...summary };
  } else {
    participants.push(summary);
  }

  metadata.participants = participants;

  if (summary.role === 'client') {
    metadata.partnerName = metadata.partnerName || summary.name;
    metadata.partnerCompany = metadata.partnerCompany || summary.organizationName;
    metadata.partnerOrgId = summary.organizationId;
    metadata.partnerLogoUrl = metadata.partnerLogoUrl || summary.organizationLogoUrl || null;
  } else if (summary.role === 'shipper') {
    metadata.shipperName = metadata.shipperName || summary.name;
    metadata.shipperCompany = metadata.shipperCompany || summary.organizationName;
    metadata.shipperOrgId = summary.organizationId;
    metadata.shipperLogoUrl = metadata.shipperLogoUrl || summary.organizationLogoUrl || null;
  }
};

const syncThreadParticipantMetadata = async (
  thread: ChatThread,
  summary: ParticipantSummary
) => {
  try {
    const metadata = normaliseMetadata(thread.metadata);
    metadata.shipperBranchOrgId = thread.shipper_branch_org_id ?? null;
    metadata.galleryBranchOrgId = thread.gallery_branch_org_id ?? null;
    metadata.shipmentId = thread.shipment_id ?? null;
    const before = JSON.stringify(metadata);
    upsertParticipantMetadata(metadata, summary);
    const after = JSON.stringify(metadata);

    if (before === after) {
      return;
    }

    await updateThreadMetadata(thread.id, metadata);
    thread.metadata = metadata;

    try {
      await updateConversationAttributes(thread.twilio_conversation_sid, metadata);
    } catch (error) {
      console.warn('[chat] Failed to update Twilio conversation attributes', {
        threadId: thread.id,
        error: error instanceof Error ? error.message : error,
      });
    }
  } catch (error) {
    console.warn('[chat] Failed to persist participant metadata', {
      threadId: thread.id,
      participantId: summary.id,
      error: error instanceof Error ? error.message : error,
    });
  }
};

const seedDefaultParticipants = async (
  thread: ChatThread,
  quote: QuoteContext,
  initiatorUserId: string,
  scope: ConversationScope
) => {
  const galleryOrgId = scope.galleryBranchOrgId ?? quote.owner_org_id ?? null;
  const shipperOrgId = scope.shipperBranchOrgId ?? null;

  const ensureMember = async (
    userId: string,
    organizationId: string | null,
    roleOverride: 'client' | 'shipper'
  ) => {
    if (!userId || userId === initiatorUserId) {
      return;
    }

    try {
      await ensureParticipantInThread(thread.id, userId, {
        organizationId: organizationId ?? undefined,
        roleOverride,
      });
    } catch (error) {
      console.warn('[chat] Unable to seed default participant', {
        threadId: thread.id,
        userId,
        role: roleOverride,
        organizationId,
        error: error instanceof Error ? error.message : error,
      });
    }
  };

  if (quote.submitted_by) {
    await ensureMember(quote.submitted_by, galleryOrgId, 'client');
  }

  const seedOrgMembers = async (organizationId: string | null, role: 'client' | 'shipper') => {
    if (!organizationId) {
      return;
    }

    try {
      const members = await getMembersForOrganization(organizationId);
      const userIds = members
        .map((member) => member.user_id)
        .filter((userId): userId is string => Boolean(userId));

      for (const userId of userIds) {
        await ensureMember(userId, organizationId, role);
      }
    } catch (error) {
      console.warn('[chat] Failed to load organization members for seeding participants', {
        organizationId,
        role,
        error,
      });
    }
  };

  await seedOrgMembers(galleryOrgId, 'client');
  await seedOrgMembers(shipperOrgId, 'shipper');
};

export const ensureParticipantInThread = async (
  threadId: string,
  userId: string,
  options: EnsureParticipantOptions = {}
): Promise<EnsureParticipantResult> => {
  const thread = await getThreadById(threadId);
  if (!thread) {
    throw new Error('Chat thread not found');
  }

  const existingParticipant = await getParticipantRecord(threadId, userId);

  const targetOrgId = options.organizationId ?? thread.organization_id;

  const organization = await getOrganizationById(targetOrgId);
  if (!organization) {
    throw new Error('Target organization not found');
  }

  if (existingParticipant && !existingParticipant.left_at) {
    const identityRole = existingParticipant.role === 'shipper' ? 'shipper' : 'client';
    const profile = await getProfileByUserId(userId);
    const displayName = deriveDisplayName(profile, organization, identityRole);

    await syncThreadParticipantMetadata(thread, {
      id: userId,
      identity: existingParticipant.twilio_identity,
      role: identityRole,
      name: displayName,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationLogoUrl: organization.logoUrl ?? null,
    });

    return {
      participant: existingParticipant,
      identity: existingParticipant.twilio_identity,
      role: identityRole,
      thread,
    };
  }

  const membership = await getMembershipForOrg(userId, targetOrgId);
  if (!membership) {
    throw new Error('User is not a member of the target organization');
  }

  const role = options.roleOverride ?? resolveParticipantRole(organization.type);
  const profile = await getProfileByUserId(userId);

  const twilioIdentity = buildIdentity(role, userId);
  const twilioRoleSid =
    role === 'shipper'
      ? getRequiredEnv('TWILIO_ROLE_SHIPPER_SID')
      : getRequiredEnv('TWILIO_ROLE_CLIENT_SID');

  const participant = await upsertParticipant({
    thread_id: thread.id,
    user_id: userId,
    organization_id: targetOrgId,
    role,
    twilio_identity: twilioIdentity,
    twilio_role_sid: twilioRoleSid,
  });

  await addParticipantToConversation({
    conversationSid: thread.twilio_conversation_sid,
    identity: twilioIdentity,
    roleSid: twilioRoleSid,
  }).catch((error) => {
    console.error('[chatOrchestrator] addParticipant failed', error);
  });

  const displayName = deriveDisplayName(profile, organization, role);

  await syncThreadParticipantMetadata(thread, {
    id: userId,
    identity: twilioIdentity,
    role,
    name: displayName,
    organizationId: organization.id,
    organizationName: organization.name,
    organizationLogoUrl: organization.logoUrl ?? null,
  });

  return {
    participant,
    identity: twilioIdentity,
    role,
    thread,
  };
};
