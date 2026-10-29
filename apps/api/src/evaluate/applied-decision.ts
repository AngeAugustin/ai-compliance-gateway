import type { EvaluateInteractionRequest, PolicyAction, RiskBand, RiskFactorBreakdown } from "@acg/shared";

export interface DecisionSummary {
  action: PolicyAction;
  policyId: string | null;
  riskScore: number;
  riskBand: RiskBand;
  factorBreakdown: RiskFactorBreakdown[];
}

export interface ResolvedDecision {
  /** Ce qui a réellement été appliqué : c'est ce que le journal doit dire. */
  applied: DecisionSummary;
  /** Décision recalculée par le serveur, présente seulement quand l'agent a décidé lui-même. */
  serverDecision?: Omit<DecisionSummary, "factorBreakdown">;
  diverges: boolean;
}

/**
 * L'agent décide et applique localement (contexte, risque résiduel après masquage,
 * politiques en cache) ; le serveur recalcule sans ces éléments, éventuellement plus
 * tard (file hors ligne) et avec des politiques qui ont pu changer. Journaliser la
 * décision serveur ferait mentir le journal : on journalise l'action appliquée et on
 * garde la décision serveur à côté, ce qui rend tout écart visible et vérifiable.
 */
const STRICTNESS: Record<PolicyAction, number> = { ALLOW: 0, WARN: 1, MASK: 2, BLOCK: 3 };

/**
 * Alerte DECISION_DIVERGENCE : un poste plus strict que le serveur (contexte, risque
 * résiduel) est attendu → avertissement ; un poste plus laxiste que le serveur est le
 * signe possible d'un agent altéré ou d'un cache de politiques périmé → critique.
 */
export function divergenceAlert(applied: PolicyAction, server: PolicyAction): { severity: "warning" | "critical"; message: string } {
  const laxer = STRICTNESS[applied] < STRICTNESS[server];
  return {
    severity: laxer ? "critical" : "warning",
    message: laxer
      ? `Poste moins strict que le serveur : ${applied} appliqué, ${server} attendu`
      : `Poste plus strict que le serveur : ${applied} appliqué, ${server} recalculé`,
  };
}

export function resolveAppliedDecision(
  server: DecisionSummary,
  local: EvaluateInteractionRequest["localDecision"],
): ResolvedDecision {
  if (!local) return { applied: server, diverges: false };
  return {
    applied: {
      action: local.action,
      policyId: local.policyId,
      riskScore: local.riskScore,
      riskBand: local.riskBand,
      factorBreakdown: local.factorBreakdown,
    },
    serverDecision: { action: server.action, policyId: server.policyId, riskScore: server.riskScore, riskBand: server.riskBand },
    diverges: local.action !== server.action,
  };
}
