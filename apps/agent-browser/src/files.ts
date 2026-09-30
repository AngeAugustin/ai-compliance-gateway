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
