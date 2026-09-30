import { z } from "zod";
import { CONTEXT_CATEGORIES, ENTITY_TYPES } from "../domain/entities.js";

export const DETECTION_LAYERS = ["rules", "ner", "llm_context", "keyword_context"] as const;
export type DetectionLayer = (typeof DETECTION_LAYERS)[number];

export const SensitiveEntitySchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  confidence: z.number().min(0).max(1),
  /** Position dans le texte source [start, end) — jamais la valeur elle-même côté serveur */
  span: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
  /** Couche ayant produit l'entité */
  layer: z.enum(DETECTION_LAYERS),
  /** Valeur en clair : présente uniquement côté agent, retirée avant toute transmission */
  value: z.string().optional(),
});
export type SensitiveEntity = z.infer<typeof SensitiveEntitySchema>;

export const ContextClassificationSchema = z.object({
  contextCategory: z.enum(CONTEXT_CATEGORIES),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(240).optional(),
});
export type ContextClassification = z.infer<typeof ContextClassificationSchema>;

/**
 * Contrat de sortie unique de chaque couche de détection (DAT §8).
 * La comparabilité des couches (Objectif 4) repose sur ce contrat.
 */
export const DetectionResultSchema = z.object({
  layer: z.enum(DETECTION_LAYERS),
  entities: z.array(SensitiveEntitySchema),
  context: ContextClassificationSchema.optional(),
  processingTimeMs: z.number().nonnegative(),
  modelVersion: z.string(),
  /** true si la couche a fonctionné en mode dégradé (modèle non chargé, repli) */
  degraded: z.boolean().default(false),
});
export type DetectionResult = z.infer<typeof DetectionResultSchema>;

/** Version transmissible au serveur : entités sans valeur en clair. */
export const DetectionResultWireSchema = DetectionResultSchema.extend({
  entities: z.array(SensitiveEntitySchema.omit({ value: true })),
});
export type DetectionResultWire = z.infer<typeof DetectionResultWireSchema>;

export function stripEntityValues(result: DetectionResult): DetectionResultWire {
  return {
    ...result,
    entities: result.entities.map(({ value: _value, ...rest }) => rest),
  };
}

/** Résultat agrégé des trois couches (DAT §8.4). */
export interface AggregatedDetection {
  entities: SensitiveEntity[];
  context: ContextClassification | null;
  layers: DetectionLayer[];
  degraded: boolean;
  totalProcessingTimeMs: number;
  results: DetectionResult[];
}
