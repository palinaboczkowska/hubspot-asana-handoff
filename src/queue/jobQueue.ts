export interface DeadLetter<T> {
  job: T;
  attempts: number;
  error: string;
}

export interface QueueOptions {
  maxAttempts: number;
  /** Delay before retry n is baseDelayMs * 2^(n-1). */
  baseDelayMs: number;
}

/**
 * The webhook answers HubSpot right away and the work happens here, with
 * retries and backoff. Jobs that keep failing land in a dead-letter list
 * instead of disappearing. In-process for this project; on Google Cloud
 * the same shape maps to Pub/Sub or Cloud Tasks.
 */
export class JobQueue<T> {
  readonly deadLetters: DeadLetter<T>[] = [];
  private pending = new Set<Promise<void>>();

  constructor(
    private readonly worker: (job: T) => Promise<void>,
    private readonly options: QueueOptions,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  enqueue(job: T): void {
    const run = this.process(job).finally(() => this.pending.delete(run));
    this.pending.add(run);
  }

  /** Waits until every job has finished or been dead-lettered. Used by tests and the demo. */
  async drain(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
  }

  private async process(job: T): Promise<void> {
    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt += 1) {
      try {
        await this.worker(job);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt === this.options.maxAttempts) {
          this.deadLetters.push({ job, attempts: attempt, error: message });
          return;
        }
        await this.sleep(this.options.baseDelayMs * 2 ** (attempt - 1));
      }
    }
  }
}
