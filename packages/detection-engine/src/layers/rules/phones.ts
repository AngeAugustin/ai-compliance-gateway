import { findPhoneNumbersInText } from "libphonenumber-js/max";
import { beninMobileOperator, normalizeBeninPhone } from "./validators.js";

export interface PhoneCandidate {
  start: number;
  end: number;
  value: string;
  confidence: number;
  /** Pays ISO 3166 déduit par libphonenumber (BJ, FR, US…) ou « BJ-legacy ». */
  country: string;
}

/**
 * Régions testées pour les numéros écrits sans indicatif. Le Bénin d'abord
 * (plan 2024 en 01XXXXXXXX), puis la France (diaspora, partenaires).
 * Les numéros au format international (+CC) sont reconnus quel que soit le pays.
 */
const NATIONAL_REGIONS = ["BJ", "FR"] as const;

const PHONE_CONTEXT = /(t[ée]l|t[ée]l[ée]phone|num[ée]ro|appel|contact|joindre|whatsapp|portable|mobile|cell|phone|call|sms)/i;

/** Ancien plan béninois à 8 chiffres (avant 2024) : « 97 12 34 56 ». */
const LEGACY_BENIN = /(?<![\d+])(\d{2})[\s.-]?(\d{2})[\s.-]?(\d{2})[\s.-]?(\d{2})(?![\d])/g;

/**
 * Numéros de téléphone via libphonenumber-js (portage JS de la bibliothèque
 * Google utilisée par Presidio). Validation par plan de numérotation : un
 * numéro syntaxiquement plausible mais non attribué est rejeté.
 */
export function findPhoneCandidates(text: string): PhoneCandidate[] {
  const out: PhoneCandidate[] = [];
  const taken = (s: number, e: number) => out.some((c) => c.start < e && s < c.end);

  for (const region of NATIONAL_REGIONS) {
    for (const found of findPhoneNumbersInText(text, { defaultCountry: region })) {
      const raw = text.slice(found.startsAt, found.endsAt);
      // Sans indicatif, un numéro national commence par 0 (BJ « 01 », FR « 0X »).
      // Écarte les faux positifs du type « 192.168.1.10 » interprété comme numéro FR.
      if (!/^(\+|00|0)/.test(raw)) continue;
      if (taken(found.startsAt, found.endsAt)) continue;
      out.push({
        start: found.startsAt,
        end: found.endsAt,
        value: raw,
        confidence: raw.startsWith("+") || raw.startsWith("00") ? 0.88 : 0.78,
        country: found.number.country ?? region,
      });
    }
  }

  // Ancien format béninois : trop ambigu seul (8 chiffres), exigé avec préfixe
  // opérateur valide ET mot de contexte téléphonique à proximité.
  LEGACY_BENIN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LEGACY_BENIN.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (taken(start, end)) continue;
    const local = normalizeBeninPhone(m[0]);
    if (!local || !beninMobileOperator(local)) continue;
    const before = text.slice(Math.max(0, start - 40), start);
    if (!PHONE_CONTEXT.test(before) && !/(momo|mobile\s*money|moov|celtiis|mtn)/i.test(before)) continue;
    out.push({ start, end, value: m[0], confidence: 0.75, country: "BJ-legacy" });
  }

  return out.sort((a, b) => a.start - b.start);
}
