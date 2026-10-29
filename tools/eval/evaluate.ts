import type { ContextCategory, EntityType, SensitiveEntity } from "../../packages/shared/src/index.js";
import { CONTEXT_CATEGORIES } from "../../packages/shared/src/index.js";
import { applyMasking } from "../../packages/detection-engine/src/index.js";
import type { EvalSample, GoldEntity, Split } from "./annotation.js";
import {
  MATCH_MODES,
  bootstrapInterval,
  macroF1,
  matchEntities,
  mergeByType,
  percentile,
  prf,
  sumCounts,
  type Counts,
  type Interval,
  type MatchMode,
  type Prf,
} from "./metrics.js";
import { attack, buildAttackIndex, REID_VARIANTS, type ReidScenario, type ReidVariant } from "./reidentification.js";
import type { Person } from "./population.js";
import type { EvalSystem, SystemsSetup } from "./systems.js";

export interface ScoreLine {
  counts: Counts;
  prf: Prf;
}

export interface LatencyStats {
  runs: number;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  max: number;
  charsPerMs: number;
  byLength: Record<"court" | "moyen" | "long", { n: number; p50: number; p95: number }>;
}

export interface MaskingLine {
  total: number;
  complet: number;
  partiel: number;
  aucun: number;
}

export interface ErrorExample {
  sample: string;
  split: Split;
  entityType: EntityType;
  value: string;
  excerpt: string;
}

export interface SystemReport {
  id: string;
  label: string;
  description: string;
  coverage: EntityType[];
  global: Record<MatchMode, ScoreLine & { ci95: Interval }>;
  bySplit: Partial<Record<Split, Record<MatchMode, ScoreLine>>>;
  byType: { entityType: EntityType; support: number; counts: Counts; prf: Prf; inCoverage: boolean }[];
  macroF1: number;
  /** Partiel, restreint aux types que la configuration sait produire. */
  perimetre: ScoreLine;
  latency: LatencyStats;
  masking: { global: MaskingLine; byType: { entityType: EntityType; line: MaskingLine }[] };
  missed: ErrorExample[];
  spurious: ErrorExample[];
}

export interface ContextReport {
  id: string;
  label: string;
  n: number;
  accuracy: number;
  macroF1: number;
  confusion: Record<string, Record<string, number>>;
}

export interface ReidLine {
  system: string;
  label: string;
  byVariant: Record<ReidVariant, { n: number; reidentified: number; kLe5: number; medianK: number }>;
  global: { n: number; reidentified: number; kLe5: number; medianK: number };
}

const ERROR_LIMIT = 25;

