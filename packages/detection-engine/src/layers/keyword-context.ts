import type { ContextCategory, DetectionResult } from "@acg/shared";
import { now, type DetectionLayerProvider, type LayerStatus } from "./types.js";

const MODEL_VERSION = "keyword-context-1.0.0";

const LEXICONS: Record<Exclude<ContextCategory, "Generique">, string[]> = {
  RH: [
    "recrutement", "embauche", "licenciement", "contrat de travail", "cv", "curriculum",
    "salaire", "bulletin de paie", "congé", "évaluation annuelle", "poste", "candidat",
    "ressources humaines", "onboarding", "démission",
  ],
  Finance: [
    "cotisation", "facture", "trésorerie", "budget", "iban", "virement", "mobile money",
    "momo", "fcfa", "comptabilité", "bilan", "impayé", "créance", "montant", "paiement",
  ],
  Juridique: [
    "contentieux", "assignation", "contrat", "clause", "litige", "avocat", "jurisprudence",
    "conformité", "rgpd", "malabo", "apdp", "responsabilité",
  ],
  Technique: [
    "api key", "mot de passe", "serveur", "base de données", "déploiement", "kubernetes",
    "endpoint", "token", "ssh", "repository", "bug", "production", "logs",
  ],
  Medical: [
    "diagnostic", "patient", "ordonnance", "pathologie", "médical", "hôpital", "handicap",
    "affection", "dossier médical", "prescription",
  ],
};

export function classifyByKeywords(text: string): { contextCategory: ContextCategory; confidence: number; rationale: string } {
  const lower = text.toLowerCase();
  const scores: { category: ContextCategory; hits: string[] }[] = [];
  for (const [category, words] of Object.entries(LEXICONS) as [Exclude<ContextCategory, "Generique">, string[]][]) {
    const hits = words.filter((w) => lower.includes(w));
    if (hits.length > 0) scores.push({ category, hits });
  }
  scores.sort((a, b) => b.hits.length - a.hits.length);
  if (scores.length === 0) {
    return { contextCategory: "Generique", confidence: 0.4, rationale: "Aucun lexique métier dominant" };
  }
  const top = scores[0]!;
  const confidence = Math.min(0.55 + top.hits.length * 0.08, 0.86);
  return {
    contextCategory: top.category,
    confidence,
    rationale: `Lexique ${top.category} : ${top.hits.slice(0, 3).join(", ")}`,
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
