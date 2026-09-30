export type ExtractionMethod = "native" | "ocr" | "failed" | "unsupported";

export interface FileInput {
  fileName: string;
  mimeType?: string;
  data: Uint8Array;
}

export interface ExtractedFile {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  contentSha256: string;
  text: string;
  extractedTextLength: number;
  extractionMethod: ExtractionMethod;
  extractionDegraded: boolean;
  /** Formats texte (csv, txt) pouvant être réécrits localement */
  sanitizable: boolean;
  error?: string;
}

export interface ExtractOptions {
  maxBytes?: number;
  maxPages?: number;
  enableOcr?: boolean;
}

export const DEFAULT_EXTRACT_OPTIONS: Required<ExtractOptions> = {
  maxBytes: 25 * 1024 * 1024,
  maxPages: 50,
  enableOcr: false,
};
