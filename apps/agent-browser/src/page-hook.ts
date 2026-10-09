/**
 * Monde MAIN : intercepte fetch() des pages d'IA (ChatGPT, Claude, Gemini, …)
 * et demande au content script (monde isolé) d'appliquer ALLOW / WARN / MASK / BLOCK.
 * Aucune API chrome.* ici.
 */
import { collectPrompt, looksLikeFileUpload, looksLikeModelCall, patchPrompt } from "./prompt-extract.js";

type SanitizedWire = { fileName: string; mimeType: string; base64: string };

type GateResult = {
  action?: string;
  outbound?: string;
  userMessage?: string;
  error?: string;
  sanitizedFiles?: SanitizedWire[];
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

function gateViaContent(text: string, files: SanitizedWire[] = []): Promise<GateResult> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      pending.delete(id);
      resolve({ error: "timeout" });
    }, 20000);
    pending.set(id, (res) => {
      window.clearTimeout(timer);
      resolve(res);
    });
    window.postMessage({ source: "acg-hook", type: "GATE", id, text, files }, "*");
  });
}

function blockedResponse(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

function wireToFile(f: SanitizedWire): File {
  const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
  return new File([bytes], f.fileName, { type: f.mimeType || "text/plain" });
}

async function fileToWire(file: File): Promise<SanitizedWire | null> {
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return {
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      base64: btoa(binary),
    };
  } catch {
    return null;
  }
}

async function extractFormDataFiles(fd: FormData): Promise<SanitizedWire[]> {
  const out: SanitizedWire[] = [];
  for (const value of fd.values()) {
    if (typeof File !== "undefined" && value instanceof File && value.size > 0) {
      const wire = await fileToWire(value);
      if (wire) out.push(wire);
    }
  }
  return out;
}

function rebuildFormData(original: FormData, sanitized: SanitizedWire[]): FormData {
  const byName = new Map(sanitized.map((f) => [f.fileName, f]));
  const next = new FormData();
  for (const [key, value] of original.entries()) {
    if (typeof File !== "undefined" && value instanceof File) {
      const match = byName.get(value.name);
      next.append(key, match ? wireToFile(match) : value, match ? match.fileName : value.name);
    } else {
      next.append(key, value);
    }
  }
  return next;
}

/** Timeout / erreur technique : ne pas bloquer le site (sauf décision BLOCK explicite). */
function shouldHardBlock(res: GateResult): boolean {
  return res.action === "BLOCK";
}

window.fetch = async function acgFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const modelCall = looksLikeModelCall(url, method);
  const fileUpload = looksLikeFileUpload(url, method);
  if (!modelCall && !fileUpload) {
    return origFetch(input, init);
  }

  const formBody = init?.body instanceof FormData ? init.body : null;
  const formFiles = formBody ? await extractFormDataFiles(formBody) : [];

  // Upload fichier : toujours passer par le content script (buffer déjà MASK/BLOCK à l'attache).
  if (fileUpload) {
    const res = await gateViaContent("", formFiles);
    if (res.error === "timeout" && formFiles.length > 0) {
      return blockedResponse("Analyse ACG expirée — envoi annulé.");
    }
    if (shouldHardBlock(res)) {
      return blockedResponse(res.userMessage ?? "blocked by ACG");
    }
    if (res.action === "MASK" && res.sanitizedFiles?.length && formBody) {
      return origFetch(url, {
        ...init,
        method,
        body: rebuildFormData(formBody, res.sanitizedFiles),
      });
    }
    return origFetch(input, init);
  }

  if (!modelCall) {
    return origFetch(input, init);
  }

  const rawBody = await readBody(input, init);

  if (!rawBody) {
    const res = await gateViaContent("", formFiles);
    if (res.error === "timeout") return blockedResponse("Analyse ACG expirée — envoi annulé.");
    if (res.action === "BLOCK") return blockedResponse(res.userMessage ?? "blocked by ACG");
    if (res.action === "MASK" && res.sanitizedFiles?.length && formBody) {
      return origFetch(url, {
        ...init,
        method,
        body: rebuildFormData(formBody, res.sanitizedFiles),
      });
    }
    return origFetch(input, init);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    const res = await gateViaContent("", formFiles);
    if (res.error === "timeout") return blockedResponse("Analyse ACG expirée — envoi annulé.");
    if (res.action === "BLOCK") return blockedResponse(res.userMessage ?? "blocked by ACG");
    return origFetch(input, init);
  }

  const text = collectPrompt(parsed)?.trim() ?? "";
  const res = await gateViaContent(text, formFiles);
  if (res.error === "timeout") {
    return blockedResponse("Analyse ACG expirée — envoi annulé.");
  }
  if (res.action === "BLOCK") {
    return blockedResponse(res.userMessage ?? "blocked by ACG");
  }
  // Erreurs techniques (context invalidated, etc.) : WARN côté UI, ne pas 403 le fetch.
  if (text && res.action === "MASK" && res.outbound && res.outbound !== text) {
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
  if (typeof FormData !== "undefined" && body instanceof FormData) return null;
  if (typeof Blob !== "undefined" && body instanceof Blob) return null;
  if (input instanceof Request) {
    const ct = input.headers.get("content-type") ?? "";
    if (ct.includes("multipart/form-data") || ct.includes("octet-stream")) return null;
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
