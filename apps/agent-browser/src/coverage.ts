import { hostPermissionMatches, type AgentSyncResponse } from "@acg/shared";

export const STATIC_HOST_MATCHES = [
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://gemini.google.com/*",
  "https://aistudio.google.com/*",
  "https://claude.ai/*",
  "https://copilot.microsoft.com/*",
  "https://m365.cloud.microsoft/*",
  "https://chat.deepseek.com/*",
  "https://deepseek.com/*",
  "https://chat.mistral.ai/*",
  "https://www.perplexity.ai/*",
  "https://perplexity.ai/*",
  "https://grok.com/*",
  "https://x.com/*",
] as const;

const DYNAMIC_CONTENT_ID = "acg-content-dynamic";
const DYNAMIC_HOOK_ID = "acg-hook-dynamic";

export function catalogMatches(snapshot: AgentSyncResponse | null): string[] {
  const domains = snapshot?.aiServices.flatMap((s) => s.domains) ?? [];
  return hostPermissionMatches(domains);
}

export function extraMatches(snapshot: AgentSyncResponse | null): string[] {
  const staticSet = new Set<string>(STATIC_HOST_MATCHES);
  return catalogMatches(snapshot).filter((m) => !staticSet.has(m));
}

export async function registerCatalogScripts(snapshot: AgentSyncResponse | null): Promise<string[]> {
  const extra = extraMatches(snapshot);
  await chrome.scripting.unregisterContentScripts({ ids: [DYNAMIC_CONTENT_ID, DYNAMIC_HOOK_ID] }).catch(() => undefined);
  if (extra.length === 0) return extra;
  await chrome.scripting.registerContentScripts([
    {
      id: DYNAMIC_HOOK_ID,
      js: ["page-hook.js"],
      matches: extra,
      runAt: "document_start",
      world: "MAIN",
      persistAcrossSessions: true,
    },
    {
      id: DYNAMIC_CONTENT_ID,
      js: ["content.js"],
      matches: extra,
      runAt: "document_idle",
      world: "ISOLATED",
      persistAcrossSessions: true,
    },
  ]);
  return extra;
}

export async function injectOpenTabs(matches: string[]): Promise<void> {
  if (matches.length === 0) return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    if (!urlHitsMatches(tab.url, matches)) continue;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["page-hook.js"], world: "MAIN" }).catch(() => undefined);
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"], world: "ISOLATED" }).catch(() => undefined);
  }
}

function urlHitsMatches(url: string, matches: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return matches.some((m) => {
      const want = m.replace(/^https:\/\//, "").replace(/\/\*$/, "").toLowerCase();
      return host === want || host.endsWith(`.${want}`);
    });
  } catch {
    return false;
  }
}
