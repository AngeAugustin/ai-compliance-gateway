/**
 * Point d'entrée neutre (navigateur + Node) : couche 1 (règles), repli de la
 * couche 3 (mots-clés), agrégation et masquage. Aucune dépendance Node.
 */
export * from "./layers/types.js";
export * from "./layers/rules/index.js";
export * from "./layers/keyword-context.js";
export * from "./aggregate.js";
export * from "./masking.js";
export { DetectionEngine, type DetectionEngineOptions, type DetectionLayerProvider } from "./engine.js";
export * from "./tuning.js";
export { findPhoneCandidates, type PhoneCandidate } from "./layers/rules/phones.js";
export * from "./layers/ner-common.js";
