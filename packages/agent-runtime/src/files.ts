import {
  anyExtractionDegraded,
  combinePromptAndFiles,
  extractFiles,
  sanitizeTextFile,
  type ExtractedFile,
  type ExtractEngineOptions,
  type FileInput,
} from "@acg/file-extract";
import type { AttachmentWire, PolicyAction, SensitiveEntity } from "@acg/shared";

export type IncomingFile = FileInput;

export function toAttachmentWire(f: ExtractedFile): AttachmentWire {
  return {
    attachmentId: f.attachmentId,
    fileName: f.fileName,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    contentSha256: f.contentSha256,
    extractedTextLength: f.extractedTextLength,
    extractionMethod: f.extractionMethod,
    extractionDegraded: f.extractionDegraded,
  };
}

export async function prepareFileAnalysis(
  promptText: string,
  files: IncomingFile[],
  opts?: ExtractEngineOptions,
): Promise<{ analysisText: string; extracted: ExtractedFile[]; attachments: AttachmentWire[] }> {
  if (files.length === 0) {
    return { analysisText: promptText, extracted: [], attachments: [] };
  }
  const extracted = await extractFiles(files, opts);
  return {
    analysisText: combinePromptAndFiles(promptText, extracted),
    extracted,
    attachments: extracted.map(toAttachmentWire),
  };
}

export function fileExtractionDegraded(extracted: ExtractedFile[]): boolean {
  return anyExtractionDegraded(extracted);
}

/** Si MASK mais fichier non réécrivable (PDF, image…) → bloquer la pièce jointe. */
export function shouldBlockAttachmentsForMask(
  action: PolicyAction,
  extracted: ExtractedFile[],
  entities: SensitiveEntity[],
): { block: boolean; reason: string | null } {
  if (action !== "MASK" || extracted.length === 0) return { block: false, reason: null };
  for (const file of extracted) {
    const fileEntities = entities.filter((e) => file.text.includes(e.value ?? ""));
    if (fileEntities.length === 0) continue;
    const sanitized = sanitizeTextFile(file, fileEntities);
    if (!sanitized) {
      return {
        block: true,
        reason: `Le fichier « ${file.fileName} » contient des données sensibles et ne peut pas être anonymisé automatiquement. Envoi bloqué.`,
      };
    }
  }
  return { block: false, reason: null };
}

export function entitiesInPromptOnly(promptText: string, entities: SensitiveEntity[]): SensitiveEntity[] {
  return entities.filter((e) => {
    const v = e.value ?? "";
    return v.length > 0 && promptText.includes(v);
  });
}
