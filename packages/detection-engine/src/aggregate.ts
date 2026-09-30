import type { AggregatedDetection, DetectionResult, SensitiveEntity } from "@acg/shared";

function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/**
 * Fusionne les entités des couches : même span (chevauchement) et même type
 * → on conserve la confiance la plus haute. Types différents sur le même span
 * → on conserve le plus sensible (déjà ordonné par les couches, ici max confidence).
 */
export function mergeEntities(results: DetectionResult[]): SensitiveEntity[] {
  const merged: SensitiveEntity[] = [];
  const all = results.flatMap((r) => r.entities).sort((a, b) => a.span[0] - b.span[0] || b.confidence - a.confidence);
  for (const entity of all) {
    const clash = merged.find((e) => overlaps(e.span, entity.span));
    if (!clash) {
      merged.push(entity);
      continue;
    }
    if (entity.entityType === clash.entityType) {
      if (entity.confidence > clash.confidence) {
        merged.splice(merged.indexOf(clash), 1, entity);
      }
    } else if (entity.confidence > clash.confidence + 0.05) {
      merged.splice(merged.indexOf(clash), 1, entity);
    }
  }
  return merged.sort((a, b) => a.span[0] - b.span[0]);
}

export function aggregateResults(results: DetectionResult[]): AggregatedDetection {
  const entities = mergeEntities(results);
  const contextResults = results.filter((r) => r.context).sort((a, b) => (b.context?.confidence ?? 0) - (a.context?.confidence ?? 0));
  const context = contextResults[0]?.context ?? null;
  return {
    entities,
    context,
    layers: results.map((r) => r.layer),
    degraded: results.some((r) => r.degraded),
    totalProcessingTimeMs: results.reduce((s, r) => s + r.processingTimeMs, 0),
    results,
  };
}
