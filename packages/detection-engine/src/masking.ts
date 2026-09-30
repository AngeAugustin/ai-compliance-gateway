import { ENTITY_DEFINITIONS, type EntityType, type SensitiveEntity } from "@acg/shared";

export interface MaskingPlan {
  text: string;
  tokens: string[];
  replacements: { span: [number, number]; token: string; entityType: EntityType; value: string }[];
}

/**
 * Remplace les entités par des jetons stables au sein d'une interaction
 * (PERSONNE_001, MONTANT_001…). Opère de droite à gauche pour préserver les offsets.
 */
export function applyMasking(text: string, entities: SensitiveEntity[]): MaskingPlan {
  const counters = new Map<string, number>();
  const sorted = [...entities].sort((a, b) => b.span[0] - a.span[0]);
  const replacements: MaskingPlan["replacements"] = [];
  let out = text;

  for (const entity of sorted) {
    const def = ENTITY_DEFINITIONS[entity.entityType];
    const n = (counters.get(def.tokenPrefix) ?? 0) + 1;
    counters.set(def.tokenPrefix, n);
    const token = `${def.tokenPrefix}_${String(n).padStart(3, "0")}`;
    const value = entity.value ?? out.slice(entity.span[0], entity.span[1]);
    out = out.slice(0, entity.span[0]) + token + out.slice(entity.span[1]);
    replacements.push({ span: entity.span, token, entityType: entity.entityType, value });
  }

  replacements.reverse();
  const sequential = remapTokenNumbers(replacements);
  let rebuilt = text;
  for (const r of [...sequential].sort((a, b) => b.span[0] - a.span[0])) {
    rebuilt = rebuilt.slice(0, r.span[0]) + r.token + rebuilt.slice(r.span[1]);
  }
  return { text: rebuilt, tokens: sequential.map((r) => r.token), replacements: sequential };
}

function remapTokenNumbers(replacements: MaskingPlan["replacements"]): MaskingPlan["replacements"] {
  const counters = new Map<string, number>();
  return replacements.map((r) => {
    const prefix = ENTITY_DEFINITIONS[r.entityType].tokenPrefix;
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return { ...r, token: `${prefix}_${String(n).padStart(3, "0")}` };
  });
}

/** Quasi-identifiants encore présents dans le texte masqué (DAT §10.2 risque résiduel). */
export function residualQuasiIdentifiers(text: string, original: SensitiveEntity[]): SensitiveEntity[] {
  return original.filter((e) => {
    const value = e.value ?? "";
    return value.length > 0 && text.includes(value);
  });
}
