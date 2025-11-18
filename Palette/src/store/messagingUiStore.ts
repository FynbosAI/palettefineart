import { create } from 'zustand';
import useChatStore from './chatStore';

type Participant = {
  id?: string;
  name: string;
  abbreviation?: string;
  brandColor?: string;
  contactEmail?: string | null;
  hasBid?: boolean;
  bidAmount?: number;
};

type BulkRecipientContext = {
  id: string;
  label: string;
  shipmentId?: string | null;
  shipperBranchOrgId?: string | null;
  galleryBranchOrgId?: string | null;
};

type MessagingContext = {
  quoteId: string;
  quoteTitle: string;
  quoteRoute: string;
  quoteValue: number;
  targetDateStart: string | null;
  targetDateEnd: string | null;
  quoteType: 'auction' | 'requested';
  bidderName: string;
  bidderAbbreviation: string;
  bidderColor: string;
  bidPrice?: number;
  participants?: Participant[];
  highlightParticipantIds?: string[];
  shipmentId?: string | null;
  shipperBranchOrgId?: string | null;
  galleryBranchOrgId?: string | null;
  bulkRecipients?: BulkRecipientContext[];
};

type MessagingUiState = {
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
};

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
    const prev = get();
    const requestedQuoteId = context.quoteId;
    const isSameQuote = prev.context?.quoteId === requestedQuoteId;

    if (prev.launching && isSameQuote) {
      set({ modalOpen: true, context, error: null });
      return;
    }

    lastRequestedQuoteId = requestedQuoteId;
    const previousThreads = isSameQuote ? prev.bulkThreads : {};
    const previousActiveRecipient = isSameQuote ? prev.activeBulkRecipientId : null;

    set({
      modalOpen: true,
      launching: true,
      context,
      threadId: isSameQuote ? prev.threadId : null,
      error: null,
      bulkRecipients: context.bulkRecipients ?? [],
      bulkThreads: isSameQuote ? prev.bulkThreads : {},
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
            set((prevState) => ({
              error: hasErrors ? 'Unable to open any branch conversations. Please try again.' : prevState.error,
            }));
          } else if (Object.keys(errors).length > 0) {
            set((prevState) => ({
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
        set({
          threadId,
          launching: false,
          bulkRecipients: [],
          bulkThreads: {},
          bulkThreadErrors: {},
          activeBulkRecipientId: null,
        });
      }
    } catch (error: any) {
      if (lastRequestedQuoteId === requestedQuoteId) {
        set({ error: error?.message || 'Unable to open conversation', launching: false });
      }
      throw error;
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
        set((prevState) => ({
          bulkSending: false,
          error: openError?.message || 'Unable to prepare conversations. Please try again.',
          bulkThreadErrors: { ...prevState.bulkThreadErrors },
        }));
        return;
      }
    }

    const entries = Object.entries(threadsMap).filter(([, threadId]) => Boolean(threadId));
    if (entries.length === 0) {
      set((prevState) => ({
        bulkThreads: threadsMap,
        bulkThreadErrors: {
          ...prevState.bulkThreadErrors,
          ...errors,
        },
        error: 'No conversations are ready yet. Please try again once invites are active.',
      }));
      return;
    }

    set({ bulkSending: true, error: null });

    const successRecipients = new Set<string>();
    const threadToRecipients = new Map<string, string[]>();

    for (const [recipientId, threadId] of entries) {
      const list = threadToRecipients.get(threadId) ?? [];
      list.push(recipientId);
      threadToRecipients.set(threadId, list);
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
      }
    }

    set((prevState) => {
      const nextErrors = { ...prevState.bulkThreadErrors };
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
      set((prevState) => ({
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

export type { MessagingContext, Participant, BulkRecipientContext };
export default useMessagingUiStore;
