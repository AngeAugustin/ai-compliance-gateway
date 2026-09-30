import type { DetectionResult, SensitiveEntity } from "@acg/shared";
import { now, type DetectionLayerProvider, type LayerStatus } from "../types.js";
import { RULE_PATTERNS } from "./patterns.js";
import { beninMobileOperator, normalizeBeninPhone } from "./validators.js";

const MODEL_VERSION = "rules-1.0.0";

function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

function extractValue(match: RegExpExecArray): string {
  return (match[1] ?? match[2] ?? match[0]!).trim();
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
          const local = normalizeBeninPhone(value);
          if (local && beninMobileOperator(local)) {
            const around = text.slice(Math.max(0, match.index - 32), match.index + raw.length + 32).toLowerCase();
            if (/(momo|mobile money|moov money|celtiis)/.test(around)) {
              entityType = "MOBILE_MONEY";
              confidence = 0.92;
            }
          }
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
