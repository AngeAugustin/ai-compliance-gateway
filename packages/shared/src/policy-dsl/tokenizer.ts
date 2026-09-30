export type TokenType =
  | "identifier"
  | "string"
  | "number"
  | "boolean"
  | "operator"
  | "lparen"
  | "rparen"
  | "lbracket"
  | "rbracket"
  | "comma"
  | "keyword"
  | "eof";

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

const KEYWORDS = new Set(["AND", "OR", "NOT", "IN"]);
const OPERATORS = ["==", "!=", "<>", ">=", "<=", "=", ">", "<"];

export class DslSyntaxError extends Error {
  constructor(
    message: string,
    public readonly position: number,
  ) {
    super(`${message} (position ${position})`);
    this.name = "DslSyntaxError";
  }
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen", value: ch, position: i++ });
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen", value: ch, position: i++ });
      continue;
    }
    if (ch === "[") {
      tokens.push({ type: "lbracket", value: ch, position: i++ });
      continue;
    }
    if (ch === "]") {
      tokens.push({ type: "rbracket", value: ch, position: i++ });
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma", value: ch, position: i++ });
      continue;
    }
    if (ch === '"' || ch === "'") {
      const start = i;
      let j = i + 1;
      let out = "";
      while (j < input.length && input[j] !== ch) {
        if (input[j] === "\\" && j + 1 < input.length) {
          out += input[j + 1];
          j += 2;
        } else {
          out += input[j];
          j++;
        }
      }
      if (j >= input.length) throw new DslSyntaxError("Chaîne non terminée", start);
      tokens.push({ type: "string", value: out, position: start });
      i = j + 1;
      continue;
    }
    const op = OPERATORS.find((o) => input.startsWith(o, i));
    if (op) {
      tokens.push({ type: "operator", value: op === "==" ? "=" : op === "<>" ? "!=" : op, position: i });
      i += op.length;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(input[i + 1] ?? ""))) {
      const start = i;
      let j = i + 1;
      while (j < input.length && /[0-9.]/.test(input[j]!)) j++;
      tokens.push({ type: "number", value: input.slice(start, j), position: start });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9_.]/.test(input[j]!)) j++;
      const word = input.slice(start, j);
      const upper = word.toUpperCase();
      if (KEYWORDS.has(upper)) tokens.push({ type: "keyword", value: upper, position: start });
      else if (upper === "TRUE" || upper === "FALSE") tokens.push({ type: "boolean", value: upper.toLowerCase(), position: start });
      else tokens.push({ type: "identifier", value: word, position: start });
      i = j;
      continue;
    }
    throw new DslSyntaxError(`Caractère inattendu « ${ch} »`, i);
  }
  tokens.push({ type: "eof", value: "", position: input.length });
  return tokens;
}
