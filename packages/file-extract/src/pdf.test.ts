/**
 * PDF : lecture des flux compressés, échec explicite quand rien n'est lisible, OCR des pages
 * scannées, et masquage vérifié par relecture. Les PDF sont fabriqués par pdf-lib (flux compressés
 * comme ceux de Word ou d'un navigateur), pas écrits à la main.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SensitiveEntity } from "@acg/shared";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { extractOne } from "./engine.js";
import { sanitizeExtractedFile } from "./sanitize.js";

const IBAN = "FR76 3000 6000 0112 3456 7890 189";
const EMAIL = "marie.agbodji@cnss.bj";

async function textPdf(lines: string[], pages = 1): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < pages; p++) {
    const page = pdf.addPage();
    lines.forEach((l, i) => page.drawText(l, { x: 50, y: 750 - i * 16, size: 11, font }));
  }
  return pdf.save();
}

const SCAN_PNG = resolve(__dirname, "../../../data/eval/fichiers-office/images");

describe("extraction PDF", () => {
  it("lit un PDF à flux compressés (les valeurs n'apparaissent pas en clair dans le binaire)", async () => {
    const data = await textPdf([`Virement vers ${IBAN}`, `Contact : ${EMAIL}`]);
    expect(new TextDecoder("latin1").decode(data)).not.toContain(EMAIL);
    const r = await extractOne({ fileName: "ordre.pdf", data });
    expect(r.extractionMethod).toBe("native");
    expect(r.extractionDegraded).toBe(false);
    expect(r.text).toContain(IBAN);
    expect(r.text).toContain(EMAIL);
  });

  it("PDF illisible : échec explicite et mode dégradé, jamais un texte vide présenté comme sûr", async () => {
    const junk = new Uint8Array(4096);
    for (let i = 0; i < junk.length; i++) junk[i] = (i * 7919 + 13) % 256;
    junk.set(new TextEncoder().encode("%PDF-1.7\n"), 0);
    const r = await extractOne({ fileName: "corrompu.pdf", data: junk });
    expect(r.extractionMethod).toBe("failed");
    expect(r.extractionDegraded).toBe(true);
    expect(r.text).toBe("");
    expect(r.error).toBeTruthy();
  });

  it("pages au-delà de la limite : extraction signalée dégradée", async () => {
    const data = await textPdf([`Contact : ${EMAIL}`], 3);
    const r = await extractOne({ fileName: "long.pdf", data }, { maxPages: 2 });
    expect(r.text).toContain(EMAIL);
    expect(r.extractionDegraded).toBe(true);
    expect(r.error).toMatch(/limite/);
  });

  it.skipIf(!existsSync(SCAN_PNG))("PDF scanné sans OCR : échec explicite", async () => {
    const pdf = await PDFDocument.create();
    const img = await pdf.embedPng(readFileSync(resolve(SCAN_PNG, "man-001.png")));
    pdf.addPage([595, 300]).drawImage(img, { x: 0, y: 0, width: 595, height: 300 });
    const r = await extractOne({ fileName: "scan.pdf", data: await pdf.save() }, { ocr: false });
    expect(r.extractionMethod).toBe("failed");
    expect(r.extractionDegraded).toBe(true);
  });

  it.skipIf(!existsSync(SCAN_PNG))(
    "PDF scanné avec OCR : le texte des images est lu",
    async () => {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const page = pdf.addPage();
      page.drawText("Page de garde", { x: 50, y: 780, size: 11, font });
      // Image d'un texte (rendu net Arial 26 px) qui contient une valeur sensible.
      const [first] = (await import("node:fs")).readdirSync(SCAN_PNG).filter((f) => f.endsWith(".png"));
      const img = await pdf.embedPng(readFileSync(resolve(SCAN_PNG, first!)));
      page.drawImage(img, { x: 20, y: 300, width: 555, height: (img.height * 555) / img.width });
      const r = await extractOne({ fileName: "scan.pdf", data: await pdf.save() }, { ocr: true });
      expect(r.extractionMethod).toBe("ocr");
      expect(r.text).toContain("Page de garde");
      expect(r.text.length).toBeGreaterThan(40);
    },
    120_000,
  );
});

describe("masquage PDF", () => {
  it("le PDF renvoyé ne contient plus la valeur, même quand elle était dans un flux compressé", async () => {
    const data = await textPdf([`Contact : ${EMAIL}`]);
    const file = await extractOne({ fileName: "contact.pdf", data });
    const start = file.text.indexOf(EMAIL);
    const entity = { entityType: "EMAIL", value: EMAIL, span: [start, start + EMAIL.length], confidence: 1, layer: "regex" } as unknown as SensitiveEntity;
    const out = await sanitizeExtractedFile(file, [entity]);
    expect(out).not.toBeNull();
    const reread = await extractOne({ fileName: "contact.pdf", data: out!.data });
    expect(reread.text).not.toContain(EMAIL);
    expect(new TextDecoder("latin1").decode(out!.data)).not.toContain(EMAIL);
  });
});
