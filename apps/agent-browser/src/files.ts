export type PendingFileWire = {
  fileName: string;
  mimeType: string;
  base64: string;
};

const pending: PendingFileWire[] = [];

export function pendingFiles(): PendingFileWire[] {
  return [...pending];
}

export function clearPendingFiles(): void {
  pending.length = 0;
}

export async function addPendingFile(file: File): Promise<void> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  pending.push({
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    base64: btoa(binary),
  });
}

export function clearFileInputs(root: ParentNode = document): void {
  root.querySelectorAll('input[type="file"]').forEach((input) => {
    (input as HTMLInputElement).value = "";
  });
  clearPendingFiles();
}

/** Remplace le buffer pending + les input[type=file] par les versions jetonées. */
export function applySanitizedFiles(files: PendingFileWire[]): void {
  pending.length = 0;
  pending.push(...files);
  if (files.length === 0) return;
  const dt = new DataTransfer();
  for (const f of files) {
    const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
    dt.items.add(new File([bytes], f.fileName, { type: f.mimeType || "text/plain" }));
  }
  for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'))) {
    try {
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } catch {
      /* certains navigateurs refusent d'écrire input.files */
    }
  }
}

const REMOVE_LABEL =
  /remove|supprimer|retirer|delete|enlever|close|fermer|dismiss|remove file|remove image|remove attachment/i;

/** Tentative de retrait des pastilles de pièces jointes dans l'UI du site (ChatGPT, etc.). */
export function stripAttachmentUi(root: ParentNode = document): number {
  clearFileInputs(root);
  let removed = 0;
  const candidates = root.querySelectorAll<HTMLElement>(
    [
      'button[aria-label]',
      '[role="button"][aria-label]',
      'button[data-testid*="remove"]',
      'button[data-testid*="delete"]',
      'button[data-testid*="file"]',
    ].join(","),
  );
  for (const el of Array.from(candidates)) {
    const label = `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""} ${el.textContent ?? ""}`;
    if (!REMOVE_LABEL.test(label)) continue;
    // Évite de cliquer sur des contrôles hors zone composeur / pièces jointes
    const nearComposer =
      el.closest("form") ||
      el.closest('[data-testid*="composer"]') ||
      el.closest('[class*="composer"]') ||
      el.closest('[class*="attachment"]') ||
      el.closest('[class*="file"]');
    if (!nearComposer && !/file|image|attachment|fichier|pièce/i.test(label)) continue;
    try {
      el.click();
      removed += 1;
    } catch {
      /* ignore */
    }
  }
  return removed;
}

/** Indices DOM qu'une pièce jointe est encore affichée alors que notre buffer peut être vide. */
export function hasVisibleAttachments(root: ParentNode = document): boolean {
  if (pending.length > 0) return true;
  const selectors = [
    '[data-testid*="file-thumbnail"]',
    '[data-testid*="attachment"]',
    '[data-testid*="file-preview"]',
    '[data-testid*="image-preview"]',
    'img[alt*="uploaded" i]',
    'img[alt*="attachment" i]',
    'img[alt*="fichier" i]',
    '[class*="attachment" i]',
    '[class*="file-preview" i]',
    '[class*="FileThumbnail" i]',
  ];
  for (const sel of selectors) {
    try {
      if (root.querySelector(sel)) return true;
    } catch {
      /* selector invalid in some engines */
    }
  }
  // Boutons « retirer le fichier » encore présents = pastille encore là
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("button[aria-label], [role='button'][aria-label]"))) {
    const label = el.getAttribute("aria-label") ?? "";
    if (REMOVE_LABEL.test(label) && /file|image|attachment|fichier|photo|pièce/i.test(label)) {
      return true;
    }
  }
  return false;
}
