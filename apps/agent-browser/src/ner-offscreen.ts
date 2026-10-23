import type { DetectionLayerProvider, LayerStatus } from "@acg/detection-engine";
import { NER_BROWSER_MODEL, type DetectionResult, type SensitiveEntity } from "@acg/shared";

const OFFSCREEN_URL = "offscreen.html";
/** Au-delà, le prompt part avec les seules règles plutôt que de bloquer l'utilisateur. */
const DETECT_TIMEOUT_MS = 5_000;
/** Après un réveil du SW, le modèle est souvent déjà chargé dans l'offscreen : courte attente. */
const WARM_WAIT_MS = 1_500;

function sleep(ms: number): Promise<null> {
  return new Promise((r) => setTimeout(() => r(null), ms));
}

/**
 * Couche 2 (NER) côté service worker A1 : relaie le texte vers le document
 * offscreen qui exécute le modèle. Couche « optionnelle » : tant que le modèle
 * se télécharge, l'agent fonctionne avec les règles sans passer en fail-closed.
 */
export class OffscreenNerLayer implements DetectionLayerProvider {
  readonly layer = "ner" as const;
  readonly optional = true;
  private ready = false;
  private lastError: string | undefined = "chargement du modèle NER";
  private warming: Promise<void> | null = null;

  /** @param getApiUrl URL de l'API ACG, source prioritaire des poids du modèle (réseau local). */
  constructor(private readonly getApiUrl: () => string | null = () => null) {}

  async initialize(): Promise<LayerStatus> {
    void this.warmup();
    return this.status();
  }

  status(): LayerStatus {
    return {
      layer: "ner",
      available: this.ready,
      degraded: !this.ready,
      modelVersion: this.ready ? `transformers-ner:${NER_BROWSER_MODEL.id}@${NER_BROWSER_MODEL.revision.slice(0, 7)}` : "ner-unavailable",
      detail: this.ready ? undefined : this.lastError,
    };
  }

  private async ensureDocument(): Promise<void> {
    if (chrome.offscreen.hasDocument && (await chrome.offscreen.hasDocument())) return;
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ["WORKERS"],
        justification: "Exécution locale du modèle NER (noms, lieux) sur les prompts avant envoi à un service d'IA.",
      });
    } catch (err) {
      // Création concurrente : un seul document offscreen par extension.
      if (!/single offscreen|already exists/i.test(String(err))) throw err;
    }
  }

  warmup(): Promise<void> {
    if (!this.warming) {
      this.warming = (async () => {
        await this.ensureDocument();
        const res = (await chrome.runtime.sendMessage({ target: "offscreen", type: "NER_WARMUP", apiUrl: this.getApiUrl() })) as { ready?: boolean; error?: string } | undefined;
        this.ready = res?.ready === true;
        this.lastError = res?.error;
      })()
        .catch((err) => {
          this.ready = false;
          this.lastError = String(err);
        })
        .finally(() => {
          this.warming = null;
        });
    }
    return this.warming;
  }

  async detect(text: string): Promise<DetectionResult> {
    const started = performance.now();
    if (!this.ready) await Promise.race([this.warmup(), sleep(WARM_WAIT_MS)]);
    if (this.ready) {
      try {
        const res = (await Promise.race([
          chrome.runtime.sendMessage({ target: "offscreen", type: "NER_DETECT", text, apiUrl: this.getApiUrl() }),
          sleep(DETECT_TIMEOUT_MS),
        ])) as { ready?: boolean; entities?: SensitiveEntity[]; error?: string } | null;
        if (res?.ready && res.entities) {
          return this.result(started, res.entities, false);
        }
        this.ready = res?.ready === true;
        this.lastError = res?.error ?? "délai NER dépassé";
      } catch (err) {
        this.ready = false;
        this.lastError = String(err);
      }
    }
    return this.result(started, [], true);
  }

  private result(started: number, entities: SensitiveEntity[], degraded: boolean): DetectionResult {
    return {
      layer: "ner",
      entities,
      processingTimeMs: Math.round((performance.now() - started) * 100) / 100,
      modelVersion: degraded ? "ner-unavailable" : "transformers-ner",
      degraded,
    };
  }
}
