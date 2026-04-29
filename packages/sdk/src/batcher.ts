import type { TraceInput } from "./types";

function isNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("failed to send") ||
    message.includes("offline")
  );
}

export class TraceBatcher {
  private queue: TraceInput[] = [];
  private offlineQueue: TraceInput[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly onFlush: (traces: TraceInput[]) => Promise<void>;
  private readonly debug: boolean;
  private isFlushing = false;

  constructor(config: {
    batchSize: number;
    flushIntervalMs: number;
    onFlush: (traces: TraceInput[]) => Promise<void>;
    debug?: boolean;
  }) {
    this.batchSize = config.batchSize;
    this.flushIntervalMs = config.flushIntervalMs;
    this.onFlush = config.onFlush;
    this.debug = Boolean(config.debug);
  }

  add(trace: TraceInput): void {
    this.queue.push(trace);

    if (this.queue.length + this.offlineQueue.length >= this.batchSize) {
      void this.flush();
      return;
    }

    this.ensureTimer();
  }

  async flush(): Promise<void> {
    if (this.isFlushing) {
      return;
    }

    const batch = [...this.offlineQueue, ...this.queue];

    if (batch.length === 0) {
      this.clearTimer();
      return;
    }

    this.isFlushing = true;
    this.offlineQueue = [];
    this.queue = [];
    this.clearTimer();

    try {
      await this.onFlush(batch);
    } catch (error) {
      if (this.debug) {
        console.warn("[finetuneops] flush failed", error);
      }

      if (isNetworkError(error)) {
        this.offlineQueue = [...batch, ...this.offlineQueue];

        if (this.offlineQueue.length > 1000) {
          const dropped = this.offlineQueue.length - 1000;
          this.offlineQueue = this.offlineQueue.slice(-1000);

          if (this.debug) {
            console.warn(`[finetuneops] dropped ${dropped} traces while offline queue was full`);
          }
        }
      }
    } finally {
      this.isFlushing = false;

      if (this.queue.length + this.offlineQueue.length > 0) {
        this.ensureTimer();
      }
    }
  }

  async shutdown(): Promise<void> {
    this.clearTimer();
    await this.flush();
    this.clearTimer();
  }

  private ensureTimer() {
    if (this.timer) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.flushIntervalMs);
  }

  private clearTimer() {
    if (!this.timer) {
      return;
    }

    clearTimeout(this.timer);
    this.timer = null;
  }
}
