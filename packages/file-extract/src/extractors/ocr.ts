/** OCR local (Node / workers) via tesseract.js — langues fra+eng. */
export async function extractImageOcr(data: Uint8Array): Promise<string> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("fra+eng");
    try {
      const payload = typeof Buffer !== "undefined" ? Buffer.from(data) : data;
      const { data: ocr } = await worker.recognize(payload);
      return (ocr.text ?? "").trim();
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    throw new Error(`OCR indisponible : ${err instanceof Error ? err.message : String(err)}`);
  }
}
