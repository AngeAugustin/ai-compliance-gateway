import { describe, expect, it } from "vitest";
import { DetectionEngine } from "./engine.js";
import { applyMasking } from "./masking.js";
import { RulesLayer } from "./layers/rules/index.js";
import { classifyByKeywords } from "./layers/keyword-context.js";
import { isValidIban, isValidLuhn, normalizeBeninPhone } from "./layers/rules/validators.js";

describe("validators", () => {
  it("valide un IBAN FR connu", () => {
    expect(isValidIban("FR7630006000011234567890189")).toBe(true);
    expect(isValidIban("FR7630006000011234567890180")).toBe(false);
  });
  it("valide Luhn", () => {
    expect(isValidLuhn("4532015112830366")).toBe(true);
    expect(isValidLuhn("4532015112830367")).toBe(false);
  });
  it("normalise un numéro béninois", () => {
    expect(normalizeBeninPhone("+229 01 97 12 34 56")).toBe("0197123456");
    expect(normalizeBeninPhone("97123456")).toBe("0197123456");
  });
});

describe("RulesLayer", () => {
  const layer = new RulesLayer();

  it("détecte e-mail, IBAN, mobile money et clé API", async () => {
    const text =
      "Contacter jean.dupont@cnss.bj pour virer 2 500 000 FCFA vers FR7630006000011234567890189 via MoMo 01 97 12 34 56. Clé: sk-abcdefghijklmnopqrstuvwxyz012345";
    const result = await layer.detect(text);
    const types = result.entities.map((e) => e.entityType);
    expect(types).toContain("EMAIL");
    expect(types).toContain("IBAN");
    expect(types).toContain("FINANCIAL_AMOUNT");
    expect(types).toContain("MOBILE_MONEY");
    expect(types).toContain("API_KEY");
    expect(result.degraded).toBe(false);
    expect(result.layer).toBe("rules");
  });

  it("détecte un numéro d'assuré CNSS", async () => {
    const result = await layer.detect("Le numero CNSS A12345678 doit rester interne.");
    expect(result.entities.map((e) => e.entityType).join(",")).toContain("CNSS_INSURED_NUMBER");
  });
});

describe("DetectionEngine + masking", () => {
  it("agrège et masque sans perdre le texte autour", async () => {
    const engine = new DetectionEngine();
    const text = "Envoyer 150 000 FCFA à ada@cnss.bj pour les cotisations.";
    const agg = await engine.detect(text);
    expect(agg.entities.length).toBeGreaterThan(0);
    expect(agg.context?.contextCategory).toBe("Finance");
    const masked = applyMasking(text, agg.entities);
    expect(masked.text).not.toContain("ada@cnss.bj");
    expect(masked.tokens.length).toBe(agg.entities.length);
    expect(masked.text).toMatch(/EMAIL_\d{3}/);
  });
});

describe("keyword context", () => {
  it("classe un prompt RH", () => {
    expect(classifyByKeywords("Voici le CV du candidat et son salaire d'embauche").contextCategory).toBe("RH");
  });

  it("compare sans accents ni casse, en mots entiers", () => {
    expect(classifyByKeywords("Patient HOSPITALISÉ pour paludisme").contextCategory).toBe("Medical");
    expect(classifyByKeywords("Ecris une requete SQL sur la table des prestations").contextCategory).toBe("Technique");
    // « cv » à l'intérieur d'un jeton encodé n'est pas un mot RH.
    expect(classifyByKeywords("Résume ce texte : xYguCvOVbnSQ6w3pj").contextCategory).toBe("Generique");
  });

  it("un seul terme ambigu reste générique", () => {
    expect(classifyByKeywords("Quel est le montant total ?").contextCategory).toBe("Generique");
    expect(classifyByKeywords("Résume cet article de presse").contextCategory).toBe("Generique");
  });

  it("à score égal, la catégorie la plus sensible l'emporte", () => {
    expect(classifyByKeywords("Envoie la facture du médecin").contextCategory).toBe("Medical");
  });
});
