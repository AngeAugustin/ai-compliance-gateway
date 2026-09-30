import { z } from "zod";

export const EXTRACTION_METHODS = ["native", "ocr", "failed", "unsupported"] as const;

export const AttachmentWireSchema = z.object({
  attachmentId: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  contentSha256: z.string().min(16),
  extractedTextLength: z.number().int().nonnegative(),
  extractionMethod: z.enum(EXTRACTION_METHODS),
  extractionDegraded: z.boolean(),
});
export type AttachmentWire = z.infer<typeof AttachmentWireSchema>;

/** Fichier entrant (Inspect / agents) — base64 côté JSON. */
export const IncomingFileSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().optional(),
  base64: z.string().min(1),
});
export type IncomingFile = z.infer<typeof IncomingFileSchema>;
