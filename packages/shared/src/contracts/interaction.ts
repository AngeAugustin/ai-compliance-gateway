import { z } from "zod";
import { CHANNELS, POLICY_ACTIONS, RISK_BANDS } from "../domain/actions.js";
import { AttachmentWireSchema } from "./attachment.js";
import { DetectionResultWireSchema } from "./detection.js";
import { RiskFactorBreakdownSchema } from "./risk.js";

/**
 * POST /v1/interactions/evaluate — requête (DAT §15).
 * L'agent envoie les résultats de détection SANS valeur en clair. Lorsqu'une
 * action MASK est possible, il fournit les entités à tokeniser sous forme
 * chiffrée pour le Vault (voir maskCandidates) ; le serveur ne voit jamais
 * la valeur en clair hors mémoire de traitement.
 */
export const EvaluateInteractionRequestSchema = z.object({
  interactionId: z.string().min(1),
  agentId: z.string().min(1).optional(),
  aiServiceId: z.string().min(1),
  channel: z.enum(CHANNELS),
  detectionResults: z.array(DetectionResultWireSchema).min(1),
  /** Longueur du texte analysé (jamais le texte lui-même) */
  textLength: z.number().int().nonnegative(),
  /** Métadonnées pièces jointes (jamais le binaire ni le texte extrait) */
  attachments: z.array(AttachmentWireSchema).max(20).default([]),
  /**
   * Candidats au masquage : pour chaque entité, le type et la valeur en clair.
   * Transmis uniquement si l'agent est configuré en tokenisation côté serveur
   * (mode par défaut : tokenisation locale, ce champ est vide).
   */
  maskCandidates: z
    .array(
      z.object({
        entityType: z.string(),
        value: z.string().max(2000),
      }),
    )
    .max(200)
    .default([]),
  occurredAt: z.string().datetime(),
  /** Décision prise localement si l'agent était hors ligne (journalisation a posteriori) */
  localDecision: z
    .object({
      action: z.enum(POLICY_ACTIONS),
      policyId: z.string().min(1).nullable(),
      riskScore: z.number().int().min(0).max(100),
      riskBand: z.enum(RISK_BANDS),
      factorBreakdown: z.array(RiskFactorBreakdownSchema),
      degradedMode: z.boolean(),
      maskedTokens: z.array(z.string()).default([]),
    })
    .optional(),
});
export type EvaluateInteractionRequest = z.infer<typeof EvaluateInteractionRequestSchema>;

export const EvaluateInteractionResponseSchema = z.object({
  interactionId: z.string().min(1),
  eventId: z.string().min(1),
  decision: z.enum(POLICY_ACTIONS),
  riskScore: z.number().int().min(0).max(100),
  riskBand: z.enum(RISK_BANDS),
  factorBreakdown: z.array(RiskFactorBreakdownSchema),
  policyId: z.string().min(1).nullable(),
  policyName: z.string().nullable(),
  referenceFrameworks: z.array(z.string()),
  /** Correspondance valeur -> jeton, uniquement si maskCandidates a été fourni */
  maskedTokens: z.array(z.string()),
  tokenMap: z.array(z.object({ value: z.string(), token: z.string() })).optional(),
  escalated: z.boolean(),
  escalationReason: z.string().nullable(),
  userMessage: z.string().nullable(),
  processingTimeMs: z.number().nonnegative(),
});
export type EvaluateInteractionResponse = z.infer<typeof EvaluateInteractionResponseSchema>;
