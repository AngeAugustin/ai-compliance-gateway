import { describe, expect, it } from "vitest";
import { DetectionEngine } from "@acg/detection-engine";
import { DEFAULT_AI_SERVICES, DEFAULT_RISK_BAND_THRESHOLDS, DEFAULT_RISK_WEIGHTS } from "@acg/shared";
import { DecisionCache } from "./cache.js";
import { decideLocally } from "./pipeline.js";
import { SEED_EQUIVALENT_POLICIES, TEXT_E2E_SCENARIOS, type TextE2EScenario } from "./e2e-texte.scenarios.js";

function hydrateFor(scenario: TextE2EScenario): DecisionCache {
  const cache = new DecisionCache();
  cache.hydrate({
    policyVersion: "e2e-seed-equivalent",
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
      userId: "00000000-0000-4000-8000-00000000e2e1",
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

async function runScenario(scenario: TextE2EScenario) {
  const engine = new DetectionEngine();
  await engine.initialize();
  return decideLocally({
    promptText: scenario.text,
    channel: scenario.channel === "api" ? "browser" : scenario.channel,
    hostnameOrCommand: scenario.hostnameOrCommand,
    engine,
    cache: hydrateFor(scenario),
  });
}

describe("E2E texte — pipeline local (seed-equivalent)", () => {
  for (const scenario of TEXT_E2E_SCENARIOS) {
    it(`${scenario.id} — ${scenario.title}`, async () => {
      const decision = await runScenario(scenario);

      expect(
        scenario.expectedActions,
        `${scenario.id}: action=${decision.action} score=${decision.risk.value} band=${decision.risk.band} policy=${decision.decision.policyName}`,
      ).toContain(decision.action);

      if (scenario.expectEntityTypes?.length) {
        const types = new Set(decision.entities.map((e) => e.entityType));
        for (const t of scenario.expectEntityTypes) {
          expect(types.has(t), `${scenario.id}: entité manquante ${t} (obtenu: ${[...types].join(",") || "∅"})`).toBe(true);
        }
      }

      if (scenario.expectedPolicyNameIncludes && decision.action !== "ALLOW") {
        expect(decision.decision.policyName?.toLowerCase() ?? "").toContain(
          scenario.expectedPolicyNameIncludes.toLowerCase(),
        );
      }

      if (decision.action === "MASK") {
        expect(decision.maskedText).not.toBe(scenario.text);
        expect(decision.maskedText).toMatch(/_[0-9]{3}\b/);
        for (const secret of scenario.mustNotAppearIfMasked ?? []) {
          expect(decision.maskedText, `${scenario.id}: fuite « ${secret} »`).not.toContain(secret);
        }
        if (/cotisation/i.test(scenario.text)) {
          expect(decision.maskedText.toLowerCase()).toMatch(/cotisation/);
        }
      }

      if (decision.action === "BLOCK") {
        expect(decision.maskedText).toBe(scenario.text);
      }

      if (decision.action === "ALLOW") {
        expect(decision.entities.filter((e) => e.entityType === "API_KEY" || e.entityType === "PASSWORD")).toHaveLength(0);
      }
    });
  }
});

describe("E2E texte — invariants transverses", () => {
  it("T-INV-01 — BLOCK secrets prioritaire sur WARN bande high", async () => {
    const scenario = TEXT_E2E_SCENARIOS.find((s) => s.id === "T-BLOCK-01")!;
    const decision = await runScenario(scenario);
    expect(decision.action).toBe("BLOCK");
    expect(decision.decision.policyName?.toLowerCase()).toContain("secret");
  });

  it("T-INV-02 — canaux browser et cli produisent la même action sur un même secret", async () => {
    const browser = await runScenario(TEXT_E2E_SCENARIOS.find((s) => s.id === "T-CH-02")!);
    const cli = await runScenario(TEXT_E2E_SCENARIOS.find((s) => s.id === "T-CH-01")!);
    expect(browser.action).toBe(cli.action);
    expect(browser.action).toBe("BLOCK");
  });

  it("T-INV-03 — BLOCK ne produit pas de jetons de masquage", async () => {
    const decision = await runScenario(TEXT_E2E_SCENARIOS.find((s) => s.id === "T-BLOCK-01")!);
    expect(decision.decision.maskedTokens).toEqual([]);
  });

  it("T-INV-04 — ALLOW ne modifie pas le texte sortant", async () => {
    const scenario = TEXT_E2E_SCENARIOS.find((s) => s.id === "T-ALLOW-01")!;
    const decision = await runScenario(scenario);
    expect(decision.action).toBe("ALLOW");
    expect(decision.maskedText).toBe(scenario.text);
  });
});
