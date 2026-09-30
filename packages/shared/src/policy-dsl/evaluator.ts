import type { Expr, LiteralValue, Operand } from "./ast.js";
import { RISK_BAND_ORDER, type Channel, type RiskBand } from "../domain/actions.js";

/**
 * Contexte d'évaluation d'une politique : tout ce qu'une condition peut référencer.
 * Les noms d'identifiants exposés à la DSL sont documentés dans POLICY_IDENTIFIERS.
 */
export interface PolicyContext {
  risk_score: number;
  risk_band: RiskBand;
  entity_type: string[];
  entity_count: number;
  quasi_identifier_count: number;
  direct_identifier_count: number;
  context_category: string | null;
  context_confidence: number;
  department: string;
  channel: Channel;
  degraded_mode: boolean;
  cross_border: boolean;
  text_length: number;
  ai_service: {
    id: string;
    hosting_region: string;
    free_access: boolean;
    risk_baseline: number;
  };
  user: {
    jurisdiction: string;
    department: string;
    role: string;
  };
}

export const POLICY_IDENTIFIERS: Record<string, { type: "number" | "string" | "boolean" | "list" | "band"; description: string }> = {
  risk_score: { type: "number", description: "Score de risque 0-100" },
  risk_band: { type: "band", description: "Bande de risque (low < moderate < high < critical), comparaison ordinale" },
  entity_type: { type: "list", description: "Types d'entités détectées" },
  entity_count: { type: "number", description: "Nombre total d'entités détectées" },
  quasi_identifier_count: { type: "number", description: "Nombre de quasi-identifiants distincts" },
  direct_identifier_count: { type: "number", description: "Nombre d'identifiants directs distincts" },
  context_category: { type: "string", description: "Catégorie contextuelle (RH, Finance, Juridique, Technique, Medical, Generique)" },
  context_confidence: { type: "number", description: "Confiance de la classification contextuelle 0-1" },
  department: { type: "string", description: "Direction de l'utilisateur" },
  channel: { type: "string", description: "Canal : browser | cli | api" },
  degraded_mode: { type: "boolean", description: "Vrai si la détection a fonctionné en mode dégradé" },
  cross_border: { type: "boolean", description: "Vrai si le service est hébergé hors de la juridiction de l'utilisateur" },
  text_length: { type: "number", description: "Longueur du texte analysé" },
  "ai_service.id": { type: "string", description: "Identifiant du service d'IA" },
  "ai_service.hosting_region": { type: "string", description: "Région d'hébergement du service" },
  "ai_service.free_access": { type: "boolean", description: "Service en accès gratuit (données potentiellement réutilisées)" },
  "ai_service.risk_baseline": { type: "number", description: "Risque de base du service 0-100" },
  "user.jurisdiction": { type: "string", description: "Juridiction de l'utilisateur" },
  "user.department": { type: "string", description: "Direction de l'utilisateur" },
  "user.role": { type: "string", description: "Rôle de l'utilisateur" },
};

export const POLICY_FUNCTIONS: Record<string, { arity: number; description: string }> = {
  contains: { arity: 2, description: "contains(liste, valeur) : la liste contient la valeur" },
  count: { arity: 1, description: "count(liste) : nombre d'éléments" },
  any_of: { arity: 2, description: "any_of(liste, [valeurs]) : au moins une valeur présente" },
  all_of: { arity: 2, description: "all_of(liste, [valeurs]) : toutes les valeurs présentes" },
  lower: { arity: 1, description: "lower(chaîne) : minuscules" },
};

export class DslEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DslEvaluationError";
  }
}

type Value = LiteralValue | null;

export function evaluateCondition(expr: Expr, ctx: PolicyContext): boolean {
  return truthy(evaluate(expr, ctx));
}

function evaluate(expr: Expr, ctx: PolicyContext): Value {
  switch (expr.kind) {
    case "or":
      return truthy(evaluate(expr.left, ctx)) || truthy(evaluate(expr.right, ctx));
    case "and":
      return truthy(evaluate(expr.left, ctx)) && truthy(evaluate(expr.right, ctx));
    case "not":
      return !truthy(evaluate(expr.operand, ctx));
    case "compare": {
      const l = evaluate(expr.left, ctx);
      const r = evaluate(expr.right, ctx);
      return compare(expr.op, l, r, isBandOperand(expr.left) || isBandOperand(expr.right));
    }
    case "in": {
      const v = evaluate(expr.operand, ctx);
      const list = evaluate(expr.list, ctx);
      if (!Array.isArray(list)) throw new DslEvaluationError("IN attend une liste à droite");
      const found = Array.isArray(v) ? v.some((x) => list.some((y) => looseEqual(x, y))) : list.some((y) => looseEqual(v, y));
      return expr.negated ? !found : found;
    }
    case "call":
      return callFunction(expr.fn, expr.args.map((a) => evaluate(a, ctx)));
    case "identifier":
      return resolveIdentifier(expr.name, ctx);
    case "literal":
      return expr.value;
  }
}

