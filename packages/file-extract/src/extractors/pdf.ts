/** Extraction PDF : pdfjs-dist si installé, sinon heuristique sur les streams texte. */
export async function extractPdf(data: Uint8Array, _maxPages = 50): Promise<string> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.js");
    const loading = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    const limit = Math.min(loading.numPages, _maxPages);
    const parts: string[] = [];
    for (let i = 1; i <= limit; i++) {
      const page = await loading.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) => ("str" in item ? String(item.str) : ""))
        .join(" ");
      parts.push(line);
    }
    const text = parts.join("\n").trim();
    if (text) return text;
  } catch {
    /* pdfjs absent ou PDF complexe — repli heuristique */
  }
  return extractPdfHeuristic(data);
}

function extractPdfHeuristic(data: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(data);
  const chunks: string[] = [];
  const paren = raw.matchAll(/\(([^()\\]{3,240})\)/g);
  for (const m of paren) {
    const s = m[1]!.replace(/\\n/g, " ").replace(/\\r/g, " ");
    if (/[A-Za-z0-9@]/.test(s)) chunks.push(s);
  }
  const literal = raw.matchAll(/\bTj[\s\S]{0,4}\(([^)]+)\)/g);
  for (const m of literal) chunks.push(m[1]!);
  return [...new Set(chunks)].join(" ").replace(/\s+/g, " ").trim();
}
