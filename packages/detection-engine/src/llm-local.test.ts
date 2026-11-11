/**
 * Couche LLM de contexte, sans le modèle : chargement refusé, repli sur les lexiques, erreurs
 * en cours de route, sérialisation des appels. Le LLM est facultatif : son absence ne doit
 * jamais faire passer la détection en mode dégradé, ni faire perdre une entité.
 * Le test avec le vrai modèle est dans llm-local.model.test.ts (`pnpm test:llm`).
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DetectionEngine } from "./engine.js";
import { classifyByKeywords } from "./layers/keyword-context.js";
import { LlmLocalLayer } from "./layers/llm-local.js";

const FINANCE = "Prépare le rapprochement bancaire des factures fournisseurs et le budget du trimestre.";
const IBAN_PROMPT = `${FINANCE} Virement vers FR76 3000 6000 0112 3456 7890 189.`;

/** Remplace la session llama par une fausse, pour tester le comportement autour du modèle. */
function withFakeSession(layer: LlmLocalLayer, prompt: (p: string) => Promise<string>): LlmLocalLayer {
  const l = layer as unknown as { ready: boolean; session: unknown; initialHistory: unknown };
  l.ready = true;
  l.initialHistory = [];
  l.session = { prompt, getChatHistory: () => [], setChatHistory: () => undefined };
  return layer;
}

function tempFile(name: string, content: string | Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), "acg-llm-"));
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

describe("LLM local — sans modèle", () => {
  it("modèle absent : couche indisponible, contexte donné par les lexiques", async () => {
    const layer = new LlmLocalLayer({ modelPath: undefined });
    const status = await layer.initialize();
    expect(status.available).toBe(false);
    expect(status.detail).toMatch(/absent/);
    const r = await layer.detect(FINANCE);
    expect(r.degraded).toBe(true);
    expect(r.modelVersion).toBe("llm-fallback-keywords");
    expect(r.context).toEqual(classifyByKeywords(FINANCE));
  });

  it("empreinte du modèle invalide : le fichier n'est pas chargé", async () => {
    const path = tempFile("faux.gguf", "pas un modèle");
    const layer = new LlmLocalLayer({ modelPath: path, expectedSha256: "0".repeat(64) });
    const status = await layer.initialize();
    expect(status.available).toBe(false);
    expect(status.detail).toBe("checksum LLM invalide");
    expect(layer.integrityReport()?.status).toBe("mismatch");
  });

  it("fichier corrompu sans empreinte attendue : échec de chargement rattrapé, repli sur les lexiques", async () => {
    const junk = new Uint8Array(64 * 1024);
    junk.set(new TextEncoder().encode("GGUF"), 0);
    for (let i = 4; i < junk.length; i++) junk[i] = (i * 31) % 251;
    const layer = new LlmLocalLayer({ modelPath: tempFile("corrompu.gguf", junk) });
    const status = await layer.initialize();
    expect(status.available).toBe(false);
    expect(status.detail).toBeTruthy();
    expect((await layer.detect(FINANCE)).context?.contextCategory).toBe(classifyByKeywords(FINANCE).contextCategory);
  }, 60_000);

  it("le moteur reste pleinement opérationnel sans LLM : entités détectées, pas de mode dégradé", async () => {
    const engine = new DetectionEngine({ extraLayers: [new LlmLocalLayer({ modelPath: undefined })] });
    await engine.initialize();
    const r = await engine.detect(IBAN_PROMPT);
    expect(r.entities.some((e) => e.entityType === "IBAN")).toBe(true);
    expect(r.degraded).toBe(false);
    expect(r.context?.contextCategory).toBe("Finance");
  });
});

describe("LLM local — comportement autour du modèle (session simulée)", () => {
  it("erreur du modèle pendant la classification : repli sur les lexiques, sans exception", async () => {
    const layer = withFakeSession(new LlmLocalLayer(), async () => {
      throw new Error("contexte saturé");
    });
    const r = await layer.detect(FINANCE);
    expect(r.degraded).toBe(true);
    expect(r.context).toEqual(classifyByKeywords(FINANCE));
  });

  it("réponse hors catégories : ramenée à « Generique »", async () => {
    const layer = withFakeSession(new LlmLocalLayer(), async () => "Comptabilité");
    const r = await layer.detect("Bonjour, peux-tu m'aider ?");
    expect(r.context?.contextCategory).toBe("Generique");
    expect(r.degraded).toBe(false);
  });

  it("confiance : 0,9 si les lexiques confirment, 0,75 s'ils divergent", async () => {
    const agree = await withFakeSession(new LlmLocalLayer(), async () => "Finance").detect(FINANCE);
    expect(agree.context).toMatchObject({ contextCategory: "Finance", confidence: 0.9 });
    const disagree = await withFakeSession(new LlmLocalLayer(), async () => "Juridique").detect(FINANCE);
    expect(disagree.context).toMatchObject({ contextCategory: "Juridique", confidence: 0.75 });
  });

  it("appels simultanés traités un par un (une seule séquence de contexte)", async () => {
    let running = 0;
    let maxRunning = 0;
    const layer = withFakeSession(new LlmLocalLayer(), async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 20));
      running--;
      return "Technique";
    });
    const results = await Promise.all(Array.from({ length: 5 }, () => layer.detect("Le serveur PostgreSQL ne répond plus.")));
    expect(maxRunning).toBe(1);
    expect(results.every((r) => r.context?.contextCategory === "Technique")).toBe(true);
  });

  it("une erreur sur un appel ne bloque pas les suivants", async () => {
    let n = 0;
    const layer = withFakeSession(new LlmLocalLayer(), async () => {
      if (n++ === 0) throw new Error("échec ponctuel");
      return "Finance";
    });
    const [first, second] = await Promise.all([layer.detect(FINANCE), layer.detect(FINANCE)]);
    expect(first.degraded).toBe(true);
    expect(second.degraded).toBe(false);
    expect(second.context?.contextCategory).toBe("Finance");
  });

  it("dans le moteur, l'avis le plus confiant l'emporte : un LLM en désaccord perd face à des lexiques très sûrs", async () => {
    const kw = classifyByKeywords(FINANCE);
    const engine = new DetectionEngine({ extraLayers: [withFakeSession(new LlmLocalLayer(), async () => "Juridique")] });
    (engine as unknown as { initialized: boolean }).initialized = true;
    const r = await engine.detect(FINANCE);
    // Comportement actuel, documenté : 0,75 (LLM en désaccord) contre la confiance des lexiques.
    expect(r.context?.contextCategory).toBe(kw.confidence > 0.75 ? kw.contextCategory : "Juridique");
  });
});
