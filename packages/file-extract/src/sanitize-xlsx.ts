import { sanitizeZipXmlParts } from "./sanitize-zip-xml.js";

const XLSX_XML_PART =
  /^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml|tables\/table\d+\.xml|workbook\.xml)$/i;

/** Remplace les valeurs sensibles dans sharedStrings / feuilles d'un XLSX. */
export async function sanitizeXlsxBinary(
  data: Uint8Array,
  replacements: { from: string; to: string }[],
): Promise<Uint8Array | null> {
  return sanitizeZipXmlParts(data, replacements, (name) => XLSX_XML_PART.test(name));
}
