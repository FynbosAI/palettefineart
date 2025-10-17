import { create } from 'zustand';
import useChatStore from './chatStore';

export interface BulkRecipientContext {
  id: string;
  label: string;
  shipmentId?: string | null;
  shipperBranchOrgId?: string | null;
  galleryBranchOrgId?: string | null;
}

export interface MessagingContext {
  quoteId: string;
  quoteTitle?: string;
  galleryName?: string;
  galleryBranchName?: string;
  galleryCompanyName?: string;
  routeLabel?: string;
  targetDateLabel?: string;
  quoteValueLabel?: string;
  shipmentId?: string | null;
  shipperBranchOrgId?: string | null;
  galleryBranchOrgId?: string | null;
  bulkRecipients?: BulkRecipientContext[];
}

interface MessagingUiState {
  modalOpen: boolean;
  launching: boolean;
  context: MessagingContext | null;
  threadId: string | null;
  error: string | null;
  bulkRecipients: BulkRecipientContext[];
  bulkThreads: Record<string, string>;
  bulkThreadErrors: Record<string, string>;
  activeBulkRecipientId: string | null;
  bulkSending: boolean;
  setActiveBulkRecipient: (recipientId: string | null) => Promise<void>;
  sendBulkMessage: (body: string) => Promise<void>;
  openForQuote: (context: MessagingContext) => Promise<void>;
  closeModal: () => void;
  clearError: () => void;
}

let lastRequestedQuoteId: string | null = null;

