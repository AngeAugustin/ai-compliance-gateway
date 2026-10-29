import { describe, expect, it } from "vitest";
import type { SensitiveEntity } from "@acg/shared";
import { DetectionEngine } from "./engine.js";
import { applyMasking } from "./masking.js";
import { RulesLayer } from "./layers/rules/index.js";
import { isValidNir } from "./layers/rules/patterns.js";
import { chunkText, locate, nerItemsToEntities, runNerPipeline } from "./layers/ner-common.js";
import { tuneEntities } from "./tuning.js";
import type { DetectionLayerProvider } from "./layers/types.js";

const rules = new RulesLayer();

async function found(text: string): Promise<string[]> {
  return (await rules.detect(text)).entities.map((e) => `${e.entityType}:${e.value}`);
}

describe("téléphones (libphonenumber-js)", () => {
  it("reconnaît les formats français national et international", async () => {
    expect(await found("Mon numéro : 06 12 34 56 78")).toEqual(["PHONE:06 12 34 56 78"]);
    expect(await found("Contact: +33 6 12 34 56 78")).toEqual(["PHONE:+33 6 12 34 56 78"]);
    expect(await found("call +1 415 555 2671")).toEqual(["PHONE:+1 415 555 2671"]);
  });

  it("accepte l'ancien format béninois à 8 chiffres seulement avec un contexte téléphonique", async () => {
    expect(await found("Appelle le 97 12 34 56")).toEqual(["PHONE:97 12 34 56"]);
    expect(await found("Le lot 97 12 34 56 est livré")).toEqual([]);
  });

  it("ne transforme pas une IP en numéro et garde la classification mobile money", async () => {
    expect(await found("IP 192.168.1.10")).toEqual(["IP_ADDRESS:192.168.1.10"]);
    expect(await found("Virement MoMo au 01 97 12 34 56")).toEqual(["MOBILE_MONEY:01 97 12 34 56"]);
  });
});

describe("nouveaux motifs", () => {
  it("date de naissance en lettres, mais pas une date ordinaire", async () => {
    expect(await found("Né le 12 mars 1985")).toEqual(["DATE_OF_BIRTH:12 mars 1985"]);
    expect(await found("date de naissance : 1er janvier 1990")).toEqual(["DATE_OF_BIRTH:1er janvier 1990"]);
    expect(await found("Réunion le 12 mars 2026")).toEqual([]);
  });

  it("pathologie nommée uniquement en contexte clinique", async () => {
    expect(await found("Le patient souffre de diabète de type 2")).toEqual(["MEDICAL:diabète de type 2"]);
    expect(await found("Le diabète est un enjeu de santé publique au Bénin")).toEqual([]);
  });

  it("JWT, jeton Bearer, passeport et NIR", async () => {
    expect(await found("token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijklmnop")).toEqual([
      "API_KEY:eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijklmnop",
    ]);
    expect(await found("Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456")).toEqual(["API_KEY:abcdefghijklmnopqrstuvwxyz123456"]);
    expect(await found("Son numéro de passeport est B1234567")).toEqual(["NATIONAL_ID:B1234567"]);
    expect(isValidNir("1 85 03 75 112 345 94")).toBe(true);
    expect(isValidNir("1 85 03 75 112 345 67")).toBe(false);
    expect(await found("NIR 1 85 03 75 112 345 94")).toEqual(["NATIONAL_ID:1 85 03 75 112 345 94"]);
  });

  it("numéro d'assuré CNSS avec ou sans le mot « CNSS », jamais un mot sans chiffre", async () => {
    expect(await found("assuré CNSS B20481736")).toEqual(["CNSS_INSURED_NUMBER:B20481736"]);
    expect(await found("Abdou Chabi, assuré n° B20481736, réclame")).toEqual(["CNSS_INSURED_NUMBER:B20481736"]);
    expect(await found("son n° d'assurée : C30917264")).toEqual(["CNSS_INSURED_NUMBER:C30917264"]);
    expect(await found("matricule CNSS 4401928")).toEqual(["CNSS_INSURED_NUMBER:4401928"]);
    expect(await found("l'agence CNSS Parakou")).toEqual([]);
  });

  it("salaire et cotisation séparés du montant par quelques mots", async () => {
    expect(await found("pour un salaire brut mensuel de 132 000 FCFA")).toEqual(["SALARY:132 000"]);
    expect(await found("salaire de base 185 000 F, prime de transport 15 000 F")).toEqual(["SALARY:185 000", "SALARY:15 000"]);
    expect(await found("cotisations du trimestre : 3 456 780 FCFA")).toEqual(["SALARY:3 456 780"]);
    expect(await found("le SMIG est fixé à 52 000 FCFA")).toEqual(["FINANCIAL_AMOUNT:52 000"]);
  });
});

describe("fusion des couches", () => {
  const engine = (entities: SensitiveEntity[]) =>
    new DetectionEngine({
      extraLayers: [
        {
          layer: "ner",
          initialize: async () => ({ layer: "ner", available: true, degraded: false }),
          status: () => ({ layer: "ner", available: true, degraded: false }),
          detect: async () => ({ layer: "ner", entities, processingTimeMs: 0 }),
        } as unknown as DetectionLayerProvider,
      ],
    });

  it("un fragment NER inclus dans une URL interne ne la tronque pas", async () => {
    const text = "connexion refusée vers https://intranet.cnss.bj/prestations/api/v2/dossiers";
    const e = engine([entity("ORGANIZATION", "api", text, 0.91)]);
    await e.initialize();
    const { entities } = await e.detect(text);
    expect(entities.map((x) => `${x.entityType}:${text.slice(...x.span)}`)).toEqual([
      "INTERNAL_URL:https://intranet.cnss.bj/prestations/api/v2/dossiers",
    ]);
  });
});

