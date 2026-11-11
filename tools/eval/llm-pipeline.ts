/**
 * Le LLM de contexte tel qu'il agit dans l'agent — `pnpm eval:llm:pipeline`.
 *
 * L'évaluation de la détection mesure le LLM seul. Dans le moteur, son avis est mis en concurrence
 * avec celui des lexiques et l'avis le plus confiant l'emporte (aggregate.ts) : un LLM en
 * désaccord annonce 0,75, les lexiques jusqu'à 0,86. On mesure donc ici, sur le même corpus
 * (graine 2026, 65 prompts manuels + 300 générés), trois classifications obtenues en un seul passage :
 * - lexiques seuls (sans LLM, configuration par défaut) ;
 * - LLM seul (ce que mesurait l'évaluation de la détection) ;
 * - moteur avec LLM (contexte final, celui que reçoit le scoring dans l'agent),
 * ainsi que le temps de détection du moteur avec LLM.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { CORPUS_MANUEL } from "../../data/eval/corpus-manuel.js";
import { toSample, type EvalSample } from "./annotation.js";
import { generateSamples } from "./corpus-genere.js";
import { generatePopulation } from "./population.js";
import { createRng } from "./rng.js";
import { classifyByKeywords, DetectionEngine } from "../../packages/detection-engine/src/index.js";
import { LlmLocalLayer } from "../../packages/detection-engine/src/node.js";
import type { DetectionResult } from "../../packages/shared/src/index.js";

loadEnv({ quiet: true });
const OUT = resolve("docs/evaluation/resultats");
const SEED = 2026;
const log = (m: string) => console.log(`[llm-pipeline] ${m}`);

const people = generatePopulation(createRng(SEED), 2000);
const samples: EvalSample[] = [
  ...CORPUS_MANUEL.map((s) => toSample(s, "manuel")),
  ...generateSamples(createRng(SEED + 1), people, 300).map((s) => toSample(s, "genere")),
].filter((s) => s.context !== null);

async function main() {
  const modelPath = process.env.LLM_MODEL_PATH;
  if (!modelPath || !existsSync(modelPath)) throw new Error("LLM_MODEL_PATH absent ou introuvable (.env)");
  const layer = new LlmLocalLayer({ modelPath, expectedSha256: process.env.LLM_MODEL_SHA256 || undefined });
  const t0 = performance.now();
  const status = await layer.initialize();
  if (!status.available) throw new Error(`LLM non chargé : ${status.detail}`);
  const loadMs = performance.now() - t0;
  log(`modèle chargé en ${Math.round(loadMs)} ms`);

  // Enveloppe qui garde la réponse du LLM, pour obtenir « LLM seul » sans second appel.
  let lastLlm: DetectionResult | null = null;
  const spy = Object.assign(Object.create(Object.getPrototypeOf(layer)), layer, {
    detect: async (text: string) => (lastLlm = await layer.detect(text)),
    initialize: async () => layer.status(),
    status: () => layer.status(),
  });
  const engine = new DetectionEngine({ extraLayers: [spy] });
  await engine.initialize();

  type Row = { id: string; split: string; expected: string; keywords: string; llm: string; engine: string; llmDegraded: boolean; ms: number; kwConfidence: number };
  const rows: Row[] = [];
  for (const [i, s] of samples.entries()) {
    const t = performance.now();
    const r = await engine.detect(s.text);
    const ms = performance.now() - t;
    const kw = classifyByKeywords(s.text);
    rows.push({
      id: s.id,
      split: s.split,
      expected: s.context!,
      keywords: kw.contextCategory,
      kwConfidence: kw.confidence,
      llm: (lastLlm as DetectionResult | null)?.context?.contextCategory ?? "?",
      llmDegraded: (lastLlm as DetectionResult | null)?.degraded ?? true,
      engine: r.context?.contextCategory ?? "?",
      ms,
    });
    if ((i + 1) % 25 === 0) log(`${i + 1}/${samples.length}`);
  }

  const acc = (sel: (r: Row) => string, split?: string) => {
    const rs = rows.filter((r) => !split || r.split === split);
    const ok = rs.filter((r) => sel(r) === r.expected).length;
    return { ok, n: rs.length };
  };
  const pct = (x: { ok: number; n: number }) => `${((100 * x.ok) / x.n).toFixed(1).replace(".", ",")} % (${x.ok}/${x.n})`;
  const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
  const disagreements = rows.filter((r) => r.llm !== r.keywords);
  const llmWon = disagreements.filter((r) => r.engine === r.llm);
  const llmRightLost = disagreements.filter((r) => r.llm === r.expected && r.engine !== r.expected);
  const llmWrongWon = disagreements.filter((r) => r.llm !== r.expected && r.engine === r.llm);

  const methods: [string, (r: Row) => string][] = [
    ["Lexiques seuls (défaut)", (r) => r.keywords],
    ["LLM seul", (r) => r.llm],
    ["**Moteur avec LLM (contexte final)**", (r) => r.engine],
  ];
  const md = [
    `# Le LLM de contexte dans le moteur`,
    `Date : ${new Date().toISOString().slice(0, 10)} · Phi-3.5-mini Q4_K_M, CPU · ${rows.length} prompts étiquetés (graine ${SEED}) · chargement du modèle ${Math.round(loadMs / 100) / 10} s · repli sur les lexiques pendant la mesure : ${rows.filter((r) => r.llmDegraded).length}.`,
    `## Exactitude de la catégorie de contexte`,
    `| Méthode | Corpus manuel | Corpus généré | Global |`,
    `| :--- | ---: | ---: | ---: |`,
    ...methods.map(([label, sel]) => `| ${label} | ${pct(acc(sel, "manuel"))} | ${pct(acc(sel, "genere"))} | ${pct(acc(sel))} |`),
    `## Arbitrage entre LLM et lexiques`,
    `- Désaccords LLM / lexiques : ${disagreements.length} sur ${rows.length}.`,
    `- Le LLM l'emporte dans le moteur : ${llmWon.length} fois ; les lexiques : ${disagreements.length - llmWon.length} fois.`,
    `- LLM juste mais écarté par les lexiques : ${llmRightLost.length} ; LLM faux mais retenu : ${llmWrongWon.length}.`,
    `## Temps de détection du moteur avec LLM`,
    `Médiane ${Math.round(q(0.5))} ms · p95 ${Math.round(q(0.95))} ms · max ${Math.round(sorted[sorted.length - 1]!)} ms (règles, mots-clés et LLM, sans NER ; le LLM traite un prompt à la fois).`,
    `## Lecture`,
    `- « LLM seul » est le chiffre de l'évaluation de la détection. Le « contexte final » est celui qui entre réellement dans le score de risque quand LLM_MODEL_PATH est renseigné.`,
    `- Le contexte pèse 15 % du score de risque ; il ne change ni les entités détectées ni leur masquage.`,
  ].reduce((md, line, i, all) => md + (i === 0 ? "" : (line.startsWith("|") && all[i - 1]!.startsWith("|")) || (line.startsWith("- ") && all[i - 1]!.startsWith("- ")) ? "\n" : "\n\n") + line, "");
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "llm-pipeline.md"), md + "\n", "utf8");
  writeFileSync(join(OUT, "llm-pipeline.json"), JSON.stringify({ loadMs, rows }, null, 2), "utf8");
  for (const [label, sel] of methods) log(`${label.replace(/\*/g, "")} : manuel ${pct(acc(sel, "manuel"))} · global ${pct(acc(sel))}`);
  log(`désaccords ${disagreements.length}, LLM retenu ${llmWon.length}, LLM juste écarté ${llmRightLost.length} · médiane ${Math.round(q(0.5))} ms`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
