import type { EntityType } from "@acg/shared";
import { beninMobileOperator, isShannonHighEntropy, isValidIban, isValidLuhn, normalizeBeninPhone } from "./validators.js";

export interface RulePattern {
  id: string;
  entityType: EntityType;
  /** Confiance de base si le motif et le validateur passent. */
  confidence: number;
  regex: RegExp;
  validate?: (match: string, text: string) => boolean;
  /** Si défini, n'émet que si l'un des mots-clés est présent dans une fenêtre autour du match. */
  contextKeywords?: string[];
}

const MONTHS_FR = "janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre";
const MONTHS_EN = "january|february|march|april|may|june|july|august|september|october|november|december";

/** Date numérique (12/03/1985, 1985-03-12) ou en toutes lettres (1er mars 1985, March 12, 1985). */
const DATE_VALUE = [
  String.raw`\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}`,
  String.raw`\d{4}-\d{2}-\d{2}`,
  String.raw`(?:1er|\d{1,2})\s+(?:${MONTHS_FR}|${MONTHS_EN})\s+\d{4}`,
  String.raw`(?:${MONTHS_EN})\s+\d{1,2},?\s+\d{4}`,
].join("|");

/** Pathologies courantes — liste non exhaustive, à enrichir avec la direction médicale. */
const MEDICAL_CONDITIONS = [
  String.raw`diab[èe]te(?:\s+de\s+type\s+[12])?`,
  "VIH",
  "sida",
  String.raw`s[ée]ropositi(?:f|ve|vit[ée])`,
  String.raw`hypertension(?:\s+art[ée]rielle)?`,
  String.raw`cancer(?:\s+du\s+[a-zé]+|\s+de\s+la\s+[a-zé]+)?`,
  "tuberculose",
  "paludisme",
  String.raw`dr[ée]panocytose`,
  String.raw`h[ée]patite\s+[ABC]`,
  String.raw`d[ée]pression`,
  String.raw`[ée]pilepsie`,
  "asthme",
  String.raw`insuffisance\s+(?:r[ée]nale|cardiaque|respiratoire)`,
  "AVC",
  String.raw`schizophr[ée]nie`,
  String.raw`trouble\s+bipolaire`,
  "alzheimer",
  "parkinson",
  String.raw`leuc[ée]mie`,
  String.raw`scl[ée]rose\s+en\s+plaques`,
  String.raw`hernie\s+discale`,
  String.raw`burn-?out`,
].join("|");

/** Clé du NIR français (n° de sécurité sociale, 15 caractères) : 97 − (corps mod 97). */
export function isValidNir(raw: string): boolean {
  const s = raw.replace(/\s/g, "").toUpperCase();
  if (!/^[12]\d{4}(?:\d{2}|2A|2B)\d{6}\d{2}$/.test(s)) return false;
  const body = s.slice(0, 13).replace("2A", "19").replace("2B", "18");
  return 97 - Number(BigInt(body) % 97n) === Number(s.slice(13));
}

function nearby(text: string, index: number, window = 48): string {
  return text.slice(Math.max(0, index - window), Math.min(text.length, index + window)).toLowerCase();
}

function hasKeyword(text: string, index: number, keywords: string[]): boolean {
  const slice = nearby(text, index);
  return keywords.some((k) => slice.includes(k.toLowerCase()));
}

export const RULE_PATTERNS: RulePattern[] = [
  {
    id: "private-key",
    entityType: "PRIVATE_KEY",
    confidence: 0.99,
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
  },
  {
    id: "connection-string",
    entityType: "CONNECTION_STRING",
    confidence: 0.95,
    regex: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^\s"'<>]+/gi,
  },
  {
    id: "api-key-bearer",
    entityType: "API_KEY",
    confidence: 0.92,
    regex: /\b(?:sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|xai-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16})\b/g,
  },
  {
    id: "jwt",
    entityType: "API_KEY",
    confidence: 0.93,
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  },
  {
    id: "bearer-token",
    entityType: "API_KEY",
    confidence: 0.86,
    regex: /\bBearer\s+([A-Za-z0-9._~+/-]{20,}=*)/g,
  },
  {
    id: "api-key-generic",
    entityType: "API_KEY",
    confidence: 0.78,
    regex: /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"]?([A-Za-z0-9_\-/+=]{16,})['"]?/gi,
    validate: (match) => isShannonHighEntropy(match.replace(/^[^:=]+[:=]\s*['"]?/, ""), 3.2),
  },
  {
    id: "password-assignment",
    entityType: "PASSWORD",
    confidence: 0.88,
    regex: /\b(?:password|mot\s+de\s+passe|mdp|passwd)\s*[:=]\s*['"]?([^\s'"]{6,})['"]?/gi,
  },
  {
    id: "credential-email-slash",
    entityType: "PASSWORD",
    confidence: 0.82,
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\s*\/\s*([^\s/,;]{4,})\b/gi,
    contextKeywords: ["identifiant", "mdp", "password", "mot de passe", "compte", "demo", "connexion", "espace"],
  },
  {
    id: "iban",
    entityType: "IBAN",
    confidence: 0.97,
    regex: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g,
    validate: (m) => isValidIban(m),
  },
  {
    id: "credit-card",
    entityType: "CREDIT_CARD",
    confidence: 0.95,
    regex: /\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))(?:[ -]?\d{4}){3}\b/g,
    validate: (m) => isValidLuhn(m),
  },
  {
    id: "email",
    entityType: "EMAIL",
    confidence: 0.98,
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
  {
    id: "mobile-money-labeled",
    entityType: "MOBILE_MONEY",
    confidence: 0.93,
    regex: /(?:momo|moov\s*money|mobile\s*money|celtiis\s*money|mtn\s*momo)[^\d+]{0,20}((?:\+?229[\s.-]?)?(?:01[\s.-]?)?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2})/gi,
    validate: (m) => normalizeBeninPhone(m) !== null,
  },
  {
    id: "phone-benin",
    entityType: "PHONE",
    confidence: 0.9,
    regex: /(?:\+229[\s.-]?|00\s*229[\s.-]?)(?:01[\s.-]?)?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}|(?:^|[^\d])01[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}(?!\d)/g,
    validate: (m, text) => {
      const local = normalizeBeninPhone(m);
      if (!local) return false;
      const idx = text.indexOf(m);
      if (hasKeyword(text, idx, ["momo", "mobile money", "moov money", "celtiis"])) return false;
      return beninMobileOperator(local) !== null || local.startsWith("01");
    },
  },
  {
    id: "cnss-insured",
    entityType: "CNSS_INSURED_NUMBER",
    confidence: 0.9,
    // « CNSS B20481736 », « assuré n° … », « n° d'assuré … », « numéro d'assurée … », « matricule CNSS … ».
    regex:
      /\b(?:cnss|assur[ée]e?\s+(?:cnss\s+)?n[°o]\.?|n[°o]\.?\s*d['’]\s*assur[ée]e?|num[ée]ro\s+d['’]\s*assur[ée]e?|matricule\s+(?:cnss|assur[ée]e?))\s*[:\s]\s*([A-Z0-9]{6,14})\b/gi,
    // Un identifiant contient des chiffres : « CNSS Parakou » n'en est pas un.
    validate: (m) => /\d/.test(m.split(/[:\s]+/).pop() ?? ""),
  },
  {
    id: "cnss-employer",
    entityType: "CNSS_EMPLOYER_NUMBER",
    confidence: 0.88,
    regex: /\b(?:n[°o]?\s*employeur|employeur\s*cnss|matricule\s*employeur)\s*[:\s]*([A-Z0-9]{5,14})\b/gi,
  },
  {
    id: "national-id",
    entityType: "NATIONAL_ID",
    confidence: 0.86,
    regex: /\b(?:NPI|IFU|CIP)\s*[:\s]*([A-Z0-9]{8,16})\b/gi,
  },
  {
    id: "tax-id",
    entityType: "TAX_ID",
    confidence: 0.84,
    regex: /\b(?:identifiant\s+fiscal|n[°o]?\s*fiscal)\s*[:\s]*([A-Z0-9]{8,16})\b/gi,
  },
  {
    id: "date-of-birth",
    entityType: "DATE_OF_BIRTH",
    confidence: 0.85,
    // Une date n'est sensible que liée à une naissance : « réunion le 12 mars » reste autorisé.
    regex: new RegExp(
      String.raw`\b(?:n[ée]e?\s+le|n[ée]e?|date\s+de\s+naissance|naissance|DOB|date\s+of\s+birth|born(?:\s+on)?)\s*[:\s]*(${DATE_VALUE})(?![\d])`,
      "gi",
    ),
  },
  {
    id: "passport",
    entityType: "NATIONAL_ID",
    confidence: 0.86,
    regex: /\b(?:passeport|passport)\b(?:\s+(?:n[°o]|num[ée]ro|number|no|est|is))*\s*[:#]?\s*([A-Z]{1,2}\d{6,8})\b/gi,
  },
  {
    id: "fr-nir",
    entityType: "NATIONAL_ID",
    confidence: 0.9,
    regex: /\b[12]\s?\d{2}\s?(?:0[1-9]|1[0-2])\s?(?:\d{2}|2A|2B)\s?\d{3}\s?\d{3}\s?\d{2}\b/g,
    validate: (m) => isValidNir(m),
  },
  {
    id: "salary",
    entityType: "SALARY",
    confidence: 0.82,
    // Le mot-clé peut être suivi de quelques mots (« salaire brut mensuel de », « cotisations du
    // trimestre : », « prime de transport ») ; seul le montant est capturé, sans la devise.
    regex:
      /\b(?:salaires?|cotisations?|r[ée]mun[ée]rations?|primes?|appointements)(?:\s+(?!\d)[\p{L}'’]+){0,4}?\s*[:=]?\s*(\d{1,3}(?:[ \u00a0.]?\d{3})+(?:[.,]\d{1,2})?)(?=\s*(?:F\b|FCFA|XOF|EUR|€|francs?\b)|[\s.,;)]|$)/giu,
  },
  {
    id: "financial-amount",
    entityType: "FINANCIAL_AMOUNT",
    confidence: 0.75,
    regex: /\b(\d{1,3}(?:[ \u00a0.]?\d{3})+(?:[.,]\d{1,2})?)\s*(?:FCFA|XOF|EUR|€|USD|\$)\b/g,
  },
  {
    id: "ipv4",
    entityType: "IP_ADDRESS",
    confidence: 0.85,
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g,
    validate: (m) => !m.startsWith("0.") && m !== "0.0.0.0" && m !== "127.0.0.1",
  },
  {
    id: "internal-url",
    entityType: "INTERNAL_URL",
    confidence: 0.8,
    regex: /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|[a-z0-9-]+\.(?:internal|local|intranet|cnss\.bj))(?::\d+)?(?:\/[^\s"'<>]*)?/gi,
  },
  {
    id: "internal-id",
    entityType: "INTERNAL_ID",
    confidence: 0.7,
    regex: /\b(?:ticket|dossier|ref(?:erence)?|id\s*interne)\s*[:#]?\s*([A-Z]{2,5}-?\d{4,12})\b/gi,
    contextKeywords: ["ticket", "dossier", "reference", "référence", "interne"],
  },
  {
    id: "medical-labeled",
    entityType: "MEDICAL",
    confidence: 0.8,
    regex: /\b(?:diagnostic|pathologie|ordonnance|dossier\s+m[ée]dical|affection|handicap)\s*[:\s]+([^\n.]{8,80})/gi,
  },
  {
    // Pathologie nommée sans étiquette « diagnostic : » — exige un contexte clinique proche.
    id: "medical-condition",
    entityType: "MEDICAL",
    confidence: 0.82,
    regex: new RegExp(String.raw`(?<![A-Za-zÀ-ÿ])(?:${MEDICAL_CONDITIONS})(?![A-Za-zÀ-ÿ])`, "gi"),
    contextKeywords: [
      "patient", "malade", "maladie", "souffre", "souffrant", "atteint", "diagnostiqu", "traitement", "traité",
      "hospitalis", "médecin", "medecin", "médical", "medical", "arrêt", "certificat", "soins", "suivi pour",
      "porteur", "porteuse", "suffers", "diagnosed",
    ],
  },
];

export { hasKeyword, nearby };
