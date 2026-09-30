import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.example"), override: false });

export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/ai_compliance_gateway";
export const DATABASE_ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";

export function databaseNameFromUrl(url: string): string {
  const parsed = new URL(url);
  return parsed.pathname.replace(/^\//, "");
}
