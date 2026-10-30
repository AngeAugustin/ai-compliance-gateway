import { describe, expect, it } from "vitest";
import { SignedHeartbeatSchema } from "@acg/shared";
import { isZodError, validationBody } from "./validation.filter.js";

describe("corps invalide → 400", () => {
  it("reconnaît l'erreur Zod d'un schéma de contrat et liste les champs en cause", () => {
    let caught: unknown;
    try {
      SignedHeartbeatSchema.parse({});
    } catch (err) {
      caught = err;
    }
    expect(isZodError(caught)).toBe(true);
    const body = validationBody(caught as Parameters<typeof validationBody>[0]);
    expect(body.statusCode).toBe(400);
    expect(body.message.join(" ")).toMatch(/payload|signature/);
  });

  it("laisse passer les autres erreurs", () => {
    expect(isZodError(new Error("boom"))).toBe(false);
    expect(isZodError(null)).toBe(false);
  });
});
