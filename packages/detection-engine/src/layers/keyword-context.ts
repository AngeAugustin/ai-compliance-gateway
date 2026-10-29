import type { ContextCategory, DetectionResult } from "@acg/shared";
import { now, type DetectionLayerProvider, type LayerStatus } from "./types.js";

const MODEL_VERSION = "keyword-context-2.0.0";

type Category = Exclude<ContextCategory, "Generique">;

/**
 * Lexiques métier (CNSS, administration béninoise). Poids 2 : terme propre au domaine ;
 * poids 1 : terme ambigu, partagé avec un autre domaine ou employé hors contexte
 * (« contrat », « production », « clinique » comme nom d'employeur…).
 * Les termes sont comparés sans accents ni casse, en mots entiers ; un « s » final
 * optionnel couvre le pluriel.
 */
const LEXICONS: Record<Category, Record<string, 1 | 2>> = {
  RH: {
    "recrutement": 2, "recruter": 2, "embauche": 2, "embaucher": 2, "licenciement": 2, "licencier": 2,
    "contrat de travail": 2, "cv": 2, "curriculum": 2, "bulletin de paie": 2, "fiche de paie": 2,
    "ressources humaines": 2, "onboarding": 2, "demission": 2, "attestation de travail": 2,
    "certificat de travail": 2, "entretien annuel": 2, "evaluation annuelle": 2, "entretien d'embauche": 2,
    "candidature": 2, "periode d'essai": 2, "preavis": 2, "heures supplementaires": 2, "fiche de poste": 2,
    "organigramme": 2, "mise a pied": 2, "sanction disciplinaire": 2, "absenteisme": 2, "teletravail": 2,
    "conge": 2, "salaire": 1, "equipe": 1, "candidat": 1, "poste": 1, "mutation": 1, "promotion": 1, "formation": 1,
    "effectif": 1, "employe": 1, "collaborateur": 1, "prime": 1, "rh": 1, "anciennete": 1,
  },
  Finance: {
    "cotisation": 2, "facture": 2, "facturation": 2, "tresorerie": 2, "budget": 2, "budgetaire": 2,
    "iban": 2, "rib": 2, "virement": 2, "mobile money": 2, "momo": 2, "fcfa": 2, "comptabilite": 2,
    "bilan": 2, "impaye": 2, "creance": 2, "recouvrement": 2, "echeancier": 2, "majoration": 2,
    "penalite de retard": 2, "compte de resultat": 2, "encaissement": 2, "decaissement": 2, "devis": 2,
    "bon de commande": 2, "arriere": 2, "releve bancaire": 2, "exercice comptable": 2, "amortissement": 2,
    "montant": 1, "paiement": 1, "remboursement": 1, "solde": 1, "taux": 1, "depense": 1, "recette": 1,
    "fournisseur": 1, "comptable": 1, "provision": 1, "audit": 1,
  },
  Juridique: {
    "contentieux": 2, "assignation": 2, "clause": 2, "litige": 2, "avocat": 2, "jurisprudence": 2,
    "conformite": 2, "rgpd": 2, "malabo": 2, "apdp": 2, "recours": 2, "voies de recours": 2,
    "juridiction": 2, "tribunal": 2, "cour d'appel": 2, "cour supreme": 2, "jugement": 2, "plainte": 2,
    "mise en demeure": 2, "huissier": 2, "code de securite sociale": 2, "code du travail": 2,
    "decret": 2, "reglementation": 2, "reglementaire": 2, "delai de prescription": 2, "penal": 2,
    "contrat": 1, "responsabilite": 1, "loi": 1, "article": 1, "procedure": 1, "sanction": 1,
    "ordonnance": 1, "prescription": 1, "juridique": 2, "legal": 1,
  },
  Technique: {
    "api": 2, "api key": 2, "cle api": 2, "mot de passe": 2, "serveur": 2, "base de donnees": 2,
    "deploiement": 2, "deployer": 2, "kubernetes": 2, "docker": 2, "endpoint": 2, "token": 2, "ssh": 2,
    "repository": 2, "git": 2, "bug": 2, "logs": 2, "script": 2, "python": 2, "javascript": 2,
    "typescript": 2, "java": 2, "sql": 2, "requete sql": 2, "http": 2, "json": 2, "firewall": 2,
    "pare-feu": 2, "vpn": 2, "adresse ip": 2, "authentification": 2, "authorization": 2, "bearer": 2,
    "oauth": 2, "tls": 2, "ssl": 2, "stack trace": 2, "regex": 2, "linux": 2, "cron": 2, "deboguer": 2,
    "developpeur": 2, "logiciel": 2, "application web": 2, "code source": 2,
    "production": 1, "requete": 1, "table": 1, "erreur": 1, "configuration": 1, "reseau": 1,
    "sauvegarde": 1, "migration": 1, "application": 1, "exception": 1, "csv": 1, "excel": 1, "macro": 1,
  },
  Medical: {
    "diagnostic": 2, "patient": 2, "pathologie": 2, "medical": 2, "medicale": 2, "medicaux": 2,
    "hopital": 2, "hospitalise": 2, "hospitalisee": 2, "hospitalisation": 2, "handicap": 2,
    "dossier medical": 2, "maladie": 2, "malade": 2, "accident du travail": 2, "maladie professionnelle": 2,
    "arret maladie": 2, "certificat medical": 2, "medecin": 2, "invalidite": 2, "incapacite": 2,
    "medicament": 2, "chirurgie": 2, "grossesse": 2, "accouchement": 2, "vaccination": 2, "sante": 2,
    "soins": 2, "diabete": 2, "hypertension": 2, "tuberculose": 2, "paludisme": 2, "vih": 2, "sida": 2,
    "cancer": 2, "asthme": 2, "hepatite": 2, "drepanocytose": 2, "epilepsie": 2, "depression": 2,
    "insuffisance renale": 2, "hernie discale": 2, "affection": 2,
    "ordonnance": 1, "prescription": 1, "traitement": 1, "clinique": 1, "pharmacie": 1, "infirmier": 1,
    "infirmiere": 1, "consultation": 1, "urgence": 1, "maternite": 1, "prise en charge": 1, "arret de travail": 1,
  },
};

