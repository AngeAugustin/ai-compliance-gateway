import { z } from "zod";
import { CHANNELS, POLICY_ACTIONS, RISK_BANDS } from "../domain/actions.js";
import { RiskFactorBreakdownSchema } from "./risk.js";

/**
 * Événement de sécurité journalisé (DAT §12). Ne contient jamais de valeur
 * sensible en clair : uniquement des catégories, un score, une décision.
 */
export const SecurityEventSchema = z.object({
  eventId: z.string().min(1),
  sequence: z.number().int().nonnegative().optional(),
  occurredAt: z.string().datetime(),
  userIdHash: z.string().length(64),
  department: z.string(),
  agentId: z.string().min(1).nullable(),
  channel: z.enum(CHANNELS),
  /** Adresse IP source vue par le serveur (hors empreinte de chaîne). */
  clientIp: z.string().max(64).nullable().optional(),
  aiServiceId: z.string().nullable(),
  hostingRegion: z.string().nullable(),
  entitiesDetected: z.array(z.string()),
  entityCounts: z.record(z.string(), z.number().int()),
  contextCategory: z.string().nullable(),
  riskScore: z.number().int().min(0).max(100),
  riskBand: z.enum(RISK_BANDS),
  factorBreakdown: z.array(RiskFactorBreakdownSchema),
  policyId: z.string().min(1).nullable(),
  action: z.enum(POLICY_ACTIONS),
  referenceFrameworks: z.array(z.string()),
  degradedMode: z.boolean(),
  processingTimeMs: z.number().int().nullable(),
  detectionLayers: z.array(z.string()),
  prevEventHash: z.string().length(64).nullable(),
  eventHash: z.string().length(64),
});
export type SecurityEvent = z.infer<typeof SecurityEventSchema>;

/** Champs entrant dans le calcul de event_hash (hors séquence, hash et métadonnées réseau). */
export type SecurityEventHashInput = Omit<SecurityEvent, "eventHash" | "sequence" | "clientIp">;

export const SecurityAlertSchema = z.object({
  id: z.string().min(1),
  alertType: z.enum(["AGENT_MISSING", "AGENT_TAMPERED", "AGENT_RECOVERED", "CRITICAL_INTERACTION", "INFRA_DEGRADED"]),
  severity: z.enum(["info", "warning", "critical"]),
  agentId: z.string().min(1).nullable(),
  eventId: z.string().min(1).nullable(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string().datetime(),
  acknowledgedAt: z.string().datetime().nullable(),
  acknowledgedBy: z.string().min(1).nullable(),
});
export type SecurityAlert = z.infer<typeof SecurityAlertSchema>;

export const AnalyticsSummarySchema = z.object({
  period: z.object({ from: z.string(), to: z.string() }),
  totals: z.object({
    interactions: z.number(),
    allow: z.number(),
    warn: z.number(),
    mask: z.number(),
    block: z.number(),
    degraded: z.number(),
    averageRiskScore: z.number(),
    p95ProcessingTimeMs: z.number().nullable(),
  }),
  byBand: z.record(z.enum(RISK_BANDS), z.number()),
  byDepartment: z.array(z.object({ department: z.string(), count: z.number(), blocked: z.number(), avgRisk: z.number() })),
  byService: z.array(z.object({ aiServiceId: z.string(), hostingRegion: z.string().nullable(), count: z.number(), crossBorder: z.boolean() })),
  topEntities: z.array(z.object({ entityType: z.string(), count: z.number() })),
  timeline: z.array(z.object({ bucket: z.string(), allow: z.number(), warn: z.number(), mask: z.number(), block: z.number() })),
  agents: z.object({ total: z.number(), online: z.number(), missing: z.number(), tampered: z.number() }),
  openAlerts: z.number(),
  chainIntegrity: z.object({ verified: z.boolean(), checkedEvents: z.number(), firstBrokenSequence: z.number().nullable() }),
  activeFramework: z.string().nullable(),
});
export type AnalyticsSummary = z.infer<typeof AnalyticsSummarySchema>;
