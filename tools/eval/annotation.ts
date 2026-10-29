import { isEntityType, type ContextCategory, type EntityType } from "../../packages/shared/src/index.js";

/**
 * Annotation en ligne : ⟦TYPE|valeur⟧. Les positions sont calculées au parsing,
 * ce qui évite les offsets saisis à la main (source d'erreurs d'annotation).
 */
export interface GoldEntity {
  entityType: EntityType;
  span: [number, number];
  value: string;
}

export type Split = "manuel" | "genere" | "long";

export interface AnnotatedSource {
  id: string;
  /** Catégorie de contexte attendue ; null pour les documents multi-thèmes (exclus de l'évaluation du contexte). */
  context: ContextCategory | null;
  markup: string;
  note?: string;
}

export interface EvalSample {
  id: string;
  split: Split;
  context: ContextCategory | null;
  text: string;
  gold: GoldEntity[];
  note?: string;
}

const MARK = /⟦([A-Z_]+)\|([^⟧]*)⟧/g;

export function ann(entityType: EntityType, value: string): string {
  return `⟦${entityType}|${value}⟧`;
}

export function parseAnnotated(markup: string): { text: string; gold: GoldEntity[] } {
  let text = "";
  let last = 0;
  const gold: GoldEntity[] = [];
  for (const m of markup.matchAll(MARK)) {
    const [whole, type, value] = m as unknown as [string, string, string];
    text += markup.slice(last, m.index);
    if (!isEntityType(type)) throw new Error(`Type d'entité inconnu « ${type} » dans : ${markup.slice(0, 80)}`);
    if (!value || value !== value.trim()) throw new Error(`Valeur vide ou entourée d'espaces pour ${type} dans : ${markup.slice(0, 80)}`);
    const start = text.length;
    text += value;
    gold.push({ entityType: type, span: [start, start + value.length], value });
    last = m.index! + whole.length;
  }
  text += markup.slice(last);
  if (/[⟦⟧]/.test(text)) throw new Error(`Balise d'annotation mal formée dans : ${markup.slice(0, 80)}`);
  return { text, gold };
}

export function toSample(source: AnnotatedSource, split: Split): EvalSample {
  const { text, gold } = parseAnnotated(source.markup);
  return { id: source.id, split, context: source.context, text, gold, note: source.note };
}
