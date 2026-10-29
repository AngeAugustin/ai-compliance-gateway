import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateTotpSecret, hotp, otpauthUri, totpStep, verifyTotp } from "./totp.js";

// Vecteurs de la RFC 6238 (annexe B), SHA-1, secret ASCII « 12345678901234567890 », 8 chiffres
// tronqués ici aux 6 derniers : la troncature dynamique donne les mêmes 6 derniers chiffres.
const RFC_SECRET = Buffer.from("12345678901234567890");

describe("TOTP RFC 6238", () => {
  it("retrouve les vecteurs de test de la RFC", () => {
    expect(hotp(RFC_SECRET, Math.floor(59 / 30))).toBe("287082");
    expect(hotp(RFC_SECRET, Math.floor(1111111109 / 30))).toBe("081804");
    expect(hotp(RFC_SECRET, Math.floor(1234567890 / 30))).toBe("005924");
    expect(hotp(RFC_SECRET, Math.floor(2000000000 / 30))).toBe("279037");
  });

  it("base32 aller-retour", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it("accepte le code courant et ±1 pas, refuse le rejeu et les codes mal formés", () => {
    const secret = generateTotpSecret();
    const now = 1_800_000_000_000;
    const step = totpStep(now);
    const code = hotp(base32Decode(secret), step);
    expect(verifyTotp(secret, code, null, now)).toBe(step);
    expect(verifyTotp(secret, code, step, now)).toBeNull(); // déjà utilisé
    expect(verifyTotp(secret, hotp(base32Decode(secret), step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(secret, hotp(base32Decode(secret), step - 2), null, now)).toBeNull();
    expect(verifyTotp(secret, "12345", null, now)).toBeNull();
  });

  it("URI d'enrôlement standard", () => {
    expect(otpauthUri("ACG", "dpo@cnss.bj", "JBSWY3DPEHPK3PXP")).toBe(
      "otpauth://totp/ACG%3Adpo%40cnss.bj?secret=JBSWY3DPEHPK3PXP&issuer=ACG&algorithm=SHA1&digits=6&period=30",
    );
  });
});
