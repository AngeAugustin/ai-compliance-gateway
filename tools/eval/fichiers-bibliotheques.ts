/**
 * Fabrique les fichiers de mesure de l'extraction sans Microsoft Office, avec des bibliothèques
 * tierces indépendantes du projet : docx (DOCX), SheetJS (XLSX), pptxgenjs (PPTX), pdf-lib (PDF
 * texte et PDF scanné à partir des images PNG déjà rendues par fichiers-office.ps1).
 *
 *   pnpm eval:extraction corpus                       → data/eval/fichiers-office/corpus.json
 *   powershell -File tools/eval/fichiers-office.ps1   → images PNG (et fichiers Office si Office répond)
 *   tsx tools/eval/fichiers-bibliotheques.ts          → DOCX, XLSX, PPTX, PDF sans Office
 *
 * Écrit aussi producteurs.json (fichier → outil) : le rapport de mesure le cite.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import PptxGenJS from "pptxgenjs";
import { createRequire } from "node:module";
// SheetJS est une dépendance de @acg/file-extract (même version que l'extracteur), pas de la racine.
const XLSX = createRequire(resolve("packages/file-extract/package.json"))("xlsx") as {
  utils: { aoa_to_sheet(rows: unknown[][]): unknown; book_new(): unknown; book_append_sheet(wb: unknown, ws: unknown, name: string): void };
  write(wb: unknown, opts: { type: "buffer"; bookType: "xlsx" }): Buffer;
};

const DIR = resolve("data/eval/fichiers-office");
const corpus = JSON.parse(readFileSync(join(DIR, "corpus.json"), "utf8")) as { id: string; text: string }[];
const producers: Record<string, string> = {};

// —— DOCX ——
const doc = new Document({
  sections: [{ children: corpus.map((s) => new Paragraph({ children: [new TextRun({ text: s.text, font: "Calibri", size: 22 })] })) }],
});
writeFileSync(join(DIR, "corpus.docx"), await Packer.toBuffer(doc));
producers["corpus.docx"] = "docx 9 (bibliothèque JavaScript)";

// —— XLSX : une ligne par prompt, cellule texte ——
const ws = XLSX.utils.aoa_to_sheet([["id", "demande"], ...corpus.map((s) => [s.id, s.text])]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "corpus");
writeFileSync(join(DIR, "corpus.xlsx"), XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
producers["corpus.xlsx"] = "SheetJS 0.18";

// —— PPTX : une diapositive par prompt ——
// Export CommonJS : selon la résolution, le constructeur est l'export par défaut ou son champ default.
type Pptx = { addSlide(): { addText(text: string, opts: Record<string, unknown>): void }; write(o: { outputType: "nodebuffer" }): Promise<unknown> };
const PptxCtor = ((PptxGenJS as unknown as { default?: unknown }).default ?? PptxGenJS) as new () => Pptx;
const pptx = new PptxCtor();
for (const s of corpus) {
  pptx.addSlide().addText(s.text, { x: 0.5, y: 0.5, w: 9, h: 4, fontSize: 20, valign: "top" });
}
writeFileSync(join(DIR, "corpus.pptx"), (await pptx.write({ outputType: "nodebuffer" })) as Buffer);
producers["corpus.pptx"] = "pptxgenjs 4";

// —— PDF texte : Helvetica (encodage WinAnsi), retour à la ligne manuel ——
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const size = 11;
const margin = 50;
const lineHeight = 15;
let page = pdf.addPage();
let y = page.getHeight() - margin;
let replaced = 0;
const encodable = (text: string) =>
  [...text]
    .map((c) => {
      try {
        font.encodeText(c);
        return c;
      } catch {
        replaced++;
        return c === " " || c === " " ? " " : "?";
      }
    })
    .join("");
const maxWidth = () => page.getWidth() - 2 * margin;
const fits = (t: string) => font.widthOfTextAtSize(t, size) <= maxWidth();
/** Un mot plus large que la ligne est coupé au caractère, comme le fait Word. */
const splitLong = (w: string): string[] => {
  const out: string[] = [];
  let cur = "";
  for (const c of w) {
    if (cur && !fits(cur + c)) {
      out.push(cur);
      cur = "";
    }
    cur += c;
  }
  return cur ? [...out, cur] : out;
};
for (const s of corpus) {
  let line = "";
  const flush = () => {
    if (y < margin) {
      page = pdf.addPage();
      y = page.getHeight() - margin;
    }
    page.drawText(line, { x: margin, y, size, font });
    y -= lineHeight;
    line = "";
  };
  // Les retours à la ligne du texte source deviennent des lignes du PDF (WinAnsi ne les encode pas).
  for (const paragraph of s.text.split(/\r?\n/)) {
    for (const word of encodable(paragraph).split(" ")) {
      for (const w of fits(word) ? [word] : splitLong(word)) {
        const next = line ? `${line} ${w}` : w;
        if (!fits(next) && line) {
          flush();
          line = w;
        } else line = next;
      }
    }
    if (line) flush();
  }
  y -= lineHeight / 2;
}
writeFileSync(join(DIR, "corpus-texte.pdf"), await pdf.save());
producers["corpus-texte.pdf"] = `pdf-lib 1.17, Helvetica WinAnsi (${replaced} caractère(s) hors encodage remplacé(s))`;

// —— PDF scanné : les 10 premières images, sans couche texte ——
const scan = await PDFDocument.create();
for (const s of corpus.slice(0, 10)) {
  const png = join(DIR, "images", `${s.id}.png`);
  if (!existsSync(png)) throw new Error(`image absente : ${png} (lancez fichiers-office.ps1)`);
  const img = await scan.embedPng(readFileSync(png));
  const w = 595;
  const h = (img.height * w) / img.width;
  scan.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
}
writeFileSync(join(DIR, "corpus-scanne.pdf"), await scan.save());
producers["corpus-scanne.pdf"] = "pdf-lib 1.17 (10 images PNG pleine page, aucune couche texte)";

writeFileSync(join(DIR, "producteurs.json"), JSON.stringify(producers, null, 2) + "\n", "utf8");
for (const [f, p] of Object.entries(producers)) console.log(`${f} : ${p}`);
