const AI_PATH =
  /conversation|complet|chat|generate|message|prompt|query|ask|append_message|backend-api|generatecontent|streamgenerate|anthropic|v1\//i;

export function looksLikeModelCall(url: string, method: string): boolean {
  const verb = method.toUpperCase();
  if (verb !== "POST" && verb !== "PUT" && verb !== "PATCH") return false;
  try {
    const u = new URL(url, "https://localhost");
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return false;
    if (/localhost|127\.0\.0\.1/.test(u.hostname) && u.port === "4000") return false;
    return AI_PATH.test(`${u.pathname}${u.search}`);
  } catch {
    return false;
  }
}

export function collectPrompt(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  if (Array.isArray(rec.messages)) {
    for (let i = rec.messages.length - 1; i >= 0; i--) {
      const extracted = fromMessage(rec.messages[i]);
      if (extracted) return extracted;
    }
  }
  for (const key of ["prompt", "input", "query", "text", "message", "instruction"]) {
    if (typeof rec[key] === "string" && rec[key]) return rec[key] as string;
  }
  if (rec.content && typeof rec.content === "object") {
    const fromContent = fromMessage({ content: rec.content });
    if (fromContent) return fromContent;
  }
  return null;
}

function fromMessage(message: unknown): string | null {
  if (!message || typeof message !== "object") return null;
  const m = message as Record<string, unknown>;
  const content = m.content;
  if (typeof content === "string" && content.trim()) return content;
  if (content && typeof content === "object") {
    const parts = (content as { parts?: unknown }).parts;
    if (Array.isArray(parts)) {
      const joined = parts.filter((p): p is string => typeof p === "string").join("\n");
      if (joined.trim()) return joined;
    }
    if (typeof (content as { text?: unknown }).text === "string") return (content as { text: string }).text;
  }
  if (typeof m.text === "string" && m.text.trim()) return m.text;
  return null;
}

export function patchPrompt(root: unknown, original: string, masked: string): boolean {
  if (!root || typeof root !== "object") return false;
  if (Array.isArray(root)) {
    for (let i = 0; i < root.length; i++) {
      if (root[i] === original) {
        root[i] = masked;
        return true;
      }
      if (patchPrompt(root[i], original, masked)) return true;
    }
    return false;
  }
  const obj = root as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value === original) {
      obj[key] = masked;
      return true;
    }
    if (Array.isArray(value) && value.length > 0 && value.every((x) => typeof x === "string") && value.join("\n") === original) {
      obj[key] = [masked];
      return true;
    }
    if (patchPrompt(value, original, masked)) return true;
  }
  return false;
}