const useMessagingUiStore = create<MessagingUiState>((set, get) => ({
  modalOpen: false,
  launching: false,
  context: null,
  threadId: null,
  error: null,
  bulkRecipients: [],
  bulkThreads: {},
  bulkThreadErrors: {},
  activeBulkRecipientId: null,
  bulkSending: false,
  async openForQuote(context) {
    const prevState = get();
    const requestedQuoteId = context.quoteId;
    const isSameQuote = prevState.context?.quoteId === requestedQuoteId;

    if (prevState.launching && isSameQuote) {
      set({ modalOpen: true, context, error: null });
      return;
    }

    lastRequestedQuoteId = requestedQuoteId;
    const previousThreads = isSameQuote ? prevState.bulkThreads : {};
    const previousActiveRecipient = isSameQuote ? prevState.activeBulkRecipientId : null;

    set({
      modalOpen: true,
      launching: true,
      context,
      threadId: isSameQuote ? prevState.threadId : null,
      error: null,
      bulkRecipients: context.bulkRecipients ?? [],
      bulkThreads: isSameQuote ? prevState.bulkThreads : {},
      bulkThreadErrors: {},
      activeBulkRecipientId: null,
      bulkSending: false,
    });

    try {
      const chatState = useChatStore.getState();
      if (!chatState.threads.length) {
        await chatState.fetchThreads();
      }

      const bulkRecipients = context.bulkRecipients ?? [];
      if (bulkRecipients.length > 0) {
        const { threads, errors } = await chatState.openThreadsForRecipients({
          quoteId: context.quoteId,
          recipients: bulkRecipients.map((recipient) => ({
            key: recipient.id,
            shipmentId: recipient.shipmentId ?? null,
            shipperBranchOrgId: recipient.shipperBranchOrgId ?? null,
            galleryBranchOrgId: recipient.galleryBranchOrgId ?? null,
          })),
        });

        const mergedThreads = bulkRecipients.reduce<Record<string, string>>((acc, recipient) => {
          const threadId = threads[recipient.id] ?? previousThreads[recipient.id];
          if (threadId) {
            acc[recipient.id] = threadId;
          }
          return acc;
        }, {});

        let nextActiveRecipient = previousActiveRecipient;
        if (nextActiveRecipient && !bulkRecipients.some((recipient) => recipient.id === nextActiveRecipient)) {
          nextActiveRecipient = null;
        }

        let nextThreadId: string | null = null;
        if (nextActiveRecipient) {
          const candidateThreadId = mergedThreads[nextActiveRecipient];
          if (candidateThreadId) {
            await chatState.selectThread(candidateThreadId);
            nextThreadId = candidateThreadId;
          }
        }

        if (lastRequestedQuoteId === requestedQuoteId) {
          set({
            threadId: nextThreadId,
            launching: false,
            bulkRecipients,
            bulkThreads: mergedThreads,
            bulkThreadErrors: errors,
            activeBulkRecipientId: nextActiveRecipient ?? null,
          });

          if (!nextThreadId) {
            const hasErrors = Object.keys(errors).length > 0;
            set((prev) => ({
              error: hasErrors ? 'Unable to open any branch conversations. Please try again.' : prev.error,
            }));
          } else if (Object.keys(errors).length > 0) {
            set((prev) => ({
              error: 'Some branches could not be opened. Review the list and retry.',
            }));
          }
        }

        return;
      }

      const threadId = await chatState.openThreadForQuote({
        quoteId: context.quoteId,
        shipmentId: context.shipmentId ?? null,
        shipperBranchOrgId: context.shipperBranchOrgId ?? undefined,
        galleryBranchOrgId: context.galleryBranchOrgId ?? undefined,
      });
      await chatState.selectThread(threadId);
      if (lastRequestedQuoteId === requestedQuoteId) {
        set({ threadId, launching: false, bulkRecipients: [], bulkThreads: {}, bulkThreadErrors: {}, activeBulkRecipientId: null });
      }
    } catch (error: any) {
      console.error('[messagingUiStore] Failed to open conversation', error);
      if (lastRequestedQuoteId === requestedQuoteId) {
        set({ error: error?.message || 'Unable to open conversation', launching: false });
      }
    }
  },
  async setActiveBulkRecipient(recipientId: string | null) {
    const { bulkThreads, activeBulkRecipientId, threadId: currentThreadId } = get();
    if (activeBulkRecipientId === recipientId || (!activeBulkRecipientId && !recipientId)) {
      return;
    }

    const nextThreadId = recipientId ? bulkThreads[recipientId] : null;

    if (!nextThreadId) {
      set({ activeBulkRecipientId: recipientId, threadId: null });
      return;
    }

    if (currentThreadId && currentThreadId === nextThreadId) {
      set({ activeBulkRecipientId: recipientId, threadId: nextThreadId });
      return;
    }

    try {
      await useChatStore.getState().selectThread(nextThreadId);
      set({ activeBulkRecipientId: recipientId, threadId: nextThreadId });
    } catch (error: any) {
      console.error('[messagingUiStore] Failed to switch bulk conversation', error);
      set({ error: error?.message || 'Unable to switch conversation.' });
    }
  },
  async sendBulkMessage(body: string) {
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }

    const { context, bulkThreads, bulkRecipients, bulkThreadErrors } = get();
    if (!context) {
      set({ error: 'Messaging context missing. Please reopen the conversation.' });
      return;
    }

    const chatState = useChatStore.getState();
    const threadsMap = { ...bulkThreads };
    const recipientsList = bulkRecipients ?? [];
    let errors: Record<string, string> = { ...bulkThreadErrors };

    const missingRecipients = recipientsList.filter((recipient) => !threadsMap[recipient.id]);

    if (missingRecipients.length > 0) {
      try {
        const { threads, errors: creationErrors } = await chatState.openThreadsForRecipients({
          quoteId: context.quoteId,
          recipients: missingRecipients.map((recipient) => ({
            key: recipient.id,
            shipmentId: recipient.shipmentId ?? null,
            shipperBranchOrgId: recipient.shipperBranchOrgId ?? null,
            galleryBranchOrgId: recipient.galleryBranchOrgId ?? null,
          })),
        });

        Object.entries(threads).forEach(([key, threadId]) => {
          if (threadId) {
            threadsMap[key] = threadId;
            delete errors[key];
          }
        });

        Object.entries(creationErrors).forEach(([key, message]) => {
          errors[key] = message;
        });
      } catch (openError: any) {
        console.error('[messagingUiStore] Failed to prepare bulk conversations', openError);
        set((prev) => ({
          bulkSending: false,
          error: openError?.message || 'Unable to prepare conversations. Please try again.',
          bulkThreadErrors: { ...prev.bulkThreadErrors },
        }));
        return;
      }
    }

    const entries = Object.entries(threadsMap).filter(([, threadId]) => Boolean(threadId));
    if (entries.length === 0) {
      set((prev) => ({
        bulkThreads: threadsMap,
        bulkThreadErrors: {
          ...prev.bulkThreadErrors,
          ...errors,
        },
        error: 'No conversations are ready yet. Please try again once invites are accepted.',
      }));
      return;
    }

    set({ bulkSending: true, error: null });

    const successRecipients = new Set<string>();
    const threadToRecipients = new Map<string, string[]>();

    for (const [recipientId, threadId] of entries) {
      const recipientsForThread = threadToRecipients.get(threadId) ?? [];
      recipientsForThread.push(recipientId);
      threadToRecipients.set(threadId, recipientsForThread);
    }

    for (const [threadId, recipientIds] of threadToRecipients.entries()) {
      try {
        await chatState.sendMessage(threadId, trimmed);
        recipientIds.forEach((id) => successRecipients.add(id));
      } catch (error: any) {
        const message = error?.message || 'Failed to send';
        recipientIds.forEach((id) => {
          errors[id] = message;
        });
        console.error('[messagingUiStore] Failed to send bulk message', {
          threadId,
          recipientIds,
          error,
        });
      }
    }

    set((prev) => {
      const nextErrors = { ...prev.bulkThreadErrors };
      successRecipients.forEach((recipientId) => {
        delete nextErrors[recipientId];
      });
      Object.entries(errors).forEach(([recipientId, message]) => {
        nextErrors[recipientId] = message;
      });
      return {
        bulkSending: false,
        bulkThreadErrors: nextErrors,
        bulkThreads: threadsMap,
      };
    });

    if (Object.keys(errors).length > 0) {
      set((prev) => ({
        error: 'Some branches did not receive the message. Please review and retry.',
      }));
    }
  },
  closeModal() {
    lastRequestedQuoteId = null;
    set({
      modalOpen: false,
      launching: false,
      context: null,
      threadId: null,
      error: null,
      bulkRecipients: [],
      bulkThreads: {},
      bulkThreadErrors: {},
      activeBulkRecipientId: null,
      bulkSending: false,
    });
  },
  clearError() {
    set({ error: null });
  },
}));

export default useMessagingUiStore;
