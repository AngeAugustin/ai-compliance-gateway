export type PendingFileWire = {
  fileName: string;
  mimeType: string;
  base64: string;
};

const pending: PendingFileWire[] = [];
/** Ignore les change/input synthétiques quand on réinjecte une version jetonée. */
let suppressFileCapture = false;
/** Chaîne pour attendre la fin d'un encode base64 avant un envoi. */
let captureChain: Promise<void> = Promise.resolve();

export function pendingFiles(): PendingFileWire[] {
  return [...pending];
}

export function clearPendingFiles(): void {
  pending.length = 0;
}

export function isFileCaptureSuppressed(): boolean {
  return suppressFileCapture;
}

/** Ne doit jamais rester en rejet : sinon tous les gates hang définitivement. */
export async function awaitFileCapture(): Promise<void> {
  try {
    await captureChain;
  } catch {
    captureChain = Promise.resolve();
  }
}

export function setPendingFiles(files: PendingFileWire[]): void {
  pending.length = 0;
  pending.push(...files);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const comma = dataUrl.indexOf(",");
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Lecture fichier impossible"));
    reader.readAsDataURL(file);
  });
}

export async function addPendingFile(file: File): Promise<void> {
  const base64 = await fileToBase64(file);
  pending.push({
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    base64,
  });
}

/** Capture asynchrone sérialisée — erreurs isolées, chaîne toujours récupérable. */
export function queueFileCapture(files: ArrayLike<File>): Promise<void> {
  const list = Array.from(files);
  const job = async () => {
    clearPendingFiles();
    for (const file of list) {
      try {
        await addPendingFile(file);
      } catch {
        /* fichier illisible : on continue */
      }
    }
  };
  captureChain = captureChain.then(job, job);
  return captureChain.then(
    () => undefined,
    () => undefined,
  );
}

export function clearFileInputs(root: ParentNode = document): void {
  root.querySelectorAll('input[type="file"]').forEach((input) => {
    (input as HTMLInputElement).value = "";
  });
  clearPendingFiles();
}

/** Met à jour uniquement le buffer agent (pas l'UI) — sûr à rappeler depuis le hook fetch. */
export function applySanitizedFiles(files: PendingFileWire[]): void {
  pending.length = 0;
  pending.push(...files);
}

/** Vide le champ fichier du composeur + pastilles UI (sans toucher au prompt). */
export function clearComposerFiles(root: ParentNode = document): void {
  const scope = findComposerScope(root) ?? root;
  suppressFileCapture = true;
  try {
    scope.querySelectorAll('input[type="file"]').forEach((input) => {
      (input as HTMLInputElement).value = "";
    });
  } finally {
    suppressFileCapture = false;
  }
  clearPendingFiles();
  stripAttachmentChipsOnly(root);
}

/**
 * Injecte des fichiers (originaux ou jetonés) dans le seul input fichier du composeur
 * et notifie le site via un unique événement change.
 */
export function injectComposerFiles(files: PendingFileWire[]): boolean {
  applySanitizedFiles(files);
  if (files.length === 0) return false;

  stripAttachmentChipsOnly();

  const scope = findComposerScope() ?? document;
  const inputs = Array.from(scope.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  const input = inputs[0];
  if (!input) return false;

  const dt = new DataTransfer();
  for (const f of files) {
    try {
      const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
      dt.items.add(new File([bytes], f.fileName, { type: f.mimeType || "text/plain" }));
    } catch {
      /* base64 invalide */
    }
  }
  if (dt.files.length === 0) return false;

  suppressFileCapture = true;
  try {
    for (const other of inputs) {
      if (other !== input) other.value = "";
    }
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch {
    return false;
  } finally {
    suppressFileCapture = false;
  }
}

/** Remplace les pastilles du composeur par les versions jetonées. */
export function replaceComposerWithSanitized(files: PendingFileWire[]): void {
  injectComposerFiles(files);
}

const REMOVE_LABEL =
  /remove|supprimer|retirer|delete|enlever|remove file|remove image|remove attachment|remove upload/i;

/** Zone composeur : évite de matcher le chrome global (menus, historique, boutons trombone). */
export function findComposerScope(root: ParentNode = document): Element | null {
  const doc = root instanceof Document ? root : root.ownerDocument ?? document;
  const anchor =
    (root instanceof Element ? root : doc).querySelector?.("#prompt-textarea") ||
    doc.querySelector("#prompt-textarea") ||
    doc.querySelector('[data-testid="composer"]') ||
    doc.querySelector('form[data-type="unified-composer"]') ||
    doc.querySelector('[data-testid="chat-input"]') ||
    doc.querySelector("form textarea") ||
    doc.querySelector('[contenteditable="true"]');
  if (!anchor) return null;
  return (
    anchor.closest("form") ||
    anchor.closest('[data-testid*="composer"]') ||
    anchor.closest('[class*="composer"]') ||
    anchor.parentElement
  );
}

/** Clique les boutons « retirer » du composeur sans toucher au buffer pending. */
export function stripAttachmentChipsOnly(root: ParentNode = document): number {
  const scope = findComposerScope(root) ?? root;
  let removed = 0;
  const candidates = scope.querySelectorAll<HTMLElement>(
    ['button[aria-label]', '[role="button"][aria-label]', 'button[data-testid*="remove"]', 'button[data-testid*="delete"]'].join(","),
  );
  for (const el of Array.from(candidates)) {
    const label = `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""} ${el.textContent ?? ""}`;
    if (!REMOVE_LABEL.test(label)) continue;
    if (!/file|image|attachment|fichier|photo|pièce|upload/i.test(label)) continue;
    try {
      el.click();
      removed += 1;
    } catch {
      /* ignore */
    }
  }
  return removed;
}

/** Tentative de retrait des pastilles de pièces jointes dans l'UI du site (ChatGPT, etc.). */
export function stripAttachmentUi(root: ParentNode = document): number {
  clearFileInputs(root);
  return stripAttachmentChipsOnly(root);
}

function composerHasFileInputs(scope: ParentNode): boolean {
  for (const input of Array.from(scope.querySelectorAll<HTMLInputElement>('input[type="file"]'))) {
    if (input.files && input.files.length > 0) return true;
  }
  return false;
}

/**
 * Indices DOM qu'une pièce jointe est encore affichée dans le composeur.
 * Sélecteurs volontiers étroits : `[class*="attachment"]` matchait le bouton trombone ChatGPT/Claude.
 */
export function hasVisibleAttachments(root: ParentNode = document): boolean {
  if (pending.length > 0) return true;
  const scope = findComposerScope(root);
  if (!scope) return false;
  if (composerHasFileInputs(scope)) return true;

  const selectors = [
    '[data-testid*="file-thumbnail"]',
    '[data-testid*="file-preview"]',
    '[data-testid*="image-preview"]',
    '[data-testid="composer-attachment"]',
    '[data-testid*="composer-file"]',
    'img[alt*="uploaded" i]',
    'img[alt*="Uploaded" i]',
    '[class*="FileThumbnail"]',
    '[class*="file-thumbnail"]',
    '[data-testid*="file-chip"]',
  ];
  for (const sel of selectors) {
    try {
      if (scope.querySelector(sel)) return true;
    } catch {
      /* selector invalid in some engines */
    }
  }
  for (const el of Array.from(scope.querySelectorAll<HTMLElement>("button[aria-label], [role='button'][aria-label]"))) {
    const label = el.getAttribute("aria-label") ?? "";
    if (REMOVE_LABEL.test(label) && /file|image|attachment|fichier|photo|pièce|upload/i.test(label)) {
      return true;
    }
  }
  return false;
}
