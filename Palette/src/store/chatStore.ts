import { Client as TwilioClient, type Conversation, type Message } from '@twilio/conversations';
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import logger from '../lib/utils/logger';

const importMetaEnv = (typeof import.meta !== 'undefined' && (import.meta as any)?.env)
  ? (import.meta as any).env
  : undefined;
const processEnv = (typeof globalThis !== 'undefined' && (globalThis as any)?.process?.env)
  ? (globalThis as any).process.env
  : undefined;

const resolvedApiBase = (
  importMetaEnv?.VITE_API_BASE_URL ??
  processEnv?.VITE_API_BASE_URL ??
  ''
);
const trimmedApiBase = typeof resolvedApiBase === 'string' ? resolvedApiBase.replace(/\/+$/, '') : '';
const CHAT_API_BASE = trimmedApiBase
  ? (trimmedApiBase.endsWith('/api') ? trimmedApiBase : `${trimmedApiBase}/api`)
  : '/api';
const TOKEN_REFRESH_BUFFER_MS = 60_000; // refresh 1 minute before expiry

const addClientListener = (client: TwilioClient, event: string, handler: (...args: any[]) => void) => {
  const target = client as any;
  if (typeof target.on === 'function') {
    target.on(event, handler);
  } else if (typeof target.addListener === 'function') {
    target.addListener(event, handler);
  }
};

const removeClientListener = (client: TwilioClient, event: string, handler: (...args: any[]) => void) => {
  const target = client as any;
  if (typeof target.off === 'function') {
    target.off(event, handler);
  } else if (typeof target.removeListener === 'function') {
    target.removeListener(event, handler);
  }
};

const createTwilioClient = async (token: string): Promise<TwilioClient> => {
  const client = new TwilioClient(token);
  const currentState = (client as any).state ?? (client as any).connectionState;

  if (currentState === 'initialized' || currentState === 'connected' || currentState === 'ready') {
    return client;
  }

  await new Promise<void>((resolve, reject) => {
    const handleInit = () => {
      removeClientListener(client, 'initialized', handleInit);
      removeClientListener(client, 'initFailed', handleFail);
      resolve();
    };
    const handleFail = (error: unknown) => {
      removeClientListener(client, 'initialized', handleInit);
      removeClientListener(client, 'initFailed', handleFail);
      reject(error);
    };

    addClientListener(client, 'initialized', handleInit);
    addClientListener(client, 'initFailed', handleFail);
  });

  return client;
};

export interface ChatMessage {
  sid: string;
  body: string | null;
  authorIdentity: string | null;
  authorUserId: string | null;
  timestamp: string;
  index: number | null;
}

const toEpochMs = (timestamp: string) => {
  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? 0 : value;
};

const sortChatMessages = (messages: ChatMessage[]): ChatMessage[] => {
  return [...messages].sort((a, b) => {
    if (a.index !== null && b.index !== null && a.index !== b.index) {
      return a.index - b.index;
    }

    const delta = toEpochMs(a.timestamp) - toEpochMs(b.timestamp);
    if (delta !== 0) {
      return delta;
    }

    return a.sid.localeCompare(b.sid);
  });
};

const mergeChatMessages = (
  existing: ChatMessage[] | undefined,
  incoming: ChatMessage | ChatMessage[]
): ChatMessage[] => {
  const merged = new Map<string, ChatMessage>();

  (existing ?? []).forEach((msg) => {
    merged.set(msg.sid, msg);
  });

  const list = Array.isArray(incoming) ? incoming : [incoming];
  list.forEach((msg) => {
    merged.set(msg.sid, msg);
  });

  return sortChatMessages(Array.from(merged.values()));
};

export interface ChatThreadSummary {
  id: string;
  quoteId: string | null;
  shipmentId: string | null;
  conversationSid: string | null;
  shipperBranchOrgId: string | null;
  galleryBranchOrgId: string | null;
  metadata: Record<string, unknown> | null;
  lastMessageAt: string | null;
  role: string;
  unreadCount: number;
}

