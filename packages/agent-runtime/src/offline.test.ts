/**
 * Fonctionnement hors ligne de l'agent (NFR-02, DAT §17.4) : décision sans serveur, file
 * d'attente persistante, rejeu après reconnexion, redémarrage et cache de politiques obsolète.
 * Le serveur est simulé par un `fetch` de test : on contrôle quand il est joignable et ce qu'il répond.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DetectionEngine } from "@acg/detection-engine";
import {
  DEFAULT_AI_SERVICES,
  DEFAULT_RISK_BAND_THRESHOLDS,
  DEFAULT_RISK_WEIGHTS,
  generateAgentKeyPair,
  type AgentSyncResponse,
  type EvaluateInteractionRequest,
  type Policy,
} from "@acg/shared";
import { AgentRuntime, memoryConfigStore, SecureQueue } from "./index.js";

const API = "http://api.test";
const SECRET = "sk-abcdefghijklmnopqrstuvwxyz012345";
const EMAIL_PROMPT = "Réponds à koffi.adjovi@exemple.bj au sujet de son dossier";

function snapshot(version: string, policies: Policy[]): AgentSyncResponse {
  return {
    policyVersion: version,
    generatedAt: new Date().toISOString(),
    policies,
    aiServices: DEFAULT_AI_SERVICES.map((s) => ({
      id: s.id,
      name: s.name,
      hostingRegion: s.hostingRegion,
      riskBaseline: s.riskBaseline,
      freeAccess: s.freeAccess,
      domains: s.domains,
      cliCommands: s.cliCommands,
    })),
    riskWeights: { ...DEFAULT_RISK_WEIGHTS },
    riskBandThresholds: { ...DEFAULT_RISK_BAND_THRESHOLDS },
    organization: { jurisdiction: "BJ", regulatoryFrameworkId: "BJ_MALABO" },
    user: {
      userId: "00000000-0000-4000-8000-0000000000a1",
      department: "Prestations",
      departmentRiskLevel: "moderate",
      jurisdiction: "BJ",
      role: "USER",
    },
    heartbeatIntervalSeconds: 60,
    syncIntervalSeconds: 300,
    expectedModelHashes: {},
  };
}

const BLOCK_SECRETS: Policy = {
  id: "00000000-0000-4000-8000-0000000000b1",
  name: "Bloquer secrets",
  conditionExpr: `any_of(entity_type, ["API_KEY", "PASSWORD", "PRIVATE_KEY", "CONNECTION_STRING"])`,
  action: "BLOCK",
  priority: 1,
  version: 1,
  enabled: true,
  referenceFrameworks: [],
};
const MASK_EMAIL: Policy = {
  id: "00000000-0000-4000-8000-0000000000b2",
  name: "Masquer les courriels",
  conditionExpr: `contains(entity_type, "EMAIL")`,
  action: "MASK",
  priority: 5,
  version: 1,
  enabled: true,
  referenceFrameworks: [],
};

/** Serveur simulé : joignable ou non, et éventuellement un rejet permanent pour certains événements. */
class FakeServer {
  online = true;
  snapshot: AgentSyncResponse = snapshot("v1", [BLOCK_SECRETS]);
  syncRequired = false;
  /** interactionId refusés en 400 (corps rejeté définitivement). */
  rejected = new Set<string>();
  received: EvaluateInteractionRequest[] = [];
  heartbeats: { queuedEvents: number; policyVersion: string | null }[] = [];

