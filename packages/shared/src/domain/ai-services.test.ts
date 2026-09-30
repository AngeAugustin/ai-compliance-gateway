import { describe, expect, it } from "vitest";
import { DEFAULT_AI_SERVICES, hostPermissionMatches } from "./ai-services.js";

describe("hostPermissionMatches", () => {
  it("produit des motifs Chrome à partir des domaines du catalogue", () => {
    const domains = DEFAULT_AI_SERVICES.flatMap((s) => s.domains);
    const matches = hostPermissionMatches(domains);
    expect(matches).toContain("https://chatgpt.com/*");
    expect(matches).toContain("https://aistudio.google.com/*");
    expect(matches).toContain("https://x.com/*");
    expect(matches.every((m) => m.startsWith("https://") && m.endsWith("/*"))).toBe(true);
  });

  it("ignore les hôtes invalides", () => {
    expect(hostPermissionMatches(["not a host", "*", "https://ok.example"])).toEqual(["https://ok.example/*"]);
  });
});