type ThreadScope = {
  quoteId?: string | null;
  shipmentId?: string | null;
  shipperBranchOrgId?: string | null;
  galleryBranchOrgId?: string | null;
};

interface ThreadContextInput {
  quoteId: string;
  shipmentId?: string | null;
  shipperBranchOrgId?: string | null;
  galleryBranchOrgId?: string | null;
}

interface BulkThreadRequest {
  key: string;
  shipmentId?: string | null;
  shipperBranchOrgId?: string | null;
  galleryBranchOrgId?: string | null;
}

interface TokenInfo {
  token: string;
  expiresAt: number;
  threadId: string;
  conversationSid: string;
  quoteId: string | null;
  shipmentId: string | null;
  shipperBranchOrgId: string | null;
  galleryBranchOrgId: string | null;
}

interface ConversationState {
  conversation: Conversation;
  listenersAttached: boolean;
}

interface RefreshOptions {
  force?: boolean;
  threadId?: string;
  quoteId?: string;
  organizationId?: string;
  shipmentId?: string | null;
  shipperBranchOrgId?: string | null;
  galleryBranchOrgId?: string | null;
}

interface RefreshResult {
  threadId: string;
  conversationSid: string;
  quoteId: string | null;
  shipmentId: string | null;
  shipperBranchOrgId: string | null;
  galleryBranchOrgId: string | null;
}

interface ChatState {
  loading: boolean;
  error: string | null;
  threads: ChatThreadSummary[];
  messages: Record<string, ChatMessage[]>;
  activeThreadId: string | null;
  client: TwilioClient | null;
  tokenInfo: TokenInfo | null;
  conversations: Record<string, ConversationState>;
  provisioned: boolean;
  warmedThreads: Record<string, boolean>;
  warmupInFlight: boolean;
  preloading: boolean;
  threadScopes: Record<string, ThreadScope>;
  fetchThreads: () => Promise<void>;
  selectThread: (threadId: string) => Promise<void>;
  sendMessage: (threadId: string, body: string) => Promise<void>;
  refreshToken: (options?: RefreshOptions) => Promise<RefreshResult>;
  openThreadForQuote: (options: ThreadContextInput) => Promise<string>;
  clearError: () => void;
  provisionConversations: () => Promise<void>;
  warmupThread: (threadId?: string) => Promise<void>;
  preloadThreadsAndMessages: (options?: { limit?: number }) => Promise<void>;
  openThreadsForRecipients: (options: {
    quoteId: string;
    recipients: BulkThreadRequest[];
  }) => Promise<{ threads: Record<string, string>; errors: Record<string, string> }>;
}

const toChatMessage = (message: Message): ChatMessage => ({
  sid: message.sid,
  body: message.body ?? null,
  authorIdentity: message.author ?? null,
  authorUserId:
    typeof message.author === 'string' && message.author.includes(':')
      ? message.author.split(':').slice(1).join(':')
      : null,
  timestamp: message.dateCreated?.toISOString?.() ?? new Date().toISOString(),
  index: typeof message.index === 'number' ? message.index : null,
});

const ensureSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }
  return data.session ?? null;
};

