import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical.js";
import { computeEventHash, sha256Hex } from "./hash.js";
import { generateAgentKeyPair, importPrivateKey, importPublicKey, signPayload, verifyPayload } from "./signing.js";
import { base64UrlToBytes, bytesToBase64Url } from "./encoding.js";

describe("canonicalJson", () => {
  it("trie les clés et ignore undefined", () => {
    expect(canonicalJson({ b: 1, a: [3, { z: true, y: undefined }], c: undefined })).toBe(`{"a":[3,{"z":true}],"b":1}`);
  });
});

describe("hash", () => {
  it("sha256 connu", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("chaînage : modifier un champ ou le hash précédent change le hash", async () => {
    const base = {
      eventId: "11111111-1111-4111-8111-111111111111",
      occurredAt: "2026-09-28T10:00:00.000Z",
      userIdHash: "a".repeat(64),
      department: "Finance",
      agentId: null,
      channel: "browser" as const,
      aiServiceId: "chatgpt.com",
      hostingRegion: "US",
      entitiesDetected: ["PERSON"],
      entityCounts: { PERSON: 1 },
      contextCategory: null,
      riskScore: 40,
      riskBand: "moderate" as const,
      factorBreakdown: [],
      policyId: null,
      action: "WARN" as const,
      referenceFrameworks: [],
      degradedMode: false,
      processingTimeMs: 12,
      detectionLayers: ["rules"],
      prevEventHash: null,
    };
    const h1 = await computeEventHash(base);
    const h2 = await computeEventHash({ ...base, riskScore: 41 });
    const h3 = await computeEventHash({ ...base, prevEventHash: "b".repeat(64) });
    expect(h1).toHaveLength(64);
    expect(h1).not.toBe(h2);
    expect(h1).not.toBe(h3);
    expect(await computeEventHash(base)).toBe(h1);

    // Ajout de serverDecision : les événements antérieurs (champ absent) gardent leur empreinte,
    // et la décision serveur, quand elle est présente, est couverte par l'empreinte.
    expect(await computeEventHash({ ...base, serverDecision: undefined })).toBe(h1);
    const withServer = { ...base, serverDecision: { action: "BLOCK" as const, policyId: "p1", riskScore: 80, riskBand: "high" as const } };
    expect(await computeEventHash(withServer)).not.toBe(h1);
  });
});

describe("signing", () => {
  it("signe et vérifie un payload ; rejette une altération", async () => {
    const pair = await generateAgentKeyPair();
    const priv = await importPrivateKey(pair.privateKey);
    const pub = await importPublicKey(pair.publicKey);
    const payload = { agentId: "x", sequence: 1, sentAt: "2026-09-28T10:00:00.000Z" };
    const sig = await signPayload(priv, payload);
    expect(await verifyPayload(pub, payload, sig)).toBe(true);
    expect(await verifyPayload(pub, { ...payload, sequence: 2 }, sig)).toBe(false);
    expect(await verifyPayload(pub, payload, "not-a-signature")).toBe(false);
  });

  it("encode base64url aller-retour", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
  });
});