function excerpt(text: string, span: [number, number]): string {
  const start = Math.max(0, span[0] - 30);
  const end = Math.min(text.length, span[1] + 30);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "…" : ""}`;
}

function lengthBucket(n: number): "court" | "moyen" | "long" {
  return n < 200 ? "court" : n <= 1000 ? "moyen" : "long";
}

function maskingCoverage(gold: GoldEntity[], replaced: [number, number][]): MaskingLine & { perType: Map<EntityType, MaskingLine> } {
  const perType = new Map<EntityType, MaskingLine>();
  const total: MaskingLine = { total: 0, complet: 0, partiel: 0, aucun: 0 };
  for (const g of gold) {
    // Seuls les caractères visibles comptent : l'espace entre prénom et nom ne révèle rien.
    let visible = 0;
    let covered = 0;
    for (let i = g.span[0]; i < g.span[1]; i++) {
      if (/\s/.test(g.value[i - g.span[0]]!)) continue;
      visible++;
      if (replaced.some(([a, b]) => i >= a && i < b)) covered++;
    }
    const key: keyof MaskingLine = covered >= visible ? "complet" : covered > 0 ? "partiel" : "aucun";
    const line = perType.get(g.entityType) ?? { total: 0, complet: 0, partiel: 0, aucun: 0 };
    line.total++;
    line[key]++;
    perType.set(g.entityType, line);
    total.total++;
    total[key]++;
  }
  return { ...total, perType };
}

export async function evaluateSystem(
  system: EvalSystem,
  samples: EvalSample[],
  repetitions: number,
): Promise<{ report: SystemReport; outputs: Map<string, SensitiveEntity[]> }> {
  const outputs = new Map<string, SensitiveEntity[]>();
  const timings: { ms: number; length: number }[] = [];

  // Échauffement non chronométré (JIT, caches ONNX).
  for (const s of samples.slice(0, 5)) await system.detect(s.text);

  for (const s of samples) {
    let last: SensitiveEntity[] = [];
    for (let r = 0; r < repetitions; r++) {
      const started = performance.now();
      const out = await system.detect(s.text);
      timings.push({ ms: performance.now() - started, length: s.text.length });
      last = out.entities;
    }
    outputs.set(s.id, last);
  }

  const perDoc: Record<MatchMode, Counts[]> = { strict: [], partiel: [], protection: [] };
  const typeMaps: ReturnType<typeof matchEntities>["byType"][] = [];
  const splitCounts = new Map<Split, Record<MatchMode, Counts[]>>();
  const perimetreCounts: Counts[] = [];
  const missed: ErrorExample[] = [];
  const spurious: ErrorExample[] = [];
  const maskingTotals: MaskingLine = { total: 0, complet: 0, partiel: 0, aucun: 0 };
  const maskingByType = new Map<EntityType, MaskingLine>();

  for (const s of samples) {
    const preds = outputs.get(s.id)!;
    const split = splitCounts.get(s.split) ?? { strict: [], partiel: [], protection: [] };
    for (const mode of MATCH_MODES) {
      const m = matchEntities(s.gold, preds, mode);
      perDoc[mode].push(m.counts);
      split[mode].push(m.counts);
      if (mode === "partiel") {
        typeMaps.push(m.byType);
        const inScope = s.gold.filter((g) => system.coverage.has(g.entityType));
        perimetreCounts.push(matchEntities(inScope, preds, "partiel").counts);
        for (const g of m.missed) missed.push({ sample: s.id, split: s.split, entityType: g.entityType, value: g.value, excerpt: excerpt(s.text, g.span) });
        for (const p of m.spurious) {
          spurious.push({ sample: s.id, split: s.split, entityType: p.entityType, value: s.text.slice(p.span[0], p.span[1]), excerpt: excerpt(s.text, p.span) });
        }
      }
    }
    splitCounts.set(s.split, split);

    const plan = applyMasking(s.text, preds);
    const cov = maskingCoverage(s.gold, plan.replacements.map((r) => r.span));
    maskingTotals.total += cov.total;
    maskingTotals.complet += cov.complet;
    maskingTotals.partiel += cov.partiel;
    maskingTotals.aucun += cov.aucun;
    for (const [type, line] of cov.perType) {
      const acc = maskingByType.get(type) ?? { total: 0, complet: 0, partiel: 0, aucun: 0 };
      acc.total += line.total;
      acc.complet += line.complet;
      acc.partiel += line.partiel;
      acc.aucun += line.aucun;
      maskingByType.set(type, acc);
    }
  }

  const global = Object.fromEntries(
    MATCH_MODES.map((mode) => {
      const counts = sumCounts(perDoc[mode]);
      return [mode, { counts, prf: prf(counts), ci95: bootstrapInterval(perDoc[mode], (c) => prf(c).f1) }];
    }),
  ) as SystemReport["global"];

  const bySplit: SystemReport["bySplit"] = {};
  for (const [split, modes] of splitCounts) {
    bySplit[split] = Object.fromEntries(
      MATCH_MODES.map((mode) => {
        const counts = sumCounts(modes[mode]);
        return [mode, { counts, prf: prf(counts) }];
      }),
    ) as Record<MatchMode, ScoreLine>;
  }

  const merged = mergeByType(typeMaps);
  const byType = [...merged.entries()]
    .map(([entityType, counts]) => ({
      entityType,
      support: counts.tp + counts.fn,
      counts,
      prf: prf(counts),
      inCoverage: system.coverage.has(entityType),
    }))
    .sort((a, b) => b.support - a.support || a.entityType.localeCompare(b.entityType));

  const all = timings.map((t) => t.ms).sort((a, b) => a - b);
  const byLength = {} as LatencyStats["byLength"];
  for (const bucket of ["court", "moyen", "long"] as const) {
    const values = timings.filter((t) => lengthBucket(t.length) === bucket).map((t) => t.ms).sort((a, b) => a - b);
    byLength[bucket] = { n: values.length, p50: percentile(values, 50), p95: percentile(values, 95) };
  }
  const totalChars = timings.reduce((s, t) => s + t.length, 0);
  const totalMs = timings.reduce((s, t) => s + t.ms, 0);

  const perimetre = sumCounts(perimetreCounts);
  const priority = (e: ErrorExample) => (e.split === "manuel" ? 0 : 1);
  return {
    outputs,
    report: {
      id: system.id,
      label: system.label,
      description: system.description,
      coverage: [...system.coverage].sort(),
      global,
      bySplit,
      byType,
      macroF1: macroF1(merged),
      perimetre: { counts: perimetre, prf: prf(perimetre) },
      latency: {
        runs: all.length,
        p50: percentile(all, 50),
        p95: percentile(all, 95),
        p99: percentile(all, 99),
        mean: totalMs / Math.max(1, all.length),
        max: all[all.length - 1] ?? 0,
        charsPerMs: totalChars / Math.max(1e-9, totalMs),
        byLength,
      },
      masking: {
        global: maskingTotals,
        byType: [...maskingByType.entries()]
          .map(([entityType, line]) => ({ entityType, line }))
          .sort((a, b) => b.line.total - a.line.total),
      },
      missed: missed.sort((a, b) => priority(a) - priority(b)).slice(0, ERROR_LIMIT),
      spurious: spurious.sort((a, b) => priority(a) - priority(b)).slice(0, ERROR_LIMIT),
    },
  };
}

export async function evaluateContext(setup: SystemsSetup, samples: EvalSample[]): Promise<ContextReport[]> {
  const labelled = samples.filter((s): s is EvalSample & { context: ContextCategory } => s.context !== null);
  const reports: ContextReport[] = [];
  for (const classifier of setup.contextClassifiers) {
    const confusion: Record<string, Record<string, number>> = {};
    for (const g of CONTEXT_CATEGORIES) confusion[g] = Object.fromEntries(CONTEXT_CATEGORIES.map((p) => [p, 0]));
    let correct = 0;
    for (const s of labelled) {
      const predicted = (await classifier.classify(s.text))?.contextCategory ?? "Generique";
      confusion[s.context]![predicted]!++;
      if (predicted === s.context) correct++;
    }
    const f1s = CONTEXT_CATEGORIES.map((c) => {
      const tp = confusion[c]![c]!;
      const fn = CONTEXT_CATEGORIES.reduce((s, p) => s + (p === c ? 0 : confusion[c]![p]!), 0);
      const fp = CONTEXT_CATEGORIES.reduce((s, g) => s + (g === c ? 0 : confusion[g]![c]!), 0);
      return tp + fn > 0 ? prf({ tp, fp, fn }).f1 : null;
    }).filter((v): v is number => v !== null);
    reports.push({
      id: classifier.id,
      label: classifier.label,
      n: labelled.length,
      accuracy: correct / Math.max(1, labelled.length),
      macroF1: f1s.reduce((a, b) => a + b, 0) / Math.max(1, f1s.length),
      confusion,
    });
  }
  return reports;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)]! : 0;
}

export async function evaluateReidentification(
  systems: EvalSystem[],
  scenarios: (ReidScenario & { text: string })[],
  people: Person[],
): Promise<ReidLine[]> {
  const index = buildAttackIndex(people);
  const configs: { id: string; label: string; mask: (text: string) => Promise<string> }[] = [
    { id: "aucun", label: "Sans passerelle (texte en clair)", mask: async (t) => t },
    ...systems.map((s) => ({
      id: s.id,
      label: s.label,
      mask: async (t: string) => applyMasking(t, (await s.detect(t)).entities).text,
    })),
  ];
  const lines: ReidLine[] = [];
  for (const config of configs) {
    const results: { variant: ReidVariant; candidates: number; reidentified: boolean; kLe5: boolean }[] = [];
    for (const sc of scenarios) {
      const masked = await config.mask(sc.text);
      const r = attack(masked, sc.targetId, index);
      results.push({
        variant: sc.variant,
        candidates: r.candidates,
        reidentified: r.reidentified,
        kLe5: r.targetAmongCandidates && r.candidates <= 5,
      });
    }
    const summarize = (rows: typeof results) => ({
      n: rows.length,
      reidentified: rows.filter((r) => r.reidentified).length,
      kLe5: rows.filter((r) => r.kLe5).length,
      medianK: median(rows.map((r) => r.candidates)),
    });
    lines.push({
      system: config.id,
      label: config.label,
      byVariant: Object.fromEntries(REID_VARIANTS.map((v) => [v, summarize(results.filter((r) => r.variant === v))])) as ReidLine["byVariant"],
      global: summarize(results),
    });
  }
  return lines;
}
