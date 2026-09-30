import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export interface ModelIntegrityResult {
  name: string;
  path: string | null;
  expectedSha256: string | null;
  actualSha256: string | null;
  status: "verified" | "mismatch" | "absent" | "unverified" | "hub";
}

export function hubIntegrity(name: string): ModelIntegrityResult {
  return { name, path: null, expectedSha256: null, actualSha256: null, status: "hub" };
}

export async function verifyModelFile(name: string, path: string | undefined, expectedSha256?: string): Promise<ModelIntegrityResult> {
  if (!path || !existsSync(path)) {
    return { name, path: path ?? null, expectedSha256: expectedSha256 ?? null, actualSha256: null, status: "absent" };
  }
  const buf = await readFile(path);
  const actualSha256 = createHash("sha256").update(buf).digest("hex");
  if (!expectedSha256) {
    return { name, path, expectedSha256: null, actualSha256, status: "unverified" };
  }
  return {
    name,
    path,
    expectedSha256: expectedSha256.toLowerCase(),
    actualSha256,
    status: actualSha256 === expectedSha256.toLowerCase() ? "verified" : "mismatch",
  };
}

export function isModelTrusted(result: ModelIntegrityResult): boolean {
  return result.status === "verified" || result.status === "unverified" || result.status === "hub";
}
