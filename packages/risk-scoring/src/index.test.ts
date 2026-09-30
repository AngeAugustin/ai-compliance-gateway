import { describe, expect, it } from "vitest";
import { computeRiskScore } from "./index.js";
import type { SensitiveEntity } from "@acg/shared";

const e = (entityType: SensitiveEntity["entityType"], layer: SensitiveEntity["layer"] = "rules"): SensitiveEntity => ({
  entityType,
  confidence: 0.9,
  span: [0, 1],
  layer,
});

describe("computeRiskScore", () => {
  it("reste bas sans entité ni transfert", () => {
    const score = computeRiskScore({
      entities: [],
      contextCategory: "Generique",
      departmentRiskLevel: "low",
      userJurisdiction: "BJ",
      aiHostingRegion: "BJ",
      aiRiskBaseline: 10,
    });
    expect(score.value).toBeLessThan(25);
    expect(score.band).toBe("low");
    expect(score.crossBorder).toBe(false);
    expect(score.factorBreakdown).toHaveLength(4);
  });

  it("monte avec données financières transfrontalières", () => {
    const score = computeRiskScore({
      entities: [e("FINANCIAL_AMOUNT"), e("MOBILE_MONEY"), e("PERSON")],
      contextCategory: "Finance",
      contextConfidence: 0.87,
      departmentRiskLevel: "high",
      userJurisdiction: "BJ",
      aiHostingRegion: "US",
      aiRiskBaseline: 30,
    });
    expect(score.value).toBeGreaterThanOrEqual(50);
    expect(score.crossBorder).toBe(true);
    expect(score.quasiIdentifierCount).toBeGreaterThanOrEqual(1);
  });

  it("détecte une combinaison de quasi-identifiants (H2)", () => {
    const score = computeRiskScore({
      entities: [e("PERSON"), e("EMAIL"), e("PHONE"), e("JOB_TITLE")],
      contextCategory: "RH",
      departmentRiskLevel: "moderate",
      userJurisdiction: "BJ",
      aiHostingRegion: "US",
      aiRiskBaseline: 25,
    });
    const qi = score.factorBreakdown.find((f) => f.factor === "quasi_identifier_combination")!;
    expect(qi.rawScore).toBeGreaterThan(0);
    expect(score.quasiIdentifierCount).toBeGreaterThanOrEqual(3);
  });
});
