import type { EntityType } from "../../packages/shared/src/index.js";
import type { GoldEntity } from "./annotation.js";
import { createRng } from "./rng.js";

/**
 * Appariement gold ↔ prédictions, trois modes (cf. SemEval-2013 / MUC) :
 * - strict   : même type ET mêmes bornes ;
 * - partiel  : même type ET chevauchement ;
 * - protection : chevauchement quel que soit le type — ce qui compte pour le masquage
 *   (une valeur masquée sous le mauvais type est quand même protégée).
 * L'appariement est un-à-un, glouton par recouvrement (IoU) décroissant.
 */
export type MatchMode = "strict" | "partiel" | "protection";
export const MATCH_MODES: MatchMode[] = ["strict", "partiel", "protection"];

export interface PredEntity {
  entityType: EntityType;
  span: [number, number];
}

export interface Counts {
  tp: number;
  fp: number;
  fn: number;
}

export interface MatchResult {
  counts: Counts;
  /** Par type gold pour tp/fn, par type prédit pour fp. */
  byType: Map<EntityType, Counts>;
  /** Gold non retrouvés (pour l'analyse d'erreurs). */
  missed: GoldEntity[];
  /** Prédictions sans gold correspondant. */
  spurious: PredEntity[];
  /** Paires (gold, prédiction) appariées. */
  pairs: { gold: GoldEntity; pred: PredEntity }[];
}

function iou(a: [number, number], b: [number, number]): number {
  const inter = Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
  if (inter <= 0) return 0;
  return inter / (Math.max(a[1], b[1]) - Math.min(a[0], b[0]));
}

function compatible(mode: MatchMode, g: GoldEntity, p: PredEntity): boolean {
  if (mode === "strict") return g.entityType === p.entityType && g.span[0] === p.span[0] && g.span[1] === p.span[1];
  if (mode === "partiel") return g.entityType === p.entityType && iou(g.span, p.span) > 0;
  return iou(g.span, p.span) > 0;
}

function bump(map: Map<EntityType, Counts>, type: EntityType, key: keyof Counts) {
  const c = map.get(type) ?? { tp: 0, fp: 0, fn: 0 };
  c[key]++;
  map.set(type, c);
}

export function matchEntities(gold: GoldEntity[], preds: PredEntity[], mode: MatchMode): MatchResult {
  const candidates: { gi: number; pi: number; score: number }[] = [];
  gold.forEach((g, gi) =>
    preds.forEach((p, pi) => {
      if (compatible(mode, g, p)) candidates.push({ gi, pi, score: iou(g.span, p.span) });
    }),
  );
  candidates.sort((a, b) => b.score - a.score || a.gi - b.gi || a.pi - b.pi);
  const usedGold = new Set<number>();
  const usedPred = new Set<number>();
  const pairs: MatchResult["pairs"] = [];
  for (const c of candidates) {
    if (usedGold.has(c.gi) || usedPred.has(c.pi)) continue;
    usedGold.add(c.gi);
    usedPred.add(c.pi);
    pairs.push({ gold: gold[c.gi]!, pred: preds[c.pi]! });
  }
  const byType = new Map<EntityType, Counts>();
  for (const { gold: g } of pairs) bump(byType, g.entityType, "tp");
  const missed = gold.filter((_, i) => !usedGold.has(i));
  const spurious = preds.filter((_, i) => !usedPred.has(i));
  for (const g of missed) bump(byType, g.entityType, "fn");
  for (const p of spurious) bump(byType, p.entityType, "fp");
  return {
    counts: { tp: pairs.length, fp: spurious.length, fn: missed.length },
    byType,
    missed,
    spurious,
    pairs,
  };
}

export interface Prf {
  precision: number;
  recall: number;
  f1: number;
}

/** Conventions : P = 1 sans prédiction, R = 1 sans gold (rien à trouver, rien de raté). */
export function prf({ tp, fp, fn }: Counts): Prf {
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

export function addCounts(a: Counts, b: Counts): Counts {
  return { tp: a.tp + b.tp, fp: a.fp + b.fp, fn: a.fn + b.fn };
}

export function sumCounts(list: Counts[]): Counts {
  return list.reduce(addCounts, { tp: 0, fp: 0, fn: 0 });
}

export function mergeByType(maps: Map<EntityType, Counts>[]): Map<EntityType, Counts> {
  const out = new Map<EntityType, Counts>();
  for (const map of maps) {
    for (const [type, c] of map) out.set(type, addCounts(out.get(type) ?? { tp: 0, fp: 0, fn: 0 }, c));
  }
  return out;
}

/** Macro-F1 sur les types présents dans le gold (un type jamais attendu n'a pas de rappel défini). */
export function macroF1(byType: Map<EntityType, Counts>): number {
  const scored = [...byType.values()].filter((c) => c.tp + c.fn > 0);
  if (scored.length === 0) return 0;
  return scored.reduce((s, c) => s + prf(c).f1, 0) / scored.length;
}

export interface Interval {
  low: number;
  high: number;
}

/**
 * Intervalle de confiance à 95 % par bootstrap sur les documents (rééchantillonnage
 * avec remise). Les documents, pas les entités, sont l'unité statistique : les entités
 * d'un même prompt ne sont pas indépendantes.
 */
export function bootstrapInterval(
  perDocument: Counts[],
  statistic: (c: Counts) => number,
  iterations = 1000,
  seed = 7,
): Interval {
  if (perDocument.length === 0) return { low: 0, high: 0 };
  const rng = createRng(seed);
  const values: number[] = [];
  for (let b = 0; b < iterations; b++) {
    let acc: Counts = { tp: 0, fp: 0, fn: 0 };
    for (let i = 0; i < perDocument.length; i++) acc = addCounts(acc, perDocument[rng.int(0, perDocument.length - 1)]!);
    values.push(statistic(acc));
  }
  values.sort((a, b) => a - b);
  return { low: values[Math.floor(iterations * 0.025)]!, high: values[Math.min(iterations - 1, Math.ceil(iterations * 0.975) - 1)]! };
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}
