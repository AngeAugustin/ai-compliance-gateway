/** OCR local optionnel (Node, ACG_ENABLE_OCR=1 + tesseract.js installé). */
export async function extractImageOcr(data: Uint8Array): Promise<string> {
  try {
    const mod = "tesseract.js";
    const { createWorker } = (await import(mod)) as typeof import("tesseract.js");
    const worker = await createWorker("fra+eng");
    try {
      const { data: ocr } = await worker.recognize(Buffer.from(data));
      return (ocr.text ?? "").trim();
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    throw new Error(`OCR indisponible : ${err instanceof Error ? err.message : String(err)}`);
  }
}
