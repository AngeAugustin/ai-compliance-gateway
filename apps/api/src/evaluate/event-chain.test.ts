import { describe, expect, it } from "vitest";
import { appendToChain, EVENT_CHAIN_LOCK_KEY, type ChainClient } from "./event-chain.js";

/**
 * Base simulée avec un vrai verrou consultatif : un seul détenteur à la fois, libéré à la fin de
 * la « transaction ». Les requêtes rendent la main (await) entre chaque étape, comme le réseau.
 */
function fakeDb() {
  const events: { hash: string; prev: string | null }[] = [];
  let holder: Promise<void> = Promise.resolve();
  const tick = () => new Promise<void>((r) => setTimeout(r, Math.random() * 3));

  async function transaction<T>(fn: (c: ChainClient) => Promise<T>, withLock: boolean): Promise<T> {
    let release = () => {};
    const client: ChainClient = {
      async query(text) {
        await tick();
        if (text.includes("pg_advisory_xact_lock")) {
          const previous = holder;
          holder = new Promise<void>((r) => (release = r));
          await previous;
          return { rows: [] };
        }
        if (text.startsWith("SELECT event_hash")) {
          const last = events.at(-1);
          return { rows: (last ? [{ event_hash: last.hash }] : []) as never[] };
        }
        return { rows: [] };
      },
    };
    try {
      if (withLock) return await fn(client);
      // Sans verrou : même lecture puis insertion, comme l'ancien code.
      const prev = await client.query<{ event_hash: string }>("SELECT event_hash FROM analytics.security_event ORDER BY sequence DESC LIMIT 1");
      return await (fn as unknown as (c: ChainClient, p: string | null) => Promise<T>)(client, prev.rows[0]?.event_hash ?? null);
    } finally {
      release();
    }
  }

  const insert = (prev: string | null, i: number) => async () => {
    await tick();
    events.push({ hash: `h${i}`, prev });
  };
  const broken = () => events.filter((e, i) => e.prev !== (events[i - 1]?.hash ?? null)).length;
  return { events, transaction, insert, broken };
}

describe("journal chaîné", () => {
  it("prend le verrou de la chaîne avant de lire le dernier hachage", async () => {
    const calls: string[] = [];
    const client: ChainClient = {
      async query(text, params) {
        calls.push(text.includes("advisory") ? `lock ${params?.[0]}` : "select");
        return { rows: text.includes("advisory") ? [] : ([{ event_hash: "abc" }] as never[]) };
      },
    };
    const prev = await appendToChain(client, async (p) => p);
    expect(calls).toEqual([`lock ${EVENT_CHAIN_LOCK_KEY}`, "select"]);
    expect(prev).toBe("abc");
  });

  it("50 écritures simultanées : chaîne intacte avec le verrou", async () => {
    const db = fakeDb();
    await Promise.all(
      Array.from({ length: 50 }, (_, i) => db.transaction((c) => appendToChain(c, (prev) => db.insert(prev, i)()), true)),
    );
    expect(db.events).toHaveLength(50);
    expect(db.broken()).toBe(0);
  });

  it("témoin : sans verrou, les mêmes écritures cassent la chaîne", async () => {
    const db = fakeDb();
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        db.transaction(((_c: ChainClient, prev: string | null) => db.insert(prev, i)()) as never, false),
      ),
    );
    expect(db.broken()).toBeGreaterThan(0);
  });
});
