import logger from '../../lib/utils/logger';

type RefreshFn = (quoteId: string) => Promise<unknown> | unknown;

export class GalleryBidRefreshQueue {
  private readonly refreshFn: RefreshFn;
  private readonly delayMs: number;
  private pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(refreshFn: RefreshFn, delayMs = 600) {
    this.refreshFn = refreshFn;
    this.delayMs = delayMs;
  }

  enqueue(quoteId: string | null | undefined) {
    if (!quoteId) {
      return;
    }

    this.pending.add(quoteId);

    if (!this.timer) {
      this.timer = setTimeout(() => {
        void this.flush();
      }, this.delayMs);
    }
  }

  clear() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending.clear();
  }

  private async flush() {
    const targets = Array.from(this.pending);
    this.pending.clear();
    this.timer = null;

    await Promise.all(
      targets.map(async (quoteId) => {
        try {
          await this.refreshFn(quoteId);
        } catch (error) {
          logger.error('Realtime', `Failed to refresh quote ${quoteId} after bid event`, error);
        }
      })
    );
  }
}
