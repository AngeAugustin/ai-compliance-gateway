/**
 * Accord entre annotateurs sur le corpus manuel — `pnpm eval:accord`.
 *
 *   pnpm eval:accord export     → docs/evaluation/annotation/a-annoter.txt (textes sans annotation)
 *   (le second annotateur annote ce fichier en suivant guide-annotation.md, et l'enregistre
 *    sous docs/evaluation/annotation/annotations-2.txt)
 *   pnpm eval:accord            → docs/evaluation/resultats/accord-annotateurs.md et .json
 *   pnpm eval:accord --exemple  → vérifie le calcul sur une annotation simulée, sans rien écrire
 *
 * Mesures, de la plus stricte à la plus utile pour la protection :
 * - F1 strict : même type et mêmes bornes (pour deux annotateurs, F1 = accord symétrique,
 *   Hripcsak et Rothschild 2005 ; le kappa est mal défini pour des segments) ;
 * - F1 chevauchement typé : même type, segments qui se recouvrent ;
 * - F1 protection : segments qui se recouvrent, quel que soit le type (ce qui sera masqué) ;
 * - kappa de Cohen par caractère : chaque caractère porte un type ou « aucun ».
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CORPUS_MANUEL } from "../../data/eval/corpus-manuel.js";
import { parseAnnotated, type GoldEntity } from "./annotation.js";

const DIR = resolve("docs/evaluation/annotation");
const OUT = resolve("docs/evaluation/resultats");
const BLOCK = /^### (\S+)/;

interface Doc {
  id: string;
  text: string;
  a: GoldEntity[];
  b: GoldEntity[];
}

/** Fichier à annoter : un bloc par prompt, en-tête « ### id », texte brut ensuite. */
export function exportText(): string {
  return (
    CORPUS_MANUEL.map((s) => `### ${s.id}\n${parseAnnotated(s.markup).text}`).join("\n\n") + "\n"
  );
}

/** Lit le fichier annoté. Balises acceptées : ⟦TYPE|valeur⟧ ou [[TYPE|valeur]] (plus facile à taper). */
export function parseAnnotatedFile(content: string): Map<string, { text: string; gold: GoldEntity[] }> {
  const out = new Map<string, { text: string; gold: GoldEntity[] }>();
  let id: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (!id) return;
    const markup = buf.join("\n").replace(/\[\[([A-Z_]+)\|([^\]]*)\]\]/g, "⟦$1|$2⟧").replace(/\s+$/, "");
    out.set(id, parseAnnotated(markup));
  };
  for (const line of content.replace(/^﻿/, "").split(/\r?\n/)) {
    const m = line.match(BLOCK);
    if (m) {
      flush();
      id = m[1]!;
      buf = [];
    } else if (id) buf.push(line);
  }
  flush();
  return out;
}

const overlaps = (x: GoldEntity, y: GoldEntity) => x.span[0] < y.span[1] && y.span[0] < x.span[1];

/** Appariement glouton un-pour-un ; renvoie le nombre de paires. */
function matchCount(a: GoldEntity[], b: GoldEntity[], same: (x: GoldEntity, y: GoldEntity) => boolean): number {
  const used = new Set<number>();
  let n = 0;
  for (const x of a) {
    const j = b.findIndex((y, k) => !used.has(k) && same(x, y));
    if (j >= 0) {
      used.add(j);
      n++;
    }
  }
  return n;
}

const f1 = (m: number, na: number, nb: number) => (na + nb === 0 ? 1 : (2 * m) / (na + nb));

