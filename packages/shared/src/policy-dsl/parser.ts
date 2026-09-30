import type { CompareOp, Expr, LiteralValue, Operand, ParsedRule } from "./ast.js";
import { DslSyntaxError, tokenize, type Token } from "./tokenizer.js";
import { POLICY_ACTIONS, type PolicyAction } from "../domain/actions.js";

/**
 * Grammaire :
 *   expr     := and_expr ( OR and_expr )*
 *   and_expr := not_expr ( AND not_expr )*
 *   not_expr := NOT not_expr | primary
 *   primary  := '(' expr ')' | operand [ ( op operand ) | ( [NOT] IN list ) ]
 *   operand  := literal | identifier | identifier '(' args ')'
 *   list     := '[' literal ( ',' literal )* ']'
 */
class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): Expr {
    const expr = this.parseOr();
    if (this.peek().type !== "eof") throw new DslSyntaxError(`Jeton inattendu « ${this.peek().value} »`, this.peek().position);
    return expr;
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
  }
  private next(): Token {
    return this.tokens[this.pos++]!;
  }
  private isKeyword(value: string): boolean {
    const t = this.peek();
    return t.type === "keyword" && t.value === value;
  }
  private expect(type: Token["type"], value?: string): Token {
    const t = this.next();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new DslSyntaxError(`Attendu ${value ?? type}, obtenu « ${t.value || t.type} »`, t.position);
    }
    return t;
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.isKeyword("OR")) {
      this.next();
      left = { kind: "or", left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseNot();
    while (this.isKeyword("AND")) {
      this.next();
      left = { kind: "and", left, right: this.parseNot() };
    }
    return left;
  }

  private parseNot(): Expr {
    if (this.isKeyword("NOT")) {
      this.next();
      return { kind: "not", operand: this.parseNot() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    if (this.peek().type === "lparen") {
      this.next();
      const inner = this.parseOr();
      this.expect("rparen");
      return inner;
    }
    const left = this.parseOperand();
    const t = this.peek();
    if (t.type === "operator") {
      this.next();
      const right = this.parseOperand();
      return { kind: "compare", op: t.value as CompareOp, left, right };
    }
    if (t.type === "keyword" && (t.value === "IN" || t.value === "NOT")) {
      let negated = false;
      if (t.value === "NOT") {
        this.next();
        negated = true;
        if (!this.isKeyword("IN")) throw new DslSyntaxError("Attendu IN après NOT", this.peek().position);
      }
      this.next();
      const list = this.parseOperand();
      return { kind: "in", operand: left, list, negated };
    }
    return left;
  }

  private parseOperand(): Operand {
    const t = this.peek();
    switch (t.type) {
      case "string":
        this.next();
        return { kind: "literal", value: t.value };
      case "number":
        this.next();
        return { kind: "literal", value: Number(t.value) };
      case "boolean":
        this.next();
        return { kind: "literal", value: t.value === "true" };
      case "lbracket":
        return { kind: "literal", value: this.parseList() };
      case "identifier": {
        this.next();
        if (this.peek().type === "lparen") {
          this.next();
          const args: Operand[] = [];
          if (this.peek().type !== "rparen") {
            args.push(this.parseOperand());
            while (this.peek().type === "comma") {
              this.next();
              args.push(this.parseOperand());
            }
          }
          this.expect("rparen");
          return { kind: "call", fn: t.value.toLowerCase(), args };
        }
        return { kind: "identifier", name: t.value };
      }
      default:
        throw new DslSyntaxError(`Opérande attendu, obtenu « ${t.value || t.type} »`, t.position);
    }
  }

  private parseList(): LiteralValue[] {
    this.expect("lbracket");
    const items: LiteralValue[] = [];
    if (this.peek().type !== "rbracket") {
      items.push(this.parseLiteralItem());
      while (this.peek().type === "comma") {
        this.next();
        items.push(this.parseLiteralItem());
      }
    }
    this.expect("rbracket");
    return items;
  }

  private parseLiteralItem(): LiteralValue {
    const t = this.next();
    if (t.type === "string") return t.value;
    if (t.type === "number") return Number(t.value);
    if (t.type === "boolean") return t.value === "true";
    throw new DslSyntaxError("Littéral attendu dans la liste", t.position);
  }
}

export function parseCondition(conditionExpr: string): Expr {
  if (!conditionExpr.trim()) throw new DslSyntaxError("Condition vide", 0);
  return new Parser(tokenize(conditionExpr)).parse();
}

/**
 * Analyse un bloc RULE complet (format du DAT §10.1) :
 *   RULE "nom"
 *     WHEN <condition>
 *     THEN action = MASK
 *     LOG reference_frameworks = ["OWASP-LLM02"]
 */
export function parseRuleBlock(text: string): ParsedRule {
  const src = text.replace(/\r\n/g, "\n").trim();
  const nameMatch = /^RULE\s+"([^"]*)"/i.exec(src);
  const whenIdx = src.search(/\bWHEN\b/i);
  const thenIdx = src.search(/\bTHEN\b/i);
  const logIdx = src.search(/\bLOG\b/i);
  if (whenIdx < 0) throw new DslSyntaxError("Clause WHEN manquante", 0);

  const conditionEnd = thenIdx > whenIdx ? thenIdx : logIdx > whenIdx ? logIdx : src.length;
  const conditionExpr = src
    .slice(whenIdx + 4, conditionEnd)
    .replace(/\s+/g, " ")
    .trim();
  parseCondition(conditionExpr);

  let action: PolicyAction | null = null;
  if (thenIdx >= 0) {
    const thenEnd = logIdx > thenIdx ? logIdx : src.length;
    const m = /action\s*=\s*([A-Z]+)/i.exec(src.slice(thenIdx, thenEnd));
    if (!m) throw new DslSyntaxError("Clause THEN sans « action = ... »", thenIdx);
    const candidate = m[1]!.toUpperCase();
    if (!(POLICY_ACTIONS as readonly string[]).includes(candidate)) throw new DslSyntaxError(`Action inconnue ${candidate}`, thenIdx);
    action = candidate as PolicyAction;
  }

  let referenceFrameworks: string[] = [];
  if (logIdx >= 0) {
    const m = /reference_frameworks\s*=\s*\[([^\]]*)\]/i.exec(src.slice(logIdx));
    if (m) {
      referenceFrameworks = m[1]!
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }
  }

  return { name: nameMatch?.[1] ?? null, conditionExpr, action, referenceFrameworks };
}

export function formatRuleBlock(rule: { name: string; conditionExpr: string; action: string; referenceFrameworks: string[] }): string {
  const lines = [`RULE "${rule.name.replace(/"/g, '\\"')}"`, `  WHEN ${rule.conditionExpr}`, `  THEN action = ${rule.action}`];
  if (rule.referenceFrameworks.length > 0) {
    lines.push(`  LOG reference_frameworks = [${rule.referenceFrameworks.map((r) => `"${r}"`).join(", ")}]`);
  }
  return lines.join("\n");
}
