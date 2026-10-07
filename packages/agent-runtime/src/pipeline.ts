import { DetectionEngine } from "@acg/detection-engine";
import { applyMasking, residualQuasiIdentifiers } from "@acg/detection-engine";
import { buildPolicyContext, decidePolicy } from "@acg/policy-engine";
import { computeRiskScore, type ScoreConfig } from "@acg/risk-scoring";
import { sanitizeTextFile, type ExtractedFile, type SanitizedFile } from "@acg/file-extract";
import {
  randomUuid,
  type AttachmentWire,
  type Channel,
  type PolicyAction,
  type PolicyDecision,
  type RiskScore,
  type SensitiveEntity,
} from "@acg/shared";
import type { DecisionCache } from "./cache.js";
import { entitiesInPromptOnly, fileExtractionDegraded, shouldBlockAttachmentsForMask } from "./files.js";

export interface LocalDecision {
  interactionId: string;
  action: PolicyAction;
  decision: PolicyDecision;
  risk: RiskScore;
  maskedText: string;
  originalText: string;
  /** Prompt utilisateur seul (sans extraits fichier) */
  promptText: string;
  entities: SensitiveEntity[];
  degradedMode: boolean;
  aiServiceId: string;
  processingTimeMs: number;
  attachments: AttachmentWire[];
  /** Fichiers présents mais bloqués (BLOCK ou MASK non réécrivable) */
  blockAttachments: boolean;
  sanitizedFileNames: string[];
  /** Contenu fichier déjà jetonné (à renvoyer à la place de l'original) */
  sanitizedFiles: SanitizedFile[];
}

export interface PipelineInput {
  /** Texte utilisateur (composer / argv) sans contenu fichier */
  promptText: string;
  /** Texte complet pour analyse ; défaut = promptText */
  analysisText?: string;
  extractedFiles?: ExtractedFile[];
  channel: Channel;
  hostnameOrCommand: string;
  engine: DetectionEngine;
  cache: DecisionCache;
  failClosedDepartments?: string[];
}

/**
 * Pipeline local identique à celui du serveur : détection → scoring → politique → masquage.
 * Utilisé par A1 et A2, en ligne comme hors ligne (NFR-02).
 */