export function agreement(docs: Doc[]) {
  let na = 0;
  let nb = 0;
  let strict = 0;
  let typed = 0;
  let protection = 0;
  const perType = new Map<string, { m: number; na: number; nb: number }>();
  const disagreements: string[] = [];
  // Kappa par caractère.
  const confusion = new Map<string, number>();
  const labelsA = new Map<string, number>();
  const labelsB = new Map<string, number>();
  let chars = 0;

  for (const d of docs) {
    na += d.a.length;
    nb += d.b.length;
    strict += matchCount(d.a, d.b, (x, y) => x.entityType === y.entityType && x.span[0] === y.span[0] && x.span[1] === y.span[1]);
    typed += matchCount(d.a, d.b, (x, y) => x.entityType === y.entityType && overlaps(x, y));
    protection += matchCount(d.a, d.b, overlaps);
    for (const t of new Set([...d.a, ...d.b].map((e) => e.entityType))) {
      const ea = d.a.filter((e) => e.entityType === t);
      const eb = d.b.filter((e) => e.entityType === t);
      const p = perType.get(t) ?? { m: 0, na: 0, nb: 0 };
      p.m += matchCount(ea, eb, overlaps);
      p.na += ea.length;
      p.nb += eb.length;
      perType.set(t, p);
    }
    for (const x of d.a) {
      const y = d.b.find((e) => overlaps(x, e));
      if (!y) disagreements.push(`${d.id} : ${x.entityType} « ${x.value} » — absent chez l'annotateur 2`);
      else if (y.entityType !== x.entityType) disagreements.push(`${d.id} : « ${x.value} » ${x.entityType} / ${y.entityType}`);
      else if (y.span[0] !== x.span[0] || y.span[1] !== x.span[1]) disagreements.push(`${d.id} : bornes « ${x.value} » / « ${y.value} »`);
    }
    for (const y of d.b) if (!d.a.some((x) => overlaps(x, y))) disagreements.push(`${d.id} : ${y.entityType} « ${y.value} » — ajouté par l'annotateur 2`);

    const label = (ents: GoldEntity[], i: number) => ents.find((e) => i >= e.span[0] && i < e.span[1])?.entityType ?? "O";
    for (let i = 0; i < d.text.length; i++) {
      if (/\s/.test(d.text[i]!)) continue;
      const la = label(d.a, i);
      const lb = label(d.b, i);
      chars++;
      confusion.set(`${la}|${lb}`, (confusion.get(`${la}|${lb}`) ?? 0) + 1);
      labelsA.set(la, (labelsA.get(la) ?? 0) + 1);
      labelsB.set(lb, (labelsB.get(lb) ?? 0) + 1);
    }
  }
  let observed = 0;
  for (const [k, v] of confusion) if (k.split("|")[0] === k.split("|")[1]) observed += v;
  const po = chars ? observed / chars : 1;
  let pe = 0;
  for (const [l, v] of labelsA) pe += (v / chars) * ((labelsB.get(l) ?? 0) / chars);
  const kappa = pe === 1 ? 1 : (po - pe) / (1 - pe);

  return {
    documents: docs.length,
    entitiesA: na,
    entitiesB: nb,
    f1Strict: f1(strict, na, nb),
    f1Typed: f1(typed, na, nb),
    f1Protection: f1(protection, na, nb),
    kappaChars: kappa,
    perType: [...perType.entries()].map(([type, p]) => ({ type, na: p.na, nb: p.nb, f1: f1(p.m, p.na, p.nb) })).sort((x, y) => x.f1 - y.f1),
    disagreements,
  };
}

/** Lecture de Landis et Koch (1977). */
export function kappaLabel(k: number): string {
  if (k < 0.2) return "faible";
  if (k < 0.4) return "passable";
  if (k < 0.6) return "modéré";
  if (k < 0.8) return "substantiel";
  return "presque parfait";
}

