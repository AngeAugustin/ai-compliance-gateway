import { describe, expect, it } from "vitest";
import { isValidIban, isValidLuhn } from "../../packages/detection-engine/src/layers/rules/validators.js";
import { CORPUS_MANUEL } from "../../data/eval/corpus-manuel.js";
import { ann, parseAnnotated, toSample } from "../../tools/eval/annotation.js";
import { generateLongDocuments, generateSamples } from "../../tools/eval/corpus-genere.js";
import { bootstrapInterval, macroF1, matchEntities, prf, type PredEntity } from "../../tools/eval/metrics.js";
import { beninIban, generatePopulation, visaCard } from "../../tools/eval/population.js";
import { attack, buildAttackIndex, generateReidScenarios } from "../../tools/eval/reidentification.js";
import { createRng } from "../../tools/eval/rng.js";

describe("annotation", () => {
  it("calcule les positions dans le texte nettoyé", () => {
    const { text, gold } = parseAnnotated(`Écris à ${ann("PERSON", "Awa Bio")} au ${ann("PHONE", "01 97 00 11 22")}.`);
    expect(text).toBe("Écris à Awa Bio au 01 97 00 11 22.");
    expect(gold).toHaveLength(2);
    for (const g of gold) expect(text.slice(g.span[0], g.span[1])).toBe(g.value);
  });

  it("refuse les types inconnus, les valeurs mal bornées et les balises orphelines", () => {
    expect(() => parseAnnotated("⟦INCONNU|x⟧")).toThrow(/inconnu/);
    expect(() => parseAnnotated("⟦PERSON| Awa⟧")).toThrow(/espaces/);
    expect(() => parseAnnotated("⟦PERSON|Awa")).toThrow(/mal formée/);
  });
});

describe("corpus", () => {
  it("le corpus manuel se parse, sans identifiant en double", () => {
    const ids = new Set<string>();
    for (const source of CORPUS_MANUEL) {
      expect(ids.has(source.id), source.id).toBe(false);
      ids.add(source.id);
      expect(() => toSample(source, "manuel"), source.id).not.toThrow();
    }
    expect(CORPUS_MANUEL.length).toBeGreaterThanOrEqual(60);
  });

  it("les IBAN et cartes annotés à la main passent les validateurs (sinon la règle ne peut pas les trouver)", () => {
    for (const source of CORPUS_MANUEL) {
      for (const g of toSample(source, "manuel").gold) {
        if (g.entityType === "IBAN") expect(isValidIban(g.value), `${source.id} ${g.value}`).toBe(true);
        if (g.entityType === "CREDIT_CARD") expect(isValidLuhn(g.value), `${source.id} ${g.value}`).toBe(true);
      }
    }
  });

  it("le corpus généré est reproductible et se parse", () => {
    const people = generatePopulation(createRng(1), 200);
    const a = generateSamples(createRng(2), people, 80);
    const b = generateSamples(createRng(2), people, 80);
    expect(a).toEqual(b);
    for (const s of [...a, ...generateLongDocuments(createRng(3), people, 4)]) expect(() => toSample(s, "genere"), s.id).not.toThrow();
  });

  it("les générateurs produisent des IBAN et cartes valides", () => {
    const rng = createRng(42);
    for (let i = 0; i < 200; i++) {
      expect(isValidIban(beninIban(rng, i % 2 === 0))).toBe(true);
      expect(isValidLuhn(visaCard(rng))).toBe(true);
    }
  });
});

describe("métriques", () => {
  const gold = parseAnnotated(`${ann("PERSON", "Awa Bio")} habite ${ann("ADDRESS", "Cotonou")}`).gold;
  const pred = (entityType: PredEntity["entityType"], start: number, end: number): PredEntity => ({ entityType, span: [start, end] });

  it("strict exige les bornes exactes, partiel accepte le chevauchement", () => {
    const preds = [pred("PERSON", 0, 3), pred("ADDRESS", 15, 22)];
    expect(matchEntities(gold, preds, "strict").counts).toEqual({ tp: 1, fp: 1, fn: 1 });
    expect(matchEntities(gold, preds, "partiel").counts).toEqual({ tp: 2, fp: 0, fn: 0 });
  });

  it("protection ignore le type, partiel non", () => {
    const preds = [pred("ORGANIZATION", 0, 7)];
    expect(matchEntities(gold, preds, "partiel").counts).toEqual({ tp: 0, fp: 1, fn: 2 });
    expect(matchEntities(gold, preds, "protection").counts).toEqual({ tp: 1, fp: 0, fn: 1 });
  });

  it("l'appariement est un-à-un", () => {
    const preds = [pred("PERSON", 0, 3), pred("PERSON", 4, 7)];
    expect(matchEntities(gold, preds, "partiel").counts).toEqual({ tp: 1, fp: 1, fn: 1 });
  });

  it("prf et macro-F1 suivent les conventions documentées", () => {
    expect(prf({ tp: 0, fp: 0, fn: 0 })).toEqual({ precision: 1, recall: 1, f1: 1 });
    expect(prf({ tp: 0, fp: 3, fn: 0 }).f1).toBe(0);
    expect(prf({ tp: 3, fp: 1, fn: 1 }).f1).toBeCloseTo(0.75);
    const byType = new Map([
      ["PERSON" as const, { tp: 1, fp: 0, fn: 0 }],
      ["EMAIL" as const, { tp: 0, fp: 2, fn: 0 }], // jamais attendu : exclu de la macro-moyenne
    ]);
    expect(macroF1(byType)).toBe(1);
  });

  it("le bootstrap est déterministe et encadre la valeur observée", () => {
    const docs = Array.from({ length: 40 }, (_, i) => ({ tp: i % 3, fp: i % 5 === 0 ? 1 : 0, fn: i % 4 === 0 ? 1 : 0 }));
    const total = docs.reduce((a, c) => ({ tp: a.tp + c.tp, fp: a.fp + c.fp, fn: a.fn + c.fn }), { tp: 0, fp: 0, fn: 0 });
    const ci = bootstrapInterval(docs, (c) => prf(c).f1);
    expect(bootstrapInterval(docs, (c) => prf(c).f1)).toEqual(ci);
    expect(ci.low).toBeLessThanOrEqual(prf(total).f1);
    expect(ci.high).toBeGreaterThanOrEqual(prf(total).f1);
  });
});

describe("ré-identification", () => {
  const people = generatePopulation(createRng(2026), 2000);
  const index = buildAttackIndex(people);
  const scenarios = generateReidScenarios(createRng(5), people, 15);

  it("en clair, les scénarios directs et par identifiant ré-identifient la cible", () => {
    for (const sc of scenarios.filter((s) => s.variant === "direct" || s.variant === "identifiants")) {
      const r = attack(parseAnnotated(sc.markup).text, sc.targetId, index);
      expect(r.reidentified, `${sc.id} : ${r.candidates} candidats (${r.evidence.join(", ")})`).toBe(true);
    }
  });

  it("une fois toutes les valeurs annotées masquées, l'attaque échoue", () => {
    for (const sc of scenarios) {
      const masked = sc.markup.replace(/⟦([A-Z_]+)\|[^⟧]*⟧/g, "[$1_1]");
      expect(attack(masked, sc.targetId, index).reidentified, sc.id).toBe(false);
    }
  });
});
