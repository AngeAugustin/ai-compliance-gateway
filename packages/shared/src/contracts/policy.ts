import { z } from "zod";
import { POLICY_ACTIONS } from "../domain/actions.js";

export const PolicySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  conditionExpr: z.string().min(1).max(4000),
  action: z.enum(POLICY_ACTIONS),
  priority: z.number().int().min(0).max(10000),
  version: z.number().int().positive(),
  enabled: z.boolean(),
  referenceFrameworks: z.array(z.string()),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Policy = z.infer<typeof PolicySchema>;

export const CreatePolicySchema = PolicySchema.pick({
  name: true,
  description: true,
  conditionExpr: true,
  action: true,
  priority: true,
  enabled: true,
  referenceFrameworks: true,
}).partial({ priority: true, enabled: true, referenceFrameworks: true, description: true });
export type CreatePolicyInput = z.infer<typeof CreatePolicySchema>;

export const UpdatePolicySchema = CreatePolicySchema.partial().extend({
  /** Version attendue (verrouillage optimiste) */
  expectedVersion: z.number().int().positive().optional(),
});
export type UpdatePolicyInput = z.infer<typeof UpdatePolicySchema>;

export const PolicyDecisionSchema = z.object({
  action: z.enum(POLICY_ACTIONS),
  policyId: z.string().min(1).nullable(),
  policyName: z.string().nullable(),
  riskScore: z.number().int().min(0).max(100),
  /** Jetons de remplacement produits par le Vault pour l'action MASK */
  maskedTokens: z.array(z.string()),
  referenceFrameworks: z.array(z.string()),
  /** true si l'action a été escaladée (ex. MASK -> BLOCK sur risque résiduel) */
  escalated: z.boolean().default(false),
  escalationReason: z.string().nullable().optional(),
  /** Message destiné à l'utilisateur final (WARN/BLOCK) */
  userMessage: z.string().nullable().optional(),
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;
