import { DetectionEngine } from "@acg/detection-engine";
import {
  generateAgentKeyPair,
  importPrivateKey,
  randomUuid,
  type AgentModule,
  type EvaluateInteractionRequest,
  type HeartbeatPayload,
} from "@acg/shared";
import { DecisionCache } from "./cache.js";
import { GatewayClient, emptyIntegrity } from "./client.js";
import { type AgentPersistedConfig, type ConfigStore, DEFAULT_AGENT_CONFIG } from "./config.js";
import { prepareFileAnalysis, type IncomingFile } from "./files.js";
import { decideLocally, userFacingText, type LocalDecision } from "./pipeline.js";
import type { ExtractEngineOptions } from "@acg/file-extract";
import { SecureQueue } from "./queue.js";

export interface AgentRuntimeOptions {
  module: AgentModule;
  store: ConfigStore;
  engine: DetectionEngine;
  fetchImpl?: typeof fetch;
  queuePersist?: {
    persist: (raw: string) => Promise<void>;
    read: () => Promise<string | null>;
  };
}

export interface AgentStartOptions {
  /** Si false, sync + file mais pas de heartbeat (le démon A2 s'en charge). */
  heartbeat?: boolean;
}

/**
 * Cœur commun A1/A2. Une fois enrôlé (jeton + URL API), l'agent :
 * 1. synchronise politiques et services
 * 2. décide localement chaque interaction
 * 3. journalise auprès de l'API si joignable, sinon met en file
 * 4. émet un heartbeat signé
 */
export class AgentRuntime {
  readonly cache = new DecisionCache();
  readonly queue: SecureQueue;
  readonly client: GatewayClient;
  private config: AgentPersistedConfig;
  private privateKey: CryptoKey | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private sequence = 0;

  constructor(private readonly options: AgentRuntimeOptions) {
    this.config = { ...DEFAULT_AGENT_CONFIG, module: options.module };
    this.queue = new SecureQueue(options.queuePersist?.persist, options.queuePersist?.read);
    this.client = new GatewayClient(
      this.config.apiUrl,
      async () => this.privateKey,
      () => this.config.agentId,
    );
  }

  async start(opts: AgentStartOptions = {}): Promise<void> {
    this.config = { ...DEFAULT_AGENT_CONFIG, ...(await this.options.store.load()), module: this.options.module };
    this.sequence = Math.max(0, this.config.lastSequence ?? 0);
    this.client.setApiUrl(this.config.apiUrl);
    if (this.config.privateKey) {
      this.privateKey = await importPrivateKey(this.config.privateKey);
    }
    await this.queue.restore();
    await this.options.engine.initialize();
    if (this.config.lastSnapshot) {
      this.cache.hydrate(this.config.lastSnapshot);
    }
    if (this.config.agentId && this.privateKey) {
      try {
        await this.sync();
      } catch {
        if (!this.cache.get()) {
          this.cache.hydrate(
            this.cache.fallback({
              department: "Generique",
              departmentRiskLevel: "moderate",
              jurisdiction: "BJ",
              userId: this.config.userId ?? randomUuid(),
            }),
          );
        }
      }
      if (opts.heartbeat !== false) this.startHeartbeat();
    } else if (!this.cache.get()) {
      this.cache.hydrate(
        this.cache.fallback({
          department: "Generique",
          departmentRiskLevel: "moderate",
          jurisdiction: "BJ",
          userId: this.config.userId ?? randomUuid(),
        }),
      );
    }
  }

  async configure(apiUrl: string, enrollmentToken?: string): Promise<void> {
    this.config.apiUrl = apiUrl.replace(/\/$/, "");
    if (enrollmentToken) this.config.enrollmentToken = enrollmentToken;
    this.client.setApiUrl(this.config.apiUrl);
    await this.options.store.save(this.config);
  }

  /**
   * Enrôlement : l'agent génère sa paire ECDSA P-256, présente le jeton,
   * reçoit agentId. Après cela il « entre dans le mouvement » : sync + heartbeat.
   */
  async enroll(hostname: string, agentVersion: string, opts: AgentStartOptions = {}): Promise<void> {
    if (!this.config.enrollmentToken) throw new Error("Jeton d'enrôlement manquant — générez-le depuis le Dashboard (RSSI).");
    const pair = await generateAgentKeyPair();
    this.config.publicKey = pair.publicKey;
    this.config.privateKey = pair.privateKey;
    this.privateKey = await importPrivateKey(pair.privateKey);
    const res = await this.client.enroll({
      enrollmentToken: this.config.enrollmentToken,
      module: this.config.module,
      hostname,
      agentVersion,
      publicKey: pair.publicKey,
    });
    this.config.agentId = res.agentId;
    this.config.userId = res.userId;
    this.config.heartbeatIntervalSeconds = res.heartbeatIntervalSeconds;
    this.config.syncIntervalSeconds = res.syncIntervalSeconds;
    this.config.enrollmentToken = null;
    await this.options.store.save(this.config);
    await this.sync();
    if (opts.heartbeat !== false) this.startHeartbeat();
  }

