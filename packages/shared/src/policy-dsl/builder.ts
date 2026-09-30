import type { CompareOp, Expr, Operand } from "./ast.js";
import { parseCondition } from "./parser.js";
import {
  CONTEXT_CATEGORIES,
  ENTITY_DEFINITIONS,
  ENTITY_TYPES,
  isEntityType,
  type ContextCategory,
  type EntityFamily,
  type EntityType,
} from "../domain/entities.js";
import { CHANNELS, RISK_BANDS, type Channel, type RiskBand } from "../domain/actions.js";

export const POLICY_DEPARTMENTS = ["Cotisations", "Finance", "Juridique", "RH", "Technique", "Direction", "Generique"] as const;

export const FAMILY_LABELS: Record<EntityFamily, string> = {
  personal: "Identité",
  social: "Social / CNSS",
  financial: "Finance",
  technical: "Technique",
};

export const BAND_LABELS: Record<RiskBand, string> = {
  low: "faible",
  moderate: "modéré",
  high: "élevé",
  critical: "critique",
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  browser: "Navigateur",
  cli: "Ligne de commande",
  api: "API",
};

export const COMPARE_LABELS: Record<CompareOp, string> = {
  "=": "égal à",
  "!=": "différent de",
  ">": "supérieur à",
  ">=": "au moins",
  "<": "inférieur à",
  "<=": "au plus",
};

export const FLAG_LABELS = {
  degraded_mode: "La détection est en mode dégradé",
  cross_border: "Le service est hébergé hors juridiction",
  "ai_service.free_access": "Le service est en accès gratuit",
} as const;

export type FlagName = keyof typeof FLAG_LABELS;

export type Clause =
  | { id: string; kind: "entity"; match: "any" | "all"; types: EntityType[] }
  | { id: string; kind: "band"; op: CompareOp; value: RiskBand }
  | { id: string; kind: "score"; op: CompareOp; value: number }
  | { id: string; kind: "quasi"; op: CompareOp; value: number }
  | { id: string; kind: "direct"; op: CompareOp; value: number }
  | { id: string; kind: "count"; op: CompareOp; value: number }
  | { id: string; kind: "department"; match: "eq" | "in" | "not_in"; values: string[] }
  | { id: string; kind: "channel"; value: Channel }
  | { id: string; kind: "context"; value: ContextCategory }
  | { id: string; kind: "flag"; flag: FlagName; value: boolean }
  | { id: string; kind: "hosting_mismatch" };

export type ClauseKind = Clause["kind"];

export interface ConditionDraft {
  combinator: "AND" | "OR";
  clauses: Clause[];
}

export type ParsedDraft = { ok: true; draft: ConditionDraft } | { ok: false; reason: string };

export const CLAUSE_KIND_OPTIONS: { kind: ClauseKind; label: string; hint: string }[] = [
  { kind: "entity", label: "Données détectées", hint: "Types d'informations trouvées dans le prompt" },
  { kind: "band", label: "Niveau de risque", hint: "Faible, modéré, élevé ou critique" },
  { kind: "score", label: "Score de risque", hint: "Note de 0 à 100" },
  { kind: "quasi", label: "Quasi-identifiants", hint: "Risque de ré-identification" },
  { kind: "direct", label: "Identifiants directs", hint: "Données qui identifient seules" },
  { kind: "count", label: "Nombre de données", hint: "Combien d'entités sensibles" },
  { kind: "department", label: "Direction", hint: "Direction de l'agent ou de l'utilisateur" },
  { kind: "channel", label: "Canal", hint: "Navigateur, CLI ou API" },
  { kind: "context", label: "Catégorie du texte", hint: "RH, finance, médical…" },
  { kind: "flag", label: "Situation particulière", hint: "Mode dégradé, hors juridiction, accès gratuit" },
  { kind: "hosting_mismatch", label: "Hébergement hors juridiction", hint: "Région du service ≠ juridiction de l'utilisateur" },
];

export const ENTITY_PICKER: { family: EntityFamily; label: string; types: EntityType[] }[] = (
  ["personal", "social", "financial", "technical"] as const
).map((family) => ({
  family,
  label: FAMILY_LABELS[family],
  types: ENTITY_TYPES.filter((t) => ENTITY_DEFINITIONS[t].family === family),
}));

