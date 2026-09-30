import { z } from "zod";
import { RISK_BANDS } from "../domain/actions.js";

export const RISK_FACTORS = [
  "entity_sensitivity",
  "quasi_identifier_combination",
  "hosting_location",
  "organizational_context",
] as const;
export type RiskFactorName = (typeof RISK_FACTORS)[number];

/** Pondérations par défaut du DAT §9 (somme = 1). */
export const DEFAULT_RISK_WEIGHTS: Record<RiskFactorName, number> = {
  entity_sensitivity: 0.4,
  quasi_identifier_combination: 0.25,
  hosting_location: 0.2,
  organizational_context: 0.15,
};

export const RiskFactorBreakdownSchema = z.object({
  factor: z.enum(RISK_FACTORS),
  /** Score brut du facteur, 0-100 */
  rawScore: z.number().min(0).max(100),
  weight: z.number().min(0).max(1),
  /** Contribution pondérée au score final */
  contribution: z.number().min(0).max(100),
  explanation: z.string(),
});
export type RiskFactorBreakdown = z.infer<typeof RiskFactorBreakdownSchema>;

export const RiskScoreSchema = z.object({
  value: z.number().int().min(0).max(100),
  band: z.enum(RISK_BANDS),
  factorBreakdown: z.array(RiskFactorBreakdownSchema),
  quasiIdentifierCount: z.number().int().nonnegative(),
  crossBorder: z.boolean(),
});
export type RiskScore = z.infer<typeof RiskScoreSchema>;
