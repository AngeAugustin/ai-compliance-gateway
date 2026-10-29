import { describe, expect, it } from "vitest";
import { divergenceAlert, resolveAppliedDecision, type DecisionSummary } from "./applied-decision.js";

const server: DecisionSummary = { action: "WARN", policyId: "warn-quasi-ids", riskScore: 45, riskBand: "moderate", factorBreakdown: [] };

describe("décision journalisée", () => {
  it("sans décision locale (inspection dashboard), la décision serveur est celle appliquée", () => {
    expect(resolveAppliedDecision(server, undefined)).toEqual({ applied: server, diverges: false });
  });

  it("journalise l'action appliquée sur le poste et garde la décision serveur à côté", () => {
    // Cas réel : l'agent masque puis le contrôle de risque résiduel (inconnu du serveur) bloque.
    const local = {
      action: "BLOCK" as const,
      policyId: "residual-qi",
      riskScore: 72,
      riskBand: "high" as const,
      factorBreakdown: [],
      degradedMode: false,
      maskedTokens: [],
    };
    const r = resolveAppliedDecision(server, local);
    expect(r.applied).toMatchObject({ action: "BLOCK", policyId: "residual-qi", riskScore: 72, riskBand: "high" });
    expect(r.serverDecision).toEqual({ action: "WARN", policyId: "warn-quasi-ids", riskScore: 45, riskBand: "moderate" });
    expect(r.diverges).toBe(true);
  });

  it("gravité de l'alerte : poste plus laxiste = critique, plus strict = avertissement", () => {
    expect(divergenceAlert("ALLOW", "BLOCK").severity).toBe("critical");
    expect(divergenceAlert("MASK", "WARN").severity).toBe("warning");
    expect(divergenceAlert("WARN", "MASK").message).toContain("moins strict");
  });

  it("même action des deux côtés : pas de divergence, mais la trace serveur reste", () => {
    const local = { ...server, degradedMode: false, maskedTokens: [] };
    const r = resolveAppliedDecision(server, local);
    expect(r.diverges).toBe(false);
    expect(r.serverDecision?.action).toBe("WARN");
  });
});
