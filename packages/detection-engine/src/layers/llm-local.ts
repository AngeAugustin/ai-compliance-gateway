import type { ContextCategory, DetectionResult } from "@acg/shared";
import { CONTEXT_CATEGORIES } from "@acg/shared";
import { now, type DetectionLayerProvider, type LayerStatus } from "./types.js";
import { classifyByKeywords } from "./keyword-context.js";
import { isModelTrusted, verifyModelFile, type ModelIntegrityResult } from "../integrity.js";

const MODEL_VERSION = "phi-3.5-mini-instruct-Q4_K_M";

/**
 * Les définitions guident le modèle (sans elles, « contrat » part en RH).
 * La réponse est réduite au seul nom de catégorie, imposé par une grammaire :
 * 2-3 jetons générés au lieu d'une vingtaine pour un JSON, soit ~2 s au lieu
 * de ~10 s sur un CPU portable.
 */
const SYSTEM_PROMPT = `Classe la demande d'un employé dans UNE catégorie :
- RH : salariés, recrutement, paie, congés, évaluations.
- Finance : comptabilité, budget, factures, marges, banque.
- Juridique : contrats, clauses, litiges, conformité, RGPD.
- Technique : code, logiciel, serveurs, bases de données.
- Medical : santé, patients, diagnostics, traitements.
- Generique : tout le reste.
Réponds uniquement par le nom de la catégorie.`;

const CATEGORY_GRAMMAR = `root ::= ${CONTEXT_CATEGORIES.map((c) => `"${c}"`).join(" | ")}`;

/** Le début du texte suffit à classer ; chaque caractère lu coûte du temps CPU. */
const MAX_INPUT_CHARS = 1500;
const CONTEXT_SIZE = 2048;

export interface LlmLocalConfig {
  modelPath?: string;
  expectedSha256?: string;
  /**
   * Accélération : "cpu" (défaut), "auto", "vulkan", "cuda" ou "metal".
   * Défaut CPU : sur un GPU intégré (Intel UHD), Vulkan est 2 à 3 fois plus lent.
   * Lu depuis LLM_GPU si absent.
   */
  gpu?: string;
}

type ChatSession = {
  prompt: (p: string, o?: { grammar?: unknown; maxTokens?: number; temperature?: number }) => Promise<string>;
  getChatHistory: () => unknown;
  setChatHistory: (h: unknown) => void;
};

export class LlmLocalLayer implements DetectionLayerProvider {
  readonly layer = "llm_context" as const;
  /**
   * Sans modèle GGUF, la classification de contexte se rabat sur les mots-clés :
   * les entités restent toutes détectées, seul le facteur « contexte » (15 %) est
   * moins fin. Ce n'est pas une raison de passer en fail-closed.
   */
  readonly optional = true;
  private ready = false;
  private session: ChatSession | null = null;
  private initialHistory: unknown = null;
  private grammar: unknown = null;
  /** Une seule séquence de contexte : les appels concurrents passent un par un. */
  private queue: Promise<unknown> = Promise.resolve();
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
        getLlama: (o?: { gpu?: unknown }) => Promise<{
          loadModel: (o: { modelPath: string }) => Promise<{ createContext: (o?: { contextSize?: number }) => Promise<unknown> }>;
          createGrammar: (o: { grammar: string }) => Promise<unknown>;
        }>;
        LlamaChatSession: new (o: { contextSequence: unknown; systemPrompt?: string }) => ChatSession;
      };
      const runtime = await getLlama({ gpu: resolveGpu(this.config.gpu ?? process.env.LLM_GPU) });
      const model = await runtime.loadModel({ modelPath: this.config.modelPath! });
      const context = await model.createContext({ contextSize: CONTEXT_SIZE });
      const sequence = (context as { getSequence: () => unknown }).getSequence();
      this.session = new LlamaChatSession({ contextSequence: sequence, systemPrompt: SYSTEM_PROMPT });
      this.initialHistory = this.session.getChatHistory();
      this.grammar = await runtime.createGrammar({ grammar: CATEGORY_GRAMMAR });
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
    const done = (context: DetectionResult["context"], degraded: boolean): DetectionResult => ({
      layer: "llm_context",
      entities: [],
      context,
      processingTimeMs: Math.round((now() - started) * 100) / 100,
      modelVersion: degraded ? "llm-fallback-keywords" : MODEL_VERSION,
      degraded,
    });
    const keywords = classifyByKeywords(text);
    if (!this.ready || !this.session) return done(keywords, true);
    try {
      const category = await this.classify(text);
      return done(withConfidence(category, keywords), false);
    } catch {
      return done(keywords, true);
    }
  }

  private classify(text: string): Promise<ContextCategory> {
    const run = async (): Promise<ContextCategory> => {
      const session = this.session!;
      // Chaque prompt est classé seul : on repart de l'historique initial
      // (sinon les échanges précédents s'accumulent et ralentissent tout).
      session.setChatHistory(this.initialHistory);
      const raw = await session.prompt(`Demande :\n${text.slice(0, MAX_INPUT_CHARS)}`, {
        grammar: this.grammar,
        maxTokens: 8,
        temperature: 0,
      });
      const cat = raw.trim();
      return (CONTEXT_CATEGORIES as readonly string[]).includes(cat) ? (cat as ContextCategory) : "Generique";
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

function resolveGpu(value: string | undefined): unknown {
  const v = (value ?? "cpu").trim().toLowerCase();
  if (v === "" || v === "cpu" || v === "false" || v === "0") return false;
  return v; // "auto" | "vulkan" | "cuda" | "metal"
}

/**
 * Le modèle ne renvoie que la catégorie ; la confiance vient de son accord avec
 * les lexiques métier (deux méthodes indépendantes qui concordent).
 */
function withConfidence(
  category: ContextCategory,
  keywords: { contextCategory: ContextCategory; confidence: number; rationale: string },
): { contextCategory: ContextCategory; confidence: number; rationale: string } {
  if (keywords.contextCategory === category) {
    return { contextCategory: category, confidence: 0.9, rationale: `LLM local, confirmé par ${keywords.rationale}` };
  }
  return { contextCategory: category, confidence: 0.75, rationale: `LLM local (lexiques : ${keywords.contextCategory})` };
}
