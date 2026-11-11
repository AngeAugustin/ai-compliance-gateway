/**
 * Précision de l'extraction de fichiers — `pnpm eval:extraction`.
 *
 * Les fixtures de data/fixtures-fichiers sont produites par notre propre générateur (ZIP
 * stocké, PDF ASCII écrit à la main) : elles vérifient le parcours, pas la fidélité. Ici, les
 * 65 prompts du corpus manuel annoté sont écrits dans de vrais fichiers par des outils tiers :
 * Word (DOCX, PDF), Excel (XLSX), PowerPoint (PPTX), et rendus en images PNG pour l'OCR, plus
 * un PDF scanné (images seules). Script de fabrication : tools/eval/fichiers-office.ps1.
 *
 *   pnpm eval:extraction corpus   → écrit data/eval/fichiers-office/corpus.json
 *   powershell -File tools/eval/fichiers-office.ps1   → fabrique les fichiers (Office requis)
 *   pnpm eval:extraction          → mesure
 *
 * Mesures par format :
 *   - conservation des valeurs : part des valeurs annotées retrouvées telles quelles dans le
 *     texte extrait (la détection ne peut voir que ce que l'extraction rend) ;
 *   - fidélité du texte : part des mots du texte source retrouvés dans le texte extrait ;
 *   - détection : rappel du moteur (sans NER) sur le texte extrait, comparé au même moteur sur
 *     le texte source ; une entité compte si le moteur trouve le même type et la même valeur.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CORPUS_MANUEL } from "../../data/eval/corpus-manuel.js";
import { toSample, type EvalSample } from "./annotation.js";
import { DetectionEngine } from "../../packages/detection-engine/src/index.js";
import { extractOneNode } from "../../packages/file-extract/src/node.js";

const DIR = resolve("data/eval/fichiers-office");
const OUT = resolve("docs/evaluation/resultats");
const log = (msg: string) => console.log(`[extraction] ${msg}`);

const samples: EvalSample[] = CORPUS_MANUEL.map((s) => toSample(s, "manuel"));

function norm(s: string): string {
  return s.normalize("NFC").replace(/[  ]/g, " ").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}
function words(s: string): string[] {
  return norm(s).toLowerCase().split(/[^\p{L}\p{N}@.+-]+/u).filter((w) => w.length > 1);
}

/** Part des mots du source présents dans l'extrait (multiensemble). */
function wordRecall(source: string, extracted: string): { found: number; total: number } {
  const bag = new Map<string, number>();
  for (const w of words(extracted)) bag.set(w, (bag.get(w) ?? 0) + 1);
  let found = 0;
  const src = words(source);
  for (const w of src) {
    const n = bag.get(w) ?? 0;
    if (n > 0) {
      found++;
      bag.set(w, n - 1);
    }
  }
  return { found, total: src.length };
}

interface Unit {
  /** Fichier à extraire. */
  file: string;
  format: string;
  /** Échantillons que le fichier contient. */
  sampleIds: string[];
}

function units(): Unit[] {
  const all = samples.map((s) => s.id);
  // Fichiers enregistrés depuis Microsoft Office (office/, voir office/LISEZMOI.md) mesurés à part.
  const office: Unit[] = [
    { file: "office/corpus.docx", format: "DOCX (Word)", sampleIds: all },
    { file: "office/corpus.pdf", format: "PDF texte (Word)", sampleIds: all },
    { file: "office/corpus.xlsx", format: "XLSX (Excel)", sampleIds: all },
    { file: "office/corpus.pptx", format: "PPTX (PowerPoint)", sampleIds: all },
  ].filter((u) => existsSync(join(DIR, u.file)));
  const list: Unit[] = [
    { file: "corpus.docx", format: "DOCX", sampleIds: all },
    // PDF texte : produit par Word (corpus-word.pdf) ou, sans Office, par pdf-lib (corpus-texte.pdf).
    { file: existsSync(join(DIR, "corpus-word.pdf")) ? "corpus-word.pdf" : "corpus-texte.pdf", format: "PDF texte", sampleIds: all },
    { file: "corpus.xlsx", format: "XLSX", sampleIds: all },
    { file: "corpus.pptx", format: "PPTX", sampleIds: all },
    { file: "corpus-scanne.pdf", format: "PDF scanné (images seules)", sampleIds: all.slice(0, 10) },
    ...office,
  ];
  for (const id of all) list.push({ file: join("images", `${id}.png`), format: "Image PNG (OCR)", sampleIds: [id] });
  return list;
}