export async function decideLocally(input: PipelineInput): Promise<LocalDecision> {
  const started = performance.now?.() ?? Date.now();
  const snapshot = input.cache.get() ?? input.cache.fallback({
    department: "Generique",
    departmentRiskLevel: "moderate",
    jurisdiction: "BJ",
    userId: "00000000-0000-4000-8000-000000000099",
  });
  const service = input.cache.matchAiService(input.hostnameOrCommand);
  const aiServiceId = service?.id ?? input.hostnameOrCommand;
  const promptText = input.promptText;
  const analysisText = input.analysisText ?? promptText;
  const extractedFiles = input.extractedFiles ?? [];
  const attachments: AttachmentWire[] = extractedFiles.map((f) => ({
    attachmentId: f.attachmentId,
    fileName: f.fileName,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    contentSha256: f.contentSha256,
    extractedTextLength: f.extractedTextLength,
    extractionMethod: f.extractionMethod,
    extractionDegraded: f.extractionDegraded,
  }));

  const detection = await input.engine.detect(analysisText);
  const scoreConfig: ScoreConfig = {
    weights: snapshot.riskWeights,
    thresholds: snapshot.riskBandThresholds,
  };
  const risk = computeRiskScore(
    {
      entities: detection.entities,
      contextCategory: detection.context?.contextCategory ?? null,
      contextConfidence: detection.context?.confidence,
      departmentRiskLevel: snapshot.user.departmentRiskLevel,
      userJurisdiction: snapshot.user.jurisdiction,
      aiHostingRegion: service?.hostingRegion ?? "US",
      aiRiskBaseline: service?.riskBaseline ?? 30,
    },
    scoreConfig,
  );

  const extractionDegraded = fileExtractionDegraded(extractedFiles);
  const combinedDegraded = detection.degraded || extractionDegraded;
  const degradedMode = combinedDegraded && !detection.layers.includes("rules");
  const ctx = buildPolicyContext({
    risk,
    entities: detection.entities,
    contextCategory: detection.context?.contextCategory ?? null,
    contextConfidence: detection.context?.confidence ?? 0,
    department: snapshot.user.department,
    channel: input.channel,
    degradedMode: combinedDegraded,
    textLength: analysisText.length,
    aiService: {
      id: aiServiceId,
      hosting_region: service?.hostingRegion ?? "US",
      free_access: service?.freeAccess ?? true,
      risk_baseline: service?.riskBaseline ?? 30,
    },
    user: {
      jurisdiction: snapshot.user.jurisdiction,
      department: snapshot.user.department,
      role: snapshot.user.role,
    },
  });

  const promptEntities = entitiesInPromptOnly(promptText, detection.entities);
  let masked = applyMasking(promptText, promptEntities);
  const residual = residualQuasiIdentifiers(masked.text, detection.entities);
  let decision = decidePolicy({
    policies: snapshot.policies,
    risk,
    context: ctx,
    entities: detection.entities,
    residualEntities: residual,
  });

  // Image / PDF / format illisible : sans texte extractible la détection ne voit rien.
  // BLOCK systématique (tous rôles / directions) — sinon ALLOW + fuite possible.
  if (extractionDegraded && extractedFiles.length > 0) {
    const unreadable = extractedFiles.filter(
      (f) => f.extractionDegraded || f.extractionMethod === "unsupported" || f.extractionMethod === "failed",
    );
    const names = unreadable
      .map((f) => f.fileName)
      .filter(Boolean)
      .slice(0, 3)
      .join(", ");
    decision = {
      ...decision,
      action: "BLOCK",
      escalated: true,
      escalationReason: "Fail-closed : fichier non analysable",
      userMessage: names
        ? `Interaction bloquée : impossible d'analyser le fichier « ${names} » de façon fiable (OCR requis pour les images, ou format non supporté).`
        : "Interaction bloquée : impossible d'analyser le fichier joint de façon fiable.",
    };
  }

  const failClosed =
    combinedDegraded &&
    snapshot.user.departmentRiskLevel === "high" &&
    (input.failClosedDepartments ?? ["Cotisations", "Finance", "Juridique"]).includes(snapshot.user.department);
  if (failClosed && decision.action !== "BLOCK") {
    decision = {
      ...decision,
      action: "BLOCK",
      escalated: true,
      escalationReason: "Fail-closed : direction à risque élevé et détection dégradée",
      userMessage: extractionDegraded
        ? "Interaction bloquée : impossible d'analyser le fichier joint de façon fiable."
        : "Interaction bloquée : le moteur d'analyse n'est pas pleinement disponible.",
    };
  }

  let blockAttachments = decision.action === "BLOCK" && extractedFiles.length > 0;
  const sanitizedFileNames: string[] = [];
  const sanitizedFiles: SanitizedFile[] = [];

  if (decision.action === "MASK" && extractedFiles.length > 0) {
    const fileGate = shouldBlockAttachmentsForMask(decision.action, extractedFiles, detection.entities);
    if (fileGate.block) {
      decision = {
        ...decision,
        action: "BLOCK",
        escalated: true,
        escalationReason: "Fichier non anonymisable",
        userMessage: fileGate.reason,
      };
      blockAttachments = true;
      masked = { text: promptText, tokens: [], replacements: [] };
    } else {
      for (const file of extractedFiles) {
        const fileEntities = detection.entities.filter((e) => file.text.includes(e.value ?? ""));
        if (fileEntities.length === 0) continue;
        const sanitized = sanitizeTextFile(file, fileEntities);
        if (sanitized) {
          sanitizedFileNames.push(file.fileName);
          sanitizedFiles.push(sanitized);
        }
      }
      if (sanitizedFiles.length > 0 && !decision.userMessage) {
        decision = {
          ...decision,
          userMessage: `Données sensibles remplacées dans le prompt et ${sanitizedFiles.length} fichier(s) (${sanitizedFileNames.join(", ")}).`,
        };
      }
    }
  }

  if (decision.action !== "MASK") {
    masked = { text: promptText, tokens: [], replacements: [] };
  } else {
    decision = { ...decision, maskedTokens: masked.tokens };
  }

  if (decision.action === "BLOCK" && extractedFiles.length > 0 && !decision.userMessage) {
    decision = {
      ...decision,
      userMessage: `Envoi bloqué : le fichier joint contient des données sensibles.`,
    };
    blockAttachments = true;
  }

  return {
    interactionId: randomUuid(),
    action: decision.action,
    decision,
    risk,
    maskedText: decision.action === "MASK" ? masked.text : promptText,
    originalText: promptText,
    promptText,
    entities: detection.entities,
    degradedMode: combinedDegraded,
    aiServiceId,
    processingTimeMs: Math.round((performance.now?.() ?? Date.now()) - started),
    attachments,
    blockAttachments,
    sanitizedFileNames,
    sanitizedFiles,
  };
}

export function userFacingText(decision: LocalDecision): string {
  if (decision.action === "BLOCK") return "";
  if (decision.action === "MASK") return decision.maskedText;
  return decision.originalText;
}
