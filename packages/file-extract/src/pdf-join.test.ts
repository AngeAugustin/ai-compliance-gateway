/**
 * Assemblage des fragments de texte d'un PDF. Word (Enregistrer sous › PDF) découpe le texte
 * en fragments au milieu des mots, notamment autour des tirets ; un espace inséré entre chaque
 * fragment rendait « REC-20250318 » ou « sk-… » méconnaissables pour la détection.
 */
import { describe, expect, it } from "vitest";
import { joinTextItems, type PdfTextItem } from "./extractors/pdf.js";

/** Fragment sur une ligne y, de corps 11, avec une largeur de 5,5 par caractère. */
function item(str: string, x: number, y = 700, hasEOL = false): PdfTextItem {
  return { str, transform: [11, 0, 0, 11, x, y], width: str.length * 5.5, hasEOL };
}

describe("joinTextItems", () => {
  it("colle les fragments contigus d'un même mot (tiret de Word)", () => {
    const items = [item("dossier REC", 0), item("-", 60.5), item("20250318).", 66, 700, true)];
    expect(joinTextItems(items)).toBe("dossier REC-20250318).\n");
  });

  it("garde l'espace quand il y a un vrai blanc entre deux fragments", () => {
    expect(joinTextItems([item("Bonjour", 0), item("Marie", 38.5 + 3)])).toBe("Bonjour Marie");
  });

  it("ne double pas un espace déjà présent dans le fragment", () => {
    expect(joinTextItems([item("clé ", 0), item("sk", 22)])).toBe("clé sk");
  });

  it("passe à la ligne quand le fragment suivant est sur une autre ligne", () => {
    expect(joinTextItems([item("ligne un", 0, 700), item("ligne deux", 0, 686)])).toBe("ligne un\nligne deux");
  });

  it("sans position, garde l'ancien comportement (un espace)", () => {
    expect(joinTextItems([{ str: "a" }, { str: "b" }])).toBe("a b");
  });

  it("ignore les fragments vides de fin de ligne", () => {
    expect(joinTextItems([item("fin", 0), { str: "", hasEOL: true }, item("suite", 0, 686)])).toBe("fin\nsuite");
  });
});
