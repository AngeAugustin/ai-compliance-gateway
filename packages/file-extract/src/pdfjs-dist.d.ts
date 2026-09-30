declare module "pdfjs-dist/legacy/build/pdf.js" {
  export function getDocument(src: { data: Uint8Array; useSystemFonts?: boolean }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getTextContent(): Promise<{ items: Array<{ str?: string }> }>;
      }>;
    }>;
  };
}

declare module "tesseract.js" {
  export function createWorker(lang?: string): Promise<{
    recognize(image: Buffer | Uint8Array): Promise<{ data: { text?: string } }>;
    terminate(): Promise<void>;
  }>;
}
