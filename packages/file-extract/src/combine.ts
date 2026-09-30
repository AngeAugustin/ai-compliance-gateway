import type { ExtractedFile } from "./types.js";

/** Concatène prompt + extraits fichier pour la détection (séparateurs explicites). */
export function combinePromptAndFiles(prompt: string, files: ExtractedFile[]): string {
  const parts = [prompt.trim()];
  for (const f of files) {
    if (!f.text.trim()) {
      parts.push(`[Fichier ${f.fileName} : contenu non extractible${f.error ? ` — ${f.error}` : ""}]`);
      continue;
    }
    parts.push(`--- Fichier: ${f.fileName} (${f.mimeType}) ---\n${f.text}`);
  }
  return parts.filter(Boolean).join("\n\n");
}

export function anyExtractionDegraded(files: ExtractedFile[]): boolean {
  return files.some((f) => f.extractionDegraded || f.extractionMethod === "failed" || f.extractionMethod === "unsupported");
}
