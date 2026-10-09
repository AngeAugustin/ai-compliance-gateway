import { unzipEntries } from "./pptx-zip.js";

const DOCX_TEXT_PART = /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/i;

/** Extraction texte DOCX via ZIP/XML — compatible Node et service worker MV3 (sans Buffer/mammoth). */
export async function extractDocxFromZip(data: Uint8Array): Promise<string> {
  const entries = await unzipEntries(data);
  if (entries.length === 0) return "";
  const parts: string[] = [];
  const ordered = entries
    .filter((e) => DOCX_TEXT_PART.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const entry of ordered) {
    const xml = new TextDecoder("utf-8").decode(entry.data);
    // Joindre les runs <w:t> *dans* un paragraphe (Word coupe au milieu des mots),
    // puis séparer les paragraphes — sinon « A12345678Contact » casse la détection.
    const paragraphs = [...xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)].map((m) => {
      const runs = [...m[0]!.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((t) => t[1] ?? "");
      return runs.join("");
    });
    const block = paragraphs.filter((p) => p.trim()).join("\n");
    if (block) parts.push(block);
  }
  return parts.join("\n\n").trim();
}

export async function extractDocx(data: Uint8Array): Promise<string> {
  const fromZip = await extractDocxFromZip(data);
  if (fromZip) return fromZip;

  // Repli Node uniquement : mammoth gère mieux certains DOCX complexes.
  if (typeof Buffer === "undefined") return "";
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.default.extractRawText({ buffer: Buffer.from(data) });
    return result.value.trim();
  } catch {
    return "";
  }
}
