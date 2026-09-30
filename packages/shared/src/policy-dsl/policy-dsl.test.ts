import { describe, expect, it } from "vitest";
import { evaluateCondition, type PolicyContext } from "./evaluator.js";
import { formatRuleBlock, parseCondition, parseRuleBlock } from "./parser.js";
import { explainCondition } from "./explain.js";
import { compileCondition, parseConditionDraft } from "./builder.js";
import { lintCondition } from "./index.js";

const ctx: PolicyContext = {
  risk_score: 78,
  risk_band: "high",
  entity_type: ["PERSON", "FINANCIAL_AMOUNT", "MOBILE_MONEY"],
  entity_count: 3,
  quasi_identifier_count: 1,
  direct_identifier_count: 1,
  context_category: "Finance",
  context_confidence: 0.87,
  department: "Cotisations",
  channel: "browser",
  degraded_mode: false,
  cross_border: true,
  text_length: 420,
  ai_service: { id: "chatgpt.com", hosting_region: "US", free_access: true, risk_baseline: 30 },
  user: { jurisdiction: "BJ", department: "Cotisations", role: "USER" },
};

describe("Policy DSL", () => {
  it("évalue la règle exemple du DAT §10.1", () => {
    const expr = parseCondition(
      `risk_band >= "high" AND contains(entity_type, "FINANCIAL_AMOUNT") AND ai_service.hosting_region != user.jurisdiction`,
    );
    expect(evaluateCondition(expr, ctx)).toBe(true);
    expect(evaluateCondition(expr, { ...ctx, risk_band: "moderate" })).toBe(false);
    expect(evaluateCondition(expr, { ...ctx, ai_service: { ...ctx.ai_service, hosting_region: "BJ" } })).toBe(false);
  });

  it("compare les bandes de façon ordinale", () => {
    expect(evaluateCondition(parseCondition(`risk_band > "moderate"`), ctx)).toBe(true);
    expect(evaluateCondition(parseCondition(`risk_band < "critical"`), ctx)).toBe(true);
    expect(evaluateCondition(parseCondition(`risk_band = "high"`), ctx)).toBe(true);
  });

  it("gère IN, NOT IN, any_of, all_of, count, OR et parenthèses", () => {
    expect(evaluateCondition(parseCondition(`department IN ["Finance", "Cotisations"]`), ctx)).toBe(true);
    expect(evaluateCondition(parseCondition(`department NOT IN ["RH"]`), ctx)).toBe(true);
    expect(evaluateCondition(parseCondition(`any_of(entity_type, ["IBAN", "MOBILE_MONEY"])`), ctx)).toBe(true);
    expect(evaluateCondition(parseCondition(`all_of(entity_type, ["IBAN", "MOBILE_MONEY"])`), ctx)).toBe(false);
    expect(evaluateCondition(parseCondition(`count(entity_type) >= 3`), ctx)).toBe(true);
    expect(evaluateCondition(parseCondition(`(risk_score < 10 OR cross_border = true) AND NOT degraded_mode`), ctx)).toBe(true);
  });

  it("est insensible à la casse pour les mots-clés et les chaînes", () => {
    expect(evaluateCondition(parseCondition(`context_category = "finance" and channel == "BROWSER"`), ctx)).toBe(true);
  });

  it("rejette les identifiants et fonctions inconnus", () => {
    expect(lintCondition(`foo = 1`)).toEqual([`Identifiant inconnu « foo »`]);
    expect(lintCondition(`bar(entity_type)`)).toEqual([`Fonction inconnue « bar »`]);
    expect(lintCondition(`risk_band = "extreme"`)).toEqual([`Bande de risque inconnue « extreme »`]);
    expect(lintCondition(`risk_score >`)[0]).toMatch(/Opérande attendu/);
    expect(lintCondition(``)).toEqual([]);
  });

  it("analyse et reformate un bloc RULE complet", () => {
    const block = `RULE "Donnée financière + service hébergé hors juridiction"
  WHEN risk_band >= "high"
   AND contains(entity_type, "FINANCIAL_AMOUNT")
   AND ai_service.hosting_region != user.jurisdiction
  THEN action = MASK
  LOG reference_frameworks = ["OWASP-LLM02", "NIST-MEASURE", "MALABO-ART14"]`;
    const rule = parseRuleBlock(block);
    expect(rule.name).toBe("Donnée financière + service hébergé hors juridiction");
    expect(rule.action).toBe("MASK");
    expect(rule.referenceFrameworks).toEqual(["OWASP-LLM02", "NIST-MEASURE", "MALABO-ART14"]);
    expect(evaluateCondition(parseCondition(rule.conditionExpr), ctx)).toBe(true);
    const reformatted = formatRuleBlock({ name: rule.name!, conditionExpr: rule.conditionExpr, action: rule.action!, referenceFrameworks: rule.referenceFrameworks });
    expect(parseRuleBlock(reformatted)).toEqual(rule);
  });

  it("produit un aperçu en langage naturel", () => {
    const text = explainCondition(parseCondition(`risk_band >= "high" AND contains(entity_type, "IBAN")`));
    expect(text).toBe("La bande de risque est supérieur ou égal à « high » et les entités détectées contiennent « IBAN »");
  });
});

describe("Condition builder", () => {
  const seeds = [
    `any_of(entity_type, ["API_KEY", "PASSWORD", "PRIVATE_KEY", "CONNECTION_STRING"])`,
    `contains(entity_type, "MEDICAL")`,
    `degraded_mode = true AND department IN ["Cotisations", "Finance", "Juridique"]`,
    `risk_band >= "high" AND contains(entity_type, "FINANCIAL_AMOUNT") AND ai_service.hosting_region != user.jurisdiction`,
    `any_of(entity_type, ["CNSS_INSURED_NUMBER", "CNSS_EMPLOYER_NUMBER", "NATIONAL_ID"])`,
    `quasi_identifier_count >= 3`,
    `risk_band = "critical"`,
    `risk_band >= "high"`,
  ];

  it("reconstruit les règles seed visuellement", () => {
    for (const expr of seeds) {
      const parsed = parseConditionDraft(expr);
      expect(parsed.ok, expr).toBe(true);
      if (!parsed.ok) continue;
      const compiled = compileCondition(parsed.draft);
      expect(compiled.errors).toEqual([]);
      expect(evaluateCondition(parseCondition(compiled.expr), ctx)).toBe(evaluateCondition(parseCondition(expr), ctx));
    }
  });

  it("refuse un mélange ET/OU", () => {
    const parsed = parseConditionDraft(`risk_score < 10 OR cross_border = true AND NOT degraded_mode`);
    expect(parsed.ok).toBe(false);
  });
});
