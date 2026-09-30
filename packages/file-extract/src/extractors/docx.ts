import mammoth from "mammoth";

export async function extractDocx(data: Uint8Array): Promise<string> {
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
}
