/** Extensions et MIME reconnus pour l’extraction de contenu sensible. */

export const TEXT_LIKE_EXTENSIONS = [
  ".txt",
  ".csv",
  ".tsv",
  ".md",
  ".json",
  ".jsonl",
  ".xml",
  ".html",
  ".htm",
  ".sql",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".env",
  ".log",
  ".rtf",
  ".properties",
  ".sh",
  ".bash",
  ".ps1",
  ".bat",
  ".cmd",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".py",
  ".java",
  ".cs",
  ".go",
  ".rb",
  ".php",
  ".c",
  ".cpp",
  ".h",
  ".rs",
  ".swift",
  ".kt",
  ".scala",
  ".r",
  ".dart",
  ".vue",
  ".svelte",
  ".css",
  ".scss",
  ".less",
  ".graphql",
  ".gql",
  ".ndjson",
] as const;

export const OFFICE_EXTENSIONS = [".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".odt", ".ods", ".odp"] as const;
export const ARCHIVE_EXTENSIONS = [".zip", ".jar", ".apk"] as const;
export const DOCUMENT_EXTENSIONS = [".pdf"] as const;
export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"] as const;

export const ALL_SUPPORTED_EXTENSIONS = [
  ...TEXT_LIKE_EXTENSIONS,
  ...OFFICE_EXTENSIONS,
  ...ARCHIVE_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
] as const;

const EXT_MIME: Record<string, string> = {
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".json": "application/json",
  ".jsonl": "application/x-ndjson",
  ".md": "text/markdown",
  ".xml": "application/xml",
  ".html": "text/html",
  ".htm": "text/html",
  ".sql": "application/sql",
  ".yml": "text/yaml",
  ".yaml": "text/yaml",
  ".toml": "application/toml",
  ".ini": "text/plain",
  ".cfg": "text/plain",
  ".conf": "text/plain",
  ".env": "text/plain",
  ".log": "text/plain",
  ".rtf": "application/rtf",
  ".properties": "text/plain",
  ".sh": "text/x-shellscript",
  ".ps1": "text/plain",
  ".js": "text/javascript",
  ".ts": "text/typescript",
  ".py": "text/x-python",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".ppt": "application/vnd.ms-powerpoint",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".jar": "application/java-archive",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
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
  if (mime === "application/json" || mime === "application/sql" || mime === "application/xml" || mime === "application/rtf") {
    return true;
  }
  const ext = extensionOf(fileName);
  return (TEXT_LIKE_EXTENSIONS as readonly string[]).includes(ext);
}

export function extensionOf(fileName: string): string {
  return fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
}

export function isZipLike(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && (data[2] === 0x03 || data[2] === 0x05 || data[2] === 0x07);
}

/** Accept HTML input / CLI regex helper */
export function acceptAttribute(): string {
  return ALL_SUPPORTED_EXTENSIONS.join(",");
}

export function cliFileExtensionPattern(): RegExp {
  const body = ALL_SUPPORTED_EXTENSIONS.map((e) => e.slice(1).replace(".", "\\.")).join("|");
  return new RegExp(`\\.(${body})$`, "i");
}
