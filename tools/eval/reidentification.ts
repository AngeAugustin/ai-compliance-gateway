import { ann as A, type AnnotatedSource } from "./annotation.js";
import { formatDate, type Person } from "./population.js";
import type { Rng } from "./rng.js";

/**
 * Expérience de ré-identification (attaque par recoupement, Sweeney 2002).
 *
 * Hypothèse d'attaquant défavorable : il lit le prompt tel qu'il sort de la passerelle
 * (masqué) et dispose du registre complet des assurés (fuite d'une base RH, par exemple).
 * Il cherche dans le texte toute valeur d'attribut du registre — nom, date de naissance,
 * commune, employeur, fonction, identifiants — et garde les personnes compatibles.
 * La personne est ré-identifiée si un seul candidat reste et que c'est la bonne.
 */

export type ReidVariant = "direct" | "quasi-identifiants" | "identifiants" | "contact";
export const REID_VARIANTS: ReidVariant[] = ["direct", "quasi-identifiants", "identifiants", "contact"];

export interface ReidScenario extends AnnotatedSource {
  targetId: number;
  variant: ReidVariant;
}

const e = (p: Person) => (p.sexe === "F" ? "e" : "");
const ne = (p: Person) => (p.sexe === "F" ? "née" : "né");

const BUILDERS: Record<ReidVariant, (rng: Rng, p: Person) => string> = {
  direct: (rng, p) =>
    `Rédige un courrier à ${p.sexe === "F" ? "Mme" : "M."} ${A("PERSON", `${p.prenom} ${p.nom}`)}, ${A("JOB_TITLE", p.fonction)} chez ${A("ORGANIZATION", p.employeur)}, ${ne(p)} le ${A("DATE_OF_BIRTH", formatDate(p.naissance, rng.pick(["slash", "lettres"] as const)))}, domicilié${e(p)} à ${A("ADDRESS", p.quartier)} (${A("ADDRESS", p.commune)}), au sujet de sa réclamation.`,
  "quasi-identifiants": (rng, p) =>
    `Un${e(p)} ${A("JOB_TITLE", p.fonction)} de ${A("ORGANIZATION", p.employeur)}, ${ne(p)} le ${A("DATE_OF_BIRTH", formatDate(p.naissance, rng.pick(["slash", "lettres"] as const)))} et habitant ${A("ADDRESS", p.commune)}, conteste le calcul de ses cotisations. Rédige une réponse type.`,
  identifiants: (_rng, p) =>
    `L'assuré${e(p)} n° ${A("CNSS_INSURED_NUMBER", p.assure)}, joignable au ${A("PHONE", p.telephone)}, demande le relevé de sa carrière. Prépare la réponse.`,
  contact: (_rng, p) =>
    `Prépare le message pour ${A("PERSON", `${p.prenom} ${p.nom}`)} (${A("EMAIL", p.email)}) : son dossier déposé à ${A("ADDRESS", p.commune)} est complet.`,
};

