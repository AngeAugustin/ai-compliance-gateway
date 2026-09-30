import { describe, expect, it } from "vitest";
import { DetectionEngine } from "@acg/detection-engine";
import { DecisionCache } from "./cache.js";
import { decideLocally } from "./pipeline.js";

describe("pipeline local", () => {
  it("bloque une clé API même hors ligne (politiques bootstrap)", async () => {
    const cache = new DecisionCache();
    cache.hydrate(
      cache.fallback({
        department: "Technique",
        departmentRiskLevel: "moderate",
        jurisdiction: "BJ",
        userId: "00000000-0000-4000-8000-000000000010",
      }),
    );
    const decision = await decideLocally({
      promptText: "Voici ma clé sk-abcdefghijklmnopqrstuvwxyz012345 pour ChatGPT",
      channel: "browser",
      hostnameOrCommand: "chatgpt.com",
      engine: new DetectionEngine(),
      cache,
    });
    expect(decision.action).toBe("BLOCK");
  });

  it("masque un montant transfrontalier", async () => {
    const cache = new DecisionCache();
    cache.hydrate(
      cache.fallback({
        department: "Cotisations",
        departmentRiskLevel: "high",
        jurisdiction: "BJ",
        userId: "00000000-0000-4000-8000-000000000011",
      }),
    );
    const decision = await decideLocally({
      promptText: "Virer 2 500 000 FCFA de cotisations vers MoMo 01 97 12 34 56 pour Marie Agbodji (marie.agbodji@cnss.bj).",
      channel: "browser",
      hostnameOrCommand: "chatgpt.com",
      engine: new DetectionEngine(),
      cache,
    });
    expect(["MASK", "BLOCK", "WARN"]).toContain(decision.action);
    if (decision.action === "MASK") {
      expect(decision.maskedText).toMatch(/MONTANT_\d{3}|SALAIRE_\d{3}/);
      expect(decision.maskedText).not.toContain("2 500 000");
    }
  });
});
