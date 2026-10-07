import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  EvaluateInteractionRequestSchema,
  computeEventHash,
  hashUserId,
  randomUuid,
  type DetectionResultWire,
  type EvaluateInteractionRequest,
  type EvaluateInteractionResponse,
  type Policy,
  type RiskBand,
  type RiskFactorName,
  type SensitiveEntity,
} from "@acg/shared";
import { computeRiskScore, DEFAULT_SCORE_CONFIG, type ScoreConfig } from "@acg/risk-scoring";
import { buildPolicyContext, decidePolicy } from "@acg/policy-engine";
import { DetectionEngine } from "@acg/detection-engine";
import { applyMasking } from "@acg/detection-engine";
import { AnonymizationVault, importMasterKey } from "@acg/vault";
import { query, withTransaction } from "../db.js";
import { env } from "../env.js";
import type { AuthUser } from "../auth/jwt.js";
import { PgVaultStore } from "../vault/pg-store.js";

@Injectable()
export class EvaluateService implements OnModuleInit {
  private readonly logger = new Logger(EvaluateService.name);
  private vault: AnonymizationVault | null = null;
  private localEngine: DetectionEngine | null = null;

  async onModuleInit(): Promise<void> {
    const key = await importMasterKey(env.vaultMasterKey);
    this.vault = new AnonymizationVault(key, new PgVaultStore(), 24);
    this.localEngine = new DetectionEngine();
    await this.localEngine.initialize();
    void this.attachOptionalLayers();
  }

