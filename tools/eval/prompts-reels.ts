/**
 * Détection sur des prompts réels anonymisés — `pnpm eval:prompts-reels`.
 * Protocole de collecte : docs/evaluation/prompts-reels/protocole.md.
 *
 * Lit docs/evaluation/prompts-reels/corpus-annote.txt, au format du second annotateur :
 *   ### reel-001 Finance
 *   Texte du prompt avec [[TYPE|valeur]] ou ⟦TYPE|valeur⟧ autour de chaque donnée sensible.
 * (la catégorie de contexte après l'identifiant est facultative).
 * Mesure le moteur complet (et sans NER) avec les mêmes métriques que le corpus synthétique,
 * écrit docs/evaluation/resultats/prompts-reels.md.
 *
 *   pnpm eval:prompts-reels --exemple   → vérifie le script sur le corpus manuel réécrit dans ce format
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CORPUS_MANUEL } from "../../data/eval/corpus-manuel.js";
import { CONTEXT_CATEGORIES, type ContextCategory } from "../../packages/shared/src/index.js";
import { parseAnnotated, type EvalSample } from "./annotation.js";
import { evaluateSystem } from "./evaluate.js";
import { buildSystems } from "./systems.js";

const DIR = resolve("docs/evaluation/prompts-reels");
const OUT = resolve("docs/evaluation/resultats");
const log = (m: string) => console.log(`[prompts-reels] ${m}`);

export function parseRealCorpus(content: string): EvalSample[] {
  const out: EvalSample[] = [];
  let head: { id: string; context: ContextCategory | null } | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (!head) return;
    const markup = buf.join("\n").replace(/\[\[([A-Z_]+)\|([^\]]*)\]\]/g, "⟦$1|$2⟧").trim();
    if (markup) out.push({ id: head.id, split: "reel", context: head.context, ...parseAnnotated(markup) });
  };
  for (const line of content.replace(/^﻿/, "").split(/\r?\n/)) {
    const m = line.match(/^### (\S+)(?:\s+(\S+))?/);
    if (m) {
      flush();
      const ctx = m[2] && (CONTEXT_CATEGORIES as readonly string[]).includes(m[2]) ? (m[2] as ContextCategory) : null;
      head = { id: m[1]!, context: ctx };
      buf = [];
    } else if (head) buf.push(line);
  }
  flush();
  return out;
}

async function main() {
  const exemple = process.argv.includes("--exemple");
  const path = join(DIR, "corpus-annote.txt");
  let content: string;
  if (exemple) {
    content = CORPUS_MANUEL.map((s) => `### ${s.id} ${s.context ?? ""}\n${s.markup}`).join("\n\n");
  } else if (existsSync(path)) {
    content = readFileSync(path, "utf8");
  } else {
    log(`${path} absent : collectez et anonymisez les prompts selon protocole.md, ou --exemple pour tester le script.`);
    return;
  }
  const samples = parseRealCorpus(content);
  const entities = samples.reduce((s, x) => s + x.gold.length, 0);
  log(`${samples.length} prompts, ${entities} entités annotées`);
  const setup = await buildSystems({ withNer: process.env.NER_DISABLE !== "1" });
  const wanted = setup.systems.filter((s) => s.id === "moteur-complet" || s.id === "moteur-degrade");
  const p = (x: number) => `${(100 * x).toFixed(1).replace(".", ",")} %`;
  const lines = [
    `# Détection sur des prompts réels anonymisés${exemple ? " — EXEMPLE (corpus manuel, pas des prompts réels)" : ""}`,
    `Date : ${new Date().toISOString().slice(0, 10)} · ${samples.length} prompts · ${entities} entités annotées · ${samples.filter((s) => s.gold.length === 0).length} sans donnée sensible. Protocole : [protocole.md](../prompts-reels/protocole.md).`,
    `| Configuration | Précision | Rappel | F1 (IC 95 %) | Rappel protection | Entités lisibles après masquage |`,
    `| :--- | ---: | ---: | ---: | ---: | ---: |`,
  ];
  const missed: string[] = [];
  for (const sys of wanted) {
    const { report } = await evaluateSystem(sys, samples, 1);
    const g = report.global.partiel;
    lines.push(
      `| ${report.label} | ${p(g.prf.precision)} | ${p(g.prf.recall)} | ${p(g.prf.f1)} (${p(g.ci95.low)} – ${p(g.ci95.high)}) | ${p(report.global.protection.prf.recall)} | ${p(report.masking.global.aucun / Math.max(1, report.masking.global.total))} |`,
    );
    if (sys.id === "moteur-complet") for (const m of report.missed.slice(0, 30)) missed.push(`- ${m.sample} : ${m.entityType} « ${m.value} »`);
    log(`${report.label} : F1 ${p(g.prf.f1)}, rappel protection ${p(report.global.protection.prf.recall)}`);
  }
  lines.push(`## Données manquées (moteur complet, extrait)`, ...(missed.length ? missed : ["Aucune."]));
  lines.push(
    `## Lecture`,
    `- Comparer au corpus manuel synthétique (moteur complet : F1 78,4 %, rappel protection 80,4 %, mesurés par ce script avec --exemple) : un écart important signale que le corpus synthétique ne représente pas l'usage réel.`,
    `- Les valeurs ont été remplacées par des valeurs fictives de même forme avant annotation (protocole) : la mesure porte sur la formulation réelle, pas sur les vraies données.`,
  );
  const md = lines.reduce((md, line, i, all) => md + (i === 0 ? "" : (line.startsWith("|") && all[i - 1]!.startsWith("|")) || (line.startsWith("- ") && all[i - 1]!.startsWith("- ")) ? "\n" : "\n\n") + line, "");
  if (exemple) {
    process.stdout.write(md + "\n");
    return;
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "prompts-reels.md"), md + "\n", "utf8");
  log(`rapport : ${join(OUT, "prompts-reels.md")}`);
}

if (process.argv[1] && /prompts-reels\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exit(1);
  });
}
