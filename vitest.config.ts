import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    environment: "node",
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      include: ["packages/**/src/**", "apps/**/src/**"],
    },
  },
});