function isBandOperand(op: Operand): boolean {
  return op.kind === "identifier" && op.name === "risk_band";
}

function resolveIdentifier(name: string, ctx: PolicyContext): Value {
  if (!(name in POLICY_IDENTIFIERS)) throw new DslEvaluationError(`Identifiant inconnu « ${name} »`);
  const parts = name.split(".");
  let cur: unknown = ctx;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[p];
  }
  return (cur ?? null) as Value;
}

function callFunction(fn: string, args: Value[]): Value {
  const def = POLICY_FUNCTIONS[fn];
  if (!def) throw new DslEvaluationError(`Fonction inconnue « ${fn} »`);
  if (args.length !== def.arity) throw new DslEvaluationError(`${fn} attend ${def.arity} argument(s)`);
  switch (fn) {
    case "contains": {
      const [list, value] = args;
      if (Array.isArray(list)) return list.some((x) => looseEqual(x, value ?? null));
      if (typeof list === "string" && typeof value === "string") return list.toLowerCase().includes(value.toLowerCase());
      return false;
    }
    case "count":
      return Array.isArray(args[0]) ? args[0].length : args[0] === null ? 0 : 1;
    case "any_of": {
      const [list, values] = args;
      if (!Array.isArray(list) || !Array.isArray(values)) return false;
      return values.some((v) => list.some((x) => looseEqual(x, v)));
    }
    case "all_of": {
      const [list, values] = args;
      if (!Array.isArray(list) || !Array.isArray(values)) return false;
      return values.every((v) => list.some((x) => looseEqual(x, v)));
    }
    case "lower":
      return typeof args[0] === "string" ? args[0].toLowerCase() : (args[0] ?? null);
    default:
      throw new DslEvaluationError(`Fonction non implémentée « ${fn} »`);
  }
}

function compare(op: string, l: Value, r: Value, ordinalBand: boolean): boolean {
  if (ordinalBand && typeof l === "string" && typeof r === "string") {
    const lo = RISK_BAND_ORDER[l as RiskBand];
    const ro = RISK_BAND_ORDER[r as RiskBand];
    if (lo === undefined || ro === undefined) throw new DslEvaluationError(`Bande de risque inconnue (${l} / ${r})`);
    return numericCompare(op, lo, ro);
  }
  if (op === "=") return looseEqual(l, r);
  if (op === "!=") return !looseEqual(l, r);
  if (typeof l === "number" && typeof r === "number") return numericCompare(op, l, r);
  if (typeof l === "string" && typeof r === "string") return numericCompare(op, l.localeCompare(r), 0);
  return false;
}

function numericCompare(op: string, a: number, b: number): boolean {
  switch (op) {
    case "=":
      return a === b;
    case "!=":
      return a !== b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    default:
      throw new DslEvaluationError(`Opérateur inconnu ${op}`);
  }
}

function looseEqual(a: Value, b: Value): boolean {
  if (typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

function truthy(v: Value): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

/** Vérification statique : identifiants et fonctions connus, arités correctes. */
export function validateExpression(expr: Expr): string[] {
  const errors: string[] = [];
  const walk = (e: Expr): void => {
    switch (e.kind) {
      case "or":
      case "and":
        walk(e.left);
        walk(e.right);
        break;
      case "not":
        walk(e.operand);
        break;
      case "compare":
        walk(e.left);
        walk(e.right);
        if (isBandOperand(e.left) && e.right.kind === "literal" && typeof e.right.value === "string" && !(e.right.value in RISK_BAND_ORDER)) {
          errors.push(`Bande de risque inconnue « ${e.right.value} »`);
        }
        break;
      case "in":
        walk(e.operand);
        walk(e.list);
        break;
      case "call": {
        const def = POLICY_FUNCTIONS[e.fn];
        if (!def) errors.push(`Fonction inconnue « ${e.fn} »`);
        else if (def.arity !== e.args.length) errors.push(`${e.fn} attend ${def.arity} argument(s)`);
        e.args.forEach(walk);
        break;
      }
      case "identifier":
        if (!(e.name in POLICY_IDENTIFIERS)) errors.push(`Identifiant inconnu « ${e.name} »`);
        break;
      case "literal":
        break;
    }
  };
  walk(expr);
  return errors;
}
