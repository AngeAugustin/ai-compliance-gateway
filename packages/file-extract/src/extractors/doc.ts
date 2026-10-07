import { extractPrintableStrings } from "./binary.js";

/**
 * Ancien format Word .doc (OLE) : pas de parseur léger fiable.
 * On extrait les chaînes imprimables (souvent suffisant pour PII / secrets).
 */
export function extractDocLegacy(data: Uint8Array): string {
  return extractPrintableStrings(data, 5);
}
