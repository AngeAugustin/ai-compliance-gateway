import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical.js";
import { generateEscrowKeyPair, openEscrow, sealEscrow } from "./escrow.js";
import { agentRequestSigningPayload, generateAgentKeyPair, importPrivateKey, importPublicKey, signPayload, verifyPayload } from "./signing.js";

const ENTRIES = [
  { token: "PERSONNE_001", entityType: "PERSON", value: "Aïcha Yessoufou" },
  { token: "IBAN_001", entityType: "IBAN", value: "BJ59BJ0610100100144039000769" },
];

describe("séquestre à clé publique", () => {
  it("seule la clé privée de séquestre rouvre l'enveloppe, et l'enveloppe ne contient aucune valeur en clair", async () => {
    const keys = await generateEscrowKeyPair();
    const envelope = await sealEscrow({ kid: "k1", publicKey: keys.publicKey }, ENTRIES, "interaction-1");
    const serialized = canonicalJson(envelope);
    for (const e of ENTRIES) expect(serialized).not.toContain(e.value);
    expect(await openEscrow(keys.privateKey, envelope, "interaction-1")).toEqual(ENTRIES);

    const other = await generateEscrowKeyPair();
    await expect(openEscrow(other.privateKey, envelope, "interaction-1")).rejects.toThrow();
  });

  it("une enveloppe recopiée sur une autre interaction ne se déchiffre pas", async () => {
    const keys = await generateEscrowKeyPair();
    const envelope = await sealEscrow({ kid: "k1", publicKey: keys.publicKey }, ENTRIES, "interaction-1");
    await expect(openEscrow(keys.privateKey, envelope, "interaction-2")).rejects.toThrow();
  });

  it("une enveloppe altérée est rejetée", async () => {
    const keys = await generateEscrowKeyPair();
    const envelope = await sealEscrow({ kid: "k1", publicKey: keys.publicKey }, ENTRIES, "i");
    const tampered = { ...envelope, ct: envelope.ct.slice(0, -2) + (envelope.ct.endsWith("A") ? "BB" : "AA") };
    await expect(openEscrow(keys.privateKey, tampered, "i")).rejects.toThrow();
  });
});

describe("signature des requêtes agent", () => {
  it("couvre le corps : un événement modifié ne vérifie plus", async () => {
    const pair = await generateAgentKeyPair();
    const priv = await importPrivateKey(pair.privateKey);
    const pub = await importPublicKey(pair.publicKey);
    const base = { agentId: "a1", method: "POST", path: "/v1/interactions/evaluate", ts: "2026-10-29T10:00:00.000Z" };
    const body = { interactionId: "i1", localDecision: { action: "MASK" } };
    const sig = await signPayload(priv, await agentRequestSigningPayload({ ...base, body }));

    expect(await verifyPayload(pub, await agentRequestSigningPayload({ ...base, body }), sig)).toBe(true);
    const forged = { ...body, localDecision: { action: "ALLOW" } };
    expect(await verifyPayload(pub, await agentRequestSigningPayload({ ...base, body: forged }), sig)).toBe(false);
    expect(await verifyPayload(pub, await agentRequestSigningPayload({ ...base, path: "/v1/agents/sync", body }), sig)).toBe(false);
  });
});
