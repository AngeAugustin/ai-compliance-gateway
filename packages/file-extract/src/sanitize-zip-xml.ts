import { unzipEntries, zipStore } from "./extractors/pptx-zip.js";

/** Remplace des valeurs en clair dans les entrées XML sélectionnées d'un ZIP OOXML. */
export async function sanitizeZipXmlParts(
  data: Uint8Array,
  replacements: { from: string; to: string }[],
  includeEntry: (name: string) => boolean,
): Promise<Uint8Array | null> {
  if (replacements.length === 0) return null;
  try {
    const entries = await unzipEntries(data);
    if (entries.length === 0) return null;
    let changed = false;
    const next = entries.map((entry) => {
      if (!includeEntry(entry.name)) return entry;
      let xml = new TextDecoder("utf-8").decode(entry.data);
      const before = xml;
      for (const { from, to } of replacements) {
        if (!from || !xml.includes(from)) continue;
        xml = xml.split(from).join(to);
      }
      if (xml !== before) changed = true;
      return { name: entry.name, data: new TextEncoder().encode(xml) };
    });
    if (!changed) return null;
    return zipStore(Object.fromEntries(next.map((e) => [e.name, e.data])));
  } catch {
    return null;
  }
}
