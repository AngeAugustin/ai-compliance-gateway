/** Validation IBAN (ISO 13616) : longueur par pays + contrôle mod 97. */
export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const value = code >= 65 ? String(code - 55) : ch;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** Algorithme de Luhn (cartes bancaires). */
export function isValidLuhn(raw: string): boolean {
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Numéro béninois à 10 chiffres (plan de numérotation 2024 : préfixe 01) ou format international +229. */
export function normalizeBeninPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  const m = /^(?:\+?229)?(01\d{8})$/.exec(digits) ?? /^(?:\+?229)?(\d{8})$/.exec(digits);
  if (!m) return null;
  const local = m[1]!.length === 8 ? `01${m[1]}` : m[1]!;
  return local;
}

/** Opérateurs mobile money béninois (MTN MoMo, Moov Money, Celtiis) d'après les préfixes après « 01 ». */
export function beninMobileOperator(local10: string): "MTN" | "MOOV" | "CELTIIS" | null {
  const p2 = local10.slice(2, 4);
  if (["42", "46", "50", "51", "52", "53", "54", "56", "57", "59", "61", "62", "66", "67", "69", "90", "91", "96", "97"].includes(p2)) return "MTN";
  if (["55", "58", "60", "63", "64", "65", "68", "94", "95", "98", "99"].includes(p2)) return "MOOV";
  if (["40", "41", "43", "44", "45", "47", "48", "49"].includes(p2)) return "CELTIIS";
  return null;
}

export function isShannonHighEntropy(value: string, threshold = 3.5): boolean {
  if (value.length < 16) return false;
  const freq = new Map<string, number>();
  for (const ch of value) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy >= threshold;
}
