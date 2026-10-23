import { AgentRuntime, memoryConfigStore } from "@acg/agent-runtime";
import { DetectionEngine, type TokenBinding } from "@acg/detection-engine";
import type { AgentPersistedConfig } from "@acg/agent-runtime";
import { catalogMatches, injectOpenTabs, registerCatalogScripts } from "./coverage.js";
import { OffscreenNerLayer } from "./ner-offscreen.js";

const store = {
  async load() {
    const { acgConfig } = await chrome.storage.local.get("acgConfig");
    return (acgConfig as AgentPersistedConfig | undefined) ?? (await memoryConfigStore({ module: "A1" }).load());
  },
  async save(config: AgentPersistedConfig) {
    await chrome.storage.local.set({ acgConfig: config });
  },
};

const runtime: AgentRuntime = new AgentRuntime({
  module: "A1",
  store,
  // Couche 2 (NER) exécutée localement dans le document offscreen ; règles seules tant qu'elle charge.
  engine: new DetectionEngine({ extraLayers: [new OffscreenNerLayer((): string | null => runtime.getConfig().apiUrl || null)] }),
  queuePersist: {
    persist: async (raw) => {
      await chrome.storage.local.set({ acgQueue: raw });
    },
    read: async () => {
      const { acgQueue } = await chrome.storage.local.get("acgQueue");
      return typeof acgQueue === "string" ? acgQueue : null;
    },
  },
});
let started = false;

async function ensureStarted() {
  if (!started) {
    await runtime.start();
    started = true;
    await refreshCoverage();
  }
}

async function refreshCoverage() {
  const extra = await registerCatalogScripts(runtime.getConfig().lastSnapshot);
  await injectOpenTabs(extra);
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureStarted();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureStarted();
});

chrome.alarms.create("acg-heartbeat", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "acg-heartbeat") {
    void ensureStarted()
      .then(() => runtime.tick())
      .then(() => refreshCoverage());
  }
});

/**
 * Jetons attribués par onglet (PERSONNE_001 → valeur). Stockés en storage.session :
 * mémoire uniquement, jamais écrits sur disque, vidés à la fermeture du navigateur
 * ou de l'onglet. Sert à réutiliser les jetons et à restaurer les réponses de l'IA.
 */
const TOKEN_TTL_MS = 4 * 3600_000;

function tokenKey(tabId: number): string {
  return `acgTokens:${tabId}`;
}

async function loadTokens(tabId: number | undefined): Promise<TokenBinding[]> {
  if (tabId === undefined) return [];
  const raw = (await chrome.storage.session.get(tokenKey(tabId)))[tokenKey(tabId)] as { at: number; bindings: TokenBinding[] } | undefined;
  if (!raw || Date.now() - raw.at > TOKEN_TTL_MS) return [];
  return raw.bindings;
}

async function saveTokens(tabId: number | undefined, bindings: TokenBinding[]): Promise<void> {
  if (tabId === undefined || bindings.length === 0) return;
  await chrome.storage.session.set({ [tokenKey(tabId)]: { at: Date.now(), bindings } });
}

function tokenMap(bindings: TokenBinding[]): Record<string, string> {
  return Object.fromEntries(bindings.map((b) => [b.token, b.value]));
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(tokenKey(tabId));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === "offscreen") return false;
  const tabId = (sender as { tab?: { id?: number } } | undefined)?.tab?.id;
  void (async () => {
    await ensureStarted();
    if (message.type === "GET_STATUS") {
      const c = runtime.getConfig();
      sendResponse({
        enrolled: runtime.isEnrolled(),
        agentId: c.agentId,
        catalogOrigins: catalogMatches(c.lastSnapshot),
      });
      return;
    }
    if (message.type === "CONFIGURE") {
      await runtime.configure(String(message.apiUrl ?? ""), String(message.token ?? ""));
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "ENROLL") {
      await runtime.enroll(String(message.hostname ?? "browser"), "0.1.0-A1");
      await refreshCoverage();
      sendResponse({ ok: true, agentId: runtime.getConfig().agentId, catalogOrigins: catalogMatches(runtime.getConfig().lastSnapshot) });
      return;
    }
    if (message.type === "CATALOG_ORIGINS") {
      sendResponse({ origins: catalogMatches(runtime.getConfig().lastSnapshot) });
      return;
    }
    if (message.type === "REGISTER_SCRIPTS") {
      await refreshCoverage();
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "GET_TOKENS") {
      sendResponse({ tokens: tokenMap(await loadTokens(tabId)) });
      return;
    }
    if (message.type === "INTERCEPT") {
      const filesWire = (message.files ?? []) as { fileName: string; mimeType?: string; base64: string }[];
      const files = filesWire.map((f) => ({
        fileName: f.fileName,
        mimeType: f.mimeType,
        data: Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0)),
      }));
      const previous = await loadTokens(tabId);
      const decision = await runtime.intercept(
        String(message.text ?? ""),
        "browser",
        String(message.host ?? ""),
        files,
        { enableOcr: false },
        previous,
      );
      await saveTokens(tabId, decision.tokenBindings);
      sendResponse({
        action: decision.action,
        outbound: runtime.outboundText(decision),
        userMessage: decision.decision.userMessage,
        riskScore: decision.risk.value,
        riskBand: decision.risk.band,
        blockAttachments: decision.blockAttachments,
        attachmentCount: decision.attachments.length,
        sanitizedFileNames: decision.sanitizedFileNames,
        sanitizedFiles: decision.sanitizedFiles.map((f) => ({
          fileName: f.fileName,
          mimeType: f.mimeType,
          base64: uint8ToBase64(f.data),
        })),
        // Valeurs restaurées localement dans la réponse de l'IA (jamais envoyées au service).
        tokens: tokenMap(decision.tokenBindings),
      });
    }
  })().catch((err) => sendResponse({ error: String(err) }));
  return true;
});

function uint8ToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]!);
  return btoa(binary);
}