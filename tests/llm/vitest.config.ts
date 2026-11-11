import { defineConfig } from "vitest/config";

/** LLM de contexte avec le vrai modèle GGUF : hors de `pnpm test` (2,4 Go, ~3 s par prompt sur CPU). */
export default defineConfig({
  test: {
    include: ["packages/detection-engine/src/**/*.llm.ts"],
    environment: "node",
    testTimeout: 600_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});
