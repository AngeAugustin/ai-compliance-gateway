import { bytesToBase64Url, base64UrlToBytes, randomBytes, utf8Decode, utf8Encode } from "@acg/shared";

const ALGO = "AES-GCM";
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

export async function importMasterKey(base64: string): Promise<CryptoKey> {
  let raw: Uint8Array;
  try {
    raw = base64UrlToBytes(base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
  } catch {
    raw = utf8Encode(base64);
  }
  if (raw.length < 32) {
    const padded = new Uint8Array(32);
    padded.set(raw);
    raw = padded;
  }
  return globalThis.crypto.subtle.importKey("raw", raw.slice(0, 32) as BufferSource, { name: ALGO, length: KEY_LENGTH }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** IV (12) || ciphertext+tag — jamais de valeur en clair persistée. */
export async function encryptValue(key: CryptoKey, plaintext: string): Promise<Uint8Array> {
  const iv = randomBytes(IV_LENGTH);
  const cipher = await globalThis.crypto.subtle.encrypt({ name: ALGO, iv: iv as BufferSource }, key, utf8Encode(plaintext) as BufferSource);
  const payload = new Uint8Array(iv.length + cipher.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(cipher), iv.length);
  return payload;
}

export async function decryptValue(key: CryptoKey, payload: Uint8Array): Promise<string> {
  const iv = payload.slice(0, IV_LENGTH);
  const data = payload.slice(IV_LENGTH);
  const plain = await globalThis.crypto.subtle.decrypt({ name: ALGO, iv: iv as BufferSource }, key, data as BufferSource);
  return utf8Decode(new Uint8Array(plain));
}

export function encodeKeyMaterial(): string {
  return bytesToBase64Url(randomBytes(32));
}
