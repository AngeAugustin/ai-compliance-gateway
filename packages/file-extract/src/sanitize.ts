import { applyMasking } from "@acg/detection-engine";
import type { SensitiveEntity } from "@acg/shared";
import { extensionOf } from "./detect.js";
import type { ExtractedFile } from "./types.js";
import { sanitizeDocxBinary } from "./sanitize-docx.js";
import { rebuildMinimalPdf, sanitizePdfBinary } from "./sanitize-pdf.js";
import { sanitizePptxBinary } from "./sanitize-pptx.js";
import { sanitizeXlsxBinary } from "./sanitize-xlsx.js";

export interface SanitizedFile {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  data: Uint8Array;
  text: string;
}

function maskReplacements(text: string, entities: SensitiveEntity[]): { from: string; to: string }[] {
  const plan = applyMasking(text, entities.filter((e) => text.includes(e.value ?? "")));
  const pairs: { from: string; to: string }[] = [];
  for (const r of plan.replacements) {
    pairs.push({ from: r.value, to: r.token });
  }
  return pairs.sort((a, b) => b.from.length - a.from.length);
}

function maskedText(text: string, entities: SensitiveEntity[]): string {
  return applyMasking(text, entities.filter((e) => text.includes(e.value ?? ""))).text;
}

/** Réécriture locale TXT/CSV/SQL/JSON… */
export function sanitizeTextFile(file: ExtractedFile, entities: SensitiveEntity[]): SanitizedFile | null {
  if (!file.sanitizable || !file.text) return null;
  const plan = applyMasking(file.text, entities.filter((e) => file.text.includes(e.value ?? "")));
  const encoded = new TextEncoder().encode(plan.text);
  return {
    attachmentId: file.attachmentId,
    fileName: file.fileName,
    mimeType: file.mimeType,
    data: encoded,
    text: plan.text,
  };
}

const OFFICE_BINARY_EXTS = new Set([".docx", ".pdf", ".xlsx", ".pptx"]);

function asSanitized(file: ExtractedFile, data: Uint8Array, text: string): SanitizedFile {
  return {
    attachmentId: file.attachmentId,
    fileName: file.fileName,
    mimeType: file.mimeType,
    data,
    text,
  };
}

/** Réécriture DOCX / PDF / XLSX / PPTX / texte selon le format. */
export async function sanitizeExtractedFile(
  file: ExtractedFile,
  entities: SensitiveEntity[],
): Promise<SanitizedFile | null> {
  const fileEntities = entities.filter((e) => file.text.includes(e.value ?? ""));
  if (fileEntities.length === 0 || !file.text.trim()) return null;

  const ext = extensionOf(file.fileName);
  const masked = maskedText(file.text, fileEntities);

  if (file.sanitizable && !OFFICE_BINARY_EXTS.has(ext)) {
    return sanitizeTextFile(file, fileEntities);
  }

  const replacements = maskReplacements(file.text, fileEntities);
  const source = file.sourceData;

  if ((ext === ".docx" || file.mimeType.includes("wordprocessingml")) && source) {
    const data = await sanitizeDocxBinary(source, replacements);
    if (data) return asSanitized(file, data, masked);
  }

  if ((ext === ".xlsx" || file.mimeType.includes("spreadsheetml")) && source) {
    const data = await sanitizeXlsxBinary(source, replacements);
    if (data) return asSanitized(file, data, masked);
  }

  if ((ext === ".pptx" || file.mimeType.includes("presentationml")) && source) {
    const data = await sanitizePptxBinary(source, replacements);
    if (data) return asSanitized(file, data, masked);
  }

  if ((ext === ".pdf" || file.mimeType === "application/pdf") && source) {
    // Texte lu dans des images : le remplacement dans le binaire ne les touche pas, on reconstruit.
    let data = file.extractionMethod === "ocr" ? null : sanitizePdfBinary(source, replacements);
    if (data && !(await pdfIsClean(data, fileEntities))) {
      // Une valeur subsiste (flux compressé, autre encodage) : on ne renvoie pas ce binaire.
      data = null;
    }
    if (!data) {
      data = rebuildMinimalPdf(masked.replace(/\s+/g, " ").slice(0, 500));
    }
    return asSanitized(file, data, masked);
  }

  return sanitizeTextFile(file, fileEntities);
}

/** Relit le PDF réécrit : aucune valeur sensible ne doit y rester lisible. */
async function pdfIsClean(data: Uint8Array, entities: SensitiveEntity[]): Promise<boolean> {
  const { extractPdf } = await import("./extractors/pdf.js");
  const reread = await extractPdf(data, { ocr: false });
  if (reread.degraded && !reread.text) return false;
  const norm = (s: string) => s.replace(/\s+/g, "");
  const text = norm(reread.text);
  return entities.every((e) => !e.value || !text.includes(norm(e.value)));
}
