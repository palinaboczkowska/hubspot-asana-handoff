/**
 * Remembers what has already been done, so a webhook HubSpot sends twice
 * (it retries on timeouts) never routes a lead twice or creates two Asana
 * projects. In-memory here; on Cloud Run this would be Firestore, because
 * instances restart and scale out.
 */
export interface HandoffProgress {
  projectGid: string;
  projectUrl: string;
  /** How many template tasks exist in Asana, so a retry continues where it stopped. */
  tasksCreated: number;
  noteAdded: boolean;
}

export interface ProcessedStore {
  hasEvent(eventId: number): Promise<boolean>;
  markEvent(eventId: number): Promise<void>;
  getHandoff(dealId: string): Promise<HandoffProgress | null>;
  saveHandoff(dealId: string, progress: HandoffProgress): Promise<void>;
}

export class InMemoryStore implements ProcessedStore {
  private events = new Set<number>();
  private handoffs = new Map<string, HandoffProgress>();

  async hasEvent(eventId: number) {
    return this.events.has(eventId);
  }
  async markEvent(eventId: number) {
    this.events.add(eventId);
  }
  async getHandoff(dealId: string) {
    const progress = this.handoffs.get(dealId);
    return progress ? { ...progress } : null;
  }
  async saveHandoff(dealId: string, progress: HandoffProgress) {
    this.handoffs.set(dealId, { ...progress });
  }
}
