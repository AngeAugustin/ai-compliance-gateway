import { DetectionEngine } from "./engine.js";
import { LlmLocalLayer } from "./layers/llm-local.js";
import { NerOnnxLayer } from "./layers/ner-onnx.js";

export interface NodeDetectionEngineConfig {
  nerModelPath?: string;
  nerModelSha256?: string;
  llmModelPath?: string;
  llmModelSha256?: string;
  allowHub?: boolean;
  nerHubModel?: string;
}

export async function createNodeDetectionEngine(config: NodeDetectionEngineConfig = {}): Promise<DetectionEngine> {
  const extra = [
    new NerOnnxLayer({
      modelPath: config.nerModelPath,
      expectedSha256: config.nerModelSha256,
      allowHub: config.allowHub,
      hubModel: config.nerHubModel,
    }),
    new LlmLocalLayer({ modelPath: config.llmModelPath, expectedSha256: config.llmModelSha256 }),
  ];
  const engine = new DetectionEngine({ extraLayers: extra });
  await engine.initialize();
  return engine;
}
