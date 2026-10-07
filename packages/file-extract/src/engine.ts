import { randomUuid, sha256Hex } from "@acg/shared";
import {
  extensionOf,
  guessMimeType,
  isImageMime,
  isTextLikeMime,
  isZipLike,
} from "./detect.js";
import { extractCsvAsText, extractPlainText } from "./extractors/text.js";
import { extractDocx } from "./extractors/docx.js";
import { extractXlsx } from "./extractors/xlsx.js";
import { extractPdf } from "./extractors/pdf.js";
import { extractDocLegacy } from "./extractors/doc.js";
import { extractOpenDocument } from "./extractors/opendoc.js";
import { extractPrintableStrings, looksLikeText } from "./extractors/binary.js";
import { extractPptx, listZipEntries } from "./extractors/pptx-zip.js";
import type { ExtractedFile, ExtractOptions, FileInput } from "./types.js";
import { DEFAULT_EXTRACT_OPTIONS } from "./types.js";

export interface ExtractEngineOptions extends ExtractOptions {
  ocr?: boolean;
  /** Profondeur max pour archives ZIP (défaut 2). */
  maxArchiveDepth?: number;
}

export async function extractOne(input: FileInput, opts: ExtractEngineOptions = {}): Promise<ExtractedFile> {
  return extractOneInternal(input, opts, 0);
}

async function extractOneInternal(
  input: FileInput,
  opts: ExtractEngineOptions,
  depth: number,
): Promise<ExtractedFile> {
  const options = {
    ...DEFAULT_EXTRACT_OPTIONS,
    ...opts,
    enableOcr: opts.ocr ?? opts.enableOcr ?? DEFAULT_EXTRACT_OPTIONS.enableOcr,
    maxArchiveDepth: opts.maxArchiveDepth ?? 2,
  };
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
    return fail(base, `Fichier trop volumineux (${sizeBytes} octets, max ${options.maxBytes})`);
  }

  try {
    const ext = extensionOf(input.fileName);
    let text = "";
    let method: ExtractedFile["extractionMethod"] = "native";

    if (isTextLikeMime(mime, input.fileName) || mime.startsWith("text/")) {
      text = ext === ".csv" || mime === "text/csv" ? extractCsvAsText(input.data) : extractPlainText(input.data);
    } else if (ext === ".docx" || mime.includes("wordprocessingml")) {
      text = await extractDocx(input.data);
    } else if (ext === ".doc" || mime === "application/msword") {
      text = extractDocLegacy(input.data);
      base.extractionDegraded = true;
    } else if (ext === ".xlsx" || ext === ".xls" || mime.includes("spreadsheet") || mime.includes("excel")) {
      text = extractXlsx(input.data);
    } else if (ext === ".pptx" || mime.includes("presentationml")) {
      text = await extractPptx(input.data);
    } else if (ext === ".ppt" || mime === "application/vnd.ms-powerpoint") {
      text = extractPrintableStrings(input.data, 5);
      base.extractionDegraded = true;
    } else if (ext === ".odt" || ext === ".ods" || ext === ".odp" || mime.includes("opendocument")) {
      text = await extractOpenDocument(input.data);
    } else if (ext === ".pdf" || mime === "application/pdf") {
      text = await extractPdf(input.data, options.maxPages);
      if (!text.trim()) base.extractionDegraded = true;
    } else if (ext === ".zip" || ext === ".jar" || mime === "application/zip" || isZipLike(input.data)) {
      if (depth >= options.maxArchiveDepth) {
        return fail(base, `Archive trop imbriquée (profondeur max ${options.maxArchiveDepth})`);
      }
      text = await extractZipRecursive(input.data, options, depth);
    } else if (isImageMime(mime)) {
      if (options.enableOcr) {
        const { extractImageOcr } = await import("./extractors/ocr.js");
        text = await extractImageOcr(input.data);
        method = "ocr";
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
    } else if (looksLikeText(input.data)) {
      // Fallback : fichier inconnu mais textuel (.sql sans MIME, dumps, configs…)
      text = extractPlainText(input.data);
      base.sanitizable = true;
    } else {
      // Dernier recours : chaînes imprimables dans le binaire
      text = extractPrintableStrings(input.data, 6);
      method = text ? "native" : "unsupported";
      base.extractionDegraded = true;
      base.sanitizable = false;
      if (!text) {
        return {
          ...base,
          text: "",
          extractedTextLength: 0,
          extractionMethod: "unsupported",
          extractionDegraded: true,
          error: `Format non extractible : ${mime || ext || "inconnu"}`,
        };
      }
    }

    if (!text.trim() && (ext === ".pdf" || isImageMime(mime)) && options.enableOcr && !isImageMime(mime)) {
      return fail(base, "PDF sans couche texte — OCR requis");
    }

    return {
      ...base,
      text,
      extractedTextLength: text.length,
      extractionMethod: method,
      extractionDegraded: base.extractionDegraded || text.length === 0,
    };
  } catch (err) {
    return fail(base, err instanceof Error ? err.message : String(err));
  }
}

async function extractZipRecursive(
  data: Uint8Array,
  opts: ExtractEngineOptions & { maxArchiveDepth: number; enableOcr: boolean; maxBytes: number; maxPages: number },
  depth: number,
): Promise<string> {
  const entries = await listZipEntries(data);
  const parts: string[] = [];
  const limit = Math.min(entries.length, 40);
  for (let i = 0; i < limit; i++) {
    const entry = entries[i]!;
    const nested = await extractOneInternal(
      { fileName: entry.name.split("/").pop() ?? entry.name, data: entry.data },
      opts,
      depth + 1,
    );
    if (nested.text.trim()) {
      parts.push(`--- archive:${entry.name} ---\n${nested.text}`);
    } else if (nested.error) {
      parts.push(`--- archive:${entry.name} : ${nested.error} ---`);
    }
  }
  if (entries.length > limit) {
    parts.push(`--- … ${entries.length - limit} entrée(s) non analysée(s) ---`);
  }
  return parts.join("\n\n").trim();
}

function fail(
  base: Pick<
    ExtractedFile,
    "attachmentId" | "fileName" | "mimeType" | "sizeBytes" | "contentSha256" | "extractionMethod" | "extractionDegraded" | "sanitizable"
  >,
  error: string,
): ExtractedFile {
  return {
    ...base,
    text: "",
    extractedTextLength: 0,
    extractionMethod: "failed",
    extractionDegraded: true,
    sanitizable: false,
    error,
  };
}

export async function extractFiles(inputs: FileInput[], opts: ExtractEngineOptions = {}): Promise<ExtractedFile[]> {
  const out: ExtractedFile[] = [];
  for (const input of inputs) {
    out.push(await extractOne(input, opts));
  }
  return out;
}