function entity(entityType: SensitiveEntity["entityType"], value: string, text: string, confidence: number): SensitiveEntity {
  const start = text.indexOf(value);
  return { entityType, value, confidence, span: [start, start + value.length], layer: "ner" };
}

describe("réglages post-détection", () => {
  it("le contexte remonte une entité NER faible au-dessus du seuil", () => {
    const withCtx = "Mme Aïcha Bello est absente";
    const noCtx = "Aïcha Bello est absente";
    expect(tuneEntities(withCtx, [entity("PERSON", "Aïcha Bello", withCtx, 0.5)])).toHaveLength(1);
    expect(tuneEntities(noCtx, [entity("PERSON", "Aïcha Bello", noCtx, 0.5)])).toHaveLength(0);
  });

  it("le contexte exige un mot entier (« hôtel » ne vaut pas « tel »)", () => {
    const text = "Réservez l'hôtel Ibis";
    const e = entity("PHONE", "Ibis", text, 0.3);
    expect(tuneEntities(text, [e], { defaultThreshold: 0, thresholds: {} })[0]!.confidence).toBe(0.3);
  });

  it("liste d'autorisation et liste d'exclusion", () => {
    const text = "La CNSS a validé le projet Atlas";
    const tuned = tuneEntities(text, [entity("ORGANIZATION", "CNSS", text, 0.99)], {
      allowList: ["cnss"],
      denyList: [{ value: "projet Atlas", entityType: "INTERNAL_ID" }],
    });
    expect(tuned.map((e) => `${e.entityType}:${e.value}`)).toEqual(["INTERNAL_ID:projet Atlas"]);
  });
});

describe("NER commun", () => {
  it("retrouve les positions absentes de la sortie transformers.js", () => {
    const text = "Rappelle Jean Dupont puis Jean Dupont";
    const out = nerItemsToEntities(text, [
      { entity_group: "PER", score: 0.99, word: "Jean Dupont" },
      { entity_group: "PER", score: 0.98, word: "Jean Dupont" },
    ]);
    expect(out.map((e) => e.span)).toEqual([
      [9, 20],
      [26, 37],
    ]);
    expect(out.every((e) => e.value === "Jean Dupont")).toBe(true);
  });

  it("tolère l'espacement du décodage WordPiece et ignore les labels inconnus", () => {
    expect(locate("Mme Bello-Soglo", "Bello - Soglo", 0)).toEqual([4, 15]);
    expect(nerItemsToEntities("Le COVID", [{ entity_group: "MISC", score: 0.9, word: "COVID" }])).toEqual([]);
  });

  it("découpe les textes longs et recale les positions", async () => {
    const text = `${"Phrase neutre. ".repeat(120)}Contactez Jean Dupont.`;
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.text).join("")).toBe(text);
    const fake = async (t: string) => (t.includes("Jean Dupont") ? [{ entity_group: "PER", score: 0.99, word: "Jean Dupont" }] : []);
    const [e] = await runNerPipeline(fake, text);
    expect(text.slice(e!.span[0], e!.span[1])).toBe("Jean Dupont");
  });
});

describe("masquage à jetons stables", () => {
  it("une même valeur garde son jeton, y compris d'un prompt à l'autre", () => {
    const t1 = "Écris à ada@cnss.bj puis relance ada@cnss.bj";
    const p1 = applyMasking(t1, [entity("EMAIL", "ada@cnss.bj", t1, 0.98)]);
    expect(p1.text).toBe("Écris à EMAIL_001 puis relance EMAIL_001");

    const t2 = "Compare ada@cnss.bj et bob@cnss.bj";
    const p2 = applyMasking(t2, [entity("EMAIL", "ada@cnss.bj", t2, 0.98), entity("EMAIL", "bob@cnss.bj", t2, 0.98)], p1.bindings);
    expect(p2.text).toBe("Compare EMAIL_001 et EMAIL_002");
    expect(p2.bindings.map((b) => `${b.token}=${b.value}`)).toEqual(["EMAIL_001=ada@cnss.bj", "EMAIL_002=bob@cnss.bj"]);
  });

  it("deux entités qui se chevauchent ne corrompent pas le texte", () => {
    const text = "Clé sk-abcdefghijklmnopqrstuvwxyz012345 fin";
    const key = "sk-abcdefghijklmnopqrstuvwxyz012345";
    const plan = applyMasking(text, [entity("API_KEY", key, text, 0.9), entity("PASSWORD", "abcdefghijklmnop", text, 0.8)]);
    expect(plan.text).toBe("Clé CLE_API_001 fin");
  });
});

describe("couche optionnelle", () => {
  it("une couche optionnelle indisponible ne met pas le moteur en mode dégradé", async () => {
    const loading: DetectionLayerProvider = {
      layer: "ner",
      optional: true,
      initialize: async () => ({ layer: "ner", available: false, degraded: true, modelVersion: "x" }),
      status: () => ({ layer: "ner", available: false, degraded: true, modelVersion: "x" }),
      detect: async () => ({ layer: "ner", entities: [], processingTimeMs: 0, modelVersion: "x", degraded: true }),
    };
    const engine = new DetectionEngine({ extraLayers: [loading] });
    expect((await engine.detect("bonjour")).degraded).toBe(false);
  });
});
