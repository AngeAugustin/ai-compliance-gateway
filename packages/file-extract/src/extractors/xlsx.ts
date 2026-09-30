import * as XLSX from "xlsx";

export function extractXlsx(data: Uint8Array, maxRows = 5000): string {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const chunks: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];
    chunks.push(`--- ${name} ---`);
    for (const row of rows.slice(0, maxRows)) {
      if (!Array.isArray(row)) continue;
      chunks.push(row.map((c) => String(c ?? "")).join("\t"));
    }
  }
  return chunks.join("\n").trim();
}
