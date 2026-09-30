import type { Expr, Operand } from "./ast.js";

const IDENTIFIER_LABELS: Record<string, string> = {
  risk_score: "le score de risque",
  risk_band: "la bande de risque",
  entity_type: "les entités détectées",
  entity_count: "le nombre d'entités",
  quasi_identifier_count: "le nombre de quasi-identifiants",
  direct_identifier_count: "le nombre d'identifiants directs",
  context_category: "la catégorie contextuelle",
  context_confidence: "la confiance contextuelle",
  department: "la direction",
  channel: "le canal",
  degraded_mode: "le mode dégradé",
  cross_border: "le transfert transfrontalier",
  text_length: "la longueur du texte",
  "ai_service.id": "le service d'IA",
  "ai_service.hosting_region": "la région d'hébergement du service",
  "ai_service.free_access": "l'accès gratuit au service",
  "ai_service.risk_baseline": "le risque de base du service",
  "user.jurisdiction": "la juridiction de l'utilisateur",
  "user.department": "la direction de l'utilisateur",
  "user.role": "le rôle de l'utilisateur",
};

const OP_LABELS: Record<string, string> = {
  "=": "est égal à",
  "!=": "est différent de",
  ">": "est supérieur à",
  ">=": "est supérieur ou égal à",
  "<": "est inférieur à",
  "<=": "est inférieur ou égal à",
};

/** Aperçu en langage naturel d'une condition (Policy Studio, DAT §7.3). */
export function explainCondition(expr: Expr): string {
  const s = explain(expr);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function explain(e: Expr): string {
  switch (e.kind) {
    case "or":
      return `(${explain(e.left)}) ou (${explain(e.right)})`;
    case "and":
      return `${explain(e.left)} et ${explain(e.right)}`;
    case "not":
      return `il n'est pas vrai que ${explain(e.operand)}`;
    case "compare": {
      if (e.right.kind === "literal" && typeof e.right.value === "boolean" && e.op === "=") {
        return `${operand(e.left)} ${e.right.value ? "est actif" : "est inactif"}`;
      }
      return `${operand(e.left)} ${OP_LABELS[e.op] ?? e.op} ${operand(e.right)}`;
    }
    case "in":
      return `${operand(e.operand)} ${e.negated ? "ne figure pas dans" : "figure dans"} ${operand(e.list)}`;
    case "call":
      return operand(e);
    case "identifier":
      return operand(e);
    case "literal":
      return operand(e);
  }
}

function operand(o: Operand): string {
  switch (o.kind) {
    case "identifier":
      return IDENTIFIER_LABELS[o.name] ?? o.name;
    case "literal":
      if (Array.isArray(o.value)) return `[${o.value.map((v) => JSON.stringify(v)).join(", ")}]`;
      return typeof o.value === "string" ? `« ${o.value} »` : String(o.value);
    case "call": {
      const args = o.args.map(operand);
      switch (o.fn) {
        case "contains":
          return `${args[0]} contiennent ${args[1]}`;
        case "any_of":
          return `${args[0]} contiennent au moins un élément de ${args[1]}`;
        case "all_of":
          return `${args[0]} contiennent tous les éléments de ${args[1]}`;
        case "count":
          return `le nombre de ${args[0]}`;
        default:
          return `${o.fn}(${args.join(", ")})`;
      }
    }
  }
}
