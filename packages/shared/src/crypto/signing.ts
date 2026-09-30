import { canonicalJson } from "./canonical.js";
import { base64UrlToBytes, bytesToBase64Url, utf8Encode } from "./encoding.js";
import type { PublicKeyJwk } from "../contracts/agent.js";

/**
 * Signature ECDSA P-256 / SHA-256 via WebCrypto, disponible à l'identique dans
 * Node.js, les extensions navigateur et le shim CLI. Sert au signal de présence
 * signé (DAT §11.1) et à l'authentification des agents.
 */
const ALGO: EcKeyGenParams = { name: "ECDSA", namedCurve: "P-256" };
const SIGN_PARAMS: EcdsaParams = { name: "ECDSA", hash: "SHA-256" };

export interface AgentKeyPairJwk {
  publicKey: PublicKeyJwk;
  privateKey: JsonWebKey;
}

export async function generateAgentKeyPair(): Promise<AgentKeyPairJwk> {
  const pair = await globalThis.crypto.subtle.generateKey(ALGO, true, ["sign", "verify"]);
  const publicJwk = (await globalThis.crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  const privateJwk = await globalThis.crypto.subtle.exportKey("jwk", pair.privateKey);
  return {
    publicKey: { kty: "EC", crv: "P-256", x: publicJwk.x!, y: publicJwk.y! },
    privateKey: privateJwk,
  };
}

export async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey("jwk", jwk, ALGO, false, ["sign"]);
}

export async function importPublicKey(jwk: PublicKeyJwk): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey("jwk", { ...jwk, ext: true }, ALGO, false, ["verify"]);
}

export async function signPayload(privateKey: CryptoKey, payload: unknown): Promise<string> {
  const data = utf8Encode(canonicalJson(payload));
  const signature = await globalThis.crypto.subtle.sign(SIGN_PARAMS, privateKey, data as BufferSource);
  return bytesToBase64Url(signature);
}

export async function verifyPayload(publicKey: CryptoKey, payload: unknown, signature: string): Promise<boolean> {
  try {
    const data = utf8Encode(canonicalJson(payload));
    return await globalThis.crypto.subtle.verify(SIGN_PARAMS, publicKey, base64UrlToBytes(signature) as BufferSource, data as BufferSource);
  } catch {
    return false;
  }
}

export async function publicKeyFingerprint(jwk: PublicKeyJwk): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", utf8Encode(canonicalJson(jwk)) as BufferSource);
  return bytesToBase64Url(digest).slice(0, 16);
}
