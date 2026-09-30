import type { ContextCategory, DetectionResult } from "@acg/shared";
import { CONTEXT_CATEGORIES } from "@acg/shared";
import { now, type DetectionLayerProvider, type LayerStatus } from "./types.js";
import { classifyByKeywords } from "./keyword-context.js";
import { isModelTrusted, verifyModelFile, type ModelIntegrityResult } from "../integrity.js";

const MODEL_VERSION = "phi-3.5-mini-instruct-Q4_K_M";

const SYSTEM_PROMPT = `Tu classifies un prompt d'entreprise dans UNE catégorie fermée.
Catégories: RH, Finance, Juridique, Technique, Medical, Generique.
Réponds uniquement par un JSON: {"context_category":"...","confidence":0.0,"rationale":"..."}
rationale ≤ 20 mots. Pas d'autre texte.`;

export interface LlmLocalConfig {
  modelPath?: string;
  expectedSha256?: string;
}

export class LlmLocalLayer implements DetectionLayerProvider {
  readonly layer = "llm_context" as const;
  private ready = false;
  private session: { prompt: (p: string) => Promise<string>; dispose?: () => Promise<void> } | null = null;
  private integrity: ModelIntegrityResult | null = null;
  private lastError: string | undefined;

  constructor(private readonly config: LlmLocalConfig = {}) {}

  async initialize(): Promise<LayerStatus> {
    this.integrity = await verifyModelFile("llm", this.config.modelPath, this.config.expectedSha256);
    if (this.integrity.status === "absent" || !isModelTrusted(this.integrity)) {
      this.ready = false;
      this.lastError = this.integrity.status === "mismatch" ? "checksum LLM invalide" : "modèle GGUF absent — repli mots-clés";
      return this.status();
    }
    try {
      const llama = await import("node-llama-cpp");
      const { getLlama, LlamaChatSession } = llama as unknown as {
        getLlama: () => Promise<{ loadModel: (o: { modelPath: string }) => Promise<{ createContext: () => Promise<unknown> }> }>;
        LlamaChatSession: new (o: { contextSequence: unknown }) => { prompt: (p: string) => Promise<string> };
      };
      const runtime = await getLlama();
      const model = await runtime.loadModel({ modelPath: this.config.modelPath! });
      const context = await model.createContext();
      const sequence = (context as { getSequence: () => unknown }).getSequence();
      this.session = new LlamaChatSession({ contextSequence: sequence });
      this.ready = true;
      this.lastError = undefined;
    } catch (err) {
      this.ready = false;
      this.session = null;
      this.lastError = err instanceof Error ? err.message : String(err);
    }
    return this.status();
  }

  status(): LayerStatus {
    return {
      layer: "llm_context",
      available: this.ready,
      degraded: !this.ready,
      modelVersion: this.ready ? MODEL_VERSION : "llm-fallback-keywords",
      detail: this.lastError,
    };
  }

  integrityReport(): ModelIntegrityResult | null {
    return this.integrity;
  }

  async detect(text: string): Promise<DetectionResult> {
    const started = now();
    if (!this.ready || !this.session) {
      const fallback = classifyByKeywords(text);
      return {
        layer: "llm_context",
        entities: [],
        context: fallback,
        processingTimeMs: Math.round((now() - started) * 100) / 100,
        modelVersion: "llm-fallback-keywords",
        degraded: true,
      };
    }
    try {
      const raw = await this.session.prompt(`${SYSTEM_PROMPT}\n\nPROMPT:\n${text.slice(0, 4000)}`);
      const parsed = parseLlmJson(raw);
      return {
        layer: "llm_context",
        entities: [],
        context: parsed,
        processingTimeMs: Math.round((now() - started) * 100) / 100,
        modelVersion: MODEL_VERSION,
        degraded: false,
      };
    } catch {
      const fallback = classifyByKeywords(text);
      return {
        layer: "llm_context",
        entities: [],
        context: fallback,
        processingTimeMs: Math.round((now() - started) * 100) / 100,
        modelVersion: "llm-fallback-keywords",
        degraded: true,
      };
    }
  }
}

function parseLlmJson(raw: string): { contextCategory: ContextCategory; confidence: number; rationale: string } {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return classifyByKeywords(raw);
  try {
    const json = JSON.parse(match[0]!) as { context_category?: string; contextCategory?: string; confidence?: number; rationale?: string };
    const cat = (json.context_category ?? json.contextCategory ?? "Generique") as string;
    const contextCategory = (CONTEXT_CATEGORIES as readonly string[]).includes(cat) ? (cat as ContextCategory) : "Generique";
    return {
      contextCategory,
      confidence: Math.max(0, Math.min(1, Number(json.confidence ?? 0.6))),
      rationale: String(json.rationale ?? "").slice(0, 240),
    };
  } catch {
    return classifyByKeywords(raw);
  }
}
