import { describe, expect, it } from "vitest";
import { DetectionEngine } from "@acg/detection-engine";
import { DecisionCache } from "./cache.js";
import { decideLocally } from "./pipeline.js";

function maskEmailsCache(): DecisionCache {
  const cache = new DecisionCache();
  const snapshot = cache.fallback({
    department: "RH",
    departmentRiskLevel: "moderate",
    jurisdiction: "BJ",
    userId: "00000000-0000-4000-8000-000000000020",
  });
  snapshot.policies = [
    {
      id: "pol-mask-email",
      name: "Masquer les e-mails",
      description: "Test",
      conditionExpr: `contains(entity_type, "EMAIL")`,
      action: "MASK",
      priority: 1,
      version: 1,
      enabled: true,
      referenceFrameworks: [],
    },
  ];
  cache.hydrate(snapshot);
  return cache;
}

describe("jetons stables entre deux prompts", () => {
  it("réutilise le jeton d'une valeur déjà vue et numérote les nouvelles à la suite", async () => {
    const cache = maskEmailsCache();
    const engine = new DetectionEngine();
    const first = await decideLocally({
      promptText: "Relance ada@cnss.bj pour la réunion.",
      channel: "browser",
      hostnameOrCommand: "chatgpt.com",
      engine,
      cache,
    });
    expect(first.action).toBe("MASK");
    expect(first.maskedText).toBe("Relance EMAIL_001 pour la réunion.");

    const second = await decideLocally({
      promptText: "Mets bob@cnss.bj en copie de ada@cnss.bj.",
      channel: "browser",
      hostnameOrCommand: "chatgpt.com",
      engine,
      cache,
      tokenBindings: first.tokenBindings,
    });
    expect(second.maskedText).toBe("Mets EMAIL_002 en copie de EMAIL_001.");
    expect(Object.fromEntries(second.tokenBindings.map((b) => [b.token, b.value]))).toEqual({
      EMAIL_001: "ada@cnss.bj",
      EMAIL_002: "bob@cnss.bj",
    });
  });
});
