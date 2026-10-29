import { z } from "zod";
import { canonicalJson } from "./canonical.js";
import { base64UrlToBytes, bytesToBase64Url, randomBytes, utf8Decode, utf8Encode } from "./encoding.js";
import { PublicKeyJwkSchema, type PublicKeyJwk } from "../contracts/agent.js";

/**
 * Séquestre des valeurs masquées (DAT §10.2), chiffrement hybride à clé publique :
 * ECDH P-256 avec une clé éphémère par message, HKDF-SHA256, AES-256-GCM.
 *
 * L'agent chiffre avec la clé publique du serveur ; seule la clé privée — gardée par
 * l'API, elle-même chiffrée par la clé maîtresse — permet de relire. Ni la file hors
 * ligne, ni le transit, ni la base ne contiennent donc de valeur en clair, et le serveur
 * ne déchiffre qu'à la demande d'une levée d'anonymat journalisée.
 *
 * L'identifiant d'interaction est lié en données associées (AAD) : une enveloppe
 * recopiée sur un autre événement ne se déchiffre pas.
 */
export const ESCROW_ALG = "ECDH-ES+HKDF-SHA256+A256GCM" as const;

export const EscrowEnvelopeSchema = z.object({
  v: z.literal(1),
  alg: z.literal(ESCROW_ALG),
  /** Identifiant de la clé de séquestre utilisée (rotation). */
  kid: z.string().min(1).max(64),
  /** Clé publique éphémère de l'émetteur. */
  epk: PublicKeyJwkSchema,
  iv: z.string().min(1),
  ct: z.string().min(1).max(200_000),
});
export type EscrowEnvelope = z.infer<typeof EscrowEnvelopeSchema>;

/** Contenu chiffré : correspondance jeton → valeur pour une interaction. */
export interface EscrowEntry {
  token: string;
  entityType: string;
  value: string;
}

const ECDH: EcKeyGenParams = { name: "ECDH", namedCurve: "P-256" };

export interface EscrowKeyPairJwk {
  publicKey: PublicKeyJwk;
  privateKey: JsonWebKey;
}

export async function generateEscrowKeyPair(): Promise<EscrowKeyPairJwk> {
  const pair = await globalThis.crypto.subtle.generateKey(ECDH, true, ["deriveBits"]);
  const pub = (await globalThis.crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  return {
    publicKey: { kty: "EC", crv: "P-256", x: pub.x!, y: pub.y! },
    privateKey: (await globalThis.crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey,
  };
}

async function deriveKey(privateKey: CryptoKey, publicJwk: PublicKeyJwk, kid: string, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  const peer = await globalThis.crypto.subtle.importKey("jwk", { ...publicJwk, ext: true }, ECDH, false, []);
  const shared = await globalThis.crypto.subtle.deriveBits({ name: "ECDH", public: peer }, privateKey, 256);
  const hkdf = await globalThis.crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return globalThis.crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: utf8Encode(`acg-escrow-v1|${kid}`) as BufferSource },
    hkdf,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

export async function sealEscrow(
  recipient: { kid: string; publicKey: PublicKeyJwk },
  entries: EscrowEntry[],
  interactionId: string,
): Promise<EscrowEnvelope> {
  const ephemeral = await globalThis.crypto.subtle.generateKey(ECDH, true, ["deriveBits"]);
  const epkJwk = (await globalThis.crypto.subtle.exportKey("jwk", ephemeral.publicKey)) as JsonWebKey;
  const key = await deriveKey(ephemeral.privateKey, recipient.publicKey, recipient.kid, "encrypt");
  const iv = randomBytes(12);
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: utf8Encode(interactionId) as BufferSource },
    key,
    utf8Encode(canonicalJson(entries)) as BufferSource,
  );
  return {
    v: 1,
    alg: ESCROW_ALG,
    kid: recipient.kid,
    epk: { kty: "EC", crv: "P-256", x: epkJwk.x!, y: epkJwk.y! },
    iv: bytesToBase64Url(iv),
    ct: bytesToBase64Url(ct),
  };
}

export async function openEscrow(privateKeyJwk: JsonWebKey, envelope: EscrowEnvelope, interactionId: string): Promise<EscrowEntry[]> {
  const privateKey = await globalThis.crypto.subtle.importKey("jwk", privateKeyJwk, ECDH, false, ["deriveBits"]);
  const key = await deriveKey(privateKey, envelope.epk, envelope.kid, "decrypt");
  const plain = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(envelope.iv) as BufferSource, additionalData: utf8Encode(interactionId) as BufferSource },
    key,
    base64UrlToBytes(envelope.ct) as BufferSource,
  );
  return JSON.parse(utf8Decode(new Uint8Array(plain))) as EscrowEntry[];
}
