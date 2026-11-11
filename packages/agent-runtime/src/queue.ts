import { canonicalJson, randomUuid } from "@acg/shared";

export interface QueuedEvent {
  id: string;
  createdAt: string;
  payload: unknown;
  attempts: number;
  /** Pas de nouvelle tentative avant cette date (backoff après échec). Absent : dès que possible. */
  nextAttemptAt?: string;
}

/**
 * File persistante côté agent — retransmission avec backoff (DAT §17.4).
 * Stockage en clair (chrome.storage.local ou fichier) : elle ne doit recevoir que des
 * événements sans valeur sensible (types, positions, scores, décision locale).
 */
export class SecureQueue {
  private items: QueuedEvent[] = [];
  private rejectedCount = 0;

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

  /** L'événement peut-il être retenté maintenant (backoff écoulé) ? */
  isDue(item: QueuedEvent, now = Date.now()): boolean {
    return !item.nextAttemptAt || Date.parse(item.nextAttemptAt) <= now;
  }

  size(): number {
    return this.items.length;
  }

  /** Événements retirés parce que le serveur les a refusés définitivement (depuis le démarrage). */
  rejected(): number {
    return this.rejectedCount;
  }

  async ack(id: string): Promise<void> {
    this.items = this.items.filter((i) => i.id !== id);
    await this.flush();
  }

  /**
   * Refus définitif du serveur (corps invalide…) : le renvoyer ne changera rien, et le garder
   * en tête bloquerait tous les événements suivants. Il est retiré et compté.
   */
  async reject(id: string): Promise<void> {
    const before = this.items.length;
    this.items = this.items.filter((i) => i.id !== id);
    if (this.items.length < before) this.rejectedCount++;
    await this.flush();
  }

  async fail(id: string): Promise<void> {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.attempts += 1;
      item.nextAttemptAt = new Date(Date.now() + this.backoffMs(item.attempts)).toISOString();
    }
    await this.flush();
  }

  backoffMs(attempts: number): number {
    return Math.min(30_000, 500 * 2 ** Math.min(attempts, 6));
  }

  private async flush(): Promise<void> {
    await this.persist(canonicalJson(this.items));
  }
}
