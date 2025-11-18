import {
  ensureParticipantInThread,
  ensureThreadForQuote,
} from './chatOrchestrator.js';
import {
  getMembershipsForUser,
  getQuoteIdsForOrganization,
} from './chatRepository.js';

export interface ProvisionOptions {
  organizationIds?: string[];
}

export interface ProvisionResult {
  processedOrganizations: number;
  ensuredThreads: number;
  ensuredParticipants: number;
}

const unique = <T>(entries: T[]): T[] => Array.from(new Set(entries));

export const provisionUserConversations = async (
  userId: string,
  options: ProvisionOptions = {}
): Promise<ProvisionResult> => {
  const memberships = await getMembershipsForUser(userId);

  const targetOrgIds = options.organizationIds && options.organizationIds.length > 0
    ? unique(options.organizationIds)
    : unique(memberships.map((membership) => membership.org_id).filter(Boolean));

  let ensuredThreads = 0;
  let ensuredParticipants = 0;

  for (const organizationId of targetOrgIds) {
    const quotes = await getQuoteIdsForOrganization(organizationId);

    for (const quote of quotes) {
      const { thread } = await ensureThreadForQuote({
        quoteId: quote.id,
        initiatorUserId: userId,
      });
      ensuredThreads += 1;

      await ensureParticipantInThread(thread.id, userId, {
        organizationId,
      });
      ensuredParticipants += 1;
    }
  }

  return {
    processedOrganizations: targetOrgIds.length,
    ensuredThreads,
    ensuredParticipants,
  };
};