export function generateReidScenarios(rng: Rng, people: Person[], perVariant: number): ReidScenario[] {
  const out: ReidScenario[] = [];
  for (const variant of REID_VARIANTS) {
    for (let i = 0; i < perVariant; i++) {
      const p = rng.pick(people);
      out.push({
        id: `reid-${variant}-${String(i + 1).padStart(3, "0")}`,
        context: null,
        markup: BUILDERS[variant](rng, p),
        targetId: p.id,
        variant,
      });
    }
  }
  return out;
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWord(haystack: string, needle: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(needle)}(?![\\p{L}\\p{N}])`, "u").test(haystack);
}

type Attribute = { name: string; values: (p: Person) => string[]; kind: "mot" | "texte" | "chiffres" };

/** Ordre : du plus discriminant au moins discriminant. */
const ATTRIBUTES: Attribute[] = [
  { name: "npi", kind: "chiffres", values: (p) => [p.npi] },
  { name: "assure", kind: "texte", values: (p) => [norm(p.assure)] },
  { name: "telephone", kind: "chiffres", values: (p) => [p.telephone.replace(/\D/g, "").slice(-10), p.momo.replace(/\D/g, "").slice(-10)] },
  { name: "email", kind: "texte", values: (p) => [p.email.toLowerCase()] },
  { name: "iban", kind: "texte", values: (p) => [p.iban.replace(/\s/g, "").toLowerCase()] },
  { name: "naissance", kind: "texte", values: (p) => (["slash", "lettres", "iso"] as const).map((s) => norm(formatDate(p.naissance, s))) },
  { name: "nom", kind: "mot", values: (p) => [norm(p.nom)] },
  { name: "prenom", kind: "mot", values: (p) => [norm(p.prenom)] },
  { name: "employeur", kind: "mot", values: (p) => [norm(p.employeur)] },
  { name: "quartier", kind: "mot", values: (p) => [norm(p.quartier)] },
  { name: "commune", kind: "mot", values: (p) => [norm(p.commune)] },
  { name: "fonction", kind: "mot", values: (p) => [norm(p.fonction)] },
];

export interface AttackIndex {
  people: Person[];
  byAttribute: { attribute: Attribute; index: Map<string, number[]> }[];
}

export function buildAttackIndex(people: Person[]): AttackIndex {
  return {
    people,
    byAttribute: ATTRIBUTES.map((attribute) => {
      const index = new Map<string, number[]>();
      for (const p of people) {
        for (const v of new Set(attribute.values(p))) {
          const list = index.get(v) ?? [];
          list.push(p.id);
          index.set(v, list);
        }
      }
      return { attribute, index };
    }),
  };
}

/** Indice grammatical du sexe (« née », « Mme », « domiciliée »…). */
function sexHint(text: string): "F" | "M" | null {
  // Accents conservés : « né » (naissance) ≠ « ne » (négation).
  const t = text.toLowerCase();
  const f = /(?<![\p{L}])(mme|madame|née|domiciliée|employée|hospitalisée|assurée)(?![\p{L}])/u.test(t);
  const m = /(?<![\p{L}])(m\.|monsieur|né|domicilié|employé|hospitalisé|assuré)(?![\p{L}])/u.test(t);
  if (f && !m) return "F";
  if (m && !f) return "M";
  return null;
}

export interface AttackResult {
  candidates: number;
  reidentified: boolean;
  targetAmongCandidates: boolean;
  evidence: string[];
}

export function attack(text: string, targetId: number, index: AttackIndex): AttackResult {
  const normalized = norm(text);
  const compact = normalized.replace(/\s/g, "");
  const digitRuns = new Set(
    [...text.matchAll(/\+?\d[\d\s.-]{6,}\d/g)].flatMap((m) => {
      const d = m[0].replace(/\D/g, "");
      return [d, d.slice(-10)];
    }),
  );

  let candidates = new Set(index.people.map((p) => p.id));
  const evidence: string[] = [];
  for (const { attribute, index: values } of index.byAttribute) {
    const hits = new Set<number>();
    for (const [value, ids] of values) {
      const found =
        attribute.kind === "chiffres"
          ? digitRuns.has(value)
          : attribute.kind === "mot"
            ? normalized.includes(value) && containsWord(normalized, value)
            : normalized.includes(value) || compact.includes(value.replace(/\s/g, ""));
      if (found) for (const id of ids) hits.add(id);
    }
    if (hits.size === 0) continue;
    const narrowed = new Set([...candidates].filter((id) => hits.has(id)));
    // Un recoupement contradictoire (homonymie, valeur fortuite) est ignoré plutôt que de tout éliminer.
    if (narrowed.size === 0) continue;
    candidates = narrowed;
    evidence.push(attribute.name);
  }
  const sex = sexHint(text);
  if (sex) {
    const narrowed = new Set([...candidates].filter((id) => index.people[id]!.sexe === sex));
    if (narrowed.size > 0 && narrowed.size < candidates.size) {
      candidates = narrowed;
      evidence.push("sexe");
    }
  }
  return {
    candidates: candidates.size,
    reidentified: candidates.size === 1 && candidates.has(targetId),
    targetAmongCandidates: candidates.has(targetId),
    evidence,
  };
}
