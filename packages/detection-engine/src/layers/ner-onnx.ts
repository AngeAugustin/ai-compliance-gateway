import type { DetectionResult } from "@acg/shared";
import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { now, type DetectionLayerProvider, type LayerStatus } from "./types.js";
import { hubIntegrity, verifyModelFile, type ModelIntegrityResult } from "../integrity.js";
import { DEFAULT_NER_HUB_MODEL, runNerPipeline, type NerPipeline } from "./ner-common.js";

export interface NerOnnxConfig {
  modelPath?: string;
  expectedSha256?: string;
  /** Autorise le téléchargement du modèle Xenova depuis le hub (défaut : true). */
  allowHub?: boolean;
  hubModel?: string;
}

/** NER_MODEL_PATH désigne-t-il un dossier de modèle transformers.js ? Précision déduite du fichier ONNX présent. */
function localModelDir(path: string): { parent: string; name: string; onnxFile: string; dtype: "fp32" | "q8" } | null {
  if (!existsSync(path) || !statSync(path).isDirectory()) return null;
  const full = resolve(path);
  const fp32 = join(full, "onnx", "model.onnx");
  const q8 = join(full, "onnx", "model_quantized.onnx");
  const onnxFile = existsSync(fp32) ? fp32 : existsSync(q8) ? q8 : null;
  if (!onnxFile) return null;
  return { parent: dirname(full) + sep, name: basename(full), onnxFile, dtype: onnxFile === fp32 ? "fp32" : "q8" };
}

/**
 * Couche 2 — NER via @huggingface/transformers si le modèle est présent.
 * En cas d'absence ou d'échec : couche désactivée (degraded), la couche 1 reste opérationnelle.
 */
export class NerOnnxLayer implements DetectionLayerProvider {
  readonly layer = "ner" as const;
  private ready = false;
  private pipeline: NerPipeline | null = null;
  private integrity: ModelIntegrityResult | null = null;
  private lastError: string | undefined;

  constructor(private readonly config: NerOnnxConfig = {}) {}

  async initialize(): Promise<LayerStatus> {
    const allowHub = this.config.allowHub !== false && process.env.NER_DISABLE_HUB !== "1";
    const local = this.config.modelPath ? localModelDir(this.config.modelPath) : null;
    if (local) {
      // Dossier au format transformers.js (config, tokenizer, onnx/…) : l'empreinte porte sur le fichier ONNX.
      this.integrity = await verifyModelFile("ner", local.onnxFile, this.config.expectedSha256);
    } else if (this.config.modelPath) {
      this.integrity = await verifyModelFile("ner", this.config.modelPath, this.config.expectedSha256);
    } else if (allowHub) {
      this.integrity = hubIntegrity("ner");
    } else {
      this.integrity = await verifyModelFile("ner", undefined, this.config.expectedSha256);
    }
    if (this.integrity.status === "mismatch" || (this.integrity.status === "absent" && !allowHub)) {
      this.ready = false;
      this.lastError = this.integrity.status === "mismatch" ? "checksum NER invalide" : "modèle NER absent";
      return this.status();
    }
    if (this.integrity.status === "absent" && allowHub) {
      this.integrity = hubIntegrity("ner");
    }
    try {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowLocalModels = true;
      env.allowRemoteModels = this.integrity.status === "hub";
      const hubId = this.config.hubModel ?? process.env.NER_HUB_MODEL ?? DEFAULT_NER_HUB_MODEL;
      if (local) {
        // Même modèle que l'extension (models/ner-browser), chargé sans réseau.
        env.localModelPath = local.parent;
        this.pipeline = (await pipeline("token-classification", local.name, { dtype: local.dtype })) as unknown as NerPipeline;
      } else {
        const model = this.config.modelPath && existsSync(this.config.modelPath) ? this.config.modelPath : hubId;
        this.pipeline = (await pipeline("token-classification", model)) as unknown as NerPipeline;
      }
      this.ready = true;
      this.lastError = undefined;
    } catch (err) {
      this.ready = false;
      this.pipeline = null;
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = /Cannot find module|ERR_MODULE_NOT_FOUND/i.test(msg)
        ? "@huggingface/transformers non installé — couche NER désactivée"
        : msg;
    }
    return this.status();
  }

  status(): LayerStatus {
    return {
      layer: "ner",
      available: this.ready,
      degraded: !this.ready,
      modelVersion: this.ready ? "transformers-ner" : "ner-unavailable",
      detail: this.lastError,
    };
  }

  integrityReport(): ModelIntegrityResult | null {
    return this.integrity;
  }

  async detect(text: string): Promise<DetectionResult> {
    const started = now();
    if (!this.ready || !this.pipeline) {
      return {
        layer: "ner",
        entities: [],
        processingTimeMs: Math.round((now() - started) * 100) / 100,
        modelVersion: "ner-unavailable",
        degraded: true,
      };
    }
    try {
      const entities = await runNerPipeline(this.pipeline, text);
      return {
        layer: "ner",
        entities,
        processingTimeMs: Math.round((now() - started) * 100) / 100,
        modelVersion: "transformers-ner",
        degraded: false,
      };
    } catch (err) {
      return {
        layer: "ner",
        entities: [],
        processingTimeMs: Math.round((now() - started) * 100) / 100,
        modelVersion: "ner-error",
        degraded: true,
      };
    }
  }
}
