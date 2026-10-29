/**
 * Protocole d'évaluation de la détection — point d'entrée de `pnpm eval:detection`.
 *
 * Options :
 *   --sans-ner            n'évalue pas les configurations avec NER (pas de chargement du modèle)
 *   --repetitions <n>     mesures de latence par prompt (défaut 3)
 *   --graine <n>          graine du générateur (défaut 2026) — même graine, même corpus
 *   --taille-genere <n>   prompts du corpus généré (défaut 300)
 *   --longs <n>           documents multi-demandes (défaut 20)
 *   --reid <n>            scénarios de ré-identification par variante (défaut 50)
 *   --sortie <dossier>    dossier du rapport (défaut docs/evaluation/resultats)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CORPUS_MANUEL } from "../../data/eval/corpus-manuel.js";
import { parseAnnotated, toSample, type EvalSample } from "./annotation.js";
import { generateLongDocuments, generateSamples } from "./corpus-genere.js";
import { evaluateContext, evaluateReidentification, evaluateSystem, type SystemReport } from "./evaluate.js";
import { generatePopulation } from "./population.js";
import { CONTROL_VARIANTS, generateReidScenarios } from "./reidentification.js";
import { evaluateRiskResponse } from "./risk-response.js";
import { describeCorpus, renderMarkdown, type FullReport } from "./report.js";
import { createRng } from "./rng.js";
import { buildSystems } from "./systems.js";

const { values: args } = parseArgs({
  options: {
    "sans-ner": { type: "boolean", default: false },
    repetitions: { type: "string", default: "3" },
    graine: { type: "string", default: "2026" },
    "taille-genere": { type: "string", default: "300" },
    longs: { type: "string", default: "20" },
    reid: { type: "string", default: "50" },
    sortie: { type: "string", default: "docs/evaluation/resultats" },
  },
});

const POPULATION_SIZE = 2000;
const seed = Number(args.graine);
const repetitions = Math.max(1, Number(args.repetitions));
const started = performance.now();
const log = (msg: string) => console.log(`[eval] ${msg}`);

// Chaque usage a son propre flux aléatoire : changer la taille d'un corpus ne modifie pas les autres.
const people = generatePopulation(createRng(seed), POPULATION_SIZE);
const samples: EvalSample[] = [
  ...CORPUS_MANUEL.map((s) => toSample(s, "manuel")),
  ...generateSamples(createRng(seed + 1), people, Number(args["taille-genere"])).map((s) => toSample(s, "genere")),
  ...generateLongDocuments(createRng(seed + 2), people, Number(args.longs)).map((s) => toSample(s, "long")),
];
const scenarios = generateReidScenarios(createRng(seed + 3), people, Number(args.reid)).map((s) => ({
  ...s,
  text: parseAnnotated(s.markup).text,
}));
const controls = generateReidScenarios(createRng(seed + 4), people, Number(args.reid), CONTROL_VARIANTS).map((s) => ({
  ...s,
  text: parseAnnotated(s.markup).text,
}));
const corpus = describeCorpus(samples, scenarios.length);
log(`corpus : ${corpus.samples} prompts, ${corpus.entities} entités, ${corpus.negatives} négatifs, ${scenarios.length} scénarios de ré-identification + ${controls.length} témoins`);

const setup = await buildSystems({ withNer: !args["sans-ner"] });
log(`NER : ${setup.ner.available ? `chargé en ${setup.ner.initMs} ms` : `indisponible — ${setup.ner.detail}`}`);

const reports: SystemReport[] = [];
for (const system of setup.systems) {
  log(`évaluation : ${system.label}…`);
  const { report } = await evaluateSystem(system, samples, repetitions);
  reports.push(report);
  const g = report.global.partiel;
  log(
    `  P ${(g.prf.precision * 100).toFixed(1)} · R ${(g.prf.recall * 100).toFixed(1)} · F1 ${(g.prf.f1 * 100).toFixed(1)} ` +
      `[${(g.ci95.low * 100).toFixed(1)}–${(g.ci95.high * 100).toFixed(1)}] · p50 ${report.latency.p50.toFixed(2)} ms · p95 ${report.latency.p95.toFixed(2)} ms`,
  );
}

log("classification du contexte…");
const context = await evaluateContext(setup, samples);
log("ré-identification…");
const reidentification = await evaluateReidentification(setup.systems, scenarios, people);
for (const l of reidentification) {
  log(`  ${l.label} : ${l.global.reidentified}/${l.global.n} ré-identifiés, k médian ${l.global.medianK}`);
}

log("réponse du scoring au risque de ré-identification…");
const riskResponse = await evaluateRiskResponse(setup.systems, [...scenarios, ...controls], people);
for (const l of riskResponse.filter((x) => x.variant === "facteur-actif")) {
  const g = l.byExposure.reidentifiable;
  log(`  ${l.label} : k=1 en clair ${g.n}, score moyen ${g.meanScore}, laissés en clair ${g.passedInClear}, ré-identifiés après passerelle ${g.reidentifiedAfter}`);
}

const full: FullReport = {
  meta: {
    date: new Date().toISOString().slice(0, 10),
    seed,
    repetitions,
    node: process.versions.node,
    platform: `${process.platform}-${process.arch}`,
    cpu: cpus()[0]?.model.trim() ?? "inconnu",
    durationMs: performance.now() - started,
    populationSize: POPULATION_SIZE,
  },
  setup: { ner: setup.ner, llm: setup.llm },
  corpus,
  systems: reports,
  context,
  reidentification,
  riskResponse,
};

const outDir = resolve(args.sortie);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "resultats-detection.md"), renderMarkdown(full), "utf8");
writeFileSync(join(outDir, "resultats-detection.json"), JSON.stringify(full, null, 2), "utf8");
log(`rapport : ${join(outDir, "resultats-detection.md")}`);