function report(r: ReturnType<typeof agreement>): string {
  const p = (x: number) => `${(100 * x).toFixed(1).replace(".", ",")} %`;
  const lines = [
    `# Accord entre annotateurs — corpus manuel`,
    `Date : ${new Date().toISOString().slice(0, 10)} · ${r.documents} prompts · annotateur 1 (référence du corpus) : ${r.entitiesA} entités ; annotateur 2 : ${r.entitiesB} entités. Guide : [guide-annotation.md](../annotation/guide-annotation.md).`,
    `| Mesure | Accord |`,
    `| :--- | ---: |`,
    `| F1 strict (type et bornes identiques) | ${p(r.f1Strict)} |`,
    `| F1 chevauchement typé | ${p(r.f1Typed)} |`,
    `| F1 protection (chevauchement, tout type) | ${p(r.f1Protection)} |`,
    `| Kappa de Cohen par caractère | ${r.kappaChars.toFixed(3).replace(".", ",")} (${kappaLabel(r.kappaChars)}) |`,
    `## Par type (chevauchement typé, du moins au plus consensuel)`,
    `| Type | Annotateur 1 | Annotateur 2 | F1 |`,
    `| :--- | ---: | ---: | ---: |`,
    ...r.perType.map((t) => `| ${t.type} | ${t.na} | ${t.nb} | ${p(t.f1)} |`),
    `## Désaccords (${r.disagreements.length})`,
    ...r.disagreements.slice(0, 60).map((d) => `- ${d}`),
    `## Lecture`,
    `- Le F1 protection est l'accord qui compte pour la sécurité : ce que l'un ou l'autre masquerait. Un désaccord de type seul (SALARY / FINANCIAL_AMOUNT) ne change pas la protection.`,
    `- Kappa (Landis et Koch, 1977) : < 0,4 passable, 0,4–0,6 modéré, 0,6–0,8 substantiel, > 0,8 presque parfait.`,
    `- Les désaccords sont à arbitrer à deux ; une convention ajoutée au guide doit ensuite être appliquée à tout le corpus.`,
  ];
  return lines.reduce((md, line, i, all) => md + (i === 0 ? "" : (line.startsWith("|") && all[i - 1]!.startsWith("|")) || (line.startsWith("- ") && all[i - 1]!.startsWith("- ")) ? "\n" : "\n\n") + line, "") + "\n";
}

/** Corpus de référence face à une annotation donnée (fichier ou simulation). */
export function compare(second: Map<string, { text: string; gold: GoldEntity[] }>): Doc[] {
  const docs: Doc[] = [];
  for (const s of CORPUS_MANUEL) {
    const ref = parseAnnotated(s.markup);
    const other = second.get(s.id);
    if (!other) continue;
    if (other.text !== ref.text) {
      throw new Error(`${s.id} : le texte a été modifié par l'annotateur 2 (seules les balises doivent être ajoutées).`);
    }
    docs.push({ id: s.id, text: ref.text, a: ref.gold, b: other.gold });
  }
  return docs;
}

/** Simulation : un annotateur qui oublie une entité sur 8 et classe autrement les montants. */
function simulated(): Map<string, { text: string; gold: GoldEntity[] }> {
  const m = new Map<string, { text: string; gold: GoldEntity[] }>();
  let k = 0;
  for (const s of CORPUS_MANUEL) {
    const ref = parseAnnotated(s.markup);
    const gold = ref.gold
      .filter(() => ++k % 8 !== 0)
      .map((e) => (e.entityType === "SALARY" ? { ...e, entityType: "FINANCIAL_AMOUNT" as const } : e));
    m.set(s.id, { text: ref.text, gold });
  }
  return m;
}

