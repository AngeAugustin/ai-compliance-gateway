/**
 * Catégories d'entités sensibles détectées par le Detection Engine (FR-03).
 * Le vocabulaire est fermé : toute nouvelle catégorie doit être ajoutée ici
 * pour être reconnue par le Risk Scoring, le Policy Engine et le Dashboard.
 */
export const ENTITY_TYPES = [
  // Données personnelles
  "PERSON",
  "EMAIL",
  "PHONE",
  "DATE_OF_BIRTH",
  "ADDRESS",
  "NATIONAL_ID",
  "JOB_TITLE",
  "ORGANIZATION",
  // Données sociales / CNSS
  "CNSS_INSURED_NUMBER",
  "CNSS_EMPLOYER_NUMBER",
  "SALARY",
  "MEDICAL",
  // Données financières
  "IBAN",
  "BANK_ACCOUNT",
  "CREDIT_CARD",
  "MOBILE_MONEY",
  "FINANCIAL_AMOUNT",
  "TAX_ID",
  // Données techniques
  "API_KEY",
  "PASSWORD",
  "PRIVATE_KEY",
  "IP_ADDRESS",
  "INTERNAL_URL",
  "INTERNAL_ID",
  "CONNECTION_STRING",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export type EntityFamily = "personal" | "social" | "financial" | "technical";

export interface EntityTypeDefinition {
  family: EntityFamily;
  /** Sensibilité intrinsèque (0-1) utilisée par le facteur « sensibilité des entités » */
  sensitivity: number;
  /** Quasi-identifiant : ne révèle pas seul l'identité mais y contribue en combinaison (H2) */
  quasiIdentifier: boolean;
  /** Identifiant direct : révèle seul une identité ou un secret */
  directIdentifier: boolean;
  /** Préfixe de jeton utilisé par le Vault (action MASK) */
  tokenPrefix: string;
  label: string;
}

export const ENTITY_DEFINITIONS: Record<EntityType, EntityTypeDefinition> = {
  PERSON: { family: "personal", sensitivity: 0.55, quasiIdentifier: true, directIdentifier: false, tokenPrefix: "PERSONNE", label: "Nom de personne" },
  EMAIL: { family: "personal", sensitivity: 0.6, quasiIdentifier: true, directIdentifier: true, tokenPrefix: "EMAIL", label: "Adresse e-mail" },
  PHONE: { family: "personal", sensitivity: 0.6, quasiIdentifier: true, directIdentifier: true, tokenPrefix: "TELEPHONE", label: "Numéro de téléphone" },
  DATE_OF_BIRTH: { family: "personal", sensitivity: 0.5, quasiIdentifier: true, directIdentifier: false, tokenPrefix: "DATE_NAISSANCE", label: "Date de naissance" },
  ADDRESS: { family: "personal", sensitivity: 0.5, quasiIdentifier: true, directIdentifier: false, tokenPrefix: "ADRESSE", label: "Adresse postale" },
  NATIONAL_ID: { family: "personal", sensitivity: 0.9, quasiIdentifier: false, directIdentifier: true, tokenPrefix: "ID_NATIONAL", label: "Identifiant national (NPI/IFU)" },
  JOB_TITLE: { family: "personal", sensitivity: 0.25, quasiIdentifier: true, directIdentifier: false, tokenPrefix: "FONCTION", label: "Fonction / poste" },
  ORGANIZATION: { family: "personal", sensitivity: 0.2, quasiIdentifier: true, directIdentifier: false, tokenPrefix: "ORGANISATION", label: "Organisation" },
  CNSS_INSURED_NUMBER: { family: "social", sensitivity: 0.9, quasiIdentifier: false, directIdentifier: true, tokenPrefix: "NUM_ASSURE", label: "Numéro d'assuré CNSS" },
  CNSS_EMPLOYER_NUMBER: { family: "social", sensitivity: 0.7, quasiIdentifier: false, directIdentifier: true, tokenPrefix: "NUM_EMPLOYEUR", label: "Numéro employeur CNSS" },
  SALARY: { family: "social", sensitivity: 0.7, quasiIdentifier: true, directIdentifier: false, tokenPrefix: "SALAIRE", label: "Salaire / cotisation" },
  MEDICAL: { family: "social", sensitivity: 0.95, quasiIdentifier: false, directIdentifier: false, tokenPrefix: "MEDICAL", label: "Donnée médicale" },
  IBAN: { family: "financial", sensitivity: 0.85, quasiIdentifier: false, directIdentifier: true, tokenPrefix: "IBAN", label: "IBAN" },
  BANK_ACCOUNT: { family: "financial", sensitivity: 0.8, quasiIdentifier: false, directIdentifier: true, tokenPrefix: "COMPTE", label: "Numéro de compte bancaire" },
  CREDIT_CARD: { family: "financial", sensitivity: 0.95, quasiIdentifier: false, directIdentifier: true, tokenPrefix: "CARTE", label: "Carte bancaire" },
  MOBILE_MONEY: { family: "financial", sensitivity: 0.75, quasiIdentifier: false, directIdentifier: true, tokenPrefix: "MOBILE_MONEY", label: "Numéro mobile money" },
  FINANCIAL_AMOUNT: { family: "financial", sensitivity: 0.45, quasiIdentifier: false, directIdentifier: false, tokenPrefix: "MONTANT", label: "Montant financier" },
  TAX_ID: { family: "financial", sensitivity: 0.75, quasiIdentifier: false, directIdentifier: true, tokenPrefix: "IFU", label: "Identifiant fiscal" },
  API_KEY: { family: "technical", sensitivity: 0.95, quasiIdentifier: false, directIdentifier: true, tokenPrefix: "CLE_API", label: "Clé d'API" },
  PASSWORD: { family: "technical", sensitivity: 0.95, quasiIdentifier: false, directIdentifier: true, tokenPrefix: "MOT_DE_PASSE", label: "Mot de passe" },
  PRIVATE_KEY: { family: "technical", sensitivity: 1, quasiIdentifier: false, directIdentifier: true, tokenPrefix: "CLE_PRIVEE", label: "Clé privée" },
  IP_ADDRESS: { family: "technical", sensitivity: 0.4, quasiIdentifier: true, directIdentifier: false, tokenPrefix: "IP", label: "Adresse IP" },
  INTERNAL_URL: { family: "technical", sensitivity: 0.45, quasiIdentifier: false, directIdentifier: false, tokenPrefix: "URL_INTERNE", label: "URL interne" },
  INTERNAL_ID: { family: "technical", sensitivity: 0.35, quasiIdentifier: true, directIdentifier: false, tokenPrefix: "ID_INTERNE", label: "Identifiant interne" },
  CONNECTION_STRING: { family: "technical", sensitivity: 1, quasiIdentifier: false, directIdentifier: true, tokenPrefix: "CHAINE_CONNEXION", label: "Chaîne de connexion" },
};

export function isEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value);
}

export const CONTEXT_CATEGORIES = ["RH", "Finance", "Juridique", "Technique", "Medical", "Generique"] as const;
export type ContextCategory = (typeof CONTEXT_CATEGORIES)[number];

export const CONTEXT_CATEGORY_RISK: Record<ContextCategory, number> = {
  RH: 0.7,
  Finance: 0.8,
  Juridique: 0.7,
  Technique: 0.6,
  Medical: 0.9,
  Generique: 0.1,
};