const useChatStore = create<ChatState>((set, get) => {
  const resolveThreadForContext = async (
    context: ThreadContextInput,
    options: { withLoader?: boolean; existingThreadId?: string | null; force?: boolean } = {}
  ): Promise<{ threadId: string; created: boolean }> => {
    const { withLoader = false, existingThreadId, force = true } = options;
    const state = get();

    const normalizedShipper =
      context.shipperBranchOrgId === undefined ? undefined : context.shipperBranchOrgId ?? null;
    const normalizedGallery =
      context.galleryBranchOrgId === undefined ? undefined : context.galleryBranchOrgId ?? null;

    const scopeRequested =
      context.shipperBranchOrgId !== undefined ||
      context.galleryBranchOrgId !== undefined ||
      (context.shipmentId !== undefined && context.shipmentId !== null);

    const candidates = state.threads.filter((thread) => thread.quoteId === context.quoteId);
    const matchedThread =
      (existingThreadId && candidates.find((thread) => thread.id === existingThreadId)) ||
      candidates.find((thread) => {
        const scope = state.threadScopes[thread.id];
        const matchesShipper =
          normalizedShipper === undefined
            ? true
            : (scope?.shipperBranchOrgId ?? null) === normalizedShipper;
        const matchesGallery =
          normalizedGallery === undefined
            ? true
            : (scope?.galleryBranchOrgId ?? null) === normalizedGallery;
        const matchesShipment =
          context.shipmentId === undefined
            ? true
            : (scope?.shipmentId ?? null) === (context.shipmentId ?? null);
        return matchesShipper && matchesGallery && matchesShipment;
      }) ||
      (!scopeRequested ? candidates[0] : undefined);

    if (withLoader) {
      set({ loading: true, error: null });
    }

    try {
      const result = await get().refreshToken({
        quoteId: context.quoteId,
        shipmentId: context.shipmentId ?? undefined,
        shipperBranchOrgId: normalizedShipper,
        galleryBranchOrgId: normalizedGallery,
        force,
        threadId: matchedThread?.id,
      });

      const threadId = result.threadId;
      const created = !matchedThread || matchedThread.id !== threadId;

      await ensureConversationJoined(threadId);
      set((prev) => ({
        warmedThreads: { ...prev.warmedThreads, [threadId]: true },
      }));

      return { threadId, created };
    } finally {
      if (withLoader) {
        set((prev) => ({ ...prev, loading: false }));
      }
    }
  };

  return {
    loading: false,
    error: null,
    threads: [],
    messages: {},
    activeThreadId: null,
    client: null,
    tokenInfo: null,
    conversations: {},
    provisioned: false,
    warmedThreads: {},
    warmupInFlight: false,
    preloading: false,
    threadScopes: {},
    async provisionConversations() {
      try {
      const session = await ensureSession();
      if (!session?.access_token) {
        return;
      }

      const response = await fetch(`${CHAT_API_BASE}/chat/provision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || 'Failed to provision conversations');
      }

      set({ provisioned: true });
    } catch (error: any) {
      logger.warn('chatStore.provisionConversations', error?.message);
    }
  },

  clearError() {
    set({ error: null });
  },

  async fetchThreads() {
    try {
      const session = await ensureSession();
      if (!session?.user) {
        set({ threads: [], messages: {}, activeThreadId: null, threadScopes: {} });
        return;
      }

      if (!get().provisioned) {
        await get().provisionConversations();
      }

      set({ loading: true, error: null });

      const { data, error } = await supabase
        .from('chat_thread_participants')
        .select(
          `
        thread_id,
        role,
        chat_threads (
          id,
          quote_id,
          shipment_id,
          shipper_branch_org_id,
          gallery_branch_org_id,
          twilio_conversation_sid,
          metadata,
          last_message_at
        )
        `
        )
        .eq('user_id', session.user.id)
        .order('last_message_at', { referencedTable: 'chat_threads', ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      const threads: ChatThreadSummary[] = (data || [])
        .map((row: any) => {
          const thread = row.chat_threads;
          if (!thread) return null;
          return {
            id: thread.id,
            quoteId: thread.quote_id ?? null,
            shipmentId: thread.shipment_id ?? null,
            conversationSid: thread.twilio_conversation_sid ?? null,
            shipperBranchOrgId: thread.shipper_branch_org_id ?? null,
            galleryBranchOrgId: thread.gallery_branch_org_id ?? null,
            metadata: thread.metadata ?? null,
            lastMessageAt: thread.last_message_at ?? null,
            role: row.role ?? 'client',
            unreadCount: 0,
          } as ChatThreadSummary;
        })
        .filter(Boolean) as ChatThreadSummary[];

      set((state) => {
        const activeThreadIds = new Set(threads.map((thread) => thread.id));
        const nextScopes = { ...state.threadScopes };

        threads.forEach((thread) => {
          const metadata = (thread.metadata ?? {}) as Record<string, any>;
          const shipperBranch =
            thread.shipperBranchOrgId ??
            (metadata.shipperBranchOrgId as string | null) ??
            null;
          const galleryBranch =
            thread.galleryBranchOrgId ??
            (metadata.galleryBranchOrgId as string | null) ??
            null;
          const shipmentScope =
            thread.shipmentId ?? (metadata.shipmentId as string | null) ?? null;
          const quoteScope =
            thread.quoteId ?? (metadata.quoteId as string | null) ?? null;

          nextScopes[thread.id] = {
            quoteId: quoteScope,
            shipmentId: shipmentScope,
            shipperBranchOrgId: shipperBranch,
            galleryBranchOrgId: galleryBranch,
          };
        });

        return {
          loading: false,
          threads,
          messages: Object.fromEntries(
            Object.entries(state.messages).filter(([threadId]) => activeThreadIds.has(threadId))
          ),
          warmedThreads: Object.fromEntries(
            Object.entries(state.warmedThreads).filter(([threadId]) => activeThreadIds.has(threadId))
          ),
          threadScopes: nextScopes,
        };
      });
    } catch (error: any) {
      logger.error('chatStore.fetchThreads', error?.message);
      set({ loading: false, error: error?.message || 'Failed to load chat threads' });
    }
  },

  async warmupThread(threadId) {
    const targetThreadId = threadId ?? get().threads[0]?.id ?? null;
    if (!targetThreadId) {
      return;
    }

    if (get().warmedThreads[targetThreadId]) {
      return;
    }

    set({ warmupInFlight: true });

    try {
      await get().refreshToken({ threadId: targetThreadId });
      await ensureConversationJoined(targetThreadId);
      set((prev) => ({
        warmedThreads: { ...prev.warmedThreads, [targetThreadId]: true },
        warmupInFlight: false,
      }));
    } catch (error) {
      set((prev) => {
        const next = { ...prev.warmedThreads };
        delete next[targetThreadId];
        return { warmedThreads: next, warmupInFlight: false };
      });
      throw error;
    }
  },

  async preloadThreadsAndMessages(options = {}) {
    const { limit } = options;
    if (get().preloading) {
      return;
    }

    set({ preloading: true });

    try {
      await get().fetchThreads();
      const threads = get().threads;
      const threadsToWarm = typeof limit === 'number' && limit >= 0
        ? threads.slice(0, limit)
        : threads;

      for (const thread of threadsToWarm) {
        try {
          await get().warmupThread(thread.id);
        } catch (error) {
          logger.warn('chatStore.preloadThreadsAndMessages', `Failed to warm thread ${thread.id}`, error);
        }
      }
    } finally {
      set({ preloading: false });
    }
  },

  async refreshToken(options: RefreshOptions = {}) {
    const executeRefresh = async (
      refreshOptions: RefreshOptions,
      attempt: number
    ): Promise<RefreshResult> => {
      const state = get();
      const session = await ensureSession();
      if (!session?.access_token) {
        throw new Error('No active session for token refresh');
      }

      const now = Date.now();
      const {
        force = false,
        threadId: explicitThreadId,
        quoteId,
        shipmentId,
        shipperBranchOrgId,
        galleryBranchOrgId,
        organizationId,
      } = refreshOptions;

      const currentThreadId = explicitThreadId ?? state.activeThreadId ?? state.tokenInfo?.threadId ?? null;
      const knownScope: ThreadScope = currentThreadId ? state.threadScopes[currentThreadId] ?? {} : {};

      const effectiveQuoteId = quoteId ?? knownScope.quoteId ?? null;
      const effectiveShipmentId =
        shipmentId !== undefined ? shipmentId ?? null : knownScope.shipmentId ?? null;
      const effectiveShipperBranch =
        shipperBranchOrgId !== undefined
          ? shipperBranchOrgId ?? null
          : knownScope.shipperBranchOrgId ?? null;
      const effectiveGalleryBranch =
        galleryBranchOrgId !== undefined
          ? galleryBranchOrgId ?? null
          : knownScope.galleryBranchOrgId ?? null;

      const shouldReuseExisting =
        !force &&
        state.tokenInfo &&
        state.tokenInfo.expiresAt - now > TOKEN_REFRESH_BUFFER_MS &&
        (!explicitThreadId || explicitThreadId === state.tokenInfo.threadId) &&
        (effectiveQuoteId === null || state.tokenInfo.quoteId === effectiveQuoteId) &&
        (effectiveShipmentId === null || state.tokenInfo.shipmentId === effectiveShipmentId) &&
        (shipperBranchOrgId === undefined || state.tokenInfo.shipperBranchOrgId === effectiveShipperBranch) &&
        (galleryBranchOrgId === undefined || state.tokenInfo.galleryBranchOrgId === effectiveGalleryBranch);

      if (shouldReuseExisting && state.tokenInfo) {
        return {
          threadId: state.tokenInfo.threadId,
          conversationSid: state.tokenInfo.conversationSid,
          quoteId: state.tokenInfo.quoteId,
          shipmentId: state.tokenInfo.shipmentId,
          shipperBranchOrgId: state.tokenInfo.shipperBranchOrgId,
          galleryBranchOrgId: state.tokenInfo.galleryBranchOrgId,
        };
      }

      const requestBody: Record<string, unknown> = {};
      if (effectiveQuoteId) {
        requestBody.quoteId = effectiveQuoteId;
      } else if (currentThreadId) {
        requestBody.threadId = currentThreadId;
      } else {
        throw new Error('Cannot refresh token without a thread or quote');
      }

      if (organizationId) {
        requestBody.organizationId = organizationId;
      }

      if (shipperBranchOrgId !== undefined || knownScope.shipperBranchOrgId !== undefined) {
        requestBody.shipperBranchOrgId = effectiveShipperBranch;
      }

      if (galleryBranchOrgId !== undefined || knownScope.galleryBranchOrgId !== undefined) {
        requestBody.galleryBranchOrgId = effectiveGalleryBranch;
      }

      if (shipmentId !== undefined || knownScope.shipmentId !== undefined) {
        requestBody.shipmentId = effectiveShipmentId;
      }

      const response = await fetch(`${CHAT_API_BASE}/chat/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const message = errBody.error || 'Failed to refresh chat token';

        if (attempt === 0 && typeof message === 'string' && message.includes('not a member')) {
          await get().provisionConversations();
          return executeRefresh({ ...refreshOptions, force: true }, attempt + 1);
        }

        throw new Error(message);
      }

      const json = await response.json();
      const expiresAtMs = new Date(json.expiresAt).getTime();
      const client = state.client;

      const updatedScope: ThreadScope = {
        quoteId: json.quoteId ?? effectiveQuoteId,
        shipmentId: json.shipmentId ?? effectiveShipmentId,
        shipperBranchOrgId: json.shipperBranchOrgId ?? effectiveShipperBranch ?? null,
        galleryBranchOrgId: json.galleryBranchOrgId ?? effectiveGalleryBranch ?? null,
      };

      if (!client) {
        const newClient = await createTwilioClient(json.token);
        attachClientLifecycle(newClient);
        set((prev) => ({
          client: newClient,
          tokenInfo: {
            token: json.token,
            expiresAt: expiresAtMs,
            threadId: json.threadId,
            conversationSid: json.conversationSid,
            quoteId: updatedScope.quoteId ?? null,
            shipmentId: updatedScope.shipmentId ?? null,
            shipperBranchOrgId: updatedScope.shipperBranchOrgId ?? null,
            galleryBranchOrgId: updatedScope.galleryBranchOrgId ?? null,
          },
          threadScopes: {
            ...prev.threadScopes,
            [json.threadId]: updatedScope,
          },
        }));
      } else {
        await client.updateToken(json.token);
        set((prev) => ({
          tokenInfo: {
            token: json.token,
            expiresAt: expiresAtMs,
            threadId: json.threadId,
            conversationSid: json.conversationSid,
            quoteId: updatedScope.quoteId ?? null,
            shipmentId: updatedScope.shipmentId ?? null,
            shipperBranchOrgId: updatedScope.shipperBranchOrgId ?? null,
            galleryBranchOrgId: updatedScope.galleryBranchOrgId ?? null,
          },
          threadScopes: {
            ...prev.threadScopes,
            [json.threadId]: updatedScope,
          },
        }));
      }

      return {
        threadId: json.threadId,
        conversationSid: json.conversationSid,
        quoteId: updatedScope.quoteId ?? null,
        shipmentId: updatedScope.shipmentId ?? null,
        shipperBranchOrgId: updatedScope.shipperBranchOrgId ?? null,
        galleryBranchOrgId: updatedScope.galleryBranchOrgId ?? null,
      };
    };

    return executeRefresh(options, 0);
  },

  async selectThread(threadId: string) {
    set({ activeThreadId: threadId, error: null });

    try {
      await get().refreshToken({ threadId });
      await ensureConversationJoined(threadId);
      set((prev) => ({
        warmedThreads: { ...prev.warmedThreads, [threadId]: true },
      }));
    } catch (err: any) {
      logger.error('chatStore.selectThread', err);
      set({ error: err?.message || 'Unable to open conversation' });
    }
  },

  async openThreadForQuote(context: ThreadContextInput) {
    try {
      const { threadId, created } = await resolveThreadForContext(context, {
        withLoader: true,
        force: true,
      });

      if (created) {
        await get().fetchThreads();
      }

      set({ activeThreadId: threadId });
      return threadId;
    } catch (err: any) {
      logger.error('chatStore.openThreadForQuote', err);
      set((prev) => ({ ...prev, loading: false, error: err?.message || 'Unable to open conversation' }));
      throw err;
    }
  },

  async sendMessage(threadId: string, body: string) {
    const state = get();
    const convoState = state.conversations[threadId];
    if (!convoState) {
      throw new Error('Conversation not initialized');
    }

    await convoState.conversation.sendMessage(body);
  },
  async openThreadsForRecipients({ quoteId, recipients }) {
    const threads: Record<string, string> = {};
    const errors: Record<string, string> = {};
    let createdAny = false;

    for (const recipient of recipients) {
      try {
        const { threadId, created } = await resolveThreadForContext(
          {
            quoteId,
            shipmentId: recipient.shipmentId ?? null,
            shipperBranchOrgId: recipient.shipperBranchOrgId ?? null,
            galleryBranchOrgId: recipient.galleryBranchOrgId ?? null,
          },
          { force: true }
        );

        threads[recipient.key] = threadId;
        createdAny = createdAny || created;
      } catch (error: any) {
        errors[recipient.key] = error?.message || 'Unable to open conversation';
        logger.error('chatStore.openThreadsForRecipients', error);
      }
    }

    if (createdAny) {
      try {
        await get().fetchThreads();
      } catch (error) {
        logger.warn('chatStore.openThreadsForRecipients', 'fetchThreads after creation failed', error);
      }
    }

    return { threads, errors };
  },
  };
});

