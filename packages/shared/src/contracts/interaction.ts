import { z } from "zod";
import { CHANNELS, POLICY_ACTIONS, RISK_BANDS } from "../domain/actions.js";
import { AttachmentWireSchema } from "./attachment.js";
import { DetectionResultWireSchema } from "./detection.js";
import { RiskFactorBreakdownSchema } from "./risk.js";
import { EscrowEnvelopeSchema } from "../crypto/escrow.js";

/**
 * POST /v1/interactions/evaluate — requête (DAT §15).
 * L'agent envoie les résultats de détection SANS valeur en clair et la décision
 * qu'il a appliquée (localDecision). La tokenisation est locale ; les valeurs
 * masquées ne quittent le poste que chiffrées pour le séquestre (maskEscrow).
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
   * Correspondances jeton → valeur de cette interaction, chiffrées avec la clé publique
   * de séquestre (voir crypto/escrow). Le serveur les stocke sans pouvoir les lire hors
   * levée d'anonymat. Absent si rien n'a été masqué.
   */
  maskEscrow: EscrowEnvelopeSchema.optional(),
  occurredAt: z.string().datetime(),
  /**
   * Décision réellement appliquée sur le poste. C'est elle qui est journalisée ;
   * la décision recalculée par le serveur est conservée à côté pour détecter les écarts.
   */
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
  /** Jetons appliqués (jamais les valeurs) */
  maskedTokens: z.array(z.string()),
  escalated: z.boolean(),
  escalationReason: z.string().nullable(),
  userMessage: z.string().nullable(),
  processingTimeMs: z.number().nonnegative(),
});
export type EvaluateInteractionResponse = z.infer<typeof EvaluateInteractionResponseSchema>;
