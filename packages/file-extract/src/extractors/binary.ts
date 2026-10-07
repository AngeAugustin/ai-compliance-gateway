/** Extraction heuristique depuis un binaire (équivalent approximatif de `strings`). */
export function extractPrintableStrings(data: Uint8Array, minLen = 4): string {
  const out: string[] = [];
  let current = "";
  for (let i = 0; i < data.length; i++) {
    const b = data[i]!;
    const printable = (b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13;
    if (printable) {
      current += String.fromCharCode(b);
    } else {
      if (current.length >= minLen) out.push(current);
      current = "";
    }
  }
  if (current.length >= minLen) out.push(current);
  return out.join("\n").trim();
}

/** True si le buffer est majoritairement du texte UTF-8 / ASCII. */
export function looksLikeText(data: Uint8Array): boolean {
  if (data.length === 0) return true;
  const sample = data.subarray(0, Math.min(data.length, 8192));
  let printable = 0;
  let nulls = 0;
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i]!;
    if (b === 0) nulls++;
    if ((b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13 || b >= 128) printable++;
  }
  if (nulls > sample.length * 0.01) return false;
  return printable / sample.length >= 0.85;
}