let seq = 0;
export function newClauseId(): string {
  seq += 1;
  return `c${seq}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyClause(kind: ClauseKind): Clause {
  switch (kind) {
    case "entity":
      return { id: newClauseId(), kind, match: "any", types: [] };
    case "band":
      return { id: newClauseId(), kind, op: ">=", value: "high" };
    case "score":
      return { id: newClauseId(), kind, op: ">=", value: 50 };
    case "quasi":
      return { id: newClauseId(), kind, op: ">=", value: 3 };
    case "direct":
      return { id: newClauseId(), kind, op: ">=", value: 1 };
    case "count":
      return { id: newClauseId(), kind, op: ">=", value: 1 };
    case "department":
      return { id: newClauseId(), kind, match: "in", values: [] };
    case "channel":
      return { id: newClauseId(), kind, value: "browser" };
    case "context":
      return { id: newClauseId(), kind, value: "Finance" };
    case "flag":
      return { id: newClauseId(), kind, flag: "degraded_mode", value: true };
    case "hosting_mismatch":
      return { id: newClauseId(), kind };
  }
}

export function emptyDraft(): ConditionDraft {
  return { combinator: "AND", clauses: [emptyClause("entity")] };
}

export interface CompileResult {
  expr: string;
  errors: string[];
}

export function compileCondition(draft: ConditionDraft): CompileResult {
  const errors: string[] = [];
  const parts: string[] = [];
  for (const clause of draft.clauses) {
    const compiled = compileClause(clause);
    if (compiled.error) errors.push(compiled.error);
    else parts.push(compiled.expr);
  }
  if (parts.length === 0) errors.push("Ajoutez au moins un critère complet.");
  const join = draft.combinator === "OR" ? " OR " : " AND ";
  return { expr: parts.join(join), errors };
}

function compileClause(c: Clause): { expr: string; error?: string } {
  switch (c.kind) {
    case "entity": {
      if (c.types.length === 0) return { expr: "", error: "Choisissez au moins un type de donnée." };
      if (c.types.length === 1 && c.match === "any") return { expr: `contains(entity_type, "${c.types[0]}")` };
      const list = `[${c.types.map((t) => `"${t}"`).join(", ")}]`;
      return { expr: `${c.match === "all" ? "all_of" : "any_of"}(entity_type, ${list})` };
    }
    case "band":
      return { expr: `risk_band ${c.op} "${c.value}"` };
    case "score":
      return { expr: `risk_score ${c.op} ${c.value}` };
    case "quasi":
      return { expr: `quasi_identifier_count ${c.op} ${c.value}` };
    case "direct":
      return { expr: `direct_identifier_count ${c.op} ${c.value}` };
    case "count":
      return { expr: `entity_count ${c.op} ${c.value}` };
    case "department": {
      if (c.values.length === 0) return { expr: "", error: "Choisissez au moins une direction." };
      if (c.match === "eq") return { expr: `department = "${c.values[0]}"` };
      const list = `[${c.values.map((v) => `"${v}"`).join(", ")}]`;
      return { expr: c.match === "not_in" ? `department NOT IN ${list}` : `department IN ${list}` };
    }
    case "channel":
      return { expr: `channel = "${c.value}"` };
    case "context":
      return { expr: `context_category = "${c.value}"` };
    case "flag":
      return { expr: `${c.flag} = ${c.value}` };
    case "hosting_mismatch":
      return { expr: "ai_service.hosting_region != user.jurisdiction" };
  }
}

export function parseConditionDraft(expr: string): ParsedDraft {
  if (!expr.trim()) return { ok: true, draft: emptyDraft() };
  let ast: Expr;
  try {
    ast = parseCondition(expr);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  const flattened = flattenSame(ast);
  if (!flattened) {
    return { ok: false, reason: "Cette condition mélange ET et OU. Utilisez la formule avancée, ou recréez-la avec un seul type de lien." };
  }
  const clauses: Clause[] = [];
  for (const leaf of flattened.leaves) {
    const clause = leafToClause(leaf);
    if (!clause) {
      return { ok: false, reason: "Cette condition n'est pas représentable visuellement. Passez en formule avancée." };
    }
    clauses.push(clause);
  }
  return { ok: true, draft: { combinator: flattened.combinator, clauses } };
}

function flattenSame(expr: Expr): { combinator: "AND" | "OR"; leaves: Expr[] } | null {
  if (expr.kind !== "and" && expr.kind !== "or") return { combinator: "AND", leaves: [expr] };
  const combinator: "AND" | "OR" = expr.kind === "and" ? "AND" : "OR";
  const expected = combinator === "AND" ? "and" : "or";
  const leaves: Expr[] = [];
  const walk = (e: Expr): boolean => {
    if (e.kind === expected) return walk(e.left) && walk(e.right);
    if (e.kind === "and" || e.kind === "or") return false;
    leaves.push(e);
    return true;
  };
  if (!walk(expr)) return null;
  return { combinator, leaves };
}

function leafToClause(e: Expr): Clause | null {
  if (e.kind === "call") {
    if (e.fn === "contains" && ident(e.args[0], "entity_type")) {
      const type = asEntity(strLit(e.args[1]));
      if (!type) return null;
      return { id: newClauseId(), kind: "entity", match: "any", types: [type] };
    }
    if ((e.fn === "any_of" || e.fn === "all_of") && ident(e.args[0], "entity_type")) {
      const types = asEntities(arrLit(e.args[1]));
      if (!types) return null;
      return { id: newClauseId(), kind: "entity", match: e.fn === "all_of" ? "all" : "any", types };
    }
  }
  if (e.kind === "compare") {
    if (e.left.kind === "call" && e.left.fn === "count" && ident(e.left.args[0], "entity_type") && numLit(e.right) !== null) {
      return { id: newClauseId(), kind: "count", op: e.op, value: numLit(e.right)! };
    }
    if (ident(e.left, "risk_band")) {
      const band = strLit(e.right);
      if (!band || !RISK_BANDS.includes(band as RiskBand)) return null;
      return { id: newClauseId(), kind: "band", op: e.op, value: band as RiskBand };
    }
    if (ident(e.left, "risk_score") && numLit(e.right) !== null) {
      return { id: newClauseId(), kind: "score", op: e.op, value: numLit(e.right)! };
    }
    if (ident(e.left, "quasi_identifier_count") && numLit(e.right) !== null) {
      return { id: newClauseId(), kind: "quasi", op: e.op, value: numLit(e.right)! };
    }
    if (ident(e.left, "direct_identifier_count") && numLit(e.right) !== null) {
      return { id: newClauseId(), kind: "direct", op: e.op, value: numLit(e.right)! };
    }
    if (ident(e.left, "entity_count") && numLit(e.right) !== null) {
      return { id: newClauseId(), kind: "count", op: e.op, value: numLit(e.right)! };
    }
    if (ident(e.left, "department") && strLit(e.right)) {
      return { id: newClauseId(), kind: "department", match: "eq", values: [strLit(e.right)!] };
    }
    if (ident(e.left, "channel") && strLit(e.right) && CHANNELS.includes(strLit(e.right)!.toLowerCase() as Channel)) {
      return { id: newClauseId(), kind: "channel", value: strLit(e.right)!.toLowerCase() as Channel };
    }
    if (ident(e.left, "context_category") && strLit(e.right)) {
      const raw = strLit(e.right)!;
      const match = CONTEXT_CATEGORIES.find((c) => c.toLowerCase() === raw.toLowerCase());
      if (!match) return null;
      return { id: newClauseId(), kind: "context", value: match };
    }
    if (ident(e.left, "degraded_mode") && boolLit(e.right) !== null) {
      return { id: newClauseId(), kind: "flag", flag: "degraded_mode", value: boolLit(e.right)! };
    }
    if (ident(e.left, "cross_border") && boolLit(e.right) !== null) {
      return { id: newClauseId(), kind: "flag", flag: "cross_border", value: boolLit(e.right)! };
    }
    if (ident(e.left, "ai_service.free_access") && boolLit(e.right) !== null) {
      return { id: newClauseId(), kind: "flag", flag: "ai_service.free_access", value: boolLit(e.right)! };
    }
    if (ident(e.left, "ai_service.hosting_region") && ident(e.right, "user.jurisdiction") && e.op === "!=") {
      return { id: newClauseId(), kind: "hosting_mismatch" };
    }
  }
  if (e.kind === "in" && ident(e.operand, "department")) {
    const values = arrLit(e.list);
    if (!values) return null;
    return { id: newClauseId(), kind: "department", match: e.negated ? "not_in" : "in", values };
  }
  if (e.kind === "identifier" && e.name === "degraded_mode") {
    return { id: newClauseId(), kind: "flag", flag: "degraded_mode", value: true };
  }
  if (e.kind === "identifier" && e.name === "cross_border") {
    return { id: newClauseId(), kind: "flag", flag: "cross_border", value: true };
  }
  if (e.kind === "not" && e.operand.kind === "identifier" && e.operand.name === "degraded_mode") {
    return { id: newClauseId(), kind: "flag", flag: "degraded_mode", value: false };
  }
  return null;
}

function ident(op: Operand | undefined, name: string): boolean {
  return !!op && op.kind === "identifier" && op.name === name;
}

function strLit(op: Operand | undefined): string | null {
  return op && op.kind === "literal" && typeof op.value === "string" ? op.value : null;
}

function numLit(op: Operand | undefined): number | null {
  return op && op.kind === "literal" && typeof op.value === "number" ? op.value : null;
}

function boolLit(op: Operand | undefined): boolean | null {
  return op && op.kind === "literal" && typeof op.value === "boolean" ? op.value : null;
}

function arrLit(op: Operand | undefined): string[] | null {
  if (!op || op.kind !== "literal" || !Array.isArray(op.value)) return null;
  if (!op.value.every((v) => typeof v === "string")) return null;
  return op.value as string[];
}

function asEntity(value: string | null): EntityType | null {
  return value && isEntityType(value) ? value : null;
}

function asEntities(values: string[] | null): EntityType[] | null {
  if (!values || values.length === 0) return null;
  if (!values.every(isEntityType)) return null;
  return values;
}

export function describeCondition(draft: ConditionDraft): string {
  const complete = draft.clauses.filter((c) => compileClause(c).expr);
  if (complete.length === 0) return "Ajoutez un critère pour décrire la situation.";
  const parts = complete.map(describeClause);
  const join = draft.combinator === "OR" ? " ; ou " : " ; et ";
  const head = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : "";
  return [head, ...parts.slice(1)].join(join) + ".";
}

export function describeClause(c: Clause): string {
  switch (c.kind) {
    case "entity": {
      const names = c.types.map((t) => ENTITY_DEFINITIONS[t]?.label ?? t);
      if (names.length === 0) return "une donnée sensible (à choisir)";
      const list = names.join(", ");
      return c.match === "all" ? `toutes ces données sont présentes (${list})` : `au moins une de ces données est détectée (${list})`;
    }
    case "band":
      return `le niveau de risque est ${COMPARE_LABELS[c.op]} ${BAND_LABELS[c.value]}`;
    case "score":
      return `le score de risque est ${COMPARE_LABELS[c.op]} ${c.value}`;
    case "quasi":
      return `le nombre de quasi-identifiants est ${COMPARE_LABELS[c.op]} ${c.value}`;
    case "direct":
      return `le nombre d'identifiants directs est ${COMPARE_LABELS[c.op]} ${c.value}`;
    case "count":
      return `le nombre de données sensibles est ${COMPARE_LABELS[c.op]} ${c.value}`;
    case "department": {
      if (c.values.length === 0) return "la direction (à choisir)";
      if (c.match === "eq") return `la direction est ${c.values[0]}`;
      if (c.match === "not_in") return `la direction n'est pas parmi ${c.values.join(", ")}`;
      return `la direction est parmi ${c.values.join(", ")}`;
    }
    case "channel":
      return `le canal est ${CHANNEL_LABELS[c.value]}`;
    case "context":
      return `la catégorie du texte est ${c.value}`;
    case "flag":
      return c.value ? FLAG_LABELS[c.flag].toLowerCase() : `il est faux que ${FLAG_LABELS[c.flag].toLowerCase()}`;
    case "hosting_mismatch":
      return "le service est hébergé hors de la juridiction de l'utilisateur";
  }
}