function main() {
  if (process.argv[2] === "export") {
    mkdirSync(DIR, { recursive: true });
    const path = join(DIR, "a-annoter.txt");
    writeFileSync(path, exportText(), "utf8");
    console.log(`[accord] ${CORPUS_MANUEL.length} prompts → ${path}`);
    return;
  }
  if (process.argv.includes("--exemple")) {
    process.stdout.write(report(agreement(compare(simulated()))));
    return;
  }
  const path = join(DIR, "annotations-2.txt");
  if (!existsSync(path)) {
    console.log(`[accord] ${path} absent : faites annoter a-annoter.txt (pnpm eval:accord export) selon guide-annotation.md.`);
    return;
  }
  let content = readFileSync(path, "utf8");
  let mappingNote = "";
  if (process.argv.includes("--correspondance")) {
    const { text, counts } = applyTypeSynonyms(content);
    content = text;
    mappingNote = mappingReport(counts);
    console.log(`[accord] correspondance des types appliquée : ${Object.entries(counts).map(([k, n]) => `${k} ×${n}`).join(", ")}`);
  }
  const docs = compare(parseAnnotatedFile(content));
  if (docs.length < CORPUS_MANUEL.length) console.log(`[accord] ${CORPUS_MANUEL.length - docs.length} prompt(s) non annoté(s), ignoré(s)`);
  const r = agreement(docs);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "accord-annotateurs.md"), report(r) + mappingNote, "utf8");
  writeFileSync(join(OUT, "accord-annotateurs.json"), JSON.stringify(r, null, 2), "utf8");
  console.log(`[accord] F1 strict ${(100 * r.f1Strict).toFixed(1)} %, protection ${(100 * r.f1Protection).toFixed(1)} %, kappa ${r.kappaChars.toFixed(3)} → ${join(OUT, "accord-annotateurs.md")}`);
}

/**
 * Option --correspondance : le second annotateur a pu employer ses propres noms de types au lieu
 * de ceux du guide. Table fixe, décidée sans regarder les désaccords : on ne renomme que lorsque
 * le sens est sans ambiguïté ; null = type hors du guide, la balise est retirée (valeur gardée).
 * Le fichier de l'annotateur n'est pas modifié.
 */
export const TYPE_SYNONYMS: Record<string, string | null> = {
  PERSON_NAME: "PERSON",
  PHONE_NUMBER: "PHONE",
  INSURED_ID: "CNSS_INSURED_NUMBER",
  EMPLOYER_ID: "CNSS_EMPLOYER_NUMBER",
  HEALTH_INFORMATION: "MEDICAL",
  MEDICAL_INFORMATION: "MEDICAL",
  PAYMENT_CARD: "CREDIT_CARD",
  ACCESS_TOKEN: "API_KEY",
  AWS_ACCESS_KEY: "API_KEY",
  DATABASE_CREDENTIAL: "PASSWORD",
  CASE_ID: "INTERNAL_ID",
  ORDER_REFERENCE: "INTERNAL_ID",
  AGE: null,
};

export function applyTypeSynonyms(content: string): { text: string; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  const text = content.replace(/\[\[([A-Z_]+)\|([^\]]*)\]\]/g, (all, type: string, value: string) => {
    if (!(type in TYPE_SYNONYMS)) return all;
    counts[type] = (counts[type] ?? 0) + 1;
    const to = TYPE_SYNONYMS[type];
    return to ? `[[${to}|${value}]]` : value;
  });
  return { text, counts };
}

function mappingReport(counts: Record<string, number>): string {
  const rows = Object.entries(counts).map(([from, n]) => `| ${from} | ${TYPE_SYNONYMS[from] ?? "(hors guide, balise retirée)"} | ${n} |`);
  return [
    "",
    "## Correspondance des types (--correspondance)",
    "",
    "Le second annotateur a employé ses propres noms de types. Ils ont été ramenés à ceux du guide par une table fixe ([accord-annotateurs.ts](../../../tools/eval/accord-annotateurs.ts), `TYPE_SYNONYMS`) ; le fichier d'origine n'est pas modifié. Le F1 protection ne dépend pas des types ; le F1 strict et le kappa en dépendent.",
    "",
    "| Type de l'annotateur | Type du guide | Occurrences |",
    "| :--- | :--- | ---: |",
    ...rows,
    "",
  ].join("\n");
}

if (process.argv[1] && /accord-annotateurs\.ts$/.test(process.argv[1])) main();
