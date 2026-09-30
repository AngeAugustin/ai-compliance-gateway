import {
  ACTION_SEVERITY,
  ENTITY_DEFINITIONS,
  evaluateCondition,
  mostSevereAction,
  parseCondition,
  type Policy,
  type PolicyAction,
  type PolicyContext,
  type PolicyDecision,
  type RiskScore,
  type SensitiveEntity,
} from "@acg/shared";

const USER_MESSAGES: Record<PolicyAction, string | null> = {
  ALLOW: null,
  WARN: "Cette interaction contient des données potentiellement sensibles. Elle sera transmise et journalisée.",
  MASK: "Des données sensibles ont été remplacées par des jetons avant envoi au service d'IA.",
  BLOCK: "Cette interaction a été bloquée : elle exposerait des données protégées à un service d'IA externe.",
};

export interface DecideInput {
  policies: Policy[];
  risk: RiskScore;
  context: PolicyContext;
  entities: SensitiveEntity[];
  /** Seuil de quasi-identifiants restants après masquage qui déclenche l'escalade MASK → BLOCK (DAT §10.2). */
  residualQiThreshold?: number;
  residualEntities?: SensitiveEntity[];
}

export function decidePolicy(input: DecideInput): PolicyDecision {
  const enabled = input.policies.filter((p) => p.enabled).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  let matched: Policy | null = null;
  for (const policy of enabled) {
    try {
      if (evaluateCondition(parseCondition(policy.conditionExpr), input.context)) {
        matched = policy;
        break;
      }
    } catch {
      continue;
    }
  }

  let action: PolicyAction = matched?.action ?? "ALLOW";
  let escalated = false;
  let escalationReason: string | null = null;

  const residualQiThreshold = input.residualQiThreshold ?? 2;
  if (action === "MASK" && input.residualEntities) {
    const remainingQi = new Set(
      input.residualEntities.filter((e) => ENTITY_DEFINITIONS[e.entityType]?.quasiIdentifier).map((e) => e.entityType),
    );
    if (remainingQi.size >= residualQiThreshold) {
      action = mostSevereAction(action, "BLOCK");
      escalated = true;
      escalationReason = `Risque résiduel de ré-identification : ${remainingQi.size} quasi-identifiants encore présents après masquage`;
    }
  }

  if (matched && ACTION_SEVERITY[action] < ACTION_SEVERITY[matched.action]) {
    action = matched.action;
    escalated = false;
  }

  return {
    action,
    policyId: matched?.id ?? null,
    policyName: matched?.name ?? null,
    riskScore: input.risk.value,
    maskedTokens: [],
    referenceFrameworks: matched?.referenceFrameworks ?? [],
    escalated,
    escalationReason,
    userMessage: USER_MESSAGES[action],
  };
}

export function buildPolicyContext(args: {
  risk: RiskScore;
  entities: SensitiveEntity[];
  contextCategory: string | null;
  contextConfidence: number;
  department: string;
  channel: PolicyContext["channel"];
  degradedMode: boolean;
  textLength: number;
  aiService: PolicyContext["ai_service"];
  user: PolicyContext["user"];
}): PolicyContext {
  const types = [...new Set(args.entities.map((e) => e.entityType))];
  return {
    risk_score: args.risk.value,
    risk_band: args.risk.band,
    entity_type: types,
    entity_count: args.entities.length,
    quasi_identifier_count: args.risk.quasiIdentifierCount,
    direct_identifier_count: types.filter((t) => ENTITY_DEFINITIONS[t as keyof typeof ENTITY_DEFINITIONS]?.directIdentifier).length,
    context_category: args.contextCategory,
    context_confidence: args.contextConfidence,
    department: args.department,
    channel: args.channel,
    degraded_mode: args.degradedMode,
    cross_border: args.risk.crossBorder,
    text_length: args.textLength,
    ai_service: args.aiService,
    user: args.user,
  };
}
