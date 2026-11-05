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
 *
 * Profils : l'effet d'un facteur dépend de la distance aux seuils de bande, donc du reste du
 * score. L'ablation est rejouée sur 12 profils (niveau de risque de la direction × lieu
 * d'hébergement du service) et comparée scénario par scénario. La détection, qui ne dépend
 * pas du profil, n'est exécutée qu'une fois par prompt et par configuration.
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

type DepartmentRisk = "low" | "moderate" | "high";
interface ServiceProfile {
  id: string;
  label: string;
  hostingRegion: string;
  riskBaseline: number;
  freeAccess: boolean;
}

export interface DecisionProfile {
  id: string;
  label: string;
  departmentRiskLevel: DepartmentRisk;
  service: ServiceProfile;
}

const USER = { department: "Prestations", jurisdiction: "BJ", role: "USER" };

function catalogService(id: string, label: string): ServiceProfile {
  const s = DEFAULT_AI_SERVICES.find((x) => x.id === id) ?? DEFAULT_AI_SERVICES[0]!;
  return { id: s.id, label, hostingRegion: s.hostingRegion, riskBaseline: s.riskBaseline, freeAccess: s.freeAccess };
}

/** Du moins au plus exposé : hébergement au Bénin (LLM interne hypothétique), UE, États-Unis, Chine. */
const SERVICES: ServiceProfile[] = [
  { id: "llm-interne", label: "LLM interne (BJ)", hostingRegion: "BJ", riskBaseline: 10, freeAccess: false },
  catalogService("chat.mistral.ai", "Mistral (UE)"),
  catalogService("chatgpt.com", "ChatGPT (US)"),
  catalogService("chat.deepseek.com", "DeepSeek (CN)"),
];
const DEPARTMENT_RISKS: DepartmentRisk[] = ["low", "moderate", "high"];
const DEPARTMENT_LABEL: Record<DepartmentRisk, string> = {
  low: "direction à risque faible",
  moderate: "direction à risque modéré",
  high: "direction à risque élevé",
};

export const PROFILES: DecisionProfile[] = DEPARTMENT_RISKS.flatMap((d) =>
  SERVICES.map((service) => ({ id: `${d}-${service.id}`, label: `${service.label}, ${DEPARTMENT_LABEL[d]}`, departmentRiskLevel: d, service })),
);

/** Profil de référence des tableaux détaillés : direction à risque modéré, ChatGPT (hébergé aux États-Unis). */
export const REFERENCE_PROFILE: DecisionProfile = PROFILES.find((p) => p.id === "moderate-chatgpt.com")!;

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

type Detection = Awaited<ReturnType<EvalSystem["detect"]>>;

/** Pipeline de décision de l'agent (texte seul, sans fichier). */
export async function decide(system: EvalSystem, text: string, config: ScoreConfig, profile: DecisionProfile = REFERENCE_PROFILE) {
  return decideFrom(await system.detect(text), text, config, profile);
}

export function decideFrom({ entities, context }: Detection, text: string, config: ScoreConfig, profile: DecisionProfile) {
  const SERVICE = profile.service;
  const risk = computeRiskScore(
    {
      entities,
      contextCategory: context?.contextCategory ?? null,
      contextConfidence: context?.confidence,
      departmentRiskLevel: profile.departmentRiskLevel,
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

export interface ProfileEffect {
  system: string;
  label: string;
  profile: string;
  profileLabel: string;
  n: number;
  /** Scénarios dont la bande change quand on neutralise le facteur. */
  bandChanged: number;
  /** Scénarios dont l'action change ; « plus stricte » = le facteur durcit la décision. */
  actionChanged: number;
  stricterWithFactor: number;
  laxerWithFactor: number;
  /** Écart de score moyen entre prompts ré-identifiables et témoins peu exposés. */
  gapActive: number;
  gapNeutral: number;
  actionsActive: Record<PolicyAction, number>;
  actionsNeutral: Record<PolicyAction, number>;
  /** Ré-identifiables encore exploitables après la passerelle. */
  reidAfterActive: number;
  reidAfterNeutral: number;
  examples: string[];
}

const SEVERITY: Record<PolicyAction, number> = { ALLOW: 0, WARN: 1, MASK: 2, BLOCK: 3 };

export async function evaluateProfiles(
  systems: EvalSystem[],
  scenarios: (ReidScenario & { text: string })[],
  people: Person[],
  profiles: DecisionProfile[] = PROFILES,
): Promise<ProfileEffect[]> {
  const index = buildAttackIndex(people);
  const exposure = scenarios.map((sc) => {
    const r = attack(sc.text, sc.targetId, index);
    return exposureOf(r.candidates, r.reidentified);
  });
  const neutral = neutralizedConfig();
  const out: ProfileEffect[] = [];
  for (const system of systems) {
    const detections: Detection[] = [];
    for (const sc of scenarios) detections.push(await system.detect(sc.text));
    // L'attaque après passerelle ne dépend que de l'action : mise en cache par (scénario, action).
    const reidCache = new Map<string, boolean>();
    const reidAfter = (i: number, action: PolicyAction, masked: string) => {
      const key = `${i}|${action}`;
      if (!reidCache.has(key)) {
        const sent = outgoingText(action, scenarios[i]!.text, masked);
        reidCache.set(key, sent !== null && attack(sent, scenarios[i]!.targetId, index).reidentified);
      }
      return reidCache.get(key)!;
    };
    for (const profile of profiles) {
      const effect: ProfileEffect = {
        system: system.id,
        label: system.label,
        profile: profile.id,
        profileLabel: profile.label,
        n: scenarios.length,
        bandChanged: 0,
        actionChanged: 0,
        stricterWithFactor: 0,
        laxerWithFactor: 0,
        gapActive: 0,
        gapNeutral: 0,
        actionsActive: zeros(ACTIONS),
        actionsNeutral: zeros(ACTIONS),
        reidAfterActive: 0,
        reidAfterNeutral: 0,
        examples: [],
      };
      const scores = {
        active: { exposed: [] as number[], control: [] as number[] },
        neutral: { exposed: [] as number[], control: [] as number[] },
      };
      for (const [i, sc] of scenarios.entries()) {
        const a = decideFrom(detections[i]!, sc.text, ACTIVE_CONFIG, profile);
        const n = decideFrom(detections[i]!, sc.text, neutral, profile);
        effect.actionsActive[a.action]++;
        effect.actionsNeutral[n.action]++;
        if (a.band !== n.band) effect.bandChanged++;
        if (a.action !== n.action) {
          effect.actionChanged++;
          if (SEVERITY[a.action] > SEVERITY[n.action]) effect.stricterWithFactor++;
          else effect.laxerWithFactor++;
          if (effect.examples.length < 3) effect.examples.push(`${sc.id} : ${n.action} → ${a.action}`);
        }
        const bucket = exposure[i] === "reidentifiable" ? "exposed" : exposure[i] === "anonyme" ? "control" : null;
        if (bucket) {
          scores.active[bucket].push(a.score);
          scores.neutral[bucket].push(n.score);
        }
        if (exposure[i] === "reidentifiable") {
          if (reidAfter(i, a.action, a.maskedText)) effect.reidAfterActive++;
          if (reidAfter(i, n.action, n.maskedText)) effect.reidAfterNeutral++;
        }
      }
      const mean = (xs: number[]) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : 0);
      effect.gapActive = Math.round((mean(scores.active.exposed) - mean(scores.active.control)) * 10) / 10;
      effect.gapNeutral = Math.round((mean(scores.neutral.exposed) - mean(scores.neutral.control)) * 10) / 10;
      out.push(effect);
    }
  }
  return out;
}
