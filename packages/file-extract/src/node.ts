export * from "./index.js";
import { extractFiles, extractOne } from "./engine.js";

const ocrDefault = process.env.ACG_ENABLE_OCR === "1";

export async function extractFilesNode(inputs: Parameters<typeof extractFiles>[0], opts: Parameters<typeof extractFiles>[1] = {}) {
  return extractFiles(inputs, { ...opts, enableOcr: opts.enableOcr ?? ocrDefault });
}

export async function extractOneNode(input: Parameters<typeof extractOne>[0], opts: Parameters<typeof extractOne>[1] = {}) {
  return extractOne(input, { ...opts, enableOcr: opts.enableOcr ?? ocrDefault });
}
