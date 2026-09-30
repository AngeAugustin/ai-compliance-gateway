/**
 * Sérialisation JSON canonique (clés triées, pas d'espaces, undefined ignoré).
 * Utilisée pour le hachage chaîné des événements et la signature des heartbeats :
 * agent et serveur doivent produire exactement les mêmes octets.
 */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) throw new Error("Nombre non fini non sérialisable");
      return Number.isInteger(value) ? String(value) : JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "undefined":
      return "null";
    case "object": {
      if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`;
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${serialize(obj[k])}`).join(",")}}`;
    }
    default:
      throw new Error(`Type non sérialisable: ${typeof value}`);
  }
}
