import { z } from "zod";
import { AGENT_MODULES } from "../domain/actions.js";
import { PolicySchema } from "./policy.js";
import { RISK_FACTORS } from "./risk.js";

/** Clé publique de l'agent au format JWK (ECDSA P-256). */
export const PublicKeyJwkSchema = z.object({
  kty: z.literal("EC"),
  crv: z.literal("P-256"),
  x: z.string(),
  y: z.string(),
});
export type PublicKeyJwk = z.infer<typeof PublicKeyJwkSchema>;

export const IntegrityReportSchema = z.object({
  /** Empreinte SHA-256 du bundle/binaire de l'agent tel qu'il s'auto-mesure */
  agentBundleSha256: z.string().nullable(),
  /** Vérification des poids des modèles locaux au démarrage (DAT §11.1) */
  models: z.array(
    z.object({
      name: z.string(),
      expectedSha256: z.string().nullable(),
      actualSha256: z.string().nullable(),
      status: z.enum(["verified", "mismatch", "absent", "unverified", "hub"]),
    }),
  ),
  localDetectionAvailable: z.boolean(),
  layersAvailable: z.array(z.string()),
});
export type IntegrityReport = z.infer<typeof IntegrityReportSchema>;

/** POST /v1/agents/enrollment-tokens — jeton unique pouvant couvrir A1 et/ou A2. */
export const CreateEnrollmentTokenSchema = z.object({
  modules: z.array(z.enum(AGENT_MODULES)).min(1).default(["A1", "A2"]),
  userId: z.string().min(1).optional(),
  ttlMinutes: z.number().int().positive().max(24 * 60).optional(),
});
export type CreateEnrollmentToken = z.infer<typeof CreateEnrollmentTokenSchema>;

/** POST /v1/agents/enroll — l'agent présente un jeton d'enrôlement et sa clé publique. */
export const EnrollAgentRequestSchema = z.object({
  enrollmentToken: z.string().min(16),
  module: z.enum(AGENT_MODULES),
  hostname: z.string().max(200),
  agentVersion: z.string().max(50),
  publicKey: PublicKeyJwkSchema,
});
export type EnrollAgentRequest = z.infer<typeof EnrollAgentRequestSchema>;

export const EnrollAgentResponseSchema = z.object({
  agentId: z.string().min(1),
  userId: z.string().nullable(),
  heartbeatIntervalSeconds: z.number().int().positive(),
  syncIntervalSeconds: z.number().int().positive(),
});
export type EnrollAgentResponse = z.infer<typeof EnrollAgentResponseSchema>;

/**
 * POST /v1/agents/heartbeat — corps signé par la clé privée de l'agent.
 * La signature couvre la sérialisation canonique de `payload`.
 */
export const HeartbeatPayloadSchema = z.object({
  agentId: z.string(),
  module: z.enum(AGENT_MODULES),
  sequence: z.number().int().nonnegative(),
  sentAt: z.string().datetime(),
  agentVersion: z.string(),
  integrity: IntegrityReportSchema,
  /** Nombre d'événements en file d'attente locale non transmis */
  queuedEvents: z.number().int().nonnegative(),
  /** Version des politiques actuellement en cache */
  policyVersion: z.string().nullable(),
});
export type HeartbeatPayload = z.infer<typeof HeartbeatPayloadSchema>;

export const SignedEnvelopeSchema = <T extends z.ZodTypeAny>(payload: T) =>
  z.object({
    payload,
    /** Signature ECDSA P-256 / SHA-256 (base64url) de la forme canonique de payload */
    signature: z.string(),
  });

export const SignedHeartbeatSchema = SignedEnvelopeSchema(HeartbeatPayloadSchema);
export type SignedHeartbeat = z.infer<typeof SignedHeartbeatSchema>;

export const HeartbeatResponseSchema = z.object({
  acknowledged: z.boolean(),
  serverTime: z.string().datetime(),
  /** Indique à l'agent qu'une synchronisation des politiques est nécessaire */
  syncRequired: z.boolean(),
  integrityStatus: z.string(),
});
export type HeartbeatResponse = z.infer<typeof HeartbeatResponseSchema>;

/** GET /v1/agents/sync — tout ce dont l'agent a besoin pour décider hors ligne (DAT §7.1 Decision Cache). */
export const AgentSyncResponseSchema = z.object({
  policyVersion: z.string(),
  generatedAt: z.string().datetime(),
  policies: z.array(PolicySchema),
  aiServices: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      hostingRegion: z.string(),
      riskBaseline: z.number(),
      freeAccess: z.boolean(),
      domains: z.array(z.string()),
      cliCommands: z.array(z.string()),
    }),
  ),
  riskWeights: z.record(z.enum(RISK_FACTORS), z.number()),
  riskBandThresholds: z.object({
    low: z.tuple([z.number(), z.number()]),
    moderate: z.tuple([z.number(), z.number()]),
    high: z.tuple([z.number(), z.number()]),
    critical: z.tuple([z.number(), z.number()]),
  }),
  organization: z.object({
    jurisdiction: z.string(),
    regulatoryFrameworkId: z.string(),
  }),
  /** Contexte de l'utilisateur associé à l'agent */
  user: z.object({
    userId: z.string(),
    department: z.string(),
    departmentRiskLevel: z.enum(["low", "moderate", "high"]),
    jurisdiction: z.string(),
    role: z.string(),
  }),
  heartbeatIntervalSeconds: z.number().int().positive(),
  syncIntervalSeconds: z.number().int().positive(),
  /** Empreintes attendues des modèles locaux, pour la vérification d'intégrité */
  expectedModelHashes: z.record(z.string(), z.string()),
  /** Clé publique de séquestre : l'agent y chiffre les valeurs masquées (null = pas de séquestre). */
  escrowKey: z.object({ kid: z.string().min(1), publicKey: PublicKeyJwkSchema }).nullable().optional(),
});
export type AgentSyncResponse = z.infer<typeof AgentSyncResponseSchema>;
