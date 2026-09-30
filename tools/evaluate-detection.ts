import { DetectionEngine } from "@acg/detection-engine";
import { SYNTHETIC_PROMPTS } from "../data/synthetic/generate.js";

const engine = new DetectionEngine();
await engine.initialize();

let ok = 0;
for (const sample of SYNTHETIC_PROMPTS) {
  const result = await engine.detect(sample.text);
  const types = new Set(result.entities.map((e) => e.entityType));
  const missed = sample.expected.filter((t) => !types.has(t as typeof sample.expected[number]));
  const pass = missed.length === 0;
  if (pass) ok++;
  console.log(`${pass ? "✔" : "✖"} ${sample.id} attendu=${sample.expected.join(",")} obtenu=${[...types].join(",") || "∅"}`);
}
console.log(`${ok}/${SYNTHETIC_PROMPTS.length}`);
