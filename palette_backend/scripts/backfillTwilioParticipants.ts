import process from 'node:process';
import { supabaseAdmin } from '../src/supabaseClient.js';
import {
  ensureParticipantInThread,
  ensureThreadForQuote,
} from '../src/services/chat/chatOrchestrator.js';

interface CliOptions {
  threadId?: string;
  quoteId?: string;
  organizationIds: string[];
  userIds: string[];
}

const readArgValues = (flag: string): string[] => {
  const values: string[] = [];
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag && args[index + 1]) {
      values.push(args[index + 1]);
      index += 1;
    }
  }
  return values;
};

const readSingleArg = (flag: string): string | undefined => {
  const values = readArgValues(flag);
  return values.length > 0 ? values[values.length - 1] : undefined;
};

const parseCliOptions = (): CliOptions => {
  const threadId = readSingleArg('--thread');
  const quoteId = readSingleArg('--quote');
  const organizationValues = readArgValues('--org').flatMap((value) =>
    value.split(',').map((entry) => entry.trim()).filter(Boolean)
  );
  const userValues = readArgValues('--user').flatMap((value) =>
    value.split(',').map((entry) => entry.trim()).filter(Boolean)
  );

  return {
    threadId,
    quoteId,
    organizationIds: organizationValues,
    userIds: userValues,
  };
};

const ensureThread = async (options: CliOptions, initiatorUserId?: string): Promise<string> => {
  if (options.threadId) {
    return options.threadId;
  }

  if (!options.quoteId) {
    throw new Error('Either --thread or --quote must be provided');
  }

  if (!initiatorUserId) {
    throw new Error('An initiator user ID is required when resolving a thread from --quote');
  }

  const { thread } = await ensureThreadForQuote({
    quoteId: options.quoteId,
    initiatorUserId,
  });

  return thread.id;
};

const collectOrgMembers = async (organizationId: string): Promise<string[]> => {
  const { data, error } = await supabaseAdmin
    .from('memberships')
    .select('user_id')
    .eq('org_id', organizationId);

  if (error) {
    throw new Error(`Failed to load memberships for org ${organizationId}: ${error.message}`);
  }

  return (data ?? []).map((row) => row.user_id as string).filter(Boolean);
};

const ensureUsers = async (
  threadId: string,
  userIds: string[],
  organizationId?: string
) => {
  for (const userId of userIds) {
    try {
      await ensureParticipantInThread(threadId, userId, {
        organizationId,
      });
      console.log(`✅ ensured participant ${userId} in thread ${threadId}`);
    } catch (error: any) {
      console.error(`❌ failed to enroll ${userId}:`, error?.message || error);
    }
  }
};

const run = async () => {
  const options = parseCliOptions();

  if (!options.threadId && !options.quoteId) {
    console.error('Usage: tsx scripts/backfillTwilioParticipants.ts --thread <threadId> [--org <orgId>] [--user <userId>] [--initiator <userId>]');
    console.error('   or: tsx scripts/backfillTwilioParticipants.ts --quote <quoteId> --initiator <userId> [--org <orgId>] [--user <userId>]');
    process.exitCode = 1;
    return;
  }

  const initiator = readSingleArg('--initiator');
  if (!options.threadId && !initiator) {
    console.error('When using --quote you must also provide --initiator <userId>.');
    process.exitCode = 1;
    return;
  }

  const threadId = await ensureThread(options, initiator);

  const explicitUsers = new Set(options.userIds);
  const orgIds = options.organizationIds.length > 0
    ? [...options.organizationIds]
    : [];

  const singleOrg = readSingleArg('--org');
  if (singleOrg && !orgIds.includes(singleOrg)) {
    orgIds.push(singleOrg);
  }

  const coveredUsers = new Set<string>();

  for (const organizationId of orgIds) {
    const members = await collectOrgMembers(organizationId);
    members.forEach((member) => {
      coveredUsers.add(`${organizationId}:${member}`);
      explicitUsers.add(member);
    });

    const uniqueMembers = Array.from(new Set(members));
    if (uniqueMembers.length > 0) {
      await ensureUsers(threadId, uniqueMembers, organizationId);
    }
  }

  const leftoverUsers = Array.from(explicitUsers).filter((userId) => {
    return !orgIds.some((orgId) => coveredUsers.has(`${orgId}:${userId}`));
  });

  if (leftoverUsers.length > 0) {
    await ensureUsers(threadId, leftoverUsers);
  }
};

run().catch((error) => {
  console.error('Backfill script failed:', error);
  process.exitCode = 1;
});
