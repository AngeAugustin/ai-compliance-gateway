/**
 * Extraction PDF avec pdfjs-dist (flux compressés, polices encodées) et OCR des images incorporées.
 *
 * Règle de sécurité : un PDF dont on n'a pas pu lire tout le contenu est signalé `degraded`.
 * Le repli heuristique (pdfjs indisponible ou PDF corrompu) est toujours signalé `degraded`,
 * et son résultat est écarté s'il ne ressemble pas à du texte (octets compressés décodés en latin1).
 */
import { normalizeOcrText as rejoinBrokenTokens, type RawImage } from "./ocr.js";

export interface PdfExtraction {
  text: string;
  /** "ocr" dès qu'une partie du texte vient d'images incorporées. */
  method: "native" | "ocr";
  degraded: boolean;
  /** Raison du mode dégradé, pour le journal. */
  warning?: string;
}

export interface PdfExtractOptions {
  maxPages?: number;
  ocr?: boolean;
  /** Nombre maximal d'images passées à l'OCR ; au-delà, l'extraction est dégradée. */
  maxImages?: number;
}

/** Images plus petites ignorées : logos, puces, filets. */
const MIN_IMAGE_SIDE = 32;
const MIN_IMAGE_AREA = 100 * 30;

interface PdfJsImage {
  width: number;
  height: number;
  data?: Uint8Array | Uint8ClampedArray;
  kind?: number;
}

interface PdfJsPage {
  getTextContent(): Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }>;
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  objs: { get(id: string, callback: (obj: unknown) => void): unknown };
  commonObjs: { get(id: string, callback: (obj: unknown) => void): unknown };
  cleanup(): void;
}

interface PdfJs {
  getDocument(src: Record<string, unknown>): { promise: Promise<{ numPages: number; getPage(n: number): Promise<PdfJsPage>; destroy(): Promise<void> }> };
  OPS: Record<string, number>;
}

let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs") as unknown as Promise<PdfJs>;
  return pdfjsPromise;
}

export async function extractPdf(data: Uint8Array, opts: PdfExtractOptions = {}): Promise<PdfExtraction> {
  const maxPages = opts.maxPages ?? 50;
  let pdfjs: PdfJs;
  try {
    pdfjs = await loadPdfJs();
  } catch {
    pdfjsPromise = null;
    return heuristic(data, "pdfjs-dist indisponible : lecture heuristique");
  }

  let doc;
  try {
    // Copie : pdfjs transfère le tampon au worker et le rend inutilisable pour l'appelant.
    doc = await pdfjs.getDocument({
      data: new Uint8Array(data),
      useSystemFonts: true,
      isEvalSupported: false,
      isOffscreenCanvasSupported: false,
      verbosity: 0,
    }).promise;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return heuristic(data, `PDF illisible par pdfjs (${reason}) : lecture heuristique`);
  }

  const warnings: string[] = [];
  const parts: string[] = [];
  const images: RawImage[] = [];
  const maxImages = opts.maxImages ?? 20;
  let skippedImages = 0;
  try {
    const limit = Math.min(doc.numPages, maxPages);
    if (doc.numPages > maxPages) warnings.push(`${doc.numPages - maxPages} page(s) au-delà de la limite de ${maxPages} non analysée(s)`);
    for (let i = 1; i <= limit; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      // Mise en page : un jeton trop long pour la ligne est coupé ; on le recolle comme pour l'OCR.
      parts.push(rejoinBrokenTokens(content.items.map((it) => (it.str ?? "") + (it.hasEOL ? "\n" : " ")).join("")));
      for (const img of await pageImages(pdfjs, page)) {
        if (img.width < MIN_IMAGE_SIDE || img.height < MIN_IMAGE_SIDE || img.width * img.height < MIN_IMAGE_AREA) continue;
        if (images.length >= maxImages) skippedImages++;
        else images.push(img);
      }
      page.cleanup();
    }
  } finally {
    await doc.destroy().catch(() => undefined);
  }

  let method: PdfExtraction["method"] = "native";
  if (images.length > 0 || skippedImages > 0) {
    if (!opts.ocr) {
      warnings.push(`${images.length + skippedImages} image(s) non lue(s) : OCR désactivé`);
    } else {
      if (skippedImages > 0) warnings.push(`${skippedImages} image(s) au-delà de ${maxImages} non lue(s)`);
      const { extractRawImagesOcr } = await import("./ocr.js");
      const ocrTexts = await extractRawImagesOcr(images);
      const ocrText = ocrTexts.filter((t) => t.trim()).join("\n");
      if (ocrText) {
        parts.push(ocrText);
        method = "ocr";
      }
    }
  }

  const text = parts.filter(Boolean).join("\n").trim();
  return { text, method, degraded: warnings.length > 0, warning: warnings.join(" ; ") || undefined };
}

