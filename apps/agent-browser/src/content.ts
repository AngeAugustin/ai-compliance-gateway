import { addPendingFile, clearFileInputs, clearPendingFiles, pendingFiles, type PendingFileWire } from "./files.js";

type GateResponse = {
  action?: string;
  outbound?: string;
  userMessage?: string;
  error?: string;
  blockAttachments?: boolean;
};

const overlayId = "acg-agent-banner";
const SEND_LABEL = /send|envoyer|submit|envoyer le prompt|send prompt|envoyer un message/i;
const SEND_TESTID = /send|composer-submit|submit/i;

function showBanner(text: string, action: string) {
  document.getElementById(overlayId)?.remove();
  const el = document.createElement("div");
  el.id = overlayId;
  el.setAttribute("role", "status");
  el.style.cssText =
    "position:fixed;z-index:2147483647;left:16px;right:16px;bottom:16px;padding:12px 16px;font:13px/1.4 ui-sans-serif,system-ui;border-radius:14px;color:#E8ECF4;background:#121826;border:1px solid #2A3348;box-shadow:0 8px 32px rgba(0,0,0,.45)";
  const color = action === "BLOCK" ? "#E36C5A" : action === "MASK" ? "#8B7CFF" : action === "WARN" ? "#E8B84A" : "#3DDC97";
  el.innerHTML = `<strong style="color:${color};letter-spacing:.08em;font-size:11px">${action}</strong> · ${text}`;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 8000);
}

function findComposer(): HTMLTextAreaElement | HTMLElement | null {
  return (
    document.querySelector("#prompt-textarea") ||
    document.querySelector("textarea") ||
    document.querySelector('[contenteditable="true"]') ||
    document.querySelector('[data-testid="chat-input"]') ||
    document.querySelector('[data-testid="composer"] textarea')
  );
}

function findSendButton(): HTMLButtonElement | null {
  const selectors = [
    'button[data-testid="send-button"]',
    'button[data-testid="composer-submit-button"]',
    "#composer-submit-button",
    'button[aria-label="Send prompt"]',
    'button[aria-label="Envoyer le prompt"]',
    'button[aria-label="Send"]',
    'button[aria-label="Envoyer"]',
    'button[type="submit"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLButtonElement>(sel);
    if (el) return el;
  }
  return null;
}

function isSendControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const btn = target.closest("button, [role='button'], a");
  if (!btn) return false;
  const testId = btn.getAttribute("data-testid") ?? "";
  const label = `${btn.getAttribute("aria-label") ?? ""} ${btn.getAttribute("title") ?? ""} ${btn.textContent ?? ""}`;
  if (SEND_TESTID.test(testId) || SEND_LABEL.test(label)) return true;
  const send = findSendButton();
  return Boolean(send && (btn === send || send.contains(btn) || btn.contains(send)));
}

function readText(el: HTMLTextAreaElement | HTMLElement): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value;
  return el.innerText ?? "";
}

function writeText(el: HTMLTextAreaElement | HTMLElement, value: string) {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    desc?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  el.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  sel?.removeAllRanges();
  sel?.addRange(range);
  document.execCommand("insertText", false, value);
}

let gating = false;
let passThrough = false;
let lastGate: { text: string; res: GateResponse; at: number } | null = null;

function allowNativeOnce() {
  passThrough = true;
  window.setTimeout(() => {
    passThrough = false;
  }, 1200);
}

async function gateText(text: string, files: PendingFileWire[] = pendingFiles()): Promise<GateResponse> {
  const trimmed = text.trim();
  const hasFiles = files.length > 0;
  if (!trimmed && !hasFiles) return { action: "ALLOW", outbound: text };
  const cacheKey = `${trimmed}::${files.map((f) => f.fileName).join(",")}`;
  if (lastGate && lastGate.text === cacheKey && Date.now() - lastGate.at < 2500) {
    return lastGate.res;
  }
  const res = (await chrome.runtime.sendMessage({
    type: "INTERCEPT",
    text: trimmed,
    host: location.hostname,
    files,
  })) as GateResponse;
  lastGate = { text: cacheKey, res, at: Date.now() };
  return res;
}

function applyVisual(res: GateResponse, composer: HTMLTextAreaElement | HTMLElement | null) {
  if (res.error) {
    showBanner("Agent A1 : " + res.error, "WARN");
    return;
  }
  if (res.action === "BLOCK") {
    if (composer) writeText(composer, "");
    if (res.blockAttachments) clearFileInputs();
    showBanner(res.userMessage ?? "Interaction bloquée par la politique de sécurité.", "BLOCK");
    return;
  }
  if (res.action === "MASK") {
    if (composer && res.outbound) writeText(composer, res.outbound);
    showBanner(res.userMessage ?? "Données sensibles remplacées par des jetons. Envoi du prompt masqué.", "MASK");
    return;
  }
  if (res.action === "WARN") {
    showBanner(res.userMessage ?? "Interaction journalisée.", "WARN");
  }
}

async function gateEvent(event: Event) {
  if (passThrough) return;
  const composer = findComposer();
  if (!composer) return;
  const text = readText(composer).trim();
  const files = pendingFiles();
  if ((!text && files.length === 0) || gating) return;
  gating = true;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  try {
    const res = await gateText(text, files);
    applyVisual(res, composer);
    if (res.error) return;
    if (res.action === "BLOCK") return;
    clearPendingFiles();
    allowNativeOnce();
    findSendButton()?.click();
  } finally {
    gating = false;
  }
}

document.addEventListener(
  "keydown",
  (ev) => {
    if (passThrough) return;
    if (ev.key === "Enter" && !ev.shiftKey) void gateEvent(ev);
  },
  true,
);

document.addEventListener(
  "submit",
  (ev) => {
    if (passThrough) return;
    void gateEvent(ev);
  },
  true,
);

document.addEventListener(
  "click",
  (ev) => {
    if (passThrough) return;
    if (isSendControl(ev.target)) void gateEvent(ev);
  },
  true,
);

document.addEventListener(
  "change",
  (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement) || t.type !== "file" || !t.files?.length) return;
    void (async () => {
      clearPendingFiles();
      for (const file of Array.from(t.files)) {
        await addPendingFile(file);
      }
    })();
  },
  true,
);

window.addEventListener("message", (ev: MessageEvent) => {
  if (ev.source !== window) return;
  const data = ev.data as { source?: string; type?: string; id?: string; text?: string };
  if (data?.source !== "acg-hook" || data.type !== "GATE" || !data.id) return;
  void (async () => {
    const res = await gateText(data.text ?? "");
    applyVisual(res, findComposer());
    window.postMessage({ source: "acg-content", type: "GATE_RESULT", id: data.id, ...res }, "*");
  })();
});
