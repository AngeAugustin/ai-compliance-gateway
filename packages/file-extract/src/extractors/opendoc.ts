import { listZipEntries } from "./pptx-zip.js";

/** OpenDocument (odt/ods/odp) = ZIP contenant content.xml. */
export async function extractOpenDocument(data: Uint8Array): Promise<string> {
  const files = await listZipEntries(data);
  const content = files.find((f) => f.name === "content.xml");
  if (!content) return "";
  const xml = new TextDecoder("utf-8").decode(content.data);
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
