import { describe, expect, it } from "vitest";
import { buildPolicyContext, decidePolicy } from "./index.js";
import { computeRiskScore } from "@acg/risk-scoring";
import type { Policy, SensitiveEntity } from "@acg/shared";

const policy = (partial: Partial<Policy> & Pick<Policy, "id" | "name" | "conditionExpr" | "action">): Policy => ({
  priority: 100,
  version: 1,
  enabled: true,
  referenceFrameworks: ["OWASP-LLM02"],
  ...partial,
});

const entity = (entityType: SensitiveEntity["entityType"]): SensitiveEntity => ({
  entityType,
  confidence: 0.9,
  span: [0, 1],
  layer: "rules",
});

describe("decidePolicy", () => {
  it("applique la règle MASK du DAT §10.1", () => {
    const entities = [entity("FINANCIAL_AMOUNT"), entity("MOBILE_MONEY")];
    const risk = computeRiskScore({
      entities,
      contextCategory: "Finance",
      departmentRiskLevel: "high",
      userJurisdiction: "BJ",
      aiHostingRegion: "US",
      aiRiskBaseline: 30,
    });
    const ctx = buildPolicyContext({
      risk,
      entities,
      contextCategory: "Finance",
      contextConfidence: 0.87,
      department: "Cotisations",
      channel: "browser",
      degradedMode: false,
      textLength: 200,
      aiService: { id: "chatgpt.com", hosting_region: "US", free_access: true, risk_baseline: 30 },
      user: { jurisdiction: "BJ", department: "Cotisations", role: "USER" },
    });
    const decision = decidePolicy({
      policies: [
        policy({
          id: "00000000-0000-4000-8000-000000000042",
          name: "Finance hors juridiction",
          conditionExpr: `risk_band >= "high" AND contains(entity_type, "FINANCIAL_AMOUNT") AND ai_service.hosting_region != user.jurisdiction`,
          action: "MASK",
          priority: 10,
          referenceFrameworks: ["OWASP-LLM02", "NIST-MEASURE", "MALABO-ART14"],
        }),
      ],
      risk,
      context: ctx,
      entities,
    });
    expect(decision.action).toBe("MASK");
    expect(decision.policyName).toBe("Finance hors juridiction");
  });

  it("escalade MASK vers BLOCK si quasi-identifiants résiduels", () => {
    const entities = [entity("PERSON"), entity("EMAIL"), entity("JOB_TITLE")];
    const risk = computeRiskScore({
      entities,
      contextCategory: "RH",
      departmentRiskLevel: "moderate",
      userJurisdiction: "BJ",
      aiHostingRegion: "US",
      aiRiskBaseline: 25,
    });
    const ctx = buildPolicyContext({
      risk,
      entities,
      contextCategory: "RH",
      contextConfidence: 0.7,
      department: "RH",
      channel: "browser",
      degradedMode: false,
      textLength: 100,
      aiService: { id: "chatgpt.com", hosting_region: "US", free_access: true, risk_baseline: 25 },
      user: { jurisdiction: "BJ", department: "RH", role: "USER" },
    });
    const decision = decidePolicy({
      policies: [
        policy({
          id: "00000000-0000-4000-8000-000000000043",
          name: "Masquer les PII",
          conditionExpr: `entity_count >= 1`,
          action: "MASK",
        }),
      ],
      risk,
      context: ctx,
      entities,
      residualEntities: entities,
      residualQiThreshold: 2,
    });
    expect(decision.action).toBe("BLOCK");
    expect(decision.escalated).toBe(true);
  });
});
