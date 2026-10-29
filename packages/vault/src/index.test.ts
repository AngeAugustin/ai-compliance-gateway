import { describe, expect, it } from "vitest";
import { decryptValue, encryptValue, importMasterKey } from "./index.js";

describe("vault crypto", () => {
  it("chiffre et déchiffre AES-256-GCM", async () => {
    const key = await importMasterKey("ZGV2LW9ubHktdmF1bHQta2V5LTMyLWJ5dGVzLS0tLS0tLQ==");
    const payload = await encryptValue(key, "Jean Dupont");
    expect(payload.length).toBeGreaterThan(12);
    expect(await decryptValue(key, payload)).toBe("Jean Dupont");
  });

  it("deux chiffrements de la même valeur diffèrent (IV aléatoire)", async () => {
    const key = await importMasterKey("ZGV2LW9ubHktdmF1bHQta2V5LTMyLWJ5dGVzLS0tLS0tLQ==");
    const a = await encryptValue(key, "Aïcha K.");
    const b = await encryptValue(key, "Aïcha K.");
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });
});
