import type { EntityType, SensitiveEntity } from "@acg/shared";

/**
 * Réglages post-détection appliqués à toutes les couches (règles, NER…) :
 * bonus de contexte, listes d'autorisation / d'exclusion, seuils par type.
 * Inspiré du « context enhancer » et du `score_threshold` de Presidio.
 */
export interface DetectionTuning {
  /** Confiance minimale par type ; en dessous, l'entité est écartée. */
  thresholds?: Partial<Record<EntityType, number>>;
  defaultThreshold?: number;
  /** Bonus de confiance si un mot de contexte précède / suit l'entité (défaut 0.15). */
  contextBoost?: number;
  /** Valeurs jamais signalées (comparaison insensible à la casse) : « CNSS », nom d'un service public… */
  allowList?: string[];
  /** Valeurs toujours signalées, même si aucune couche ne les reconnaît. */
  denyList?: { value: string; entityType: EntityType }[];
}

export const DEFAULT_ENTITY_THRESHOLDS: Partial<Record<EntityType, number>> = {
  PERSON: 0.6,
  ADDRESS: 0.6,
  ORGANIZATION: 0.75,
  JOB_TITLE: 0.7,
  INTERNAL_ID: 0.65,
  FINANCIAL_AMOUNT: 0.6,
};

export const DEFAULT_TUNING: Required<Omit<DetectionTuning, "allowList" | "denyList">> & Pick<DetectionTuning, "allowList" | "denyList"> = {
  thresholds: DEFAULT_ENTITY_THRESHOLDS,
  defaultThreshold: 0.5,
  contextBoost: 0.15,
  allowList: [],
  denyList: [],
};

/** Une entité accompagnée d'un mot de contexte ne descend jamais sous ce plancher (Presidio : 0.4). */
const MIN_SCORE_WITH_CONTEXT = 0.4;
const WINDOW_BEFORE = 50;
const WINDOW_AFTER = 20;

/** Mots de contexte par type (français d'abord, quelques équivalents anglais). */
export const CONTEXT_WORDS: Partial<Record<EntityType, string[]>> = {
  PERSON: [
    "m.", "mme", "mlle", "monsieur", "madame", "mademoiselle", "dr", "docteur", "nom", "prénom", "prenom",
    "agent", "assuré", "assurée", "candidat", "candidate", "salarié", "salariée", "employé", "employée",
    "patient", "patiente", "collègue", "bénéficiaire", "ayant droit", "veuve", "veuf", "mr", "mrs", "name",
  ],
  ADDRESS: ["habite", "domicile", "domicilié", "adresse", "réside", "quartier", "rue", "carré", "vit à", "lives in", "address"],
  PHONE: ["tél", "tel", "téléphone", "numéro", "appeler", "appelle", "joindre", "contact", "whatsapp", "portable", "mobile", "phone"],
  EMAIL: ["mail", "courriel", "e-mail", "écrire", "adresse"],
  ORGANIZATION: ["société", "entreprise", "employeur", "sarl", "ets", "établissement", "cabinet"],
  IP_ADDRESS: ["ip", "serveur", "host", "hôte", "machine"],
  NATIONAL_ID: ["npi", "ifu", "cip", "passeport", "carte d'identité", "cni"],
  FINANCIAL_AMOUNT: ["montant", "virement", "payer", "solde", "dette", "impayé", "prime"],
};

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function hasContext(text: string, entity: SensitiveEntity): boolean {
  const words = CONTEXT_WORDS[entity.entityType];
  if (!words?.length) return false;
  const before = normalize(text.slice(Math.max(0, entity.span[0] - WINDOW_BEFORE), entity.span[0]));
  const after = normalize(text.slice(entity.span[1], entity.span[1] + WINDOW_AFTER));
  return words.some((w) => {
    const n = normalize(w);
    // Mot entier : « tel » ne doit pas matcher « hôtel », « nom » pas « économie ».
    const re = new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`);
    return re.test(before) || re.test(after);
  });
}

export function enhanceWithContext(text: string, entities: SensitiveEntity[], boost: number): SensitiveEntity[] {
  return entities.map((e) => {
    if (!hasContext(text, e)) return e;
    const confidence = Math.min(0.99, Math.max(MIN_SCORE_WITH_CONTEXT, e.confidence + boost));
    return { ...e, confidence: Math.round(confidence * 1000) / 1000 };
  });
}

export function applyAllowDenyLists(text: string, entities: SensitiveEntity[], tuning: DetectionTuning): SensitiveEntity[] {
  const allow = new Set((tuning.allowList ?? []).map((v) => normalize(v.trim())).filter(Boolean));
  let out = allow.size ? entities.filter((e) => !allow.has(normalize((e.value ?? text.slice(e.span[0], e.span[1])).trim()))) : entities;

  for (const deny of tuning.denyList ?? []) {
    if (!deny.value.trim()) continue;
    const haystack = text.toLowerCase();
    const needle = deny.value.toLowerCase();
    let from = 0;
    while (true) {
      const idx = haystack.indexOf(needle, from);
      if (idx < 0) break;
      const span: [number, number] = [idx, idx + needle.length];
      out = out.filter((e) => !(e.span[0] < span[1] && span[0] < e.span[1]));
      out.push({ entityType: deny.entityType, confidence: 0.99, span, layer: "rules", value: text.slice(span[0], span[1]) });
      from = span[1];
    }
  }
  return out.sort((a, b) => a.span[0] - b.span[0]);
}

export function applyThresholds(entities: SensitiveEntity[], tuning: DetectionTuning): SensitiveEntity[] {
  const fallback = tuning.defaultThreshold ?? DEFAULT_TUNING.defaultThreshold;
  return entities.filter((e) => e.confidence >= (tuning.thresholds?.[e.entityType] ?? fallback));
}

/** Pipeline complet : contexte → listes → seuils. */
export function tuneEntities(text: string, entities: SensitiveEntity[], tuning: DetectionTuning = {}): SensitiveEntity[] {
  const merged: DetectionTuning = {
    ...DEFAULT_TUNING,
    ...tuning,
    thresholds: { ...DEFAULT_TUNING.thresholds, ...tuning.thresholds },
  };
  const boosted = enhanceWithContext(text, entities, merged.contextBoost ?? DEFAULT_TUNING.contextBoost);
  return applyThresholds(applyAllowDenyLists(text, boosted, merged), merged);
}
