import { randomUuid, sha256Hex } from "@acg/shared";
import { extensionOf, guessMimeType, isImageMime, isTextLikeMime } from "./detect.js";
import { extractCsvAsText, extractPlainText } from "./extractors/text.js";
import { extractDocx } from "./extractors/docx.js";
import { extractXlsx } from "./extractors/xlsx.js";
import { extractPdf } from "./extractors/pdf.js";
import type { ExtractedFile, ExtractOptions, FileInput } from "./types.js";
import { DEFAULT_EXTRACT_OPTIONS } from "./types.js";

export interface ExtractEngineOptions extends ExtractOptions {
  ocr?: boolean;
}

export async function extractOne(input: FileInput, opts: ExtractEngineOptions = {}): Promise<ExtractedFile> {
  const options = { ...DEFAULT_EXTRACT_OPTIONS, ...opts, enableOcr: opts.ocr ?? opts.enableOcr ?? false };
  const mime = guessMimeType(input.fileName, input.mimeType);
  const sizeBytes = input.data.byteLength;
  const contentSha256 = await sha256Hex(input.data);
  const base: Pick<
    ExtractedFile,
    "attachmentId" | "fileName" | "mimeType" | "sizeBytes" | "contentSha256" | "extractionMethod" | "extractionDegraded" | "sanitizable"
  > = {
    attachmentId: randomUuid(),
    fileName: input.fileName,
    mimeType: mime,
    sizeBytes,
    contentSha256,
    extractionMethod: "native",
    extractionDegraded: false,
    sanitizable: isTextLikeMime(mime, input.fileName),
  };

  if (sizeBytes > options.maxBytes) {
    return {
      ...base,
      text: "",
      extractedTextLength: 0,
      extractionMethod: "failed",
      extractionDegraded: true,
      sanitizable: false,
      error: `Fichier trop volumineux (${sizeBytes} octets, max ${options.maxBytes})`,
    };
  }

  try {
    const ext = extensionOf(input.fileName);
    let text = "";

    if (mime.startsWith("text/") || ext === ".txt" || ext === ".md" || ext === ".json") {
      text = extractPlainText(input.data);
    } else if (ext === ".csv" || mime === "text/csv") {
      text = extractCsvAsText(input.data);
    } else if (ext === ".docx" || mime.includes("wordprocessingml")) {
      text = await extractDocx(input.data);
    } else if (ext === ".xlsx" || ext === ".xls" || mime.includes("spreadsheet") || mime.includes("excel")) {
      text = extractXlsx(input.data);
    } else if (ext === ".pdf" || mime === "application/pdf") {
      text = await extractPdf(input.data, options.maxPages);
      if (!text.trim()) {
        base.extractionDegraded = true;
      }
    } else if (isImageMime(mime)) {
      if (options.enableOcr) {
        const { extractImageOcr } = await import("./extractors/ocr.js");
        text = await extractImageOcr(input.data);
        base.extractionMethod = "ocr";
      } else {
        return {
          ...base,
          text: "",
          extractedTextLength: 0,
          extractionMethod: "unsupported",
          extractionDegraded: true,
          sanitizable: false,
          error: "OCR désactivé pour les images (ACG_ENABLE_OCR=1 côté Node)",
        };
      }
    } else {
      return {
        ...base,
        text: "",
        extractedTextLength: 0,
        extractionMethod: "unsupported",
        extractionDegraded: true,
        sanitizable: false,
        error: `Format non pris en charge : ${mime || ext || "inconnu"}`,
      };
    }

    if (!text.trim() && (ext === ".pdf" || isImageMime(mime))) {
      if (options.enableOcr && !isImageMime(mime)) {
        return {
          ...base,
          text: "",
          extractedTextLength: 0,
          extractionMethod: "failed",
          extractionDegraded: true,
          sanitizable: false,
          error: "PDF sans couche texte — OCR requis",
        };
      }
    }

    return {
      ...base,
      text,
      extractedTextLength: text.length,
      extractionDegraded: base.extractionDegraded || text.length === 0,
    };
  } catch (err) {
    return {
      ...base,
      text: "",
      extractedTextLength: 0,
      extractionMethod: "failed",
      extractionDegraded: true,
      sanitizable: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function extractFiles(inputs: FileInput[], opts: ExtractEngineOptions = {}): Promise<ExtractedFile[]> {
  const out: ExtractedFile[] = [];
  for (const input of inputs) {
    out.push(await extractOne(input, opts));
  }
  return out;
}
