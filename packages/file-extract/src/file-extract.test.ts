import { describe, expect, it } from "vitest";
import { combinePromptAndFiles } from "./combine.js";
import { extractOne } from "./engine.js";

describe("file-extract", () => {
  it("extrait un CSV avec numéro CNSS", async () => {
    const csv = "nom,numero\nMarie,A12345678\n";
    const result = await extractOne({
      fileName: "assures.csv",
      data: new TextEncoder().encode(csv),
    });
    expect(result.extractionMethod).toBe("native");
    expect(result.text).toContain("A12345678");
    expect(result.sanitizable).toBe(true);
  });

  it("combine prompt et fichier", async () => {
    const csv = await extractOne({
      fileName: "data.csv",
      data: new TextEncoder().encode("CNSS B99887766"),
    });
    const combined = combinePromptAndFiles("Analyse ce fichier", [csv]);
    expect(combined).toContain("Analyse ce fichier");
    expect(combined).toContain("B99887766");
  });

  it("marque les images sans OCR comme unsupported", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const result = await extractOne({ fileName: "scan.png", mimeType: "image/png", data: png }, { enableOcr: false });
    expect(result.extractionMethod).toBe("unsupported");
    expect(result.extractionDegraded).toBe(true);
  });
});
