/** Texte OCR réel (tesseract sur les images du corpus) : les secrets doivent rester détectables. */
import { DetectionEngine } from "@acg/detection-engine";
import { describe, expect, it } from "vitest";
import { normalizeOcrText } from "./extractors/ocr.js";

const engine = new DetectionEngine();
const types = async (t: string) => (await engine.detect(t)).entities.map((e) => e.entityType);

describe("normalisation du texte OCR", () => {
  it("tirets typographiques : la clé privée redevient détectable", async () => {
    const ocr = "configurer nginx :\n\n——---BEGIN RSA PRIVATE KEY-----\nMIlEowIBAAKCAQEA7vQ3mZ8xK2LpROtYwN4cB6dF 1gH3jK5MmN7pQ9rS2tU4vWEXY\n8zA1bC3dE5fG7h19jK1IM3nO5pQ7rS9tU1vW3xY5zA7bC9dE1fG3hl5[K7IM9nO\n-----END RSA PRIVATE KEY-----";
    expect(await types(ocr)).not.toContain("PRIVATE_KEY");
    const fixed = normalizeOcrText(ocr);
    expect(fixed).toContain("-----BEGIN RSA PRIVATE KEY-----");
    expect(await types(fixed)).toContain("PRIVATE_KEY");
  });

  it("jeton coupé en fin de ligne : recollé en entier", async () => {
    const ocr = 'curl -H "Authorization: Bearer\neyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbi1jonNZliwicm9sZSI6IkKFETUIOIn0.k3Jp0Q9w2vX8tB1nM4cZ7yL6\naE5sD3fG2hJ1kLOqW9e" https://api.exemple.com';
    const fixed = normalizeOcrText(ocr);
    expect(fixed).toContain("k3Jp0Q9w2vX8tB1nM4cZ7yL6aE5sD3fG2hJ1kLOqW9e");
    const jwt = (await engine.detect(fixed)).entities.find((e) => e.entityType === "API_KEY");
    expect(jwt?.value ?? "").toMatch(/aE5sD3fG2hJ1kLOqW9e$/);
  });

  it("texte ordinaire : lignes inchangées", () => {
    const ocr = "Bonjour,\nmerci de relire la note 2025 avant vendredi.\nCordialement";
    expect(normalizeOcrText(ocr)).toBe(ocr);
  });
});
