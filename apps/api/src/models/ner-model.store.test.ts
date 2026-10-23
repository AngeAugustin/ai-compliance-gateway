import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { NER_BROWSER_MODEL, type PinnedModelFile } from "@acg/shared";

const dir = mkdtempSync(join(tmpdir(), "acg-ner-"));
process.env.NER_BROWSER_MODEL_DIR = dir;
let store: typeof import("./ner-model.store.js");

beforeAll(async () => {
  store = await import("./ner-model.store.js");
});

function pin(path: string, content: string): PinnedModelFile {
  return {
    path,
    size: Buffer.byteLength(content),
    sha256: createHash("sha256").update(content).digest("hex"),
    contentType: "application/json",
  };
}

describe("dépôt du modèle NER côté API", () => {
  it("absent, altéré, puis intègre", async () => {
    const file = pin("config.json", '{"ok":true}');
    expect((await store.checkFile(file)).status).toBe("absent");

    writeFileSync(join(dir, "config.json"), '{"ok":false}');
    expect((await store.checkFile(file)).status).toBe("mismatch");

    writeFileSync(join(dir, "config.json"), '{"ok":true}');
    // Même taille que le contenu altéré : l'invalidation passe par la date de modification.
    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(join(dir, "config.json"), '{"ok":true}');
    expect((await store.checkFile(file)).status).toBe("verified");
  });

  it("refuse un chemin qui sortirait du dossier du modèle", async () => {
    await expect(store.checkFile(pin("../evil.json", "x"))).rejects.toThrow(/hors du dossier/);
  });

  it("le manifeste reprend la révision figée et signale un dépôt incomplet", async () => {
    const m = await store.manifest();
    expect(m.revision).toBe(NER_BROWSER_MODEL.revision);
    expect(m.available).toBe(false);
    expect(m.files.map((f) => f.path)).toContain("onnx/model_quantized.onnx");
  });
});
