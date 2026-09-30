export * from "./ast.js";
export { DslSyntaxError, tokenize } from "./tokenizer.js";
export { parseCondition, parseRuleBlock, formatRuleBlock } from "./parser.js";
export {
  evaluateCondition,
  validateExpression,
  DslEvaluationError,
  POLICY_IDENTIFIERS,
  POLICY_FUNCTIONS,
  type PolicyContext,
} from "./evaluator.js";
export { explainCondition } from "./explain.js";
export * from "./builder.js";

import { parseCondition } from "./parser.js";
import { validateExpression } from "./evaluator.js";

/** Analyse + validation statique ; renvoie la liste des erreurs (vide si valide). */
export function lintCondition(conditionExpr: string): string[] {
  if (!conditionExpr.trim()) return [];
  try {
    return validateExpression(parseCondition(conditionExpr));
  } catch (err) {
    return [err instanceof Error ? err.message : String(err)];
  }
}
