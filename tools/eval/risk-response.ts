import type { PolicyAction, RiskBand } from "../../packages/shared/src/index.js";
import { DEFAULT_AI_SERVICES, DEFAULT_RISK_BAND_THRESHOLDS, DEFAULT_RISK_WEIGHTS } from "../../packages/shared/src/index.js";
import { applyMasking, residualQuasiIdentifiers } from "../../packages/detection-engine/src/index.js";
import { buildPolicyContext, decidePolicy } from "../../packages/policy-engine/src/index.js";
import { computeRiskScore, type ScoreConfig } from "../../packages/risk-scoring/src/index.js";
import { SEED_EQUIVALENT_POLICIES } from "../../packages/agent-runtime/src/e2e-texte.scenarios.js";
import { ALL_VARIANTS, attack, buildAttackIndex, type ReidScenario, type ReidVariant } from "./reidentification.js";
import type { Person } from "./population.js";
import type { EvalSystem } from "./systems.js";

/**
 * Réponse du scoring au risque de ré-identification.
 *
 * L'expérience de ré-identification mesure le masquage seul. Celle-ci vérifie le maillon
 * suivant : le facteur « combinaison de quasi-identifiants » (poids 25 %) et les politiques
 * relèvent-ils la bande et durcissent-ils l'action quand le prompt en clair désigne
 * effectivement une personne ? On rejoue le pipeline de décision de l'agent (score →
 * politiques équivalentes au seed → masquage → escalade sur risque résiduel), puis on
 * attaque ce qui sortirait réellement de la passerelle : rien si BLOCK, le texte masqué si
 * MASK, le texte en clair si ALLOW ou WARN.
 *
 * Ablation : même pipeline avec le facteur neutralisé (poids 0, les trois autres
 * renormalisés pour garder une échelle sur 100) — la différence isole sa contribution.
 */

/** Exposition du prompt en clair, d'après l'attaque sur le texte original. */
export type Exposure = "reidentifiable" | "k2-5" | "anonyme";
export const EXPOSURES: Exposure[] = ["reidentifiable", "k2-5", "anonyme"];

export const EXPOSURE_LABEL: Record<Exposure, string> = {
  reidentifiable: "Ré-identifiable en clair (k = 1)",
  "k2-5": "Quasi ré-identifiable (2 ≤ k ≤ 5)",
  anonyme: "Peu exposé (k > 5)",
};

const BANDS: RiskBand[] = ["low", "moderate", "high", "critical"];
const ACTIONS: PolicyAction[] = ["ALLOW", "WARN", "MASK", "BLOCK"];

/** Utilisateur et service de référence : direction à risque modéré, ChatGPT (hébergé aux États-Unis). */
const USER = { department: "Prestations", departmentRiskLevel: "moderate" as const, jurisdiction: "BJ", role: "USER" };
const SERVICE = DEFAULT_AI_SERVICES.find((s) => s.id === "chatgpt.com") ?? DEFAULT_AI_SERVICES[0]!;

export interface ExposureGroup {
  n: number;
  meanScore: number;
  meanQiFactor: number;
  bands: Record<RiskBand, number>;
  actions: Record<PolicyAction, number>;
  /** Encore ré-identifié après la passerelle (BLOCK = rien d'envoyé). */
  reidentifiedAfter: number;
  /** Laissé passer en clair (ALLOW ou WARN). */
  passedInClear: number;
}

export interface RiskResponseLine {
  system: string;
  label: string;
  variant: "facteur-actif" | "facteur-neutralise";
  byExposure: Record<Exposure, ExposureGroup>;
  byVariant: Partial<Record<ReidVariant, { n: number; meanScore: number; reidentifiedAfter: number; actions: Record<PolicyAction, number> }>>;
}

function neutralizedConfig(): ScoreConfig {
  const rest = 1 - DEFAULT_RISK_WEIGHTS.quasi_identifier_combination;
  return {
    weights: {
      entity_sensitivity: DEFAULT_RISK_WEIGHTS.entity_sensitivity / rest,
      quasi_identifier_combination: 0,
      hosting_location: DEFAULT_RISK_WEIGHTS.hosting_location / rest,
      organizational_context: DEFAULT_RISK_WEIGHTS.organizational_context / rest,
    },
    thresholds: { ...DEFAULT_RISK_BAND_THRESHOLDS },
  };
}

const ACTIVE_CONFIG: ScoreConfig = { weights: { ...DEFAULT_RISK_WEIGHTS }, thresholds: { ...DEFAULT_RISK_BAND_THRESHOLDS } };

