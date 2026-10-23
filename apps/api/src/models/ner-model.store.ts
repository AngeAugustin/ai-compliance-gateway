import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { NER_BROWSER_MODEL, type PinnedModelFile } from "@acg/shared";
import { env } from "../env.js";

export type ModelFileStatus = "verified" | "absent" | "mismatch";

export interface ModelFileState {
  path: string;
  size: number;
  sha256: string;
  status: ModelFileStatus;
}

/** Empreinte calculée par fichier, invalidée si la taille ou la date de modification change. */
const verified = new Map<string, { mtimeMs: number; size: number; status: ModelFileStatus }>();

function absolutePath(file: PinnedModelFile): string {
  const root = resolve(env.nerBrowserModelDir);
  const abs = resolve(root, file.path);
  // Liste blanche + garde-fou : jamais de fichier hors du dossier du modèle.
  if (!abs.startsWith(root + sep)) throw new Error(`chemin hors du dossier modèle : ${file.path}`);
  return abs;
}

function sha256File(path: string): Promise<string> {
  return new Promise((ok, ko) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => ok(hash.digest("hex")))
      .on("error", ko);
  });
}

/**
 * Vérifie un fichier du modèle contre l'empreinte figée. Un fichier altéré sur
 * le serveur n'est jamais servi : l'agent se replie alors sur le hub (lui aussi vérifié).
 */
export async function checkFile(file: PinnedModelFile): Promise<ModelFileState> {
  const base = { path: file.path, size: file.size, sha256: file.sha256 };
  const abs = absolutePath(file);
  if (!existsSync(abs)) return { ...base, status: "absent" };
  const info = await stat(abs);
  const cached = verified.get(abs);
  if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return { ...base, status: cached.status };
  const status: ModelFileStatus = info.size === file.size && (await sha256File(abs)) === file.sha256 ? "verified" : "mismatch";
  verified.set(abs, { mtimeMs: info.mtimeMs, size: info.size, status });
  return { ...base, status };
}

export async function manifest() {
  const files = await Promise.all(NER_BROWSER_MODEL.files.map(checkFile));
  return {
    id: NER_BROWSER_MODEL.id,
    revision: NER_BROWSER_MODEL.revision,
    dtype: NER_BROWSER_MODEL.dtype,
    available: files.every((f) => f.status === "verified"),
    files,
  };
}

export function servedPath(file: PinnedModelFile): string {
  return absolutePath(file);
}
