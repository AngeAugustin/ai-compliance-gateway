import type { ContextClassification, EntityType, SensitiveEntity } from "../../packages/shared/src/index.js";
import {
  DetectionEngine,
  RULE_PATTERNS,
  RulesLayer,
  classifyByKeywords,
} from "../../packages/detection-engine/src/index.js";
import { LlmLocalLayer, NerOnnxLayer } from "../../packages/detection-engine/src/node.js";

/**
 * Configurations comparées (ablation) :
 * - regles : couche 1 seule, sortie brute ;
 * - ner : couche 2 seule, sortie brute ;
 * - moteur-degrade : moteur de production sans NER (règles + mots-clés + réglages) — ce qui
 *   tourne quand le modèle NER n'est pas chargé ;
 * - moteur-complet : moteur de production avec NER (règles + NER + mots-clés + réglages).
 */
export interface EvalSystem {
  id: string;
  label: string;
  description: string;
  /** Types que la configuration sait produire (périmètre déclaré). */
  coverage: Set<EntityType>;
  detect(text: string): Promise<{ entities: SensitiveEntity[]; context: ContextClassification | null }>;
}

/** Types émis par la couche NER (LABEL_MAP de ner-common.ts). */
export const NER_TYPES: EntityType[] = ["PERSON", "ADDRESS", "ORGANIZATION"];

/** Types émis par la couche règles : motifs + détecteur de téléphones (PHONE / MOBILE_MONEY). */
export const RULE_TYPES: EntityType[] = [...new Set<EntityType>([...RULE_PATTERNS.map((p) => p.entityType), "PHONE", "MOBILE_MONEY"])];

export interface SystemsSetup {
  systems: EvalSystem[];
  ner: { available: boolean; detail?: string; initMs: number };
  llm: { available: boolean; detail?: string };
  contextClassifiers: { id: string; label: string; classify(text: string): Promise<ContextClassification | null> }[];
}

export async function buildSystems(options: { withNer: boolean }): Promise<SystemsSetup> {
  const rules = new RulesLayer();
  const degraded = new DetectionEngine();
  await degraded.initialize();

  const systems: EvalSystem[] = [
    {
      id: "regles",
      label: "Règles seules",
      description: "Couche 1 (regex + validateurs), sortie brute",
      coverage: new Set(RULE_TYPES),
      detect: async (text) => ({ entities: (await rules.detect(text)).entities, context: null }),
    },
  ];
  const degradedSystem: EvalSystem = {
    id: "moteur-degrade",
    label: "Moteur sans NER",
    description: "Règles + mots-clés + réglages (seuils, contexte) — mode dégradé",
    coverage: new Set(RULE_TYPES),
    detect: async (text) => {
      const r = await degraded.detect(text);
      return { entities: r.entities, context: r.context };
    },
  };

  let ner: SystemsSetup["ner"] = { available: false, detail: "désactivé (--sans-ner)", initMs: 0 };
  let nerLayer: NerOnnxLayer | null = null;
  if (options.withNer) {
    const layer = new NerOnnxLayer();
    const started = performance.now();
    const status = await layer.initialize();
    ner = { available: status.available, detail: status.detail, initMs: Math.round(performance.now() - started) };
    if (status.available) nerLayer = layer;
  }

  if (nerLayer) {
    const layer = nerLayer;
    systems.push({
      id: "ner",
      label: "NER seul",
      description: "Couche 2 (BERT multilingue quantifié, transformers.js), sortie brute",
      coverage: new Set(NER_TYPES),
      detect: async (text) => ({ entities: (await layer.detect(text)).entities, context: null }),
    });
  }
  systems.push(degradedSystem);
  if (nerLayer) {
    const complete = new DetectionEngine({ extraLayers: [nerLayer] });
    await complete.initialize();
    systems.push({
      id: "moteur-complet",
      label: "Moteur complet",
      description: "Règles + NER + mots-clés + réglages — configuration de production",
      coverage: new Set([...RULE_TYPES, ...NER_TYPES]),
      detect: async (text) => {
        const r = await complete.detect(text);
        return { entities: r.entities, context: r.context };
      },
    });
  }

  const contextClassifiers: SystemsSetup["contextClassifiers"] = [
    { id: "mots-cles", label: "Lexiques (couche 3, repli)", classify: async (text) => classifyByKeywords(text) },
  ];
  let llm: SystemsSetup["llm"] = { available: false, detail: "LLM_MODEL_PATH non renseigné" };
  if (process.env.LLM_MODEL_PATH) {
    const layer = new LlmLocalLayer({ modelPath: process.env.LLM_MODEL_PATH, expectedSha256: process.env.LLM_MODEL_SHA256 });
    const status = await layer.initialize();
    llm = { available: status.available, detail: status.detail };
    if (status.available) {
      contextClassifiers.push({
        id: "llm",
        label: "LLM local (couche 3)",
        classify: async (text) => (await layer.detect(text)).context ?? null,
      });
    }
  }

  return { systems, ner, llm, contextClassifiers };
}
