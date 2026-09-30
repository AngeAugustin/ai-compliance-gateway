import { describe, expect, it } from "vitest";
import { hubIntegrity, isModelTrusted, verifyModelFile } from "./integrity.js";

describe("intégrité des modèles", () => {
  it("fait confiance au mode hub NER", () => {
    expect(isModelTrusted(hubIntegrity("ner"))).toBe(true);
    expect(hubIntegrity("ner").status).toBe("hub");
  });

  it("marque un chemin manquant comme absent", async () => {
    const r = await verifyModelFile("ner", "Z:\\inexistant-modele-acg.onnx");
    expect(r.status).toBe("absent");
    expect(isModelTrusted(r)).toBe(false);
  });
});
