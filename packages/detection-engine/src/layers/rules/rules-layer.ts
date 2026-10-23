import type { DetectionResult, EntityType, SensitiveEntity } from "@acg/shared";
import { now, type DetectionLayerProvider, type LayerStatus } from "../types.js";
import { RULE_PATTERNS } from "./patterns.js";
import { findPhoneCandidates } from "./phones.js";
import { beninMobileOperator, normalizeBeninPhone } from "./validators.js";

const MODEL_VERSION = "rules-1.1.0";

function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

function extractValue(match: RegExpExecArray): string {
  return (match[1] ?? match[2] ?? match[0]!).trim();
}

/** Un numéro béninois d'opérateur mobile cité près de « MoMo / Moov Money… » est un compte mobile money. */
function classifyPhone(text: string, value: string, start: number, end: number): { entityType: EntityType; confidence: number } | null {
  const local = normalizeBeninPhone(value);
  if (!local || !beninMobileOperator(local)) return null;
  const around = text.slice(Math.max(0, start - 32), end + 32).toLowerCase();
  if (!/(momo|mobile money|moov money|celtiis)/.test(around)) return null;
  return { entityType: "MOBILE_MONEY", confidence: 0.92 };
}

export class RulesLayer implements DetectionLayerProvider {
  readonly layer = "rules" as const;

  async initialize(): Promise<LayerStatus> {
    return this.status();
  }

  status(): LayerStatus {
    return { layer: "rules", available: true, degraded: false, modelVersion: MODEL_VERSION };
  }

  async detect(text: string): Promise<DetectionResult> {
    const started = now();
    const entities: SensitiveEntity[] = [];

    for (const pattern of RULE_PATTERNS) {
      const re = new RegExp(pattern.regex.source, pattern.regex.flags.includes("g") ? pattern.regex.flags : pattern.regex.flags + "g");
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        const raw = match[0]!;
        const value = extractValue(match);
        const start = match.index + raw.indexOf(value);
        const end = start + value.length;
        if (pattern.validate && !pattern.validate(raw, text)) continue;
        if (pattern.contextKeywords) {
          const window = text.slice(Math.max(0, match.index - 40), Math.min(text.length, match.index + raw.length + 40)).toLowerCase();
          if (!pattern.contextKeywords.some((k) => window.includes(k.toLowerCase()))) continue;
        }

        let entityType = pattern.entityType;
        let confidence = pattern.confidence;
        if (entityType === "PHONE") {
          const momo = classifyPhone(text, value, match.index, match.index + raw.length);
          if (momo) ({ entityType, confidence } = momo);
        }

        const span: [number, number] = [start, end];
        const clash = entities.find((e) => overlaps(e.span, span));
        if (clash) {
          if (confidence > clash.confidence) {
            entities.splice(entities.indexOf(clash), 1);
          } else {
            continue;
          }
        }
        entities.push({ entityType, confidence, span, layer: "rules", value });
      }
    }

    // Téléphones validés par plan de numérotation (BJ, FR, international) — ne remplace
    // jamais une entité déjà trouvée par un motif plus spécifique (IBAN, carte, MoMo…).
    for (const phone of findPhoneCandidates(text)) {
      const span: [number, number] = [phone.start, phone.end];
      if (entities.some((e) => overlaps(e.span, span))) continue;
      const momo = classifyPhone(text, phone.value, phone.start, phone.end);
      entities.push({
        entityType: momo?.entityType ?? "PHONE",
        confidence: momo?.confidence ?? phone.confidence,
        span,
        layer: "rules",
        value: phone.value,
      });
    }

    entities.sort((a, b) => a.span[0] - b.span[0]);
    return {
      layer: "rules",
      entities,
      processingTimeMs: Math.round((now() - started) * 100) / 100,
      modelVersion: MODEL_VERSION,
      degraded: false,
    };
  }
}
