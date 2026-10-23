/**
 * Restauration locale des jetons (PERSONNE_001 → valeur d'origine) dans les réponses de l'IA.
 *
 * Choix de sécurité : la page n'est JAMAIS modifiée. Réécrire le DOM du service d'IA
 * exposerait les valeurs restaurées à son JavaScript (télémétrie, analytics, relecture
 * du DOM avant renvoi). Les valeurs ne vivent que dans ce content script (monde isolé)
 * et s'affichent dans un Shadow DOM fermé, illisible par les scripts de la page.
 */

const tokens = new Map<string, string>();
let tokenPattern: RegExp | null = null;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let observer: MutationObserver | null = null;
let panel: { root: ShadowRoot; host: HTMLElement } | null = null;
let collapsed = false;
let lastMessage: Element | null = null;

const SKIP = "textarea, input, [contenteditable=''], [contenteditable='true'], script, style, #acg-agent-banner, #acg-restore-host";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function rememberTokens(map: Record<string, string> | undefined): void {
  if (!map) return;
  let changed = false;
  for (const [token, value] of Object.entries(map)) {
    if (tokens.get(token) !== value) {
      tokens.set(token, value);
      changed = true;
    }
  }
  if (!changed) return;
  const keys = [...tokens.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
  tokenPattern = new RegExp(`\\b(?:${keys.join("|")})\\b`, "g");
  if (typeof document === "undefined") return;
  startObserving();
  scheduleScan();
}

export function restoreText(text: string): string {
  if (!tokenPattern) return text;
  return text.replace(tokenPattern, (t) => tokens.get(t) ?? t);
}

function startObserving(): void {
  if (observer || !document.body) return;
  observer = new MutationObserver(() => scheduleScan());
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function scheduleScan(): void {
  if (scanTimer) clearTimeout(scanTimer);
  // Les réponses arrivent en flux : on attend une accalmie avant de relire la page.
  scanTimer = setTimeout(scan, 400);
}

/** Bloc « message » le plus proche (sélecteurs des principaux services, repli sur le parent). */
function messageBlock(node: Node): Element | null {
  const el = node.parentElement;
  if (!el) return null;
  return (
    el.closest("[data-message-author-role], [data-testid^='conversation-turn'], article, message-content, .model-response-text, .markdown, .prose") ??
    el
  );
}

function scan(): void {
  scanTimer = null;
  if (!tokenPattern || !document.body) return;
  const found = new Map<string, string>();
  let last: Element | null = null;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue;
    if (!text || text.length < 5) continue;
    if (node.parentElement?.closest(SKIP)) continue;
    tokenPattern.lastIndex = 0;
    const matches = text.match(tokenPattern);
    if (!matches) continue;
    for (const t of matches) found.set(t, tokens.get(t)!);
    last = messageBlock(node);
  }
  lastMessage = last;
  render(found);
}

function ensurePanel(): { root: ShadowRoot; host: HTMLElement } {
  if (panel && panel.host.isConnected) return panel;
  const host = document.createElement("div");
  host.id = "acg-restore-host";
  // Fermé : element.shadowRoot renvoie null pour les scripts de la page.
  const root = host.attachShadow({ mode: "closed" });
  document.documentElement.appendChild(host);
  panel = { root, host };
  return panel;
}

function render(found: Map<string, string>): void {
  if (found.size === 0) {
    if (panel) panel.host.style.display = "none";
    return;
  }
  const { root, host } = ensurePanel();
  host.style.display = "block";
  const rows = [...found]
    .map(
      ([token, value]) =>
        `<li><code>${escapeHtml(token)}</code><span class="arrow">→</span><span class="value">${escapeHtml(value)}</span></li>`,
    )
    .join("");
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .card { position: fixed; right: 16px; bottom: 16px; z-index: 2147483646; width: min(340px, calc(100vw - 32px));
        font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1f1d3a; background: #f3f2fb;
        border: 1px solid #d5d2ef; border-left: 4px solid #5b52c7; border-radius: 10px; box-shadow: 0 8px 24px rgba(31,29,58,.18); }
      header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; }
      header strong { flex: 1; font-size: 13px; }
      .badge { background: #5b52c7; color: #fff; border-radius: 999px; padding: 0 8px; font-size: 12px; }
      .body { padding: 0 12px 12px; }
      .hint { margin: 0 0 8px; color: #55527a; font-size: 12px; }
      ul { list-style: none; margin: 0 0 10px; padding: 0; max-height: 180px; overflow: auto; }
      li { display: flex; gap: 6px; align-items: baseline; padding: 3px 0; border-top: 1px solid #e4e2f5; }
      code { font: 12px ui-monospace, Consolas, monospace; color: #5b52c7; }
      .arrow { color: #8a87ad; }
      .value { overflow-wrap: anywhere; font-weight: 600; }
      button { font: inherit; font-size: 12px; border: 1px solid #5b52c7; background: #5b52c7; color: #fff; border-radius: 6px;
        padding: 6px 10px; cursor: pointer; }
      button:focus-visible { outline: 2px solid #1f1d3a; outline-offset: 2px; }
      .ok { margin-left: 8px; color: #2f7a4b; font-size: 12px; }
      @media (prefers-color-scheme: dark) {
        .card { background: #23213a; color: #ecebf7; border-color: #3d3a63; }
        .hint, .arrow { color: #a9a6cc; } li { border-top-color: #3d3a63; } code { color: #a69ff0; }
      }
    </style>
    <section class="card" role="region" aria-label="Valeurs restaurées par l'agent ACG">
      <header part="header"><strong>Valeurs restaurées (local)</strong><span class="badge">${found.size}</span><span aria-hidden="true">${collapsed ? "▴" : "▾"}</span></header>
      ${
        collapsed
          ? ""
          : `<div class="body">
        <p class="hint">Visibles uniquement ici : le service d'IA n'a reçu que les jetons.</p>
        <ul>${rows}</ul>
        <button type="button">Copier la réponse restaurée</button><span class="ok" role="status"></span>
      </div>`
      }
    </section>`;
  root.querySelector("header")!.addEventListener("click", () => {
    collapsed = !collapsed;
    render(found);
  });
  root.querySelector("button")?.addEventListener("click", () => {
    const status = root.querySelector(".ok");
    const text = lastMessage instanceof HTMLElement ? lastMessage.innerText : (lastMessage?.textContent ?? "");
    void navigator.clipboard
      .writeText(restoreText(text))
      .then(() => {
        if (status) status.textContent = "Copiée";
      })
      .catch(() => {
        if (status) status.textContent = "Copie refusée par le navigateur";
      });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