/** Images dessinées sur la page, décodées par pdfjs (pixels bruts). */
async function pageImages(pdfjs: PdfJs, page: PdfJsPage): Promise<RawImage[]> {
  const ops = await page.getOperatorList();
  const out: RawImage[] = [];
  const seen = new Set<string>();
  for (let k = 0; k < ops.fnArray.length; k++) {
    const fn = ops.fnArray[k];
    const args = ops.argsArray[k] ?? [];
    let obj: PdfJsImage | null = null;
    if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintImageXObjectRepeat) {
      const id = String(args[0]);
      if (seen.has(id)) continue;
      seen.add(id);
      obj = await resolveObj(page, id);
    } else if (fn === pdfjs.OPS.paintInlineImageXObject) {
      obj = (args[0] as PdfJsImage) ?? null;
    }
    if (obj?.data && obj.width && obj.height) {
      const raw = toRawImage(obj);
      if (raw) out.push(raw);
    }
  }
  return out;
}

/** Les images sont décodées après la liste d'opérateurs : on attend leur résolution (rappel de pdfjs). */
function resolveObj(page: PdfJsPage, id: string): Promise<PdfJsImage | null> {
  const store = id.startsWith("g_") ? page.commonObjs : page.objs;
  return new Promise((done) => {
    const timer = setTimeout(() => done(null), 10_000);
    try {
      store.get(id, (obj: unknown) => {
        clearTimeout(timer);
        done((obj as PdfJsImage) ?? null);
      });
    } catch {
      clearTimeout(timer);
      done(null);
    }
  });
}

/** pdfjs ImageKind : 1 = gris 1 bit/pixel (lignes alignées sur l'octet), 2 = RVB, 3 = RVBA. */
function toRawImage(img: PdfJsImage): RawImage | null {
  const { width, height } = img;
  const src = img.data!;
  if (img.kind === 2) return { width, height, channels: 3, data: new Uint8Array(src.buffer, src.byteOffset, width * height * 3) };
  if (img.kind === 3) return { width, height, channels: 4, data: new Uint8Array(src.buffer, src.byteOffset, width * height * 4) };
  if (img.kind === 1) {
    const rowBytes = (width + 7) >> 3;
    const gray = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bit = (src[y * rowBytes + (x >> 3)]! >> (7 - (x & 7))) & 1;
        gray[y * width + x] = bit ? 255 : 0;
      }
    }
    return { width, height, channels: 1, data: gray };
  }
  return null;
}

function heuristic(data: Uint8Array, warning: string): PdfExtraction {
  const text = extractPdfHeuristic(data);
  return { text: looksReadable(text) ? text : "", method: "native", degraded: true, warning };
}

function extractPdfHeuristic(data: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(data);
  const chunks: string[] = [];
  const paren = raw.matchAll(/\(([^()\\]{3,240})\)/g);
  for (const m of paren) {
    const s = m[1]!.replace(/\\n/g, " ").replace(/\\r/g, " ");
    if (/[A-Za-z0-9@]/.test(s)) chunks.push(s);
  }
  const literal = raw.matchAll(/\bTj[\s\S]{0,4}\(([^)]+)\)/g);
  for (const m of literal) chunks.push(m[1]!);
  return [...new Set(chunks)].join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Le texte ressemble-t-il à du texte ? Les flux compressés décodés en latin1 donnent surtout
 * des caractères de contrôle et des symboles ; un texte réel est fait de lettres, chiffres, espaces
 * et ponctuation courante.
 */
export function looksReadable(text: string): boolean {
  if (text.length < 4) return false;
  const ok = text.match(/[\p{L}\p{N}\s.,;:!?'"()\-@/%&+€$*#_=]/gu)?.length ?? 0;
  return ok / text.length >= 0.9;
}
