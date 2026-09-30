/**
 * Monde MAIN : intercepte fetch() des pages d'IA (ChatGPT, Claude, Gemini, …)
 * et demande au content script (monde isolé) d'appliquer ALLOW / WARN / MASK / BLOCK.
 * Aucune API chrome.* ici.
 */
import { collectPrompt, looksLikeModelCall, patchPrompt } from "./prompt-extract.js";

type GateResult = {
  action?: string;
  outbound?: string;
  userMessage?: string;
  error?: string;
};

const pending = new Map<string, (res: GateResult) => void>();
const origFetch = window.fetch.bind(window);

window.addEventListener("message", (ev: MessageEvent) => {
  if (ev.source !== window) return;
  const data = ev.data as { source?: string; type?: string; id?: string } & GateResult;
  if (data?.source !== "acg-content" || data.type !== "GATE_RESULT" || !data.id) return;
  const resolve = pending.get(data.id);
  if (resolve) {
    pending.delete(data.id);
    resolve(data);
  }
});

function gateViaContent(text: string): Promise<GateResult> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      pending.delete(id);
      resolve({ error: "timeout" });
    }, 15000);
    pending.set(id, (res) => {
      window.clearTimeout(timer);
      resolve(res);
    });
    window.postMessage({ source: "acg-hook", type: "GATE", id, text }, "*");
  });
}

window.fetch = async function acgFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (!looksLikeModelCall(url, method)) {
    return origFetch(input, init);
  }
  const rawBody = await readBody(input, init);
  if (!rawBody) return origFetch(input, init);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return origFetch(input, init);
  }
  const text = collectPrompt(parsed)?.trim();
  if (!text) return origFetch(input, init);

  const res = await gateViaContent(text);
  if (res.error === "timeout") {
    return origFetch(input, init);
  }
  if (res.action === "BLOCK" || res.error) {
    return new Response(JSON.stringify({ error: res.userMessage ?? res.error ?? "blocked by ACG" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (res.action === "MASK" && res.outbound && res.outbound !== text) {
    const clone = JSON.parse(rawBody) as unknown;
    patchPrompt(clone, text, res.outbound);
    return origFetch(url, {
      method,
      headers: mergeHeaders(input, init),
      body: JSON.stringify(clone),
      credentials: init?.credentials ?? (input instanceof Request ? input.credentials : "same-origin"),
    });
  }
  return origFetch(input, init);
};

async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<string | null> {
  const body = init?.body;
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (input instanceof Request) {
    try {
      return await input.clone().text();
    } catch {
      return null;
    }
  }
  return null;
}

function mergeHeaders(input: RequestInfo | URL, init?: RequestInit): HeadersInit | undefined {
  if (init?.headers) return init.headers;
  if (input instanceof Request) return input.headers;
  return { "Content-Type": "application/json" };
}