  fetch = vi.fn(async (url: string | URL, init?: RequestInit): Promise<Response> => {
    if (!this.online) throw new TypeError("fetch failed (hors ligne)");
    const path = new URL(String(url)).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (path === "/v1/agents/sync") return json(this.snapshot);
    if (path === "/v1/agents/heartbeat") {
      this.heartbeats.push({ queuedEvents: body.payload.queuedEvents, policyVersion: body.payload.policyVersion });
      const res = { ok: true, syncRequired: this.syncRequired, serverTime: new Date().toISOString() };
      this.syncRequired = false;
      return json(res);
    }
    if (path === "/v1/interactions/evaluate") {
      if (this.rejected.has(body.interactionId)) return json({ code: "INVALID_BODY" }, 400);
      this.received.push(body);
      return json({ interactionId: body.interactionId, decision: body.localDecision?.action ?? "ALLOW" });
    }
    return json({ message: "not found" }, 404);
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Disque simulé de la file (fichier ~/.acg/queue.json ou chrome.storage.local). */
function memoryDisk() {
  const disk = { raw: null as string | null, writes: 0 };
  return {
    disk,
    persist: async (raw: string) => {
      disk.raw = raw;
      disk.writes++;
    },
    read: async () => disk.raw,
  };
}

async function enrolledConfig(lastSnapshot: AgentSyncResponse | null) {
  const pair = await generateAgentKeyPair();
  return {
    apiUrl: API,
    agentId: "00000000-0000-4000-8000-0000000000c1",
    userId: "00000000-0000-4000-8000-0000000000a1",
    publicKey: pair.publicKey,
    privateKey: pair.privateKey,
    lastSnapshot,
    lastPolicyVersion: lastSnapshot?.policyVersion ?? null,
  };
}

let server: FakeServer;

beforeEach(() => {
  server = new FakeServer();
  vi.stubGlobal("fetch", server.fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("file d'attente persistante (SecureQueue)", () => {
  it("conserve l'ordre, persiste à chaque changement et se restaure après redémarrage", async () => {
    const { disk, persist, read } = memoryDisk();
    const q = new SecureQueue(persist, read);
    const a = await q.enqueue({ n: 1 });
    await q.enqueue({ n: 2 });
    await q.enqueue({ n: 3 });
    await q.ack(a.id);
    expect(disk.writes).toBe(4);

    const restarted = new SecureQueue(persist, read);
    await restarted.restore();
    expect(restarted.peek().map((i) => (i.payload as { n: number }).n)).toEqual([2, 3]);
  });

  it("repart vide si le fichier de file est corrompu", async () => {
    const q = new SecureQueue(async () => undefined, async () => "{pas du json");
    await q.restore();
    expect(q.size()).toBe(0);
  });

  it("compte les échecs et plafonne le délai de nouvelle tentative à 30 s", async () => {
    const q = new SecureQueue();
    const item = await q.enqueue({});
    await q.fail(item.id);
    await q.fail(item.id);
    expect(q.peek()[0]!.attempts).toBe(2);
    expect(q.backoffMs(0)).toBe(500);
    expect(q.backoffMs(3)).toBe(4000);
    expect(q.backoffMs(20)).toBe(30_000);
  });
});

describe("agent hors ligne puis reconnecté", () => {
  it("décide hors ligne avec la dernière synchro, met l'événement en file sans valeur en clair", async () => {
    server.online = false;
    const { disk, persist, read } = memoryDisk();
    const runtime = new AgentRuntime({
      module: "A1",
      store: memoryConfigStore(await enrolledConfig(snapshot("v1", [BLOCK_SECRETS]))),
      engine: new DetectionEngine(),
      queuePersist: { persist, read },
    });
    await runtime.start({ heartbeat: false });

    const decision = await runtime.intercept(`Ma clé ${SECRET} ne marche pas`, "browser", "chatgpt.com");
    expect(decision.action).toBe("BLOCK");
    expect(decision.decision.policyId).toBe(BLOCK_SECRETS.id);
    expect(runtime.queue.size()).toBe(1);
    // Ce qui est écrit sur disque ne contient ni le secret ni le texte du prompt.
    expect(disk.raw).not.toBeNull();
    expect(disk.raw).not.toContain(SECRET);
    expect(disk.raw).not.toContain("ne marche pas");
    runtime.stop();
  });

  it("rejoue la file dans l'ordre à la reconnexion et signale sa taille dans le heartbeat", async () => {
    server.online = false;
    const runtime = new AgentRuntime({
      module: "A1",
      store: memoryConfigStore(await enrolledConfig(snapshot("v1", [BLOCK_SECRETS]))),
      engine: new DetectionEngine(),
    });
    await runtime.start({ heartbeat: false });
    const ids: string[] = [];
    for (const t of [`clé ${SECRET}`, "Bonjour, résume ce texte", "Explique la loi 2017-20"]) {
      ids.push((await runtime.intercept(t, "browser", "chatgpt.com")).interactionId);
    }
    expect(runtime.queue.size()).toBe(3);

    await new Promise((r) => setTimeout(r, 20));
    const reconnectedAt = Date.now();
    server.online = true;
    await runtime.tick();
    expect(server.heartbeats.at(-1)?.queuedEvents).toBe(3);
    expect(server.received.map((r) => r.interactionId)).toEqual(ids);
    expect(runtime.queue.size()).toBe(0);
    // L'événement rejoué garde l'heure de la décision, pas celle de l'envoi.
    for (const r of server.received) expect(Date.parse(r.occurredAt)).toBeLessThan(reconnectedAt);
    runtime.stop();
  });

  it("vide aussi la file lors de la prochaine interaction en ligne", async () => {
    server.online = false;
    const runtime = new AgentRuntime({
      module: "A1",
      store: memoryConfigStore(await enrolledConfig(snapshot("v1", [BLOCK_SECRETS]))),
      engine: new DetectionEngine(),
    });
    await runtime.start({ heartbeat: false });
    await runtime.intercept("premier message", "browser", "chatgpt.com");
    server.online = true;
    await runtime.intercept("second message", "browser", "chatgpt.com");
    expect(server.received).toHaveLength(2);
    expect(runtime.queue.size()).toBe(0);
    runtime.stop();
  });

  it("retrouve la file après un redémarrage de l'agent et la rejoue", async () => {
    server.online = false;
    const disk = memoryDisk();
    const config = await enrolledConfig(snapshot("v1", [BLOCK_SECRETS]));
    const first = new AgentRuntime({ module: "A2", store: memoryConfigStore(config), engine: new DetectionEngine(), queuePersist: disk });
    await first.start({ heartbeat: false });
    await first.intercept("message pendant la coupure", "cli", "claude");
    first.stop();

    server.online = true;
    const second = new AgentRuntime({ module: "A2", store: memoryConfigStore(config), engine: new DetectionEngine(), queuePersist: disk });
    await second.start({ heartbeat: false });
    expect(second.queue.size()).toBe(1);
    await second.tick();
    expect(server.received).toHaveLength(1);
    expect(second.queue.size()).toBe(0);
    second.stop();
  });

  it("une coupure au milieu du rejeu garde les événements restants, dans l'ordre", async () => {
    server.online = false;
    const runtime = new AgentRuntime({
      module: "A1",
      store: memoryConfigStore(await enrolledConfig(snapshot("v1", [BLOCK_SECRETS]))),
      engine: new DetectionEngine(),
    });
    await runtime.start({ heartbeat: false });
    for (const t of ["un", "deux", "trois"]) await runtime.intercept(t, "browser", "chatgpt.com");
    const pending = runtime.queue.peek().map((i) => i.id);

    server.online = true;
    let calls = 0;
    const original = server.fetch.getMockImplementation()!;
    server.fetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/v1/interactions/evaluate") && ++calls === 2) throw new TypeError("coupure");
      return original(url, init);
    });
    await runtime.tick();
    expect(server.received).toHaveLength(1);
    expect(runtime.queue.peek().map((i) => i.id)).toEqual(pending.slice(1));
    expect(runtime.queue.peek()[0]!.attempts).toBe(1);
    runtime.stop();
  });

  it("si la réponse se perd après l'enregistrement, l'événement est renvoyé avec le même identifiant (le serveur dédoublonne)", async () => {
    const runtime = new AgentRuntime({
      module: "A1",
      store: memoryConfigStore(await enrolledConfig(snapshot("v1", [BLOCK_SECRETS]))),
      engine: new DetectionEngine(),
    });
    await runtime.start({ heartbeat: false });
    const original = server.fetch.getMockImplementation()!;
    server.fetch.mockImplementationOnce(async (url, init) => {
      await original(url, init); // le serveur enregistre…
      throw new TypeError("connexion coupée avant la réponse"); // …mais l'agent ne le sait pas
    });
    const { interactionId } = await runtime.intercept("message", "browser", "chatgpt.com");
    await runtime.tick();
    expect(server.received.map((r) => r.interactionId)).toEqual([interactionId, interactionId]);
    runtime.stop();
  });

  it("un événement refusé définitivement (400) est retiré et ne bloque pas la suite", async () => {
    server.online = false;
    const runtime = new AgentRuntime({
      module: "A1",
      store: memoryConfigStore(await enrolledConfig(snapshot("v1", [BLOCK_SECRETS]))),
      engine: new DetectionEngine(),
    });
    await runtime.start({ heartbeat: false });
    const poisoned = (await runtime.intercept("un", "browser", "chatgpt.com")).interactionId;
    const next = (await runtime.intercept("deux", "browser", "chatgpt.com")).interactionId;
    server.rejected.add(poisoned);

    server.online = true;
    await runtime.tick();
    expect(server.received.map((r) => r.interactionId)).toEqual([next]);
    expect(runtime.queue.size()).toBe(0);
    expect(runtime.queue.rejected()).toBe(1);
    runtime.stop();
  });

  it("un refus d'authentification (401) est passager : l'événement est gardé", async () => {
    server.online = false;
    const runtime = new AgentRuntime({
      module: "A1",
      store: memoryConfigStore(await enrolledConfig(snapshot("v1", [BLOCK_SECRETS]))),
      engine: new DetectionEngine(),
    });
    await runtime.start({ heartbeat: false });
    await runtime.intercept("un", "browser", "chatgpt.com");
    server.online = true;
    const original = server.fetch.getMockImplementation()!;
    server.fetch.mockImplementation(async (url, init) =>
      String(url).endsWith("/v1/interactions/evaluate") ? json({ message: "horloge décalée" }, 401) : original(url, init),
    );
    await runtime.tick();
    expect(runtime.queue.size()).toBe(1);
    expect(runtime.queue.rejected()).toBe(0);
    runtime.stop();
  });

  it("après un échec, le backoff espace les tentatives", async () => {
    server.online = false;
    const runtime = new AgentRuntime({
      module: "A1",
      store: memoryConfigStore(await enrolledConfig(snapshot("v1", [BLOCK_SECRETS]))),
      engine: new DetectionEngine(),
    });
    await runtime.start({ heartbeat: false });
    await runtime.intercept("un", "browser", "chatgpt.com");
    await runtime.tick(); // échec : 1re tentative ratée, prochaine dans 1 s
    expect(runtime.queue.peek()[0]!.attempts).toBe(1);
    await runtime.tick(); // trop tôt : pas de nouvelle tentative
    expect(runtime.queue.peek()[0]!.attempts).toBe(1);

    server.online = true;
    await runtime.tick(); // toujours dans le délai
    expect(server.received).toHaveLength(0);
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 1_100 });
    await runtime.tick();
    vi.useRealTimers();
    expect(server.received).toHaveLength(1);
    expect(runtime.queue.size()).toBe(0);
    runtime.stop();
  });
});

describe("cache de politiques obsolète", () => {
  it("hors ligne, l'agent applique la dernière version synchronisée, même si le serveur a changé", async () => {
    server.online = false;
    server.snapshot = snapshot("v2", [BLOCK_SECRETS, MASK_EMAIL]);
    const runtime = new AgentRuntime({
      module: "A1",
      store: memoryConfigStore(await enrolledConfig(snapshot("v1", [BLOCK_SECRETS]))),
      engine: new DetectionEngine(),
    });
    await runtime.start({ heartbeat: false });
    const decision = await runtime.intercept(EMAIL_PROMPT, "browser", "chatgpt.com");
    expect(runtime.cache.get()?.policyVersion).toBe("v1");
    expect(decision.action).not.toBe("MASK");
    runtime.stop();
  });

  it("à la reconnexion, le heartbeat déclenche la synchro et la nouvelle politique s'applique", async () => {
    server.online = false;
    server.snapshot = snapshot("v2", [BLOCK_SECRETS, MASK_EMAIL]);
    const store = memoryConfigStore(await enrolledConfig(snapshot("v1", [BLOCK_SECRETS])));
    const runtime = new AgentRuntime({ module: "A1", store, engine: new DetectionEngine() });
    await runtime.start({ heartbeat: false });

    server.online = true;
    server.syncRequired = true;
    await runtime.tick();
    expect(server.heartbeats.at(-1)?.policyVersion).toBe("v1");
    expect(runtime.cache.get()?.policyVersion).toBe("v2");
    expect((await store.load()).lastSnapshot?.policyVersion).toBe("v2");
    const decision = await runtime.intercept(EMAIL_PROMPT, "browser", "chatgpt.com");
    expect(decision.action).toBe("MASK");
    expect(decision.maskedText).not.toContain("koffi.adjovi@exemple.bj");
    runtime.stop();
  });

  it("sans aucune synchro passée, l'agent enrôlé hors ligne se rabat sur les politiques embarquées", async () => {
    server.online = false;
    const runtime = new AgentRuntime({ module: "A1", store: memoryConfigStore(await enrolledConfig(null)), engine: new DetectionEngine() });
    await runtime.start({ heartbeat: false });
    expect(runtime.cache.get()?.policyVersion).toBe("bootstrap");
    expect((await runtime.intercept(`clé ${SECRET}`, "browser", "chatgpt.com")).action).toBe("BLOCK");
    runtime.stop();
  });
});
