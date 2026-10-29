import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) : HMAC-SHA1, pas de 30 s, 6 chiffres — compatible Google Authenticator,
 * Microsoft Authenticator, FreeOTP, Aegis. Implémenté sur node:crypto, sans dépendance.
 */
export const TOTP_PERIOD_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Secret base32 invalide");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Secret de 160 bits (taille recommandée par la RFC 4226 pour HMAC-SHA1). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(msg).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return code.toString().padStart(DIGITS, "0");
}

export function totpStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

/**
 * Vérifie un code avec une tolérance d'un pas (±30 s de décalage d'horloge). Renvoie le pas
 * accepté, à mémoriser : un code déjà utilisé (pas ≤ dernier pas accepté) est refusé (rejeu).
 */
export function verifyTotp(secretBase32: string, code: string, lastUsedStep: number | null, nowMs = Date.now()): number | null {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;
  const secret = base32Decode(secretBase32);
  const current = totpStep(nowMs);
  for (const step of [current - 1, current, current + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const expected = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(expected, Buffer.from(normalized))) return step;
  }
  return null;
}

export function otpauthUri(issuer: string, account: string, secretBase32: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(TOTP_PERIOD_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** QR code de l'URI d'enrôlement (data URL PNG) ; null si la bibliothèque n'est pas installée. */
export async function qrDataUrl(uri: string): Promise<string | null> {
  try {
    const mod = (await import("qrcode")) as unknown as { toDataURL: (text: string, opts?: object) => Promise<string>; default?: unknown };
    const lib = (mod.default ?? mod) as { toDataURL: (text: string, opts?: object) => Promise<string> };
    return await lib.toDataURL(uri, { margin: 1, width: 220 });
  } catch {
    return null;
  }
}
