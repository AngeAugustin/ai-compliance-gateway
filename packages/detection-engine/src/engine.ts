import type { AggregatedDetection, DetectionResult } from "@acg/shared";
import { aggregateResults } from "./aggregate.js";
import { KeywordContextLayer } from "./layers/keyword-context.js";
import { RulesLayer } from "./layers/rules/index.js";
import type { DetectionLayerProvider, LayerStatus } from "./layers/types.js";

export type { DetectionLayerProvider } from "./layers/types.js";

export interface DetectionEngineOptions {
  extraLayers?: DetectionLayerProvider[];
  /** Si true, n'exécute pas le repli mots-clés lorsque la couche LLM a réussi. */
  skipKeywordWhenLlmReady?: boolean;
}

/**
 * Orchestrateur des couches. Toujours disponible hors-ligne : règles + mots-clés.
 * Les couches NER/LLM sont injectées par le factory Node lorsqu'elles sont chargées.
 */
export class DetectionEngine {
  private readonly layers: DetectionLayerProvider[];
  private initialized = false;

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
    return aggregateResults(results);
  }
}