async function measure() {
  const engine = new DetectionEngine();
  await engine.initialize();
  const byId = new Map(samples.map((s) => [s.id, s]));

  type Acc = {
    files: number;
    failed: number;
    degraded: number;
    ms: number;
    values: { found: number; total: number };
    words: { found: number; total: number };
    detSource: { found: number; total: number };
    detExtracted: { found: number; total: number };
    lost: string[];
    /** Secrets (clé d'API, clé privée, mot de passe, chaîne de connexion) encore détectés dans l'extrait. */
    secrets: { found: number; total: number };
  };
  const acc = new Map<string, Acc>();
  const detected = async (text: string, gold: EvalSample["gold"]) => {
    const preds = (await engine.detect(text)).entities.map((e) => `${e.entityType}|${norm(e.value ?? text.slice(e.span[0], e.span[1]))}`);
    const bag = new Map<string, number>();
    for (const p of preds) bag.set(p, (bag.get(p) ?? 0) + 1);
    let found = 0;
    for (const g of gold) {
      const k = `${g.entityType}|${norm(g.value)}`;
      const n = bag.get(k) ?? 0;
      if (n > 0) {
        found++;
        bag.set(k, n - 1);
      }
    }
    return found;
  };

  /**
   * Un secret est protégé si le moteur détecte, dans le texte extrait, une entité du même type
   * dont la valeur est la sienne à quelques caractères près (OCR : l/1/I, 0/O) : elle sera
   * bloquée ou masquée même mal lue.
   */
  const secretsProtected = async (text: string, gold: EvalSample["gold"]) => {
    const secrets = gold.filter((g) => SECRET_TYPES.has(g.entityType));
    const preds = (await engine.detect(text)).entities
      .filter((e) => SECRET_TYPES.has(e.entityType))
      .map((e) => ({ type: e.entityType, value: norm(e.value ?? text.slice(e.span[0], e.span[1])), used: false }));
    let found = 0;
    for (const g of secrets) {
      const v = norm(g.value);
      const hit = preds.find((p) => !p.used && p.type === g.entityType && similarity(p.value, v) >= 0.8);
      if (hit) {
        hit.used = true;
        found++;
      }
    }
    return { found, total: secrets.length };
  };

  for (const u of units()) {
    const path = join(DIR, u.file);
    if (!existsSync(path)) {
      log(`absent : ${u.file} (lancez tools/eval/fichiers-office.ps1)`);
      continue;
    }
    const a =
      acc.get(u.format) ??
      ({ files: 0, failed: 0, degraded: 0, ms: 0, values: { found: 0, total: 0 }, words: { found: 0, total: 0 }, detSource: { found: 0, total: 0 }, detExtracted: { found: 0, total: 0 }, lost: [], secrets: { found: 0, total: 0 } } as Acc);
    acc.set(u.format, a);
    const t = performance.now();
    const ex = await extractOneNode({ fileName: u.file.split(/[\\/]/).pop()!, data: new Uint8Array(readFileSync(path)) }, { enableOcr: true });
    a.ms += performance.now() - t;
    a.files++;
    if (ex.extractionMethod === "failed" || ex.extractionMethod === "unsupported") a.failed++;
    if (ex.extractionDegraded) a.degraded++;
    const extracted = norm(ex.text);
    const group = u.sampleIds.map((id) => byId.get(id)!);
    const sourceText = group.map((s) => s.text).join("\n");
    const gold = group.flatMap((s) => s.gold);
    for (const g of gold) {
      a.values.total++;
      if (extracted.includes(norm(g.value))) a.values.found++;
      else if (a.lost.length < 6) a.lost.push(`${g.entityType} « ${g.value} »`);
    }
    const wr = wordRecall(sourceText, ex.text);
    a.words.found += wr.found;
    a.words.total += wr.total;
    a.detSource.total += gold.length;
    a.detExtracted.total += gold.length;
    a.detSource.found += await detected(sourceText, gold);
    a.detExtracted.found += await detected(ex.text, gold);
    const sp = await secretsProtected(ex.text, gold);
    a.secrets.found += sp.found;
    a.secrets.total += sp.total;
    if (u.sampleIds.length > 1) log(`${u.file} : ${ex.extractionMethod}${ex.extractionDegraded ? " (dégradé)" : ""}, ${ex.text.length} caractères, ${Math.round(performance.now() - t)} ms`);
  }

  const pct = (x: { found: number; total: number }) => (x.total ? `${((100 * x.found) / x.total).toFixed(1).replace(".", ",")} %` : "—");
  const rows = [...acc.entries()].map(([format, a]) => ({ format, ...a }));
  const producersPath = join(DIR, "producteurs.json");
  const producers: Record<string, string> = existsSync(producersPath) ? JSON.parse(readFileSync(producersPath, "utf8")) : {};
  const producedBy = units()
    .filter((u) => u.sampleIds.length > 1 && existsSync(join(DIR, u.file)))
    .map((u) => `${u.format} : ${producers[u.file] ?? (u.file.startsWith("office/") ? "Microsoft Office, enregistré à la main (office/LISEZMOI.md)" : "Microsoft Office (fichiers-office.ps1)")}`);
  const md = [
    `# Précision de l'extraction de fichiers`,
    `Date : ${new Date().toISOString().slice(0, 10)} · corpus manuel annoté (${samples.length} prompts, ${samples.reduce((s, x) => s + x.gold.length, 0)} valeurs annotées) écrit dans des fichiers produits par des outils tiers (voir « Producteur des fichiers »). Moteur de détection sans NER (règles + mots-clés).`,
    `| Format | Fichiers | Échecs | Dégradés | Temps moyen | Valeurs conservées | Mots conservés | Détection sur le source | Détection sur l'extrait | Secrets détectés |`,
    `| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`,
    ...rows.map(
      (r) =>
        `| ${r.format} | ${r.files} | ${r.failed} | ${r.degraded} | ${Math.round(r.ms / Math.max(1, r.files))} ms | ${pct(r.values)} (${r.values.found}/${r.values.total}) | ${pct(r.words)} | ${pct(r.detSource)} | ${pct(r.detExtracted)} | ${pct(r.secrets)} (${r.secrets.found}/${r.secrets.total}) |`,
    ),
    `## Producteur des fichiers`,
    ...producedBy.map((p) => `- ${p}`),
    `- Images PNG : System.Drawing (Arial 26 px, fond blanc)`,
    `## Valeurs perdues (exemples)`,
    ...rows.filter((r) => r.lost.length).map((r) => `- ${r.format} : ${r.lost.join(" ; ")}`),
    `## Lecture`,
    `- « Valeurs conservées » : la valeur annotée figure telle quelle (espaces normalisés) dans le texte extrait. Une valeur perdue ne peut pas être détectée, donc ni masquée ni bloquée.`,
    `- « Détection » : rappel du même moteur sur le texte source et sur le texte extrait ; l'écart entre les deux colonnes est la perte imputable à l'extraction.`,
    `- « Secrets détectés » : clés d'API, clés privées, mots de passe et chaînes de connexion que le moteur détecte encore dans l'extrait, même lus avec quelques caractères faux (similarité ≥ 0,8) : ils seront bloqués ou masqués. C'est l'indicateur de sécurité ; « valeurs conservées » mesure la fidélité.`,
    `## Limites`,
    `- Mise en forme simple (paragraphes, cellules, une diapositive par prompt) ; tableaux complexes, en-têtes et pieds de page, colonnes multiples et documents réellement numérisés (bruit, inclinaison) ne sont pas couverts.`,
    `- Les images sont rendues proprement (police nette, fond blanc) : c'est un plafond pour l'OCR, pas une estimation sur des photos ou des scans.`,
  ].reduce((md, line, i, all) => md + (i === 0 ? "" : (line.startsWith("|") && all[i - 1]!.startsWith("|")) || (line.startsWith("- ") && all[i - 1]!.startsWith("- ")) ? "\n" : "\n\n") + line, "");
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "extraction-fichiers.md"), md + "\n", "utf8");
  writeFileSync(join(OUT, "extraction-fichiers.json"), JSON.stringify(rows, null, 2), "utf8");
  for (const r of rows) log(`${r.format} : valeurs ${pct(r.values)} · secrets ${pct(r.secrets)} · détection ${pct(r.detSource)} → ${pct(r.detExtracted)}`);
  log(`rapport : ${join(OUT, "extraction-fichiers.md")}`);
}

async function main() {
  if (process.argv[2] === "corpus") {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, "corpus.json"), JSON.stringify(samples.map((s) => ({ id: s.id, text: s.text })), null, 2), "utf8");
    log(`${samples.length} prompts → ${join(DIR, "corpus.json")}`);
    return;
  }
  await measure();
  if (existsSync(join(DIR, "images"))) log(`${readdirSync(join(DIR, "images")).length} images présentes`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});

const SECRET_TYPES = new Set(["API_KEY", "PRIVATE_KEY", "PASSWORD", "CONNECTION_STRING"]);

/** 1 − distance d'édition / longueur maximale. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n]! / Math.max(m, n);
}
