/**
 * Lecteur ZIP minimal (store + deflate) pour PPTX / ODF / archives.
 * Évite une dépendance réseau fragile (fflate) tout en restant utilisable Node + navigateur.
 */

function u16(view: DataView, off: number): number {
  return view.getUint16(off, true);
}
function u32(view: DataView, off: number): number {
  return view.getUint32(off, true);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== "undefined") {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }
  // Import dynamique opaque pour ne pas faire échouer le bundle navigateur (esbuild).
  const zlibMod = "node:zlib";
  const zlib = (await (0, eval)(`import("${zlibMod}")`)) as typeof import("node:zlib");
  return new Uint8Array(zlib.inflateRawSync(Buffer.from(data)));
}

export async function unzipEntries(data: Uint8Array): Promise<{ name: string; data: Uint8Array }[]> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out: { name: string; data: Uint8Array }[] = [];
  let offset = 0;
  while (offset + 30 <= data.length) {
    const sig = u32(view, offset);
    if (sig !== 0x04034b50) break;
    const method = u16(view, offset + 8);
    const compSize = u32(view, offset + 18);
    const uncompSize = u32(view, offset + 22);
    const nameLen = u16(view, offset + 26);
    const extraLen = u16(view, offset + 28);
    const nameStart = offset + 30;
    const name = new TextDecoder("utf-8").decode(data.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    const payload = data.subarray(dataStart, dataStart + compSize);
    offset = dataStart + compSize;
    if (name.endsWith("/")) continue;
    try {
      let content: Uint8Array;
      if (method === 0) content = payload.slice();
      else if (method === 8) content = await inflateRaw(payload);
      else continue;
      if (uncompSize && content.length === 0) continue;
      out.push({ name, data: content });
    } catch {
      /* entrée corrompue ignorée */
    }
  }
  return out;
}

export async function extractPptx(data: Uint8Array): Promise<string> {
  const files = await unzipEntries(data);
  const byName = new Map(files.map((f) => [f.name, f.data]));
  const parts: string[] = [];
  const slideNames = [...byName.keys()]
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const name of slideNames) {
    const xml = new TextDecoder("utf-8").decode(byName.get(name)!);
    const texts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => m[1]!).filter(Boolean);
    if (texts.length) parts.push(`--- ${name} ---\n${texts.join(" ")}`);
  }
  for (const name of byName.keys()) {
    if (!/ppt\/(notesSlides|slideMasters)\/.*\.xml$/i.test(name)) continue;
    const xml = new TextDecoder("utf-8").decode(byName.get(name)!);
    const texts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => m[1]!).filter(Boolean);
    if (texts.length) parts.push(`--- ${name} ---\n${texts.join(" ")}`);
  }
  return parts.join("\n").trim();
}

export async function listZipEntries(data: Uint8Array): Promise<{ name: string; data: Uint8Array }[]> {
  return unzipEntries(data);
}

/** Construit un ZIP « store » (non compressé) pour les tests unitaires. */
export function zipStore(files: Record<string, Uint8Array>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const local = new Uint8Array(30 + nameBytes.length + content.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 0, true); // store
    lv.setUint32(18, content.length, true);
    lv.setUint32(22, content.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(content, 30 + nameBytes.length);
    chunks.push(local);

    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(20, content.length, true);
    cv.setUint32(24, content.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cen.set(nameBytes, 46);
    central.push(cen);
    offset += local.length;
  }
  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  for (const c of central) {
    out.set(c, p);
    p += c.length;
  }
  out.set(end, p);
  return out;
}
