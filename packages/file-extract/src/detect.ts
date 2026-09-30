const EXT_MIME: Record<string, string> = {
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".md": "text/markdown",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

export function guessMimeType(fileName: string, mimeType?: string): string {
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  const ext = fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  return EXT_MIME[ext] ?? "application/octet-stream";
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export function isTextLikeMime(mime: string, fileName: string): boolean {
  if (mime.startsWith("text/")) return true;
  const ext = fileName.toLowerCase();
  return ext.endsWith(".csv") || ext.endsWith(".txt") || ext.endsWith(".md") || ext.endsWith(".json");
}

export function extensionOf(fileName: string): string {
  return fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
}
