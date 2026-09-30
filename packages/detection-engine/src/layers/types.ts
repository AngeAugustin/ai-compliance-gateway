import type { DetectionLayer, DetectionResult } from "@acg/shared";

export interface LayerStatus {
  layer: DetectionLayer;
  available: boolean;
  degraded: boolean;
  modelVersion: string;
  detail?: string;
}

/** Interface commune à chaque couche de détection (contrat de sortie unique, DAT §8). */
export interface DetectionLayerProvider {
  readonly layer: DetectionLayer;
  /** Charge le modèle si nécessaire ; ne lève jamais : renvoie un statut. */
  initialize(): Promise<LayerStatus>;
  status(): LayerStatus;
  detect(text: string): Promise<DetectionResult>;
}

export function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