  async sync(): Promise<void> {
    const snap = await this.client.sync();
    this.cache.hydrate(snap);
    this.config.lastSnapshot = snap;
    this.config.lastPolicyVersion = snap.policyVersion;
    this.config.heartbeatIntervalSeconds = snap.heartbeatIntervalSeconds;
    this.config.syncIntervalSeconds = snap.syncIntervalSeconds;
    if (this.config.userId === null) this.config.userId = snap.user.userId;
    await this.options.store.save(this.config);
  }

  async intercept(
    text: string,
    channel: "browser" | "cli",
    hostnameOrCommand: string,
    files: IncomingFile[] = [],
    extractOpts?: ExtractEngineOptions,
  ): Promise<LocalDecision> {
    const prepared = await prepareFileAnalysis(text, files, extractOpts);
    const decision = await decideLocally({
      promptText: text,
      analysisText: prepared.analysisText,
      extractedFiles: prepared.extracted,
      channel,
      hostnameOrCommand,
      engine: this.options.engine,
      cache: this.cache,
    });
    const wire: EvaluateInteractionRequest = {
      interactionId: decision.interactionId,
      agentId: this.config.agentId ?? undefined,
      aiServiceId: decision.aiServiceId,
      channel,
      detectionResults: decision.entities.length
        ? [
            {
              layer: "rules",
              entities: decision.entities.map(({ value: _v, ...rest }) => rest),
              processingTimeMs: decision.processingTimeMs,
              modelVersion: "agent-local",
              degraded: decision.degradedMode,
            },
          ]
        : [
            {
              layer: "rules",
              entities: [],
              processingTimeMs: decision.processingTimeMs,
              modelVersion: "agent-local",
              degraded: decision.degradedMode,
            },
          ],
      textLength: prepared.analysisText.length,
      attachments: decision.attachments,
      maskCandidates:
        decision.action === "MASK"
          ? decision.entities.filter((e) => e.value).map((e) => ({ entityType: e.entityType, value: e.value! }))
          : [],
      occurredAt: new Date().toISOString(),
      localDecision: {
        action: decision.action,
        policyId: decision.decision.policyId,
        riskScore: decision.risk.value,
        riskBand: decision.risk.band,
        factorBreakdown: decision.risk.factorBreakdown,
        degradedMode: decision.degradedMode,
        maskedTokens: decision.decision.maskedTokens,
      },
    };
    try {
      await this.client.evaluate(wire);
      await this.flushQueue();
    } catch {
      await this.queue.enqueue(wire);
    }
    return decision;
  }

  outboundText(decision: LocalDecision): string {
    return userFacingText(decision);
  }

  /** Réveil MV3 / cron : heartbeat + file, sans relancer toute l'init. */
  async tick(): Promise<void> {
    if (!this.isEnrolled()) return;
    await this.sendHeartbeat();
    await this.flushQueue();
  }

  isEnrolled(): boolean {
    return Boolean(this.config.agentId && this.privateKey);
  }

  getConfig(): AgentPersistedConfig {
    return { ...this.config };
  }

  stop(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    const tick = () => {
      void this.sendHeartbeat();
    };
    tick();
    this.heartbeatTimer = setInterval(tick, this.config.heartbeatIntervalSeconds * 1000);
    this.heartbeatTimer.unref?.();
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.config.agentId) return;
    const statuses = this.options.engine.statuses();
    const payload: HeartbeatPayload = {
      agentId: this.config.agentId,
      module: this.config.module,
      sequence: ++this.sequence,
      sentAt: new Date().toISOString(),
      agentVersion: "0.1.0",
      integrity: emptyIntegrity(
        statuses.some((s) => s.layer === "rules" && s.available),
        statuses.filter((s) => s.available).map((s) => s.layer),
      ),
      queuedEvents: this.queue.size(),
      policyVersion: this.config.lastPolicyVersion,
    };
    this.config.lastSequence = this.sequence;
    void this.options.store.save(this.config);
    try {
      const res = await this.client.heartbeat(payload);
      if (res.syncRequired) await this.sync();
    } catch {
      /* hors ligne : le monitor central déclenchera AGENT_MISSING au-delà de NFR-03 */
    }
  }

  private async flushQueue(): Promise<void> {
    for (const item of this.queue.peek(10)) {
      try {
        await this.client.evaluate(item.payload as EvaluateInteractionRequest);
        await this.queue.ack(item.id);
      } catch {
        await this.queue.fail(item.id);
        break;
      }
    }
  }
}

export { decideLocally, userFacingText } from "./pipeline.js";
export { prepareFileAnalysis, type IncomingFile } from "./files.js";
export { DecisionCache } from "./cache.js";
export { GatewayClient } from "./client.js";
export { SecureQueue } from "./queue.js";
export { memoryConfigStore, DEFAULT_AGENT_CONFIG, type AgentPersistedConfig, type ConfigStore } from "./config.js";
