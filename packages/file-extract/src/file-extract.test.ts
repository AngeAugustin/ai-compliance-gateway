import { describe, expect, it } from "vitest";
import { combinePromptAndFiles } from "./combine.js";
import { extractOne } from "./engine.js";
import { zipStore } from "./extractors/pptx-zip.js";

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

  it("extrait un dump SQL avec e-mail", async () => {
    const sql = "INSERT INTO users(email) VALUES ('marie.agbodji@cnss.bj');\n";
    const result = await extractOne({
      fileName: "backup.sql",
      data: new TextEncoder().encode(sql),
    });
    expect(result.text).toContain("marie.agbodji@cnss.bj");
    expect(result.sanitizable).toBe(true);
  });

  it("extrait le texte d'un PPTX minimal", async () => {
    const slide = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:t>Numéro CNSS A12345678</a:t></p:sld>`;
    const data = zipStore({
      "ppt/slides/slide1.xml": new TextEncoder().encode(slide),
    });
    const result = await extractOne({ fileName: "brief.pptx", data });
    expect(result.text).toContain("A12345678");
  });

  it("extrait le contenu d'une archive ZIP", async () => {
    const data = zipStore({
      "notes.txt": new TextEncoder().encode("mot de passe = SuperSecret99!"),
    });
    const result = await extractOne({ fileName: "bundle.zip", data });
    expect(result.text).toContain("SuperSecret99!");
  });

  it("fallback texte pour extension inconnue textuelle", async () => {
    const result = await extractOne({
      fileName: "dump.dat",
      data: new TextEncoder().encode("sk-abcdefghijklmnopqrstuvwxyz012345"),
    });
    expect(result.text).toContain("sk-abcdefghijklmnopqrstuvwxyz012345");
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
