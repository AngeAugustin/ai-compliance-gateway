export function extractPlainText(data: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(data).replace(/\uFEFF/g, "");
}

export function extractCsvAsText(data: Uint8Array): string {
  return extractPlainText(data);
}
