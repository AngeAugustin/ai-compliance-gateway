/** Reconstruit un PDF minimal (1 page) avec le texte déjà masqué — offsets xref recalculés. */
export function rebuildMinimalPdf(text: string): Uint8Array {
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .slice(0, 1800);
  const stream = `BT /F1 11 Tf 50 750 Td (${escaped}) Tj ET`;
  const objects = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n",
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream endobj\n`,
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(body.length);
    body += obj;
  }
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]!).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

/** Remplace les valeurs en clair dans le binaire PDF (PDF texte simple) puis corrige les /Length. */
export function sanitizePdfBinary(data: Uint8Array, replacements: { from: string; to: string }[]): Uint8Array | null {
  if (replacements.length === 0) return null;
  let pdf = new TextDecoder("latin1").decode(data);
  let changed = false;
  for (const { from, to } of replacements) {
    if (!from || !pdf.includes(from)) continue;
    pdf = pdf.split(from).join(to);
    changed = true;
  }
  if (!changed) return null;
  pdf = pdf.replace(
    /<<\s*\/Length\s+(\d+)\s*>>\s*stream\r?\n([\s\S]*?)endstream/g,
    (_match, _oldLen, streamContent: string) => `<< /Length ${streamContent.length} >>stream\n${streamContent}endstream`,
  );
  return new TextEncoder().encode(pdf);
}
