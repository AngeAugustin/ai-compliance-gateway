/**
 * Référentiels réglementaires instanciables (FR-12, DAT §23).
 * Le tableau de correspondance composant -> références est substituable
 * selon la juridiction de déploiement.
 */
export type GatewayComponent =
  | "detection_engine"
  | "risk_scoring_engine"
  | "policy_engine"
  | "anonymization_vault"
  | "audit_store"
  | "dashboard";

export interface RegulatoryFrameworkDefinition {
  id: string;
  name: string;
  description: string;
  applicableJurisdictions: string[];
  componentReferences: Record<GatewayComponent, string[]>;
}

const OWASP_NIST_BASE: Record<GatewayComponent, string[]> = {
  detection_engine: ["OWASP-LLM02", "NIST-MAP", "NIST-MEASURE"],
  risk_scoring_engine: ["OWASP-LLM02", "OWASP-LLM07", "NIST-MEASURE"],
  policy_engine: ["OWASP-LLM02", "OWASP-LLM06", "NIST-MANAGE"],
  anonymization_vault: ["OWASP-LLM02", "NIST-MANAGE"],
  audit_store: ["OWASP-LLM07", "NIST-MANAGE", "NIST-GOVERN"],
  dashboard: ["NIST-GOVERN"],
};

function merge(regional: Partial<Record<GatewayComponent, string[]>>): Record<GatewayComponent, string[]> {
  const out = { ...OWASP_NIST_BASE };
  for (const key of Object.keys(regional) as GatewayComponent[]) {
    out[key] = [...OWASP_NIST_BASE[key], ...(regional[key] ?? [])];
  }
  return out;
}

export const DEFAULT_REGULATORY_FRAMEWORKS: RegulatoryFrameworkDefinition[] = [
  {
    id: "BJ_MALABO",
    name: "Bénin — Convention de Malabo / CEDEAO / APDP",
    description:
      "Convention de l'Union africaine sur la cybersécurité et la protection des données (2014, ratifiée par le Bénin en 2024), Acte additionnel CEDEAO (2010), Code du numérique et APDP Bénin.",
    applicableJurisdictions: ["BJ", "ECOWAS"],
    componentReferences: merge({
      detection_engine: ["MALABO-ART14"],
      risk_scoring_engine: ["MALABO-ART14-TRANSFERT"],
      policy_engine: ["CEDEAO-2010"],
      anonymization_vault: ["MALABO-MINIMISATION", "APDP-BJ"],
      audit_store: ["APDP-BJ-TRACABILITE"],
      dashboard: ["APDP-BJ-REPORTING"],
    }),
  },
  {
    id: "EU_GDPR_AIACT",
    name: "Union européenne — RGPD / EU AI Act",
    description: "Règlement général sur la protection des données (2016/679) et règlement sur l'intelligence artificielle (2024/1689).",
    applicableJurisdictions: ["EU", "FR", "DE", "BE", "ES", "IT", "NL", "PT"],
    componentReferences: merge({
      detection_engine: ["RGPD-ART9", "RGPD-ART32"],
      risk_scoring_engine: ["RGPD-ART44", "AIACT-ART9"],
      policy_engine: ["RGPD-ART25", "AIACT-ART26"],
      anonymization_vault: ["RGPD-ART5-1C", "RGPD-ART32"],
      audit_store: ["RGPD-ART30", "AIACT-ART12"],
      dashboard: ["RGPD-ART24"],
    }),
  },
  {
    id: "US_NIST",
    name: "États-Unis — NIST AI RMF / lois étatiques",
    description: "NIST AI Risk Management Framework 1.0, CCPA/CPRA et lois étatiques de protection des données.",
    applicableJurisdictions: ["US"],
    componentReferences: merge({
      detection_engine: ["CCPA-1798.140"],
      risk_scoring_engine: ["NIST-AI-RMF-MEASURE-2.7"],
      policy_engine: ["CCPA-1798.100"],
      anonymization_vault: ["CCPA-DEIDENTIFIED"],
      audit_store: ["NIST-AI-RMF-GOVERN-1.5"],
      dashboard: ["NIST-AI-RMF-GOVERN-4"],
    }),
  },
];
