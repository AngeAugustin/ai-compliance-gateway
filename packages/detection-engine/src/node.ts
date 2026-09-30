/**
 * Point d'entrée Node : ajoute la couche 2 (NER ONNX via transformers.js) et la
 * couche 3 (LLM local via node-llama-cpp), chargées dynamiquement et
 * facultatives, avec vérification d'intégrité des poids (DAT §11.1).
 */
export * from "./index.js";
export * from "./layers/ner-onnx.js";
export * from "./layers/llm-local.js";
export * from "./integrity.js";
export { createNodeDetectionEngine, type NodeDetectionEngineConfig } from "./node-factory.js";
