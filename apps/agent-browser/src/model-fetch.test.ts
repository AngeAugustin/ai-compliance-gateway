import { describe, expect, it } from "vitest";
import { hubFileUrl, type PinnedModel } from "@acg/shared";
import { apiFileUrl, fetchVerified, sha256Hex } from "./model-fetch.js";

const good = new TextEncoder().encode("poids du modèle");
const bad = new TextEncoder().encode("poids altérés");

async function pinned(): Promise<PinnedModel> {
  return {
    id: "acme/ner",
    revision: "abc123",
    dtype: "q8",
    files: [{ path: "onnx/model_quantized.onnx", sha256: await sha256Hex(good.buffer as ArrayBuffer), size: good.byteLength, contentType: "application/octet-stream" }],
  };
}

function fakeFetch(routes: Record<string, Uint8Array | number>) {
  const calls: string[] = [];
  const fn = async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = routes[url];
    if (route === undefined) throw new Error("réseau indisponible");
    if (typeof route === "number") return new Response(null, { status: route });
    return new Response(route as BodyInit);
  };
  return { fn, calls };
}

describe("téléchargement vérifié du modèle", () => {
  it("prend l'API ACG en priorité quand le fichier est intègre", async () => {
    const model = await pinned();
    const file = model.files[0]!;
    const { fn, calls } = fakeFetch({ [apiFileUrl("http://acg.local:4000", file)]: good });
    const res = await fetchVerified(model, file, "http://acg.local:4000", fn);
    expect(res.source).toBe("api");
    expect(calls).toEqual(["http://acg.local:4000/v1/models/ner/files/onnx/model_quantized.onnx"]);
  });

  it("refuse un fichier altéré servi par l'API et se replie sur le hub", async () => {
    const model = await pinned();
    const file = model.files[0]!;
    const { fn } = fakeFetch({ [apiFileUrl("http://acg.local:4000", file)]: bad, [hubFileUrl(model, file.path)]: good });
    const res = await fetchVerified(model, file, "http://acg.local:4000", fn);
    expect(res.source).toBe("hub");
    expect(hubFileUrl(model, file.path)).toBe("https://huggingface.co/acme/ner/resolve/abc123/onnx/model_quantized.onnx");
  });

  it("échoue si aucune source ne fournit le bon fichier", async () => {
    const model = await pinned();
    const file = model.files[0]!;
    const { fn } = fakeFetch({ [apiFileUrl("http://acg.local:4000", file)]: 404, [hubFileUrl(model, file.path)]: bad });
    await expect(fetchVerified(model, file, "http://acg.local:4000", fn)).rejects.toThrow(/api : HTTP 404 ; hub : empreinte invalide/);
  });

  it("va directement au hub sans URL d'API", async () => {
    const model = await pinned();
    const file = model.files[0]!;
    const { fn, calls } = fakeFetch({ [hubFileUrl(model, file.path)]: good });
    expect((await fetchVerified(model, file, null, fn)).source).toBe("hub");
    expect(calls).toHaveLength(1);
  });
});