/** À score égal, la catégorie la plus sensible l'emporte (ordre de CONTEXT_CATEGORY_RISK). */
const TIE_ORDER: Category[] = ["Medical", "Finance", "Juridique", "RH", "Technique"];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’`]/g, "'");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MATCHERS: { category: Category; term: string; weight: 1 | 2; regex: RegExp }[] = (
  Object.entries(LEXICONS) as [Category, Record<string, 1 | 2>][]
).flatMap(([category, terms]) =>
  Object.entries(terms).map(([term, weight]) => ({
    category,
    term,
    weight,
    // Mot entier : pas de lettre ni de chiffre de part et d'autre (« cv » ne matche pas dans un jeton).
    regex: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(normalize(term))}s?(?![\\p{L}\\p{N}])`, "u"),
  })),
);

export function classifyByKeywords(text: string): { contextCategory: ContextCategory; confidence: number; rationale: string } {
  const normalized = normalize(text);
  const scores = new Map<Category, { score: number; hits: string[] }>();
  for (const m of MATCHERS) {
    if (!m.regex.test(normalized)) continue;
    const entry = scores.get(m.category) ?? { score: 0, hits: [] };
    entry.score += m.weight;
    entry.hits.push(m.term);
    scores.set(m.category, entry);
  }
  const ranked = [...scores.entries()].sort(
    ([ca, a], [cb, b]) => b.score - a.score || TIE_ORDER.indexOf(ca) - TIE_ORDER.indexOf(cb),
  );
  const top = ranked[0];
  // Un seul terme ambigu ne suffit pas à sortir du générique.
  if (!top || top[1].score < 2) {
    return { contextCategory: "Generique", confidence: 0.4, rationale: "Aucun lexique métier dominant" };
  }
  const [category, { score, hits }] = top;
  const margin = score - (ranked[1]?.[1].score ?? 0);
  const confidence = Math.min(0.5 + score * 0.05 + margin * 0.05, 0.86);
  return {
    contextCategory: category,
    confidence: Math.round(confidence * 100) / 100,
    rationale: `Lexique ${category} : ${hits.slice(0, 3).join(", ")}`,
  };
}

export class KeywordContextLayer implements DetectionLayerProvider {
  readonly layer = "keyword_context" as const;

  async initialize(): Promise<LayerStatus> {
    return this.status();
  }

  status(): LayerStatus {
    return { layer: "keyword_context", available: true, degraded: false, modelVersion: MODEL_VERSION };
  }

  async detect(text: string): Promise<DetectionResult> {
    const started = now();
    const context = classifyByKeywords(text);
    return {
      layer: "keyword_context",
      entities: [],
      context,
      processingTimeMs: Math.round((now() - started) * 100) / 100,
      modelVersion: MODEL_VERSION,
      degraded: false,
    };
  }
}
