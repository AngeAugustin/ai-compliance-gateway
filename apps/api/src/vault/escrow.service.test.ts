import { beforeEach, describe, expect, it, vi } from "vitest";
import { InternalServerErrorException } from "@nestjs/common";
import { generateEscrowKeyPair, sealEscrow } from "@acg/shared";
import { encryptValue, importMasterKey } from "@acg/vault";

const db = vi.hoisted(() => ({
  escrowRow: null as Record<string, unknown> | null,
  accessLog: [] as unknown[][],
}));

vi.mock("../db.js", () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("FROM vault.escrow e")) return { rows: db.escrowRow ? [db.escrowRow] : [] };
    if (sql.includes("INSERT INTO vault.access_log")) db.accessLog.push(params);
    return { rows: [] };
  }),
}));

const { EscrowService } = await import("./escrow.service.js");
const { env } = await import("../env.js");

const EVENT = "0b5c8a1e-4c1f-4f7e-9a51-2d3c4b5a6f70";
const INTERACTION = "int-1";
const DPO = { id: "11111111-1111-4111-8111-111111111111", role: "DPO", mfa: true } as never;
const PURPOSE = "Réquisition judiciaire n° 2026-114";

async function setup() {
  const service = new EscrowService();
  const masterKey = await importMasterKey(env.vaultMasterKey);
  (service as unknown as { masterKey: CryptoKey }).masterKey = masterKey;
  const pair = await generateEscrowKeyPair();
  const envelope = await sealEscrow({ kid: "k1", publicKey: pair.publicKey }, [{ token: "[EMAIL_1]", entityType: "EMAIL", value: "awa@exemple.bj" }], INTERACTION);
  const row = {
    interaction_id: INTERACTION,
    envelope,
    expires_at: new Date(Date.now() + 86_400_000),
    private_jwk_encrypted: Buffer.from(await encryptValue(masterKey, JSON.stringify(pair.privateKey))),
  };
  return { service, row, envelope };
}

describe("levée d'anonymat sur un séquestre illisible", () => {
  beforeEach(() => {
    db.escrowRow = null;
    db.accessLog = [];
  });

  it("enveloppe intacte : valeurs restituées, tentative accordée journalisée", async () => {
    const { service, row } = await setup();
    db.escrowRow = row;
    const res = await service.reveal(EVENT, DPO, PURPOSE, "127.0.0.1");
    expect(res.entries[0]!.value).toBe("awa@exemple.bj");
    expect(db.accessLog).toHaveLength(1);
    expect(db.accessLog[0]![4]).toBe(true);
  });

  it("enveloppe mal formée en base : 500 (pas 400) et refus journalisé", async () => {
    const { service, row } = await setup();
    db.escrowRow = { ...row, envelope: { v: 1, kid: "k1" } };
    await expect(service.reveal(EVENT, DPO, PURPOSE, "127.0.0.1")).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(db.accessLog).toHaveLength(1);
    expect(db.accessLog[0]![4]).toBe(false);
    expect(db.accessLog[0]![5]).toBe("séquestre illisible ou altéré");
  });

  it("contenu chiffré modifié : déchiffrement refusé, 500 et refus journalisé", async () => {
    const { service, row, envelope } = await setup();
    const ct = envelope.ct;
    const flipped = (ct[0] === "A" ? "B" : "A") + ct.slice(1);
    db.escrowRow = { ...row, envelope: { ...envelope, ct: flipped } };
    await expect(service.reveal(EVENT, DPO, PURPOSE, "127.0.0.1")).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(db.accessLog).toHaveLength(1);
    expect(db.accessLog[0]![5]).toBe("séquestre illisible ou altéré");
  });
});
