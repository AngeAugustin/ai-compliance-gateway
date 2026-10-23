import { hubFileUrl, type PinnedModel, type PinnedModelFile } from "@acg/shared";

export type ModelSource = "api" | "hub" | "cache";

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** URL du fichier sur l'API ACG (voir apps/api/src/models/models.controller.ts). */
export function apiFileUrl(apiUrl: string, file: PinnedModelFile): string {
  return `${apiUrl.replace(/\/$/, "")}/v1/models/ner/files/${file.path}`;
}

/**
 * Télécharge un fichier du modèle en essayant l'API ACG puis le hub, et ne
 * l'accepte que si son SHA-256 correspond à l'empreinte figée.
 */
export async function fetchVerified(
  model: PinnedModel,
  file: PinnedModelFile,
  apiUrl: string | null,
  fetchFn: FetchFn,
): Promise<{ body: ArrayBuffer; source: Exclude<ModelSource, "cache"> }> {
  const candidates: { source: "api" | "hub"; url: string }[] = [];
  if (apiUrl) candidates.push({ source: "api", url: apiFileUrl(apiUrl, file) });
  candidates.push({ source: "hub", url: hubFileUrl(model, file.path) });

  const errors: string[] = [];
  for (const { source, url } of candidates) {
    try {
      const res = await fetchFn(url);
      if (!res.ok) {
        errors.push(`${source} : HTTP ${res.status}`);
        continue;
      }
      const body = await res.arrayBuffer();
      const actual = await sha256Hex(body);
      if (actual !== file.sha256) {
        errors.push(`${source} : empreinte invalide (${actual.slice(0, 12)}… ≠ ${file.sha256.slice(0, 12)}…)`);
        continue;
      }
      return { body, source };
    } catch (err) {
      errors.push(`${source} : ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`Fichier ${file.path} refusé — ${errors.join(" ; ")}`);
}

/** Supprime les caches de modèle d'anciennes révisions (et l'ancien cache générique). */
export async function purgeStaleCaches(currentKey: string): Promise<void> {
  if (typeof caches === "undefined") return;
  for (const key of await caches.keys()) {
    if (key !== currentKey && (key.startsWith("acg-ner-") || key === "transformers-cache")) await caches.delete(key);
  }
}

/**
 * Revérifie les fichiers déjà en cache : transformers.js les relit sans repasser
 * par env.fetch. Une entrée altérée est supprimée (elle sera retéléchargée et vérifiée).
 * Renvoie true si tous les fichiers étaient présents et intègres.
 */
export async function verifyCachedFiles(cacheKey: string, model: PinnedModel): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  const cache = await caches.open(cacheKey);
  let complete = true;
  for (const file of model.files) {
    const url = hubFileUrl(model, file.path);
    const hit = await cache.match(url);
    if (!hit) {
      complete = false;
      continue;
    }
    if ((await sha256Hex(await hit.arrayBuffer())) !== file.sha256) {
      await cache.delete(url);
      complete = false;
    }
  }
  return complete;
}
