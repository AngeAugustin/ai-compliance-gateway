import type { AggregatedDetection, DetectionResult, SensitiveEntity } from "@acg/shared";

function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

function contains(outer: [number, number], inner: [number, number]): boolean {
  return outer[0] <= inner[0] && inner[1] <= outer[1] && outer[1] - outer[0] > inner[1] - inner[0];
}

/**
 * Fusionne les entités des couches. Une entité incluse dans une autre cède toujours
 * la place à l'englobante : un fragment (« api » vu comme organisation par le NER)
 * ne doit pas tronquer une valeur structurée (l'URL qui le contient) et laisser
 * le reste en clair. Sinon, même type → confiance la plus haute ; types différents
 * → la nouvelle entité ne l'emporte qu'avec une confiance nettement supérieure.
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
    if (contains(clash.span, entity.span)) continue;
    if (contains(entity.span, clash.span)) {
      merged.splice(merged.indexOf(clash), 1, entity);
    } else if (entity.entityType === clash.entityType) {
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
