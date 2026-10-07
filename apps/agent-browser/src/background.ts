import { AgentRuntime, memoryConfigStore } from "@acg/agent-runtime";
import { DetectionEngine } from "@acg/detection-engine";
import type { AgentPersistedConfig } from "@acg/agent-runtime";
import { catalogMatches, injectOpenTabs, registerCatalogScripts } from "./coverage.js";

const store = {
  async load() {
    const { acgConfig } = await chrome.storage.local.get("acgConfig");
    return (acgConfig as AgentPersistedConfig | undefined) ?? (await memoryConfigStore({ module: "A1" }).load());
  },
  async save(config: AgentPersistedConfig) {
    await chrome.storage.local.set({ acgConfig: config });
  },
};

const runtime = new AgentRuntime({
  module: "A1",
  store,
  engine: new DetectionEngine(),
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
    if (message.type === "INTERCEPT") {
      const filesWire = (message.files ?? []) as { fileName: string; mimeType?: string; base64: string }[];
      const files = filesWire.map((f) => ({
        fileName: f.fileName,
        mimeType: f.mimeType,
        data: Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0)),
      }));
      const decision = await runtime.intercept(String(message.text ?? ""), "browser", String(message.host ?? ""), files, {
        enableOcr: false,
      });
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