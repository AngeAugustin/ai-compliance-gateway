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
    regex: /\bcnss\s+([A-Z0-9]{6,14})\b/gi,
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
    confidence: 0.8,
    regex: /\b(?:n[ée](?:e)?\s+le|date\s+de\s+naissance|n[ée](?:e)?)\s*[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/gi,
  },
  {
    id: "salary",
    entityType: "SALARY",
    confidence: 0.82,
    regex: /\b(?:salaire(?:\s+(?:brut|net|mensuel))?|cotisation(?:s)?(?:\s+sociale(?:s)?)?|r[ée]mun[ée]ration)\s*[:\s]*([\d]{1,3}(?:[ \u00a0.]?\d{3})*(?:[.,]\d{1,2})?\s*(?:FCFA|XOF|EUR|€)?)/gi,
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
];

export { hasKeyword, nearby };
