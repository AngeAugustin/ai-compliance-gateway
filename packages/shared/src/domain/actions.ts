export const POLICY_ACTIONS = ["ALLOW", "WARN", "MASK", "BLOCK"] as const;
export type PolicyAction = (typeof POLICY_ACTIONS)[number];

/** Ordre de sévérité croissante ; l'escalade ne va que dans ce sens. */
export const ACTION_SEVERITY: Record<PolicyAction, number> = { ALLOW: 0, WARN: 1, MASK: 2, BLOCK: 3 };

export function mostSevereAction(a: PolicyAction, b: PolicyAction): PolicyAction {
  return ACTION_SEVERITY[a] >= ACTION_SEVERITY[b] ? a : b;
}

export const RISK_BANDS = ["low", "moderate", "high", "critical"] as const;
export type RiskBand = (typeof RISK_BANDS)[number];

export const RISK_BAND_ORDER: Record<RiskBand, number> = { low: 0, moderate: 1, high: 2, critical: 3 };

export interface RiskBandThresholds {
  low: [number, number];
  moderate: [number, number];
  high: [number, number];
  critical: [number, number];
}

/** Seuils par défaut du DAT §9, configurables par entreprise. */
export const DEFAULT_RISK_BAND_THRESHOLDS: RiskBandThresholds = {
  low: [0, 24],
  moderate: [25, 49],
  high: [50, 74],
  critical: [75, 100],
};

export function bandForScore(score: number, thresholds: RiskBandThresholds = DEFAULT_RISK_BAND_THRESHOLDS): RiskBand {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  for (const band of RISK_BANDS) {
    const [min, max] = thresholds[band];
    if (s >= min && s <= max) return band;
  }
  return s >= thresholds.critical[0] ? "critical" : "low";
}

export const CHANNELS = ["browser", "cli", "api"] as const;
export type Channel = (typeof CHANNELS)[number];

export const AGENT_MODULES = ["A1", "A2"] as const;
export type AgentModule = (typeof AGENT_MODULES)[number];

export const USER_ROLES = ["USER", "RSSI", "DPO", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type DepartmentRiskLevel = "low" | "moderate" | "high";
