import { defineConfig } from "vitest/config";

/** Tests de l'extension dans Chromium : hors de `pnpm test` (navigateur et build requis). */
export default defineConfig({
  test: {
    include: ["apps/agent-browser/e2e/**/*.e2e.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
