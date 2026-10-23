import type { EntityType, SensitiveEntity } from "@acg/shared";

/**
 * Logique NER commune Node / navigateur (aucune dépendance Node).
 *
 * transformers.js ne renvoie PAS les offsets start/end en token-classification
 * (« TODO add support for start and end » dans la v4) : seuls `word` et `score`
 * sont fiables. Les positions sont donc retrouvées dans le texte source.
 */

const LABEL_MAP: Record<string, EntityType> = {
  PER: "PERSON",
  PERSON: "PERSON",
  PERS: "PERSON",
  LOC: "ADDRESS",
  LOCATION: "ADDRESS",
  GPE: "ADDRESS",
  ORG: "ORGANIZATION",
  ORGANIZATION: "ORGANIZATION",
};

export const DEFAULT_NER_HUB_MODEL = "Xenova/bert-base-multilingual-cased-ner-hrl";

export interface RawNerItem {
  entity_group?: string;
  entity?: string;
  score: number;
  word: string;
  start?: number;
  end?: number;
}

export type NerPipeline = (text: string, options?: Record<string, unknown>) => Promise<unknown>;

/** Découpe en morceaux ≤ maxChars sur des fins de phrase/ligne (le modèle tronque à 512 jetons). */
export function chunkText(text: string, maxChars = 1200): { offset: number; text: string }[] {
  if (text.length <= maxChars) return [{ offset: 0, text }];
  const chunks: { offset: number; text: string }[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const cut = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(". "), slice.lastIndexOf("; "));
      if (cut > maxChars * 0.5) end = start + cut + 1;
      else {
        const space = slice.lastIndexOf(" ");
        if (space > maxChars * 0.5) end = start + space + 1;
      }
    }
    chunks.push({ offset: start, text: text.slice(start, end) });
    start = end;
  }
  return chunks;
}

/**
 * Retrouve `word` dans `text` à partir de `from`, en tolérant les écarts
 * d'espacement introduits par le décodage WordPiece (« Jean - Pierre »).
 */
export function locate(text: string, word: string, from: number): [number, number] | null {
  const direct = text.indexOf(word, from);
  if (direct >= 0) return [direct, direct + word.length];
  const target = word.replace(/\s+/g, "");
  if (!target) return null;
  for (let i = from; i < text.length; i++) {
    if (text[i] !== target[0]) continue;
    let j = i;
    let k = 0;
    while (j < text.length && k < target.length) {
      if (/\s/.test(text[j]!)) {
        j++;
        continue;
      }
      if (text[j] !== target[k]) break;
      j++;
      k++;
    }
    if (k === target.length) return [i, j];
  }
  return null;
}

export function nerItemsToEntities(text: string, items: RawNerItem[], offset = 0): SensitiveEntity[] {
  const entities: SensitiveEntity[] = [];
  let cursor = 0;
  for (const item of items) {
    const label = (item.entity_group ?? item.entity ?? "").replace(/^[BIES]-/, "").toUpperCase();
    const entityType = LABEL_MAP[label];
    if (!entityType) continue;
    const word = item.word.replace(/^##/, "").trim();
    if (word.length < 2) continue;
    const span =
      typeof item.start === "number" && typeof item.end === "number" && item.end > item.start
        ? ([item.start, item.end] as [number, number])
        : locate(text, word, cursor);
    if (!span) continue;
    cursor = span[1];
    const prev = entities[entities.length - 1];
    // Sous-mots du même type collés (« Ag » + « ossou ») : fusion en une seule entité.
    if (prev && prev.entityType === entityType && span[0] - (prev.span[1] - offset) <= 1 && !/\s/.test(text.slice(prev.span[1] - offset, span[0]))) {
      prev.span = [prev.span[0], span[1] + offset];
      prev.value = text.slice(prev.span[0] - offset, span[1]);
      prev.confidence = Math.min(prev.confidence, item.score);
      continue;
    }
    entities.push({
      entityType,
      confidence: Math.max(0, Math.min(1, item.score)),
      span: [span[0] + offset, span[1] + offset],
      layer: "ner",
      value: text.slice(span[0], span[1]),
    });
  }
  return entities;
}

/** Exécute le pipeline sur chaque morceau et remet les positions dans le repère du texte complet. */
export async function runNerPipeline(pipeline: NerPipeline, text: string): Promise<SensitiveEntity[]> {
  const out: SensitiveEntity[] = [];
  for (const chunk of chunkText(text)) {
    if (!chunk.text.trim()) continue;
    const raw = (await pipeline(chunk.text, { aggregation_strategy: "simple" })) as RawNerItem[];
    out.push(...nerItemsToEntities(chunk.text, raw, chunk.offset));
  }
  return out;
}
