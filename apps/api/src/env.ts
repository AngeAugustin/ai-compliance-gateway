import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env.example"), override: false });
config({ path: resolve(process.cwd(), "../../.env.example"), override: false });

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export const env = {
  databaseUrl: req("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/ai_compliance_gateway"),
  apiPort: Number(process.env.API_PORT ?? 4000),
  apiPublicUrl: req("API_PUBLIC_URL", "http://localhost:4000"),
  jwtSecret: req("JWT_SECRET", "change-me-in-production-please-use-48-random-bytes"),
  /** Access token TTL (secondes). Court pour permettre une révocation efficace. */
  jwtTtlSeconds: Number(process.env.JWT_TTL_SECONDS ?? 900),
  /** Refresh token TTL (secondes). */
  jwtRefreshTtlSeconds: Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 604800),
  loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5),
  loginLockoutSeconds: Number(process.env.LOGIN_LOCKOUT_SECONDS ?? 900),
  loginRateLimitPerMinute: Number(process.env.LOGIN_RATE_LIMIT_PER_MINUTE ?? 5),
  vaultMasterKey: req("VAULT_MASTER_KEY", "ZGV2LW9ubHktdmF1bHQta2V5LTMyLWJ5dGVzLS0tLS0tLQ=="),
  auditUserSalt: req("AUDIT_USER_SALT", "dev-only-audit-salt"),
  heartbeatTimeoutSeconds: Number(process.env.HEARTBEAT_TIMEOUT_SECONDS ?? 300),
  heartbeatCheckIntervalSeconds: Number(process.env.HEARTBEAT_CHECK_INTERVAL_SECONDS ?? 30),
  organizationJurisdiction: req("ORGANIZATION_JURISDICTION", "BJ"),
  regulatoryFramework: req("REGULATORY_FRAMEWORK", "BJ_MALABO"),
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",").map((s) => s.trim()),
  nerModelPath: process.env.NER_MODEL_PATH || undefined,
  llmModelPath: process.env.LLM_MODEL_PATH || undefined,
  nerModelSha256: process.env.NER_MODEL_SHA256 || undefined,
  llmModelSha256: process.env.LLM_MODEL_SHA256 || undefined,
  nerDisableHub: process.env.NER_DISABLE_HUB === "1",
  nerHubModel: process.env.NER_HUB_MODEL || undefined,
  apiTlsCert: process.env.API_TLS_CERT || undefined,
  apiTlsKey: process.env.API_TLS_KEY || undefined,
};
