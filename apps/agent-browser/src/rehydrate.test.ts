import { describe, expect, it } from "vitest";
import { rememberTokens, restoreText } from "./rehydrate.js";

describe("restauration locale", () => {
  it("remplace les jetons connus sans toucher aux autres", () => {
    rememberTokens({ PERSONNE_001: "Jean Dupont", PERSONNE_010: "Aïcha Bello" });
    expect(restoreText("PERSONNE_001 et PERSONNE_010 ; PERSONNE_002 inconnu")).toBe("Jean Dupont et Aïcha Bello ; PERSONNE_002 inconnu");
  });
});
