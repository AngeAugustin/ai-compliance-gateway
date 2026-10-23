import { ENTITY_DEFINITIONS, type EntityType, type SensitiveEntity } from "@acg/shared";

export interface MaskingPlan {
  text: string;
  tokens: string[];
  replacements: { span: [number, number]; token: string; entityType: EntityType; value: string }[];
  /** Jetons connus après ce masquage (précédents + nouveaux). */
  bindings: TokenBinding[];
}

/**
 * Recalcule les spans d'entités dans un texte cible (ex. fichier seul ou prompt seul)
 * lorsque la détection a été faite sur un texte combiné.
 */
export function remapEntitiesToText(text: string, entities: SensitiveEntity[]): SensitiveEntity[] {
  const out: SensitiveEntity[] = [];
  const seen = new Set<string>();
  for (const e of entities) {
    const value = e.value ?? "";
    if (!value || !text.includes(value)) continue;
    let from = 0;
    while (true) {
      const idx = text.indexOf(value, from);
      if (idx < 0) break;
      const key = `${e.entityType}:${idx}:${value.length}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ ...e, span: [idx, idx + value.length] });
      }
      from = idx + value.length;
    }
  }
  return out;
}

/** Association jeton ↔ valeur, conservée par l'agent pour réutiliser les mêmes jetons d'un prompt à l'autre. */
export interface TokenBinding {
  token: string;
  entityType: EntityType;
  value: string;
}

function bindingKey(entityType: EntityType, value: string): string {
  return `${entityType}:${value.trim().toLowerCase()}`;
}

/**
 * Remplace les entités par des jetons stables (PERSONNE_001, MONTANT_001…).
 * Une même valeur reçoit toujours le même jeton, y compris d'un prompt à l'autre
 * si `previous` est fourni : l'IA voit une conversation cohérente et l'agent peut
 * restaurer les valeurs dans la réponse.
 */
export function applyMasking(text: string, entities: SensitiveEntity[], previous: TokenBinding[] = []): MaskingPlan {
  const localized = remapEntitiesToText(text, entities).sort((a, b) => a.span[0] - b.span[0] || b.span[1] - a.span[1]);
  // Deux entités qui se chevauchent : on garde la plus longue (sinon le remplacement corrompt le texte).
  const kept: SensitiveEntity[] = [];
  for (const e of localized) {
    const last = kept[kept.length - 1];
    if (last && e.span[0] < last.span[1]) {
      if (e.span[1] - e.span[0] > last.span[1] - last.span[0]) kept[kept.length - 1] = e;
      continue;
    }
    kept.push(e);
  }

  const known = new Map(previous.map((b) => [bindingKey(b.entityType, b.value), b]));
  const counters = new Map<string, number>();
  for (const b of previous) {
    const m = /^(.*)_(\d+)$/.exec(b.token);
    if (m) counters.set(m[1]!, Math.max(counters.get(m[1]!) ?? 0, Number(m[2])));
  }

  const replacements: MaskingPlan["replacements"] = [];
  const bindings = [...previous];
  for (const entity of kept) {
    const value = entity.value ?? text.slice(entity.span[0], entity.span[1]);
    const key = bindingKey(entity.entityType, value);
    let binding = known.get(key);
    if (!binding) {
      const prefix = ENTITY_DEFINITIONS[entity.entityType].tokenPrefix;
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      binding = { token: `${prefix}_${String(n).padStart(3, "0")}`, entityType: entity.entityType, value };
      known.set(key, binding);
      bindings.push(binding);
    }
    replacements.push({ span: entity.span, token: binding.token, entityType: entity.entityType, value });
  }

  let rebuilt = text;
  for (const r of [...replacements].reverse()) {
    rebuilt = rebuilt.slice(0, r.span[0]) + r.token + rebuilt.slice(r.span[1]);
  }
  return { text: rebuilt, tokens: replacements.map((r) => r.token), replacements, bindings };
}

/** Quasi-identifiants encore présents dans le texte masqué (DAT §10.2 risque résiduel). */
export function residualQuasiIdentifiers(text: string, original: SensitiveEntity[]): SensitiveEntity[] {
  return original.filter((e) => {
    const value = e.value ?? "";
    return value.length > 0 && text.includes(value);
  });
}
