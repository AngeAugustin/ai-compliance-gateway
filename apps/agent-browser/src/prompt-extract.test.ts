import { describe, expect, it } from "vitest";
import { collectPrompt, looksLikeModelCall, patchPrompt } from "./prompt-extract.js";

describe("prompt-extract", () => {
  it("extrait les parts ChatGPT", () => {
    const body = {
      action: "next",
      messages: [{ author: { role: "user" }, content: { content_type: "text", parts: ["NIA 1234567"] } }],
    };
    expect(collectPrompt(body)).toBe("NIA 1234567");
  });

  it("masque le texte dans parts", () => {
    const body = { messages: [{ content: { parts: ["secret-iban"] } }] };
    expect(patchPrompt(body, "secret-iban", "[[IBAN_1]]")).toBe(true);
    expect(collectPrompt(body)).toBe("[[IBAN_1]]");
  });

  it("filtre les POST vers l'API de conversation", () => {
    expect(looksLikeModelCall("https://chatgpt.com/backend-api/conversation", "POST")).toBe(true);
    expect(looksLikeModelCall("https://chatgpt.com/backend-api/conversation", "GET")).toBe(false);
    expect(looksLikeModelCall("http://localhost:4000/v1/agents/heartbeat", "POST")).toBe(false);
  });
});
