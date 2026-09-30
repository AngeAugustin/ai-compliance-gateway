import type { AgentSyncResponse, Policy } from "@acg/shared";
import { DEFAULT_AI_SERVICES, DEFAULT_RISK_BAND_THRESHOLDS, DEFAULT_RISK_WEIGHTS } from "@acg/shared";

/** Cache de décisions / politiques pour le mode déconnecté (DAT §7.1, §4.5). */
export class DecisionCache {
  private snapshot: AgentSyncResponse | null = null;

  hydrate(snapshot: AgentSyncResponse): void {
    this.snapshot = snapshot;
  }

  get(): AgentSyncResponse | null {
    return this.snapshot;
  }

  policies(): Policy[] {
    return this.snapshot?.policies ?? [];
  }

  /** Repli embarqué avant la première synchro : services connus, pondérations DAT, aucune politique custom. */
  fallback(moduleDefaults: { department: string; departmentRiskLevel: "low" | "moderate" | "high"; jurisdiction: string; userId: string }): AgentSyncResponse {
    if (this.snapshot) return this.snapshot;
    return {
      policyVersion: "bootstrap",
      generatedAt: new Date().toISOString(),
      policies: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          name: "Fail-closed directions à risque (bootstrap)",
          description: "Politique embarquée avant synchro",
          conditionExpr: `degraded_mode = true AND department IN ["Cotisations", "Finance", "Juridique"]`,
          action: "BLOCK",
          priority: 5,
          version: 1,
          enabled: true,
          referenceFrameworks: ["OWASP-LLM02"],
        },
        {
          id: "00000000-0000-4000-8000-000000000002",
          name: "Masquer données financières transfrontalières (bootstrap)",
          conditionExpr: `risk_band >= "high" AND contains(entity_type, "FINANCIAL_AMOUNT") AND cross_border = true`,
          action: "MASK",
          priority: 10,
          version: 1,
          enabled: true,
          referenceFrameworks: ["OWASP-LLM02", "MALABO-ART14"],
        },
        {
          id: "00000000-0000-4000-8000-000000000003",
          name: "Bloquer secrets techniques (bootstrap)",
          conditionExpr: `any_of(entity_type, ["API_KEY", "PASSWORD", "PRIVATE_KEY", "CONNECTION_STRING"])`,
          action: "BLOCK",
          priority: 1,
          version: 1,
          enabled: true,
          referenceFrameworks: ["OWASP-LLM02"],
        },
      ],
      aiServices: DEFAULT_AI_SERVICES.map((s) => ({
        id: s.id,
        name: s.name,
        hostingRegion: s.hostingRegion,
        riskBaseline: s.riskBaseline,
        freeAccess: s.freeAccess,
        domains: s.domains,
        cliCommands: s.cliCommands,
      })),
      riskWeights: { ...DEFAULT_RISK_WEIGHTS },
      riskBandThresholds: { ...DEFAULT_RISK_BAND_THRESHOLDS },
      organization: { jurisdiction: moduleDefaults.jurisdiction, regulatoryFrameworkId: "BJ_MALABO" },
      user: {
        userId: moduleDefaults.userId,
        department: moduleDefaults.department,
        departmentRiskLevel: moduleDefaults.departmentRiskLevel,
        jurisdiction: moduleDefaults.jurisdiction,
        role: "USER",
      },
      heartbeatIntervalSeconds: 60,
      syncIntervalSeconds: 300,
      expectedModelHashes: {},
    };
  }

  matchAiService(hostnameOrCommand: string): AgentSyncResponse["aiServices"][number] | null {
    const snap = this.snapshot;
    const list = snap?.aiServices ?? DEFAULT_AI_SERVICES;
    const needle = hostnameOrCommand.toLowerCase();
    return (
      list.find((s) => s.id === needle || s.domains.some((d) => needle === d || needle.endsWith(`.${d}`)) || s.cliCommands.includes(needle)) ?? null
    );
  }
}
