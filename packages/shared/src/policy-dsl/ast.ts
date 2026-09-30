export type LiteralValue = string | number | boolean | LiteralValue[];

export type Expr =
  | { kind: "or"; left: Expr; right: Expr }
  | { kind: "and"; left: Expr; right: Expr }
  | { kind: "not"; operand: Expr }
  | { kind: "compare"; op: CompareOp; left: Operand; right: Operand }
  | { kind: "in"; operand: Operand; list: Operand; negated: boolean }
  | { kind: "call"; fn: string; args: Operand[] }
  | { kind: "identifier"; name: string }
  | { kind: "literal"; value: LiteralValue };

export type Operand = Extract<Expr, { kind: "identifier" | "literal" | "call" }>;

export type CompareOp = "=" | "!=" | ">" | ">=" | "<" | "<=";

export interface ParsedRule {
  name: string | null;
  conditionExpr: string;
  action: "ALLOW" | "WARN" | "MASK" | "BLOCK" | null;
  referenceFrameworks: string[];
}
