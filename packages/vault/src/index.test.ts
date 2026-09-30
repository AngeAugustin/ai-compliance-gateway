import { describe, expect, it } from "vitest";
import { AnonymizationVault, MemoryVaultStore, decryptValue, encryptValue, importMasterKey } from "./index.js";

describe("vault crypto", () => {
  it("chiffre et déchiffre AES-256-GCM", async () => {
    const key = await importMasterKey("ZGV2LW9ubHktdmF1bHQta2V5LTMyLWJ5dGVzLS0tLS0tLQ==");
    const payload = await encryptValue(key, "Jean Dupont");
    expect(payload.length).toBeGreaterThan(12);
    expect(await decryptValue(key, payload)).toBe("Jean Dupont");
  });

  it("stocke une correspondance réversible", async () => {
    const key = await importMasterKey("ZGV2LW9ubHktdmF1bHQta2V5LTMyLWJ5dGVzLS0tLS0tLQ==");
    const vault = new AnonymizationVault(key, new MemoryVaultStore());
    await vault.storeMapping("11111111-1111-4111-8111-111111111111", "PERSONNE_001", "PERSON", "Aïcha K.");
    expect(await vault.reveal("PERSONNE_001")).toBe("Aïcha K.");
    expect(await vault.reveal("inconnu")).toBeNull();
  });
});
