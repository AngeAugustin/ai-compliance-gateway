import { applyMasking } from "@acg/detection-engine";
import type { SensitiveEntity } from "@acg/shared";
import type { ExtractedFile } from "./types.js";

export interface SanitizedFile {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  data: Uint8Array;
  text: string;
}

/** Réécriture locale CSV/TXT après MASK (v2 fichiers). */
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
