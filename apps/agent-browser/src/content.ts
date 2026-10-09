import {
  applySanitizedFiles,
  awaitFileCapture,
  clearComposerFiles,
  clearPendingFiles,
  hasVisibleAttachments,
  injectComposerFiles,
  isFileCaptureSuppressed,
  pendingFiles,
  queueFileCapture,
  replaceComposerWithSanitized,
  setPendingFiles,
  stripAttachmentChipsOnly,
  stripAttachmentUi,
  type PendingFileWire,
} from "./files.js";

type GateResponse = {
  action?: string;
  outbound?: string;
  userMessage?: string;
  error?: string;
  blockAttachments?: boolean;
  attachmentCount?: number;
  sanitizedFileNames?: string[];
  sanitizedFiles?: PendingFileWire[];
};

const overlayId = "acg-agent-banner";
const SEND_LABEL = /send|envoyer|submit|envoyer le prompt|send prompt|envoyer un message/i;
const SEND_TESTID = /send|composer-submit|submit/i;
let lastBannerKey = "";
let lastBannerAt = 0;
let attachBusy = false;

function showBanner(text: string, action: string) {
  const key = `${action}:${text}`;
  const now = Date.now();
  if (key === lastBannerKey && now - lastBannerAt < 12_000) return;
  lastBannerKey = key;
  lastBannerAt = now;

  document.getElementById(overlayId)?.remove();
  const el = document.createElement("div");
  el.id = overlayId;
  el.setAttribute("role", "status");

  const tones: Record<string, { accent: string; soft: string; border: string }> = {
    BLOCK: { accent: "#c94a42", soft: "#fdf2f1", border: "#f0c9c5" },
    MASK: { accent: "#5b52c7", soft: "#f3f2fb", border: "#d5d2ef" },
    WARN: { accent: "#c4841a", soft: "#fdf6eb", border: "#f0d9a8" },
    ALLOW: { accent: "#1f8a5b", soft: "#eef8f2", border: "#bfe5d0" },
  };
  const tone = tones[action] ?? { accent: "#1a6b5c", soft: "#dceee8", border: "#d4e0dc" };

  el.style.cssText = [
    "position:fixed",
    "z-index:2147483647",
    "left:16px",
    "right:16px",
    "bottom:16px",
    "max-width:560px",
    "margin:0 auto",
    "padding:12px 16px",
    "font:13px/1.45 system-ui,Segoe UI,sans-serif",
    "border-radius:10px",
    "color:#142428",
    `background:${tone.soft}`,
    `border:1px solid ${tone.border}`,
    "box-shadow:0 1px 2px rgba(16,46,50,.04),0 10px 28px rgba(16,46,50,.08)",
  ].join(";");

  el.innerHTML = `<strong style="color:${tone.accent};letter-spacing:.1em;font-size:11px;font-weight:700">${action}</strong><span style="color:#5d7370"> · </span><span>${text}</span>`;
  document.body.appendChild(el);
  window.setTimeout(() => {
    if (document.getElementById(overlayId) === el) el.remove();
  }, 8000);
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

/** Chaque interaction repart de zéro — évite qu'un BLOCK précédent contamine un MASK suivant. */
function resetGateCache() {
  lastGate = null;
}

function extensionAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function isContextInvalidated(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /extension context invalidated|context invalidated/i.test(msg);
}

async function sendToBackground<T>(message: Record<string, unknown>): Promise<T> {
  if (!extensionAlive()) {
    throw new Error("Extension context invalidated.");
  }
  try {
    return (await chrome.runtime.sendMessage(message)) as T;
  } catch (err) {
    if (isContextInvalidated(err)) {
      throw new Error("Extension context invalidated.");
    }
    throw err;
  }
}

function gateCacheKey(text: string, files: PendingFileWire[]): string {
  const filePart = files.map((f) => `${f.fileName}:${f.base64.slice(0, 48)}:${f.base64.length}`).join("|");
  return `${text}::${filePart}`;
}

async function gateText(text: string, files: PendingFileWire[] = pendingFiles()): Promise<GateResponse> {
  const trimmed = text.trim();
  const hasFiles = files.length > 0;
  if (!trimmed && !hasFiles) return { action: "ALLOW", outbound: text };

  const cacheKey = gateCacheKey(trimmed, files);
  if (lastGate && lastGate.text === cacheKey && Date.now() - lastGate.at < 2500) {
    return lastGate.res;
  }

  try {
    const res = await sendToBackground<GateResponse>({
      type: "INTERCEPT",
      text: trimmed,
      host: location.hostname,
      files,
    });
    lastGate = { text: cacheKey, res, at: Date.now() };
    return res;
  } catch (err) {
    if (isContextInvalidated(err)) {
      return {
        action: "WARN",
        userMessage: "Agent A1 mis à jour — rechargez cet onglet (F5) pour réactiver la protection.",
        error: "CONTEXT_INVALIDATED",
      };
    }
    return {
      action: "WARN",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function hadAttachments(res: GateResponse, files: PendingFileWire[]): boolean {
  return files.length > 0 || Boolean(res.blockAttachments) || (res.attachmentCount ?? 0) > 0;
}

/** BLOCK avec pièce jointe : vider le champ fichier uniquement. */
function applyFileBlock(res: GateResponse) {
  clearComposerFiles();
  stripAttachmentUi();
  showBanner(res.userMessage ?? "Fichier bloqué par la politique de sécurité.", "BLOCK");
}

function applyMaskFilesToComposer(res: GateResponse) {
  const files = res.sanitizedFiles ?? [];
  if (files.length === 0) return false;
  const ok = injectComposerFiles(files);
  const names = res.sanitizedFileNames?.join(", ") ?? files.map((f) => f.fileName).join(", ");
  showBanner(
    res.userMessage ?? `Données sensibles anonymisées dans le fichier (${names}) avant envoi.`,
    "MASK",
  );
  return ok;
}

/**
 * Analyse le fichier dès l'attache, avant upload cloud.
 * BLOCK → champ vidé · MASK → version jetonée · ALLOW → original réinjecté
 */
async function gateFilesOnAttach(rawFiles: File[]): Promise<void> {
  if (attachBusy || rawFiles.length === 0) return;
  attachBusy = true;
  resetGateCache();
  lastBannerKey = "";
  try {
    stripAttachmentChipsOnly();
    await queueFileCapture(rawFiles);
    const files = pendingFiles();
    if (files.length === 0) {
      clearComposerFiles();
      showBanner("Impossible de lire le fichier joint.", "BLOCK");
      return;
    }

    const res = await gateText("", files);

    if (res.error === "CONTEXT_INVALIDATED") {
      showBanner(res.userMessage ?? "Rechargez cet onglet (F5).", "WARN");
      clearComposerFiles();
      return;
    }
    if (res.error) {
      showBanner("Agent A1 : " + res.error, "WARN");
      clearComposerFiles();
      return;
    }

    if (res.action === "BLOCK") {
      applyFileBlock(res);
      return;
    }

    if (res.action === "MASK") {
      if (res.sanitizedFiles?.length) {
        applyMaskFilesToComposer(res);
        return;
      }
      applyFileBlock({
        ...res,
        action: "BLOCK",
        userMessage:
          res.userMessage ??
          "Le fichier contient des données sensibles et ne peut pas être anonymisé. Envoi bloqué.",
      });
      return;
    }

    injectComposerFiles(files);
    if (res.action === "WARN") {
      showBanner(res.userMessage ?? "Fichier journalisé.", "WARN");
    }
  } catch (err) {
    clearComposerFiles();
    showBanner(err instanceof Error ? err.message : "Erreur d'analyse du fichier.", "BLOCK");
  } finally {
    attachBusy = false;
  }
}

function applyVisual(res: GateResponse, composer: HTMLTextAreaElement | HTMLElement | null, files: PendingFileWire[]) {
  if (res.error === "CONTEXT_INVALIDATED") {
    showBanner(res.userMessage ?? "Rechargez cet onglet (F5) pour réactiver l'agent A1.", "WARN");
    return;
  }
  if (res.error) {
    showBanner("Agent A1 : " + res.error, "WARN");
    return;
  }
  if (res.action === "BLOCK") {
    if (composer) writeText(composer, "");
    if (hadAttachments(res, files)) {
      applyFileBlock(res);
    } else {
      showBanner(res.userMessage ?? "Interaction bloquée par la politique de sécurité.", "BLOCK");
    }
    return;
  }
  if (res.action === "MASK") {
    if (composer && res.outbound) writeText(composer, res.outbound);
    if (res.sanitizedFiles?.length) {
      applySanitizedFiles(res.sanitizedFiles);
      const names = res.sanitizedFileNames?.join(", ") ?? res.sanitizedFiles.map((f) => f.fileName).join(", ");
      showBanner(
        res.userMessage ?? `Données sensibles remplacées (prompt + fichiers : ${names}).`,
        "MASK",
      );
      return;
    }
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
  if (gating || attachBusy) return;

  gating = true;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  try {
    resetGateCache();
    await awaitFileCapture();
    const text = readText(composer).trim();
    const files = pendingFiles();
    const visibleOnly = files.length === 0 && hasVisibleAttachments();

    if (!text && files.length === 0 && !visibleOnly) {
      allowNativeOnce();
      findSendButton()?.click();
      return;
    }

    if (visibleOnly) {
      clearComposerFiles();
      showBanner(
        "Pièce jointe non capturée. Retirez-la puis rattachez-la via le trombone, puis renvoyez.",
        "BLOCK",
      );
      return;
    }

    const res = await gateText(text, files);
    if (res.error) {
      applyVisual(res, composer, files);
      return;
    }
    if (res.action === "BLOCK") {
      applyVisual(res, composer, files);
      return;
    }
    if (res.action === "MASK" && res.sanitizedFiles?.length) {
      if (composer && res.outbound) writeText(composer, res.outbound);
      replaceComposerWithSanitized(res.sanitizedFiles);
      showBanner(
        res.userMessage ??
          `Données sensibles anonymisées (${res.sanitizedFileNames?.join(", ") ?? "fichier"}).`,
        "MASK",
      );
    } else {
      applyVisual(res, composer, files);
      if (res.action !== "MASK") clearPendingFiles();
    }
    allowNativeOnce();
    findSendButton()?.click();
  } catch (err) {
    showBanner(
      err instanceof Error ? err.message : "Erreur d'analyse A1 — rechargez l'onglet (F5).",
      "WARN",
    );
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
    if (isFileCaptureSuppressed() || attachBusy) return;
    const t = ev.target;
    if (!(t instanceof HTMLInputElement) || t.type !== "file" || !t.files?.length) return;

    const snapshot = Array.from(t.files);
    ev.preventDefault();
    ev.stopImmediatePropagation();
    t.value = "";
    void gateFilesOnAttach(snapshot);
  },
  true,
);

document.addEventListener(
  "drop",
  (ev) => {
    if (isFileCaptureSuppressed() || attachBusy) return;
    const list = ev.dataTransfer?.files;
    if (!list?.length) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    void gateFilesOnAttach(Array.from(list));
  },
  true,
);

document.addEventListener(
  "paste",
  (ev) => {
    if (isFileCaptureSuppressed() || attachBusy) return;
    const items = ev.clipboardData?.items;
    if (!items?.length) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length === 0) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    void gateFilesOnAttach(files);
  },
  true,
);

window.addEventListener("message", (ev: MessageEvent) => {
  if (ev.source !== window) return;
  const data = ev.data as {
    source?: string;
    type?: string;
    id?: string;
    text?: string;
    files?: PendingFileWire[];
  };
  if (data?.source !== "acg-hook" || data.type !== "GATE" || !data.id) return;

  const reply = (payload: GateResponse & Record<string, unknown>) => {
    window.postMessage({ source: "acg-content", type: "GATE_RESULT", id: data.id, ...payload }, "*");
  };

  void (async () => {
    try {
      while (attachBusy) {
        await new Promise((r) => setTimeout(r, 40));
      }
      await awaitFileCapture();

      const hookFiles = Array.isArray(data.files) ? data.files.filter((f) => f?.base64 && f?.fileName) : [];
      const files = pendingFiles().length > 0 ? pendingFiles() : hookFiles;
      if (files.length > 0 && pendingFiles().length === 0) {
        setPendingFiles(files);
      }
      const text = (data.text ?? "").trim();

      // Heartbeat / retry sans contenu : laisser passer sans toucher au composeur.
      if (!text && files.length === 0) {
        reply({ action: "ALLOW", outbound: "" });
        return;
      }

      const res = await gateText(text, files);

      if (res.action === "BLOCK") {
        // Ne pas appeler applyFileBlock ici : le fetch est déjà annulé côté page-hook.
        // Muter le composeur depuis un fetch provoquait des états incohérents après un BLOCK.
        reply(res);
        return;
      }

      if (res.action === "MASK" && res.sanitizedFiles?.length) {
        applySanitizedFiles(res.sanitizedFiles);
      }

      reply(res);
    } catch (err) {
      reply({
        action: "WARN",
        error: err instanceof Error ? err.message : String(err),
        userMessage: "Agent A1 : erreur lors de l'analyse — réessayez ou rechargez l'onglet (F5).",
      });
    }
  })();
});