  /** NER hub / GGUF en arrière-plan : l'API reste disponible avec les règles si le téléchargement échoue. */
  private async attachOptionalLayers(): Promise<void> {
    try {
      const { createNodeDetectionEngine } = await import("@acg/detection-engine/node");
      this.localEngine = await createNodeDetectionEngine({
        nerModelPath: env.nerModelPath,
        nerModelSha256: env.nerModelSha256,
        llmModelPath: env.llmModelPath,
        llmModelSha256: env.llmModelSha256,
        allowHub: !env.nerDisableHub,
        nerHubModel: env.nerHubModel,
      });
      const ner = this.localEngine.statuses().find((s) => s.layer === "ner");
      this.logger.log(`Couches optionnelles prêtes (NER ${ner?.available ? "actif" : "dégradé"}${ner?.detail ? ` : ${ner.detail}` : ""})`);
    } catch (err) {
      this.logger.warn(`NER/LLM indisponibles, repli règles + mots-clés : ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Pipeline serveur : scoring, politique, journal chaîné, vault si MASK. */
  async evaluate(
    raw: unknown,
    actor: { user?: AuthUser; agentId?: string },
    meta: { clientIp?: string | null } = {},
  ): Promise<EvaluateInteractionResponse> {
    const started = Date.now();
    const req = EvaluateInteractionRequestSchema.parse(raw);
    const contextUser = await this.resolveUser(req, actor);

    const entities = flattenEntities(req.detectionResults);
    const context = latestContext(req.detectionResults);
    const service = await this.loadService(req.aiServiceId);
    const weights = await this.loadWeights();
    const risk = computeRiskScore(
      {
        entities,
        contextCategory: context?.contextCategory ?? null,
        contextConfidence: context?.confidence,
        departmentRiskLevel: contextUser.departmentRiskLevel,
        userJurisdiction: contextUser.jurisdiction,
        aiHostingRegion: service.hosting_region,
        aiRiskBaseline: service.risk_baseline,
      },
      weights,
    );
    const policies = await this.loadPolicies();
    const policyCtx = buildPolicyContext({
      risk,
      entities,
      contextCategory: context?.contextCategory ?? null,
      contextConfidence: context?.confidence ?? 0,
      department: contextUser.department,
      channel: req.channel,
      degradedMode: req.detectionResults.some((r) => r.degraded) || Boolean(req.localDecision?.degradedMode),
      textLength: req.textLength,
      aiService: {
        id: service.id,
        hosting_region: service.hosting_region,
        free_access: service.free_access,
        risk_baseline: service.risk_baseline,
      },
      user: { jurisdiction: contextUser.jurisdiction, department: contextUser.department, role: contextUser.role },
    });
    const decision = decidePolicy({ policies, risk, context: policyCtx, entities });

    let maskedTokens = req.localDecision?.maskedTokens ?? [];
    const tokenMap: { value: string; token: string }[] = [];
    if (decision.action === "MASK" && req.maskCandidates.length > 0 && this.vault) {
      const asEntities: SensitiveEntity[] = req.maskCandidates.map((c, i) => ({
        entityType: c.entityType as SensitiveEntity["entityType"],
        confidence: 1,
        span: [i, i + 1],
        layer: "rules",
        value: c.value,
      }));
      const plan = applyMasking(req.maskCandidates.map((c) => c.value).join("\n"), asEntities);
      maskedTokens = plan.tokens;
      for (const r of plan.replacements) {
        tokenMap.push({ value: r.value, token: r.token });
        await this.vault.storeMapping(req.interactionId, r.token, r.entityType, r.value);
      }
    }

    const eventId = randomUuid();
    const userIdHash = await hashUserId(contextUser.id, env.auditUserSalt);
    const frameworks =
      decision.referenceFrameworks.length > 0 ? decision.referenceFrameworks : await this.activeFrameworkRefs();
    const occurredAt = req.occurredAt;
    const prev = await query<{ event_hash: string }>(
      `SELECT event_hash FROM analytics.security_event ORDER BY sequence DESC LIMIT 1`,
    );
    const prevEventHash = prev.rows[0]?.event_hash ?? null;
    const eventHash = await computeEventHash({
      eventId,
      occurredAt,
      userIdHash,
      department: contextUser.department,
      agentId: actor.agentId ?? req.agentId ?? null,
      channel: req.channel,
      aiServiceId: service.id,
      hostingRegion: service.hosting_region,
      entitiesDetected: [...new Set(entities.map((e) => e.entityType))],
      entityCounts: countEntities(entities),
      contextCategory: context?.contextCategory ?? null,
      riskScore: risk.value,
      riskBand: risk.band,
      factorBreakdown: risk.factorBreakdown,
      policyId: decision.policyId,
      action: decision.action,
      referenceFrameworks: frameworks,
      degradedMode: Boolean(req.localDecision?.degradedMode) || req.detectionResults.some((r) => r.degraded),
      processingTimeMs: Date.now() - started,
      detectionLayers: req.detectionResults.map((r) => r.layer),
      prevEventHash,
    });

    await query(
      `INSERT INTO analytics.security_event (
         event_id, occurred_at, user_id_hash, department, agent_id, channel, ai_service_id, hosting_region,
         entities_detected, entity_counts, context_category, risk_score, risk_band, factor_breakdown,
         policy_id, action, reference_frameworks, degraded_mode, processing_time_ms, detection_layers,
         prev_event_hash, event_hash, client_ip
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
       )`,
      [
        eventId,
        occurredAt,
        userIdHash,
        contextUser.department,
        actor.agentId ?? req.agentId ?? null,
        req.channel,
        service.id,
        service.hosting_region,
        [...new Set(entities.map((e) => e.entityType))],
        JSON.stringify(countEntities(entities)),
        context?.contextCategory ?? null,
        risk.value,
        risk.band,
        JSON.stringify(risk.factorBreakdown),
        decision.policyId,
        decision.action,
        frameworks,
        Boolean(req.localDecision?.degradedMode) || req.detectionResults.some((r) => r.degraded),
        Date.now() - started,
        req.detectionResults.map((r) => r.layer),
        prevEventHash,
        eventHash,
        meta.clientIp ?? null,
      ],
    );

    if (decision.action === "BLOCK" && risk.band === "critical") {
      await query(
        `INSERT INTO security_alert(alert_type, severity, agent_id, event_id, message, details)
         VALUES ('CRITICAL_INTERACTION','critical',$1,$2,$3,$4)`,
        [actor.agentId ?? null, eventId, `Interaction bloquée (score ${risk.value})`, JSON.stringify({ aiServiceId: service.id })],
      );
    }

    const response: EvaluateInteractionResponse = {
      interactionId: req.interactionId,
      eventId,
      decision: decision.action,
      riskScore: risk.value,
      riskBand: risk.band,
      factorBreakdown: risk.factorBreakdown,
      policyId: decision.policyId,
      policyName: decision.policyName,
      referenceFrameworks: frameworks,
      maskedTokens,
      tokenMap: tokenMap.length ? tokenMap : undefined,
      escalated: decision.escalated,
      escalationReason: decision.escalationReason ?? null,
      userMessage: decision.userMessage ?? null,
      processingTimeMs: Date.now() - started,
    };
    this.logger.log(`${decision.action} score=${risk.value} service=${service.id}`);
    return response;
  }

  async inspect(
    text: string,
    aiServiceId: string,
    channel: EvaluateInteractionRequest["channel"],
    user: AuthUser,
    files: { fileName: string; mimeType?: string; data: Uint8Array }[] = [],
  ) {
    if (!this.localEngine) throw new Error("Detection engine non initialisé");
    const extracted = await this.extractAttachmentTexts(files);
    const { combinePromptAndFiles } = await import("@acg/file-extract");
    const analysisText = files.length ? combinePromptAndFiles(text, extracted) : text;
    const detection = await this.localEngine.detect(analysisText);
    const wire: DetectionResultWire[] = detection.results.map((r) => ({
      ...r,
      entities: r.entities.map(({ value: _v, ...rest }) => rest),
    }));
    const attachments = extracted.map((f) => ({
      attachmentId: f.attachmentId,
      fileName: f.fileName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      contentSha256: f.contentSha256,
      extractedTextLength: f.extractedTextLength,
      extractionMethod: f.extractionMethod,
      extractionDegraded: f.extractionDegraded,
    }));
    return this.evaluate(
      {
        interactionId: randomUuid(),
        aiServiceId,
        channel,
        detectionResults: wire.length ? wire : [{ layer: "rules", entities: [], processingTimeMs: 0, modelVersion: "empty", degraded: false }],
        textLength: analysisText.length,
        attachments,
        maskCandidates: detection.entities.filter((e) => e.value).map((e) => ({ entityType: e.entityType, value: e.value! })),
        occurredAt: new Date().toISOString(),
      } satisfies EvaluateInteractionRequest,
      { user },
    );
  }

  /** Extraction texte (+ OCR images) pour agents / inspect. */
  async extractAttachmentTexts(files: { fileName: string; mimeType?: string; data: Uint8Array }[]) {
    if (files.length === 0) return [];
    const { extractFilesNode } = await import("@acg/file-extract/node");
    return extractFilesNode(files.map((f) => ({ fileName: f.fileName, mimeType: f.mimeType, data: f.data })));
  }

  private async resolveUser(req: EvaluateInteractionRequest, actor: { user?: AuthUser; agentId?: string }): Promise<AuthUser> {
    if (actor.user) return actor.user;
    if (actor.agentId) {
      const row = await query<AuthUser & { risk_history_level: AuthUser["departmentRiskLevel"] }>(
        `SELECT u.id, u.email, u.display_name AS "displayName", u.department, d.risk_history_level AS "departmentRiskLevel",
                u.role, u.jurisdiction
           FROM agent a
           JOIN app_user u ON u.id = a.user_id
           JOIN reference.department d ON d.name = u.department
          WHERE a.agent_id = $1`,
        [actor.agentId],
      );
      if (row.rows[0]) return row.rows[0];
    }
    const fallback = await query<AuthUser & { risk_history_level: AuthUser["departmentRiskLevel"] }>(
      `SELECT u.id, u.email, u.display_name AS "displayName", u.department, d.risk_history_level AS "departmentRiskLevel",
              u.role, u.jurisdiction
         FROM app_user u JOIN reference.department d ON d.name = u.department
        WHERE u.role = 'USER' LIMIT 1`,
    );
    if (!fallback.rows[0]) throw new Error("Aucun utilisateur pour rattacher l'interaction");
    return fallback.rows[0];
  }

  private async loadService(id: string) {
    const row = await query<{
      id: string;
      hosting_region: string;
      risk_baseline: number;
      free_access: boolean;
    }>(`SELECT id, hosting_region, risk_baseline, free_access FROM reference.ai_service WHERE id = $1`, [id]);
    return row.rows[0] ?? { id, hosting_region: "US", risk_baseline: 30, free_access: true };
  }

  private async loadPolicies(): Promise<Policy[]> {
    const res = await query<{
      id: string;
      name: string;
      description: string | null;
      condition_expr: string;
      action: Policy["action"];
      priority: number;
      version: number;
      enabled: boolean;
      reference_frameworks: string[];
    }>(`SELECT id, name, description, condition_expr, action, priority, version, enabled, reference_frameworks FROM policy WHERE enabled = true ORDER BY priority ASC`);
    return res.rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      conditionExpr: p.condition_expr,
      action: p.action,
      priority: p.priority,
      version: p.version,
      enabled: p.enabled,
      referenceFrameworks: p.reference_frameworks,
    }));
  }

  private async loadWeights(): Promise<ScoreConfig> {
    const res = await query<{ factor_name: RiskFactorName; weight: string }>(`SELECT factor_name, weight FROM risk_factor_weight`);
    const weights = { ...DEFAULT_SCORE_CONFIG.weights };
    for (const row of res.rows) weights[row.factor_name] = Number(row.weight);
    const bands = await query<{ band: RiskBand; min_score: number; max_score: number }>(`SELECT band, min_score, max_score FROM risk_band_threshold`);
    const thresholds = { ...DEFAULT_SCORE_CONFIG.thresholds };
    for (const b of bands.rows) thresholds[b.band] = [b.min_score, b.max_score];
    return { weights, thresholds };
  }

  private async activeFrameworkRefs(): Promise<string[]> {
    const res = await query<{ component_references: Record<string, string[]> }>(
      `SELECT component_references FROM reference.regulatory_framework WHERE is_active = true LIMIT 1`,
    );
    return res.rows[0]?.component_references?.policy_engine ?? ["OWASP-LLM02"];
  }
}

function flattenEntities(results: DetectionResultWire[]): SensitiveEntity[] {
  return results.flatMap((r) => r.entities.map((e) => ({ ...e, layer: r.layer })));
}

function latestContext(results: DetectionResultWire[]) {
  return results.filter((r) => r.context).sort((a, b) => (b.context?.confidence ?? 0) - (a.context?.confidence ?? 0))[0]?.context;
}

function countEntities(entities: SensitiveEntity[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entities) out[e.entityType] = (out[e.entityType] ?? 0) + 1;
  return out;
}

void withTransaction;
