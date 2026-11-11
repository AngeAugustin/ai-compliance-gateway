import { defineConfig } from "vitest/config";

/** Tableau de bord dans Chromium contre l'API réelle : hors de `pnpm test` (API et base jetable requises). */
export default defineConfig({
  test: {
    include: ["apps/dashboard/e2e/**/*.e2e.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
