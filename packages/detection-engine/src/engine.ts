import type { AggregatedDetection, DetectionResult } from "@acg/shared";
import { aggregateResults } from "./aggregate.js";
import { KeywordContextLayer } from "./layers/keyword-context.js";
import { RulesLayer } from "./layers/rules/index.js";
import type { DetectionLayerProvider, LayerStatus } from "./layers/types.js";
import { tuneEntities, type DetectionTuning } from "./tuning.js";

export type { DetectionLayerProvider } from "./layers/types.js";

export interface DetectionEngineOptions {
  extraLayers?: DetectionLayerProvider[];
  /** Si true, n'exécute pas le repli mots-clés lorsque la couche LLM a réussi. */
  skipKeywordWhenLlmReady?: boolean;
  /** Bonus de contexte, seuils par type, listes d'autorisation / d'exclusion. */
  tuning?: DetectionTuning;
}

/**
 * Orchestrateur des couches. Toujours disponible hors-ligne : règles + mots-clés.
 * Les couches NER/LLM sont injectées par le factory Node lorsqu'elles sont chargées.
 */
export class DetectionEngine {
  private readonly layers: DetectionLayerProvider[];
  private initialized = false;
  private tuning: DetectionTuning;

  constructor(options: DetectionEngineOptions = {}) {
    const rules = new RulesLayer();
    const keyword = new KeywordContextLayer();
    const extra = options.extraLayers ?? [];
    const hasLlm = extra.some((l) => l.layer === "llm_context");
    this.layers = [rules, ...extra];
    if (!(options.skipKeywordWhenLlmReady && hasLlm)) {
      this.layers.push(keyword);
    } else {
      this.layers.push(keyword);
    }
    this.tuning = options.tuning ?? {};
  }

  /** Met à jour les réglages à chaud (ex. après synchronisation des politiques). */
  setTuning(tuning: DetectionTuning): void {
    this.tuning = tuning;
  }

  async initialize(): Promise<LayerStatus[]> {
    const statuses = await Promise.all(this.layers.map((l) => l.initialize()));
    this.initialized = true;
    return statuses;
  }

  statuses(): LayerStatus[] {
    return this.layers.map((l) => l.status());
  }

  async detect(text: string): Promise<AggregatedDetection> {
    if (!this.initialized) await this.initialize();
    const results: DetectionResult[] = [];
    for (const layer of this.layers) {
      results.push(await layer.detect(text));
    }
    const aggregated = aggregateResults(results);
    const degraded = results.some((r, i) => r.degraded && !this.layers[i]!.optional);
    return { ...aggregated, degraded, entities: tuneEntities(text, aggregated.entities, this.tuning) };
  }
}
