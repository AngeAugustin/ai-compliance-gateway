import { describe, expect, it } from "vitest";
import { DetectionEngine } from "@acg/detection-engine";
import { buildPolicyContext, decidePolicy } from "@acg/policy-engine";
import { computeRiskScore } from "@acg/risk-scoring";
import { DEFAULT_AI_SERVICES, DEFAULT_RISK_BAND_THRESHOLDS, DEFAULT_RISK_WEIGHTS } from "@acg/shared";
import { DecisionCache } from "./cache.js";
import { decideLocally } from "./pipeline.js";
import { SEED_EQUIVALENT_POLICIES, TEXT_E2E_SCENARIOS, type TextE2EScenario } from "./e2e-texte.scenarios.js";

/**
 * Démonstration du risque d'écart journal / poste : le serveur recalcule la décision
 * à partir des seules entités transmises — sans catégorie de contexte (non envoyée) ni
 * contrôle de risque résiduel après masquage. Ce test rejoue ce recalcul sur les
 * scénarios E2E et montre qu'il ne donne pas toujours l'action appliquée par l'agent :
 * d'où la journalisation de l'action locale, avec la décision serveur à côté.
 */
function cacheFor(scenario: TextE2EScenario): DecisionCache {
  const cache = new DecisionCache();
  cache.hydrate({
    policyVersion: "divergence",
    generatedAt: new Date().toISOString(),
    policies: SEED_EQUIVALENT_POLICIES,
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
    organization: { jurisdiction: scenario.user.jurisdiction, regulatoryFrameworkId: "BJ_MALABO" },
    user: {
      userId: "00000000-0000-4000-8000-00000000d1v1",
      department: scenario.user.department,
      departmentRiskLevel: scenario.user.departmentRiskLevel,
      jurisdiction: scenario.user.jurisdiction,
      role: "USER",
    },
    heartbeatIntervalSeconds: 60,
    syncIntervalSeconds: 300,
    expectedModelHashes: {},
  });
  return cache;
}

describe("écart entre décision locale et recalcul serveur", () => {
  it("le recalcul serveur (sans contexte ni risque résiduel) diverge sur une partie des scénarios", async () => {
    const engine = new DetectionEngine();
    await engine.initialize();
    const divergent: string[] = [];

    for (const scenario of TEXT_E2E_SCENARIOS) {
      const cache = cacheFor(scenario);
      const channel = scenario.channel === "api" ? "browser" : scenario.channel;
      const local = await decideLocally({ promptText: scenario.text, channel, hostnameOrCommand: scenario.hostnameOrCommand, engine, cache });

      // Ce que fait EvaluateService : mêmes entités, mêmes politiques, mais contexte absent et pas de résiduel.
      const snapshot = cache.get()!;
      const service = cache.matchAiService(scenario.hostnameOrCommand);
      const aiService = {
        id: local.aiServiceId,
        hosting_region: service?.hostingRegion ?? "US",
        free_access: service?.freeAccess ?? true,
        risk_baseline: service?.riskBaseline ?? 30,
      };
      const risk = computeRiskScore(
        {
          entities: local.entities,
          contextCategory: null,
          departmentRiskLevel: snapshot.user.departmentRiskLevel,
          userJurisdiction: snapshot.user.jurisdiction,
          aiHostingRegion: aiService.hosting_region,
          aiRiskBaseline: aiService.risk_baseline,
        },
        { weights: snapshot.riskWeights, thresholds: snapshot.riskBandThresholds },
      );
      const ctx = buildPolicyContext({
        risk,
        entities: local.entities,
        contextCategory: null,
        contextConfidence: 0,
        department: snapshot.user.department,
        channel,
        degradedMode: local.degradedMode,
        textLength: scenario.text.length,
        aiService,
        user: { jurisdiction: snapshot.user.jurisdiction, department: snapshot.user.department, role: snapshot.user.role },
      });
      const server = decidePolicy({ policies: snapshot.policies, risk, context: ctx, entities: local.entities });
      if (server.action !== local.action) divergent.push(`${scenario.id} : poste ${local.action}, serveur ${server.action}`);
    }

    console.info(`Décisions divergentes (${divergent.length}/${TEXT_E2E_SCENARIOS.length}) :\n  ${divergent.join("\n  ")}`);
    expect(divergent.length).toBeGreaterThan(0);
  });
});
