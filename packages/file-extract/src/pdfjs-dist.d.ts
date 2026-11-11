declare module "tesseract.js" {
  export function createWorker(lang?: string): Promise<{
    recognize(image: Buffer | Uint8Array): Promise<{ data: { text?: string } }>;
    terminate(): Promise<void>;
  }>;
}
