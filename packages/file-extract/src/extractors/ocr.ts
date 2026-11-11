/** OCR local (Node / workers) via tesseract.js — langues fra+eng. */
export async function extractImageOcr(data: Uint8Array): Promise<string> {
  const [text] = await ocrMany([Buffer.from(data)]);
  return text ?? "";
}

/** Pixels bruts (images incorporées d'un PDF, décodées par pdfjs). */
export interface RawImage {
  width: number;
  height: number;
  channels: 1 | 3 | 4;
  data: Uint8Array;
}

/** OCR de plusieurs images avec un seul worker (le chargement des langues coûte plusieurs secondes). */
export async function extractRawImagesOcr(images: RawImage[]): Promise<string[]> {
  if (images.length === 0) return [];
  const pngs = await Promise.all(images.map(encodePng));
  return ocrMany(pngs);
}

async function ocrMany(payloads: Buffer[]): Promise<string[]> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("fra+eng");
    try {
      const out: string[] = [];
      for (const p of payloads) {
        const { data: ocr } = await worker.recognize(p);
        out.push(normalizeOcrText(ocr.text ?? ""));
      }
      return out;
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    throw new Error(`OCR indisponible : ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Caractère de jeton : base64, base64url, hexadécimal, séparateurs de clés d'API. */
const TOKEN_TAIL = /([A-Za-z0-9._\-+/=]{24,})$/;
const TOKEN_HEAD = /^([A-Za-z0-9._\-+/=]{8,})/;
const mixed = (s: string) => /[A-Za-z]/.test(s) && /\d/.test(s);

/**
 * Corrige les défauts de l'OCR qui empêchent la détection des secrets :
 * - tirets typographiques (—, –, ‒, −) lus à la place de « - » : « ——---BEGIN RSA PRIVATE KEY »
 *   redevient « -----BEGIN » ;
 * - jeton coupé en fin de ligne par le rendu de l'image : les deux morceaux sont recollés quand
 *   la fin de ligne et le début de la suivante ressemblent tous deux à un jeton (lettres et chiffres
 *   mêlés, sans espace). Recoller deux jetons distincts ne fait que masquer plus large.
 * Les caractères mal reconnus (l/1/I, 0/O) ne sont pas corrigés : la forme de la clé reste
 * reconnaissable et le moteur la détecte quand même.
 */
export function normalizeOcrText(text: string): string {
  const lines = text.replace(/[‒–—―−]/g, "-").split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const prev = out.length ? out[out.length - 1]! : "";
    const tail = prev.trimEnd().match(TOKEN_TAIL)?.[1];
    const head = line.trimStart().match(TOKEN_HEAD)?.[1];
    if (tail && head && mixed(tail) && mixed(head) && !/^-{3,}/.test(line.trimStart())) {
      out[out.length - 1] = prev.trimEnd() + line.trimStart();
    } else {
      out.push(line);
    }
  }
  return out.join("\n").trim();
}

/** PNG 8 bits sans perte (gris, RVB ou RVBA), compressé par zlib. */
async function encodePng(img: RawImage): Promise<Buffer> {
  const { deflateSync } = await import("node:zlib");
  const { width, height, channels, data } = img;
  const colorType = channels === 1 ? 0 : channels === 3 ? 2 : 6;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtre « None »
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

let crcTable: Uint32Array | null = null;
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
