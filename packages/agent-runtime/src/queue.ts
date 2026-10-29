import { canonicalJson, randomUuid } from "@acg/shared";

export interface QueuedEvent {
  id: string;
  createdAt: string;
  payload: unknown;
  attempts: number;
}

/**
 * File persistante côté agent — retransmission avec backoff (DAT §17.4).
 * Stockage en clair (chrome.storage.local ou fichier) : elle ne doit recevoir que des
 * événements sans valeur sensible (types, positions, scores, décision locale).
 */
export class SecureQueue {
  private items: QueuedEvent[] = [];

  constructor(
    private readonly persist: (raw: string) => Promise<void> = async () => undefined,
    private readonly read: () => Promise<string | null> = async () => null,
  ) {}

  async restore(): Promise<void> {
    const raw = await this.read();
    if (!raw) return;
    try {
      this.items = JSON.parse(raw) as QueuedEvent[];
    } catch {
      this.items = [];
    }
  }

  async enqueue(payload: unknown): Promise<QueuedEvent> {
    const item: QueuedEvent = { id: randomUuid(), createdAt: new Date().toISOString(), payload, attempts: 0 };
    this.items.push(item);
    await this.flush();
    return item;
  }

  peek(limit = 20): QueuedEvent[] {
    return this.items.slice(0, limit);
  }

  size(): number {
    return this.items.length;
  }

  async ack(id: string): Promise<void> {
    this.items = this.items.filter((i) => i.id !== id);
    await this.flush();
  }

  async fail(id: string): Promise<void> {
    const item = this.items.find((i) => i.id === id);
    if (item) item.attempts += 1;
    await this.flush();
  }

  backoffMs(attempts: number): number {
    return Math.min(30_000, 500 * 2 ** Math.min(attempts, 6));
  }

  private async flush(): Promise<void> {
    await this.persist(canonicalJson(this.items));
  }
}
