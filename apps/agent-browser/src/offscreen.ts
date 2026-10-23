import { env, pipeline } from "@huggingface/transformers";
import { runNerPipeline, type NerPipeline } from "@acg/detection-engine";
import { NER_BROWSER_MODEL, pinnedModelFile } from "@acg/shared";
import { fetchVerified, purgeStaleCaches, verifyCachedFiles, type ModelSource } from "./model-fetch.js";

/**
 * Document offscreen A1 : héberge le modèle NER (transformers.js + ONNX Runtime WASM).
 *
 * Pourquoi pas dans le service worker : import() dynamique y est interdit (ORT en a
 * besoin) et le SW MV3 est tué après ~30 s d'inactivité, ce qui forcerait à recharger
 * le modèle à chaque prompt. Le document offscreen garde le modèle en mémoire.
 *
 * Le texte analysé ne quitte jamais le poste. Les poids viennent de l'API ACG (réseau
 * local) ou, à défaut, du hub Hugging Face — toujours vérifiés par SHA-256.
 */

const CACHE_KEY = `acg-ner-${NER_BROWSER_MODEL.revision.slice(0, 12)}`;
/** Tout le dépôt du modèle, quelle que soit la révision : transformers.js pré-lit la config sur « main ». */
const HUB_REPO_PREFIX = `https://huggingface.co/${NER_BROWSER_MODEL.id}/resolve/`;

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;
// Cache dédié à la révision figée : un changement de modèle n'hérite jamais d'anciens fichiers.
env.cacheKey = CACHE_KEY;
// Le cache WASM charge la fabrique ORT depuis une URL blob:, refusée par la CSP des extensions.
env.useWasmCache = false;
const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number; proxy?: boolean } };
if (onnx.wasm) {
  // Fichiers ORT embarqués dans l'extension (MV3 interdit le code distant).
  onnx.wasm.wasmPaths = {
    mjs: chrome.runtime.getURL("ort/ort-wasm-simd-threaded.asyncify.mjs"),
    wasm: chrome.runtime.getURL("ort/ort-wasm-simd-threaded.asyncify.wasm"),
  };
  // Pas d'isolation cross-origin dans un document d'extension : pas de SharedArrayBuffer.
  onnx.wasm.numThreads = 1;
}

let apiUrl: string | null = null;
let ner: NerPipeline | null = null;
let loading: Promise<void> | null = null;
let lastError: string | undefined;
const sources = new Set<ModelSource>();

/**
 * Toute requête de transformers.js vers le dépôt du modèle passe par ici :
 * API ACG d'abord, hub ensuite, empreinte SHA-256 obligatoire dans les deux cas.
 * Un fichier hors du manifeste figé n'est jamais téléchargé (404 simulé).
 */
const nativeFetch = globalThis.fetch.bind(globalThis);
env.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith(HUB_REPO_PREFIX)) return nativeFetch(input, init);
  // « <révision>/<chemin> » : on sert toujours la révision figée, jamais une autre.
  const path = url.slice(HUB_REPO_PREFIX.length).split("?")[0]!.split("/").slice(1).join("/");
  const file = pinnedModelFile(NER_BROWSER_MODEL, path);
  if (!file) return new Response(null, { status: 404, statusText: "Hors manifeste ACG" });
  const { body, source } = await fetchVerified(NER_BROWSER_MODEL, file, apiUrl, nativeFetch);
  sources.add(source);
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": file.contentType, "Content-Length": String(body.byteLength) },
  });
};

function load(): Promise<void> {
  if (ner) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      try {
        await purgeStaleCaches(CACHE_KEY);
        // transformers.js relit son cache sans repasser par env.fetch : on le revérifie ici.
        if (await verifyCachedFiles(CACHE_KEY, NER_BROWSER_MODEL)) sources.add("cache");
        ner = (await pipeline("token-classification", NER_BROWSER_MODEL.id, {
          revision: NER_BROWSER_MODEL.revision,
          device: "wasm",
          dtype: NER_BROWSER_MODEL.dtype,
        })) as unknown as NerPipeline;
        lastError = undefined;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        ner = null;
      } finally {
        loading = null;
      }
    })();
  }
  return loading;
}

function status() {
  return { ready: ner !== null, error: lastError, model: `${NER_BROWSER_MODEL.id}@${NER_BROWSER_MODEL.revision.slice(0, 7)}`, sources: [...sources] };
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message.target !== "offscreen") return false;
  void (async () => {
    if (typeof message.apiUrl === "string" && message.apiUrl) apiUrl = message.apiUrl.replace(/\/$/, "");
    if (message.type === "NER_WARMUP") {
      await load();
      reply(status());
      return;
    }
    if (message.type === "NER_DETECT") {
      if (!ner) {
        void load();
        reply({ ...status(), error: lastError ?? "modèle NER en cours de chargement" });
        return;
      }
      const entities = await runNerPipeline(ner, String(message.text ?? ""));
      reply({ ready: true, entities });
      return;
    }
    reply(status());
  })().catch((err) => reply({ ready: ner !== null, error: String(err) }));
  return true;
});
