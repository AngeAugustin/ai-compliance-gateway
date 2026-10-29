import { describe, expect, it } from "vitest";
import { canApprove, requiresApproval } from "./approval.js";

describe("double validation des règles BLOCK", () => {
  it("exige une approbation dès qu'une règle BLOCK est concernée, avant ou après", () => {
    expect(requiresApproval("CREATE", null, { action: "BLOCK" })).toBe(true);
    expect(requiresApproval("CREATE", null, { action: "MASK" })).toBe(false);
    expect(requiresApproval("UPDATE", { action: "WARN" }, { action: "BLOCK" })).toBe(true);
    // Affaiblir une règle BLOCK (passer en WARN, la désactiver) est aussi sensible que la poser.
    expect(requiresApproval("UPDATE", { action: "BLOCK" }, { action: "WARN" })).toBe(true);
    expect(requiresApproval("UPDATE", { action: "BLOCK" }, { action: null })).toBe(true);
    expect(requiresApproval("UPDATE", { action: "MASK" }, { action: null })).toBe(false);
    expect(requiresApproval("DELETE", { action: "BLOCK" }, null)).toBe(true);
    expect(requiresApproval("DELETE", { action: "ALLOW" }, null)).toBe(false);
  });

  it("l'auteur ne peut pas approuver sa propre demande", () => {
    const req = { requestedBy: "u1", status: "pending", baseVersion: 3 };
    expect(canApprove(req, "u1", 3)).toMatchObject({ ok: false, status: 403 });
    expect(canApprove(req, "u2", 3)).toEqual({ ok: true });
  });

  it("refuse une demande déjà traitée ou devenue obsolète", () => {
    expect(canApprove({ requestedBy: "u1", status: "approved", baseVersion: null }, "u2", null)).toMatchObject({ ok: false, status: 409 });
    expect(canApprove({ requestedBy: "u1", status: "pending", baseVersion: 3 }, "u2", 4)).toMatchObject({ ok: false, status: 409 });
  });
});