export function describeConditionExpr(expr: string): string | null {
  const parsed = parseConditionDraft(expr);
  if (!parsed.ok) return null;
  return describeCondition(parsed.draft);
}

export const CONDITION_TEMPLATES: { id: string; label: string; draft: () => ConditionDraft }[] = [
  {
    id: "secrets",
    label: "Secrets techniques",
    draft: () => ({
      combinator: "AND",
      clauses: [{ id: newClauseId(), kind: "entity", match: "any", types: ["API_KEY", "PASSWORD", "PRIVATE_KEY", "CONNECTION_STRING"] }],
    }),
  },
  {
    id: "medical",
    label: "Données médicales",
    draft: () => ({
      combinator: "AND",
      clauses: [{ id: newClauseId(), kind: "entity", match: "any", types: ["MEDICAL"] }],
    }),
  },
  {
    id: "cnss",
    label: "Identifiants CNSS",
    draft: () => ({
      combinator: "AND",
      clauses: [{ id: newClauseId(), kind: "entity", match: "any", types: ["CNSS_INSURED_NUMBER", "CNSS_EMPLOYER_NUMBER", "NATIONAL_ID"] }],
    }),
  },
  {
    id: "finance-border",
    label: "Montant hors juridiction",
    draft: () => ({
      combinator: "AND",
      clauses: [
        { id: newClauseId(), kind: "band", op: ">=", value: "high" },
        { id: newClauseId(), kind: "entity", match: "any", types: ["FINANCIAL_AMOUNT"] },
        { id: newClauseId(), kind: "hosting_mismatch" },
      ],
    }),
  },
  {
    id: "qi",
    label: "Ré-identification",
    draft: () => ({
      combinator: "AND",
      clauses: [{ id: newClauseId(), kind: "quasi", op: ">=", value: 3 }],
    }),
  },
];
