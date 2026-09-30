/** Adresse IP cliente vue par le serveur (proxy-aware). */
export function clientIp(req: {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  const raw =
    (typeof forwarded === "string" ? forwarded.split(",")[0] : Array.isArray(forwarded) ? forwarded[0] : undefined) ??
    req.ip ??
    req.socket?.remoteAddress ??
    null;
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.startsWith("::ffff:") ? trimmed.slice(7) : trimmed;
}