const attachClientLifecycle = (client: TwilioClient) => {
  client.on('connectionError', (error) => {
    logger.error('Twilio connection error', error?.message);
  });

  client.on('tokenAboutToExpire', async () => {
    try {
      await useChatStore.getState().refreshToken({ force: true });
    } catch (error: any) {
      logger.error('Failed to refresh Twilio token (about to expire)', error?.message);
    }
  });

  client.on('tokenExpired', async () => {
    try {
      await useChatStore.getState().refreshToken({ force: true });
    } catch (error: any) {
      logger.error('Failed to refresh Twilio token (expired)', error?.message);
    }
  });
};

const ensureConversationJoined = async (threadId: string) => {
  let state = useChatStore.getState();
  let thread = state.threads.find((t) => t.id === threadId);

  if (!thread) {
    try {
      await state.fetchThreads();
      state = useChatStore.getState();
      thread = state.threads.find((t) => t.id === threadId);
    } catch (error) {
      logger.warn('Failed to refresh threads before joining conversation', error);
    }
  }

  if (!thread) {
    const scope = state.threadScopes[threadId] ?? {};
    const tokenInfo = state.tokenInfo && state.tokenInfo.threadId === threadId ? state.tokenInfo : null;
    const inferredConversationSid = tokenInfo?.conversationSid ?? null;

    if (inferredConversationSid) {
      const syntheticThread: ChatThreadSummary = {
        id: threadId,
        quoteId: scope.quoteId ?? tokenInfo?.quoteId ?? null,
        shipmentId: scope.shipmentId ?? tokenInfo?.shipmentId ?? null,
        conversationSid: inferredConversationSid,
        shipperBranchOrgId: scope.shipperBranchOrgId ?? tokenInfo?.shipperBranchOrgId ?? null,
        galleryBranchOrgId: scope.galleryBranchOrgId ?? tokenInfo?.galleryBranchOrgId ?? null,
        metadata: {
          ...(scope.quoteId ? { quoteId: scope.quoteId } : {}),
          ...(scope.shipmentId ? { shipmentId: scope.shipmentId } : {}),
          ...(scope.shipperBranchOrgId ? { shipperBranchOrgId: scope.shipperBranchOrgId } : {}),
          ...(scope.galleryBranchOrgId ? { galleryBranchOrgId: scope.galleryBranchOrgId } : {}),
        },
        lastMessageAt: null,
        role: 'client',
        unreadCount: 0,
      };

      useChatStore.setState((prev) => {
        if (prev.threads.some((existing) => existing.id === threadId)) {
          return prev;
        }

        return {
          ...prev,
          threads: [...prev.threads, syntheticThread],
        };
      });

      state = useChatStore.getState();
      thread = syntheticThread;
    }
  }

  if (!thread) {
    throw new Error('Thread not found in local state');
  }

  let client = state.client;
  if (!client) {
    await state.refreshToken({ force: true, threadId });
    state = useChatStore.getState();
    client = state.client;
    if (!client) throw new Error('Unable to initialize Twilio client');
  }

  let latestState = state;
  let tokenConversationSid = latestState.tokenInfo?.conversationSid;
  if (!tokenConversationSid && thread.conversationSid) {
    tokenConversationSid = thread.conversationSid;
  }

  if (!tokenConversationSid) {
    throw new Error('Conversation SID missing for thread');
  }

  let conversationState = latestState.conversations[threadId];
  if (!conversationState) {
    const conversation = await client.getConversationBySid(tokenConversationSid);
    try {
      await conversation.join();
    } catch (error: any) {
      const message = String(error?.message || '');
      const status = typeof error?.status === 'number' ? error.status : undefined;
      const alreadyJoined =
        status === 409 ||
        String(error?.code ?? '').includes('50416') ||
        message.includes('already exists') ||
        message.includes('Conflict');

      if (!alreadyJoined) {
        logger.warn('Twilio join error (possibly already joined)', message);
      }
    }

    const paginator = await conversation.getMessages();
    const history = paginator.items.map(toChatMessage);

    conversation.on('messageAdded', (message: Message) => {
      const chatMessage = toChatMessage(message);
      useChatStore.setState((prev) => {
        const merged = mergeChatMessages(prev.messages[threadId], chatMessage);
        return {
          messages: {
            ...prev.messages,
            [threadId]: merged,
          },
        };
      });
    });

    conversationState = {
      conversation,
      listenersAttached: true,
    };

    useChatStore.setState((prev) => ({
      conversations: { ...prev.conversations, [threadId]: conversationState! },
      messages: {
        ...prev.messages,
        [threadId]: mergeChatMessages(prev.messages[threadId], history),
      },
    }));

    return;
  }

  if (!state.messages[threadId]) {
    const paginator = await conversationState.conversation.getMessages();
    const history = paginator.items.map(toChatMessage);
    useChatStore.setState((prev) => ({
      messages: {
        ...prev.messages,
        [threadId]: mergeChatMessages(prev.messages[threadId], history),
      },
    }));
  }
};

export default useChatStore;