export function exposureOf(candidates: number, reidentified: boolean): Exposure {
  if (reidentified) return "reidentifiable";
  return candidates <= 5 ? "k2-5" : "anonyme";
}

/** Pipeline de décision de l'agent (texte seul, sans fichier). */
export async function decide(system: EvalSystem, text: string, config: ScoreConfig) {
  const { entities, context } = await system.detect(text);
  const risk = computeRiskScore(
    {
      entities,
      contextCategory: context?.contextCategory ?? null,
      contextConfidence: context?.confidence,
      departmentRiskLevel: USER.departmentRiskLevel,
      userJurisdiction: USER.jurisdiction,
      aiHostingRegion: SERVICE.hostingRegion,
      aiRiskBaseline: SERVICE.riskBaseline,
    },
    config,
  );
  const ctx = buildPolicyContext({
    risk,
    entities,
    contextCategory: context?.contextCategory ?? null,
    contextConfidence: context?.confidence ?? 0,
    department: USER.department,
    channel: "browser",
    degradedMode: false,
    textLength: text.length,
    aiService: { id: SERVICE.id, hosting_region: SERVICE.hostingRegion, free_access: SERVICE.freeAccess, risk_baseline: SERVICE.riskBaseline },
    user: { jurisdiction: USER.jurisdiction, department: USER.department, role: USER.role },
  });
  const masked = applyMasking(text, entities);
  const decision = decidePolicy({
    policies: SEED_EQUIVALENT_POLICIES,
    risk,
    context: ctx,
    entities,
    residualEntities: residualQuasiIdentifiers(masked.text, entities),
  });
  const qi = risk.factorBreakdown.find((f) => f.factor === "quasi_identifier_combination");
  return { action: decision.action, score: risk.value, band: risk.band, qiFactor: qi?.rawScore ?? 0, maskedText: masked.text };
}

/** Ce que l'attaquant voit après la passerelle : rien si BLOCK, le masqué si MASK, le clair sinon. */
export function outgoingText(action: PolicyAction, original: string, masked: string): string | null {
  if (action === "BLOCK") return null;
  return action === "MASK" ? masked : original;
}

const zeros = <K extends string>(keys: K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

export async function evaluateRiskResponse(
  systems: EvalSystem[],
  scenarios: (ReidScenario & { text: string })[],
  people: Person[],
): Promise<RiskResponseLine[]> {
  const index = buildAttackIndex(people);
  const exposure = scenarios.map((sc) => {
    const r = attack(sc.text, sc.targetId, index);
    return exposureOf(r.candidates, r.reidentified);
  });

  const lines: RiskResponseLine[] = [];
  for (const system of systems) {
    for (const [variant, config] of [
      ["facteur-actif", ACTIVE_CONFIG],
      ["facteur-neutralise", neutralizedConfig()],
    ] as const) {
      const rows: { exposure: Exposure; variant: ReidVariant; score: number; qi: number; band: RiskBand; action: PolicyAction; reidAfter: boolean }[] = [];
      for (const [i, sc] of scenarios.entries()) {
        const d = await decide(system, sc.text, config);
        const out = outgoingText(d.action, sc.text, d.maskedText);
        const reidAfter = out !== null && attack(out, sc.targetId, index).reidentified;
        rows.push({ exposure: exposure[i]!, variant: sc.variant, score: d.score, qi: d.qiFactor, band: d.band, action: d.action, reidAfter });
      }
      const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);
      const group = (subset: typeof rows): ExposureGroup => {
        const bands = zeros(BANDS);
        const actions = zeros(ACTIONS);
        for (const r of subset) {
          bands[r.band]++;
          actions[r.action]++;
        }
        return {
          n: subset.length,
          meanScore: mean(subset.map((r) => r.score)),
          meanQiFactor: mean(subset.map((r) => r.qi)),
          bands,
          actions,
          reidentifiedAfter: subset.filter((r) => r.reidAfter).length,
          passedInClear: subset.filter((r) => r.action === "ALLOW" || r.action === "WARN").length,
        };
      };
      lines.push({
        system: system.id,
        label: system.label,
        variant,
        byExposure: Object.fromEntries(EXPOSURES.map((e) => [e, group(rows.filter((r) => r.exposure === e))])) as RiskResponseLine["byExposure"],
        byVariant: Object.fromEntries(
          ALL_VARIANTS.filter((v) => rows.some((r) => r.variant === v)).map((v) => {
            const g = group(rows.filter((r) => r.variant === v));
            return [v, { n: g.n, meanScore: g.meanScore, reidentifiedAfter: g.reidentifiedAfter, actions: g.actions }];
          }),
        ) as RiskResponseLine["byVariant"],
      });
    }
  }
  return lines;
}
