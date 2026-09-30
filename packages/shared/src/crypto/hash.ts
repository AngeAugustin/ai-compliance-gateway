import { canonicalJson } from "./canonical.js";
import { bytesToHex, utf8Encode } from "./encoding.js";
import type { SecurityEventHashInput } from "../contracts/events.js";

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === "string" ? utf8Encode(input) : input;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return bytesToHex(digest);
}

export async function sha256Canonical(value: unknown): Promise<string> {
  return sha256Hex(canonicalJson(value));
}

/**
 * Hachage chaîné des événements de sécurité (DAT §12) :
 * event_hash = sha256(canonical(event sans eventHash) || prev_event_hash)
 */
export async function computeEventHash(event: SecurityEventHashInput): Promise<string> {
  const { prevEventHash, ...rest } = event;
  return sha256Hex(canonicalJson(rest) + "|" + (prevEventHash ?? "GENESIS"));
}

/** Hachage pseudonymisant d'un identifiant utilisateur avec sel organisationnel. */
export async function hashUserId(userId: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${userId}`);
}
