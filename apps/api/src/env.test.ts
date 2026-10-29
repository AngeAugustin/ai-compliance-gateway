import { afterEach, describe, expect, it, vi } from "vitest";

const STRONG = {
  JWT_SECRET: "x".repeat(48),
  VAULT_MASTER_KEY: Buffer.alloc(32, 7).toString("base64"),
  AUDIT_USER_SALT: "sel-de-production-0123456789",
};

async function loadEnv(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  return (await import("./env.js")).env;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("secrets en production", () => {
  it("refuse la valeur de développement du secret JWT", async () => {
    await expect(loadEnv({ NODE_ENV: "production", ...STRONG, JWT_SECRET: "change-me-in-production-please-use-48-random-bytes" })).rejects.toThrow(
      /JWT_SECRET a sa valeur de développement/,
    );
  });

  it("refuse la clé de Vault de développement", async () => {
    await expect(
      loadEnv({ NODE_ENV: "production", ...STRONG, VAULT_MASTER_KEY: "ZGV2LW9ubHktdmF1bHQta2V5LTMyLWJ5dGVzLS0tLS0tLQ==" }),
    ).rejects.toThrow(/VAULT_MASTER_KEY/);
  });

  it("démarre avec des secrets propres en production, et avec les valeurs de dev hors production", async () => {
    expect((await loadEnv({ NODE_ENV: "production", ...STRONG })).jwtSecret).toBe(STRONG.JWT_SECRET);
    expect((await loadEnv({ NODE_ENV: "test" })).jwtSecret).toBeTruthy();
  });
});
