import { sanitizeZipXmlParts } from "./sanitize-zip-xml.js";

const PPTX_XML_PART =
  /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+|slideMasters\/slideMaster\d+|slideLayouts\/slideLayout\d+)\.xml$/i;

/** Remplace les valeurs sensibles dans les slides / notes d'un PPTX. */
export async function sanitizePptxBinary(
  data: Uint8Array,
  replacements: { from: string; to: string }[],
): Promise<Uint8Array | null> {
  return sanitizeZipXmlParts(data, replacements, (name) => PPTX_XML_PART.test(name));
}
