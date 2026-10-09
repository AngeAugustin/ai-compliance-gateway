import { sanitizeZipXmlParts } from "./sanitize-zip-xml.js";

const DOCX_XML_PART = /^word\/(document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/i;

/** Remplace les valeurs sensibles dans les parties XML d'un DOCX (ZIP). */
export async function sanitizeDocxBinary(
  data: Uint8Array,
  replacements: { from: string; to: string }[],
): Promise<Uint8Array | null> {
  return sanitizeZipXmlParts(
    data,
    replacements,
    (name) => DOCX_XML_PART.test(name) || (name.startsWith("word/") && name.endsWith(".xml")),
  );
}
