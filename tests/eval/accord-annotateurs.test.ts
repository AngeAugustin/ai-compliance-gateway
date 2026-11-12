import { describe, expect, it } from "vitest";
import { CORPUS_MANUEL } from "../../data/eval/corpus-manuel.js";
import { agreement, compare, exportText, kappaLabel, parseAnnotatedFile } from "../../tools/eval/accord-annotateurs.js";
import { parseAnnotated } from "../../tools/eval/annotation.js";

describe("accord entre annotateurs", () => {
  it("le fichier exporté se relit sans altérer aucun texte", () => {
    const parsed = parseAnnotatedFile(exportText());
    expect(parsed.size).toBe(CORPUS_MANUEL.length);
    expect(() => compare(parsed)).not.toThrow();
  });

  it("annotation identique à la référence : accord parfait", () => {
    const same = new Map(CORPUS_MANUEL.map((s) => [s.id, parseAnnotated(s.markup)]));
    const r = agreement(compare(same));
    expect(r.f1Strict).toBe(1);
    expect(r.kappaChars).toBeCloseTo(1, 10);
    expect(r.disagreements).toEqual([]);
  });

  it("balises [[TYPE|valeur]] acceptées ; désaccord de type sans effet sur la protection", () => {
    const file = "### man-002\nEnvoie [[SALARY|80 000]] FCFA via MoMo [[MOBILE_MONEY|01 97 12 34 56]] à l'assuré.\n";
    const r = agreement(compare(parseAnnotatedFile(file)));
    expect(r.f1Protection).toBe(1);
    expect(r.f1Strict).toBe(0.5);
    expect(r.disagreements[0]).toMatch(/FINANCIAL_AMOUNT \/ SALARY/);
  });

  it("refuse un texte modifié par l'annotateur", () => {
    const file = "### man-002\nEnvoie 80 000 FCFA via MoMo à l'assuré.\n";
    expect(() => compare(parseAnnotatedFile(file))).toThrow(/modifié/);
  });

  it("lecture de Landis et Koch", () => {
    expect(kappaLabel(0.85)).toBe("presque parfait");
    expect(kappaLabel(0.5)).toBe("modéré");
  });
});

describe("correspondance des types du second annotateur", () => {
  it("renomme les synonymes, retire les types hors guide et ne touche pas aux types du guide", async () => {
    const { applyTypeSynonyms } = await import("../../tools/eval/accord-annotateurs.js");
    const { text, counts } = applyTypeSynonyms(
      "[[PERSON_NAME|Jean Dupont]], [[AGE|34 ans]], [[EMAIL|j@cnss.bj]], [[HEALTH_INFORMATION|diabète]]",
    );
    expect(text).toBe("[[PERSON|Jean Dupont]], 34 ans, [[EMAIL|j@cnss.bj]], [[MEDICAL|diabète]]");
    expect(counts).toEqual({ PERSON_NAME: 1, AGE: 1, HEALTH_INFORMATION: 1 });
  });
});
