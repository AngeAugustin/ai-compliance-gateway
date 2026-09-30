import {
  CONTEXT_CATEGORY_RISK,
  DEFAULT_RISK_BAND_THRESHOLDS,
  DEFAULT_RISK_WEIGHTS,
  ENTITY_DEFINITIONS,
  bandForScore,
  type ContextCategory,
  type RiskBandThresholds,
  type RiskFactorBreakdown,
  type RiskFactorName,
  type RiskScore,
  type SensitiveEntity,
} from "@acg/shared";

export interface ScoreInput {
  entities: SensitiveEntity[];
  contextCategory: ContextCategory | null;
  contextConfidence?: number;
  departmentRiskLevel: "low" | "moderate" | "high";
  userJurisdiction: string;
  aiHostingRegion: string;
  aiRiskBaseline: number;
}

export interface ScoreConfig {
  weights: Record<RiskFactorName, number>;
  thresholds: RiskBandThresholds;
}

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  weights: { ...DEFAULT_RISK_WEIGHTS },
  thresholds: { ...DEFAULT_RISK_BAND_THRESHOLDS },
};

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function uniqueTypes(entities: SensitiveEntity[]): string[] {
  return [...new Set(entities.map((e) => e.entityType))];
}

/** Facteur 1 — sensibilité des entités (poids 40 %). */
export function scoreEntitySensitivity(entities: SensitiveEntity[]): { raw: number; explanation: string } {
  if (entities.length === 0) return { raw: 0, explanation: "Aucune entité sensible détectée" };
  const types = uniqueTypes(entities);
  const maxSens = Math.max(...types.map((t) => ENTITY_DEFINITIONS[t as keyof typeof ENTITY_DEFINITIONS]?.sensitivity ?? 0));
  const avgSens =
    types.reduce((s, t) => s + (ENTITY_DEFINITIONS[t as keyof typeof ENTITY_DEFINITIONS]?.sensitivity ?? 0), 0) / types.length;
  const volumeBoost = Math.min(entities.length * 4, 20);
  const raw = clamp100(maxSens * 70 + avgSens * 20 + volumeBoost);
  return {
    raw,
    explanation: `${types.length} type(s), sensibilité max ${maxSens.toFixed(2)}, ${entities.length} occurrence(s)`,
  };
}

/** Facteur 2 — combinaison de quasi-identifiants (poids 25 %, H2). */
export function scoreQuasiIdentifiers(entities: SensitiveEntity[]): { raw: number; count: number; explanation: string } {
  const qi = uniqueTypes(entities).filter((t) => ENTITY_DEFINITIONS[t as keyof typeof ENTITY_DEFINITIONS]?.quasiIdentifier);
  const count = qi.length;
  if (count < 2) return { raw: 0, count, explanation: `${count} quasi-identifiant — combinaison absente` };
  const raw = clamp100(35 + (count - 2) * 25);
  return { raw, count, explanation: `Combinaison de ${count} quasi-identifiants (${qi.join(", ")})` };
}

/** Facteur 3 — localisation d'hébergement (poids 20 %). */
export function scoreHostingLocation(
  userJurisdiction: string,
  hostingRegion: string,
  riskBaseline: number,
): { raw: number; crossBorder: boolean; explanation: string } {
  const same = normalizeRegion(userJurisdiction) === normalizeRegion(hostingRegion);
  const crossBorder = !same;
  if (same) {
    return { raw: clamp100(riskBaseline * 0.3), crossBorder, explanation: `Hébergement dans la juridiction (${hostingRegion})` };
  }
  const extra = hostingRegion.toUpperCase() === "CN" ? 20 : 0;
  const raw = clamp100(55 + riskBaseline * 0.4 + extra);
  return { raw, crossBorder, explanation: `Transfert ${userJurisdiction} → ${hostingRegion} (baseline ${riskBaseline})` };
}

function normalizeRegion(value: string): string {
  const v = value.toUpperCase();
  if (["BJ", "BENIN", "BÉNIN"].includes(v)) return "BJ";
  if (["ECOWAS", "CEDEAO"].includes(v)) return "BJ";
  if (["EU", "FR", "DE", "BE", "ES", "IT", "NL", "PT"].includes(v)) return "EU";
  return v;
}

/** Facteur 4 — contexte organisationnel (poids 15 %). Le LLM n'entre QUE ici. */
export function scoreOrganizationalContext(
  departmentRiskLevel: "low" | "moderate" | "high",
  contextCategory: ContextCategory | null,
  contextConfidence: number,
): { raw: number; explanation: string } {
  const dept = departmentRiskLevel === "high" ? 80 : departmentRiskLevel === "moderate" ? 45 : 15;
  const cat = contextCategory ? CONTEXT_CATEGORY_RISK[contextCategory] * 100 : 10;
  const conf = Math.max(0.3, Math.min(1, contextConfidence));
  const raw = clamp100(dept * 0.45 + cat * conf * 0.55);
  return {
    raw,
    explanation: `Direction ${departmentRiskLevel}, catégorie ${contextCategory ?? "inconnue"} (confiance ${(conf * 100).toFixed(0)} %)`,
  };
}

export function computeRiskScore(input: ScoreInput, config: ScoreConfig = DEFAULT_SCORE_CONFIG): RiskScore {
  const f1 = scoreEntitySensitivity(input.entities);
  const f2 = scoreQuasiIdentifiers(input.entities);
  const f3 = scoreHostingLocation(input.userJurisdiction, input.aiHostingRegion, input.aiRiskBaseline);
  const f4 = scoreOrganizationalContext(input.departmentRiskLevel, input.contextCategory, input.contextConfidence ?? 0.5);

  const parts: { factor: RiskFactorName; raw: number; explanation: string }[] = [
    { factor: "entity_sensitivity", raw: f1.raw, explanation: f1.explanation },
    { factor: "quasi_identifier_combination", raw: f2.raw, explanation: f2.explanation },
    { factor: "hosting_location", raw: f3.raw, explanation: f3.explanation },
    { factor: "organizational_context", raw: f4.raw, explanation: f4.explanation },
  ];

  const factorBreakdown: RiskFactorBreakdown[] = parts.map((p) => {
    const weight = config.weights[p.factor];
    return {
      factor: p.factor,
      rawScore: p.raw,
      weight,
      contribution: Math.round(p.raw * weight * 100) / 100,
      explanation: p.explanation,
    };
  });

  const value = clamp100(factorBreakdown.reduce((s, f) => s + f.contribution, 0));
  return {
    value,
    band: bandForScore(value, config.thresholds),
    factorBreakdown,
    quasiIdentifierCount: f2.count,
    crossBorder: f3.crossBorder,
  };
}
