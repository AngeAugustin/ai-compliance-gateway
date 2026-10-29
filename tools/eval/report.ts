import { ENTITY_DEFINITIONS, type EntityType } from "../../packages/shared/src/index.js";
import type { EvalSample, Split } from "./annotation.js";
import type { ContextReport, ReidLine, SystemReport } from "./evaluate.js";
import type { MatchMode } from "./metrics.js";
import { ALL_VARIANTS, REID_VARIANTS } from "./reidentification.js";
import { EXPOSURE_LABEL, EXPOSURES, type RiskResponseLine } from "./risk-response.js";
import type { SystemsSetup } from "./systems.js";

export interface RunMeta {
  date: string;
  seed: number;
  repetitions: number;
  node: string;
  platform: string;
  cpu: string;
  durationMs: number;
  populationSize: number;
}

export interface FullReport {
  meta: RunMeta;
  setup: Pick<SystemsSetup, "ner" | "llm">;
  corpus: {
    samples: number;
    bySplit: Record<string, number>;
    entities: number;
    entitiesByType: Record<string, number>;
    negatives: number;
    contexts: Record<string, number>;
    reidScenarios: number;
  };
  systems: SystemReport[];
  context: ContextReport[];
  reidentification: ReidLine[];
  riskResponse: RiskResponseLine[];
}

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits).replace(".", ",")} %`;
const ms = (x: number) => (x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : Math.round(x).toString()).replace(".", ",");
const label = (t: EntityType) => ENTITY_DEFINITIONS[t]?.label ?? t;
const SPLIT_LABEL: Record<Split, string> = { manuel: "Manuel", genere: "Généré", long: "Documents multi-demandes" };
const MODE_LABEL: Record<MatchMode, string> = { strict: "Strict", partiel: "Partiel", protection: "Protection" };

function table(headers: string[], rows: (string | number)[][], align?: ("l" | "r")[]): string {
  const sep = headers.map((_, i) => ((align?.[i] ?? (i === 0 ? "l" : "r")) === "r" ? "---:" : ":---"));
  return [headers, sep, ...rows.map((r) => r.map(String))].map((r) => `| ${r.join(" | ")} |`).join("\n");
}

export function describeCorpus(samples: EvalSample[], reidScenarios: number): FullReport["corpus"] {
  const bySplit: Record<string, number> = {};
  const entitiesByType: Record<string, number> = {};
  const contexts: Record<string, number> = {};
  let entities = 0;
  let negatives = 0;
  for (const s of samples) {
    bySplit[s.split] = (bySplit[s.split] ?? 0) + 1;
    if (s.gold.length === 0) negatives++;
    if (s.context) contexts[s.context] = (contexts[s.context] ?? 0) + 1;
    for (const g of s.gold) {
      entities++;
      entitiesByType[g.entityType] = (entitiesByType[g.entityType] ?? 0) + 1;
    }
  }
  return { samples: samples.length, bySplit, entities, entitiesByType, negatives, contexts, reidScenarios };
}

export function renderMarkdown(r: FullReport): string {
  const out: string[] = [];
  const systems = r.systems;
  out.push(`# Résultats de l'évaluation de la détection`);
  out.push(
    `> Rapport généré par \`pnpm eval:detection\` le ${r.meta.date} — graine ${r.meta.seed}, ${r.meta.repetitions} répétitions de latence, ` +
      `Node ${r.meta.node} (${r.meta.platform}, ${r.meta.cpu}), durée ${Math.round(r.meta.durationMs / 1000)} s. ` +
      `Protocole : [protocole-detection.md](../protocole-detection.md). Ne pas modifier à la main.`,
  );
  out.push(
    `NER : ${r.setup.ner.available ? `chargé en ${ms(r.setup.ner.initMs)} ms` : `indisponible (${r.setup.ner.detail ?? "?"})`}. ` +
      `LLM de contexte : ${r.setup.llm.available ? "chargé" : `non évalué (${r.setup.llm.detail ?? "?"})`}.`,
  );

  out.push(`## 1. Synthèse`);
  out.push(
    table(
      ["Configuration", "Précision", "Rappel", "F1 (IC 95 %)", "F1 strict", "Rappel protection", "Latence p50 / p95"],
      systems.map((s) => [
        `**${s.label}**`,
        pct(s.global.partiel.prf.precision),
        pct(s.global.partiel.prf.recall),
        `${pct(s.global.partiel.prf.f1)} (${pct(s.global.partiel.ci95.low)} – ${pct(s.global.partiel.ci95.high)})`,
        pct(s.global.strict.prf.f1),
        pct(s.global.protection.prf.recall),
        `${ms(s.latency.p50)} / ${ms(s.latency.p95)} ms`,
      ]),
    ),
  );
  out.push(
    `Appariement **partiel** (même type, chevauchement) sauf mention contraire, micro-moyenne sur tout le corpus. ` +
      `**Rappel protection** : part des données sensibles recouvertes par une détection, quel que soit le type — c'est ce qui conditionne le masquage.`,
  );

  out.push(`## 2. Corpus`);
  out.push(
    table(
      ["Sous-corpus", "Prompts"],
      Object.entries(r.corpus.bySplit).map(([k, v]) => [SPLIT_LABEL[k as Split] ?? k, v]),
    ),
  );
  out.push(
    `${r.corpus.samples} prompts, ${r.corpus.entities} entités annotées, ${r.corpus.negatives} prompts sans aucune donnée sensible (négatifs). ` +
      `${r.corpus.reidScenarios} scénarios supplémentaires pour l'expérience de ré-identification.`,
  );
  out.push(
    table(
      ["Type", "Entités annotées"],
      Object.entries(r.corpus.entitiesByType)
        .sort((a, b) => b[1] - a[1])
        .map(([t, n]) => [label(t as EntityType), n]),
    ),
  );

  out.push(`## 3. Résultats par configuration`);
  for (const s of systems) {
    out.push(`### ${s.label}`);
    out.push(`${s.description}. Macro-F1 (par type) : ${pct(s.macroF1)}. ` + `F1 sur son périmètre déclaré : ${pct(s.perimetre.prf.f1)}.`);
    const rows: (string | number)[][] = [];
    for (const mode of ["strict", "partiel", "protection"] as MatchMode[]) {
      const g = s.global[mode];
      rows.push([`Tout — ${MODE_LABEL[mode]}`, g.counts.tp, g.counts.fp, g.counts.fn, pct(g.prf.precision), pct(g.prf.recall), pct(g.prf.f1)]);
    }
    for (const [split, modes] of Object.entries(s.bySplit)) {
      const g = modes!.partiel;
      rows.push([`${SPLIT_LABEL[split as Split]} — Partiel`, g.counts.tp, g.counts.fp, g.counts.fn, pct(g.prf.precision), pct(g.prf.recall), pct(g.prf.f1)]);
    }
    out.push(table(["Sous-ensemble", "VP", "FP", "FN", "Précision", "Rappel", "F1"], rows));
  }

  out.push(`## 4. Résultats par type d'entité (F1 partiel)`);
  const types = [...new Set(systems.flatMap((s) => s.byType.filter((t) => t.support > 0).map((t) => t.entityType)))].sort(
    (a, b) => (r.corpus.entitiesByType[b] ?? 0) - (r.corpus.entitiesByType[a] ?? 0),
  );
  out.push(
    table(
      ["Type", "Support", ...systems.map((s) => s.label)],
      types.map((t) => [
        label(t),
        r.corpus.entitiesByType[t] ?? 0,
        ...systems.map((s) => {
          const line = s.byType.find((x) => x.entityType === t);
          if (!line?.inCoverage) return "hors périmètre";
          return `${pct(line.prf.f1, 0)} (R ${pct(line.prf.recall, 0)})`;
        }),
      ]),
    ),
  );
  out.push(`« hors périmètre » : la configuration ne produit jamais ce type ; ses occurrences comptent comme faux négatifs dans les totaux.`);
  const fpTypes = systems.map((s) => ({
    s,
    rows: s.byType.filter((t) => t.counts.fp > 0).sort((a, b) => b.counts.fp - a.counts.fp).slice(0, 6),
  }));
  out.push(`Faux positifs les plus fréquents :`);
  out.push(fpTypes.map(({ s, rows }) => `- **${s.label}** : ${rows.map((t) => `${label(t.entityType)} (${t.counts.fp})`).join(", ") || "aucun"}`).join("\n"));

  out.push(`## 5. Classification du contexte`);
  if (r.context.length === 0) out.push(`Aucun classifieur évalué.`);
  for (const c of r.context) {
    out.push(`### ${c.label}`);
    const splits = Object.entries(c.bySplit ?? {})
      .map(([split, v]) => `${split} ${pct(v.correct / Math.max(1, v.n))} (${v.correct}/${v.n})`)
      .join(" · ");
    out.push(`${c.n} prompts étiquetés — exactitude ${pct(c.accuracy)}, macro-F1 ${pct(c.macroF1)}. Par corpus : ${splits}.`);
    const cats = Object.keys(c.confusion);
    out.push(table(["Attendu \\ Prédit", ...cats], cats.map((g) => [g, ...cats.map((p) => c.confusion[g]![p]!)])));
  }

  out.push(`## 6. Latence`);
  out.push(
    table(
      ["Configuration", "Mesures", "p50", "p95", "p99", "Moyenne", "Max", "Débit"],
      systems.map((s) => [
        s.label,
        s.latency.runs,
        `${ms(s.latency.p50)} ms`,
        `${ms(s.latency.p95)} ms`,
        `${ms(s.latency.p99)} ms`,
        `${ms(s.latency.mean)} ms`,
        `${ms(s.latency.max)} ms`,
        `${Math.round(s.latency.charsPerMs * 1000).toLocaleString("fr-FR")} car./s`,
      ]),
    ),
  );
  out.push(
    table(
      ["Configuration", "Court (< 200 car.) p50 / p95", "Moyen (200–1 000) p50 / p95", "Long (> 1 000) p50 / p95"],
      systems.map((s) => [
        s.label,
        ...(["court", "moyen", "long"] as const).map((b) =>
          s.latency.byLength[b].n ? `${ms(s.latency.byLength[b].p50)} / ${ms(s.latency.byLength[b].p95)} ms (n=${s.latency.byLength[b].n})` : "—",
        ),
      ]),
    ),
  );
  out.push(
    `Temps mesuré autour de \`detect()\` en processus, après échauffement, hors réseau et hors politique côté serveur. ` +
      `Le chargement initial du modèle NER (${r.setup.ner.available ? `${ms(r.setup.ner.initMs)} ms` : "n/a"}) n'est payé qu'une fois par processus.`,
  );

  out.push(`## 7. Masquage : données encore lisibles après la passerelle`);
  out.push(
    table(
      ["Configuration", "Masquées entièrement", "Partiellement", "Pas du tout"],
      systems.map((s) => {
        const g = s.masking.global;
        return [s.label, pct(g.complet / g.total), pct(g.partiel / g.total), pct(g.aucun / g.total)];
      }),
    ),
  );
  const best = systems[systems.length - 1];
  if (best) {
    out.push(`Détail pour **${best.label}** :`);
    out.push(
      table(
        ["Type", "Entités", "Entièrement", "Partiellement", "Pas du tout"],
        best.masking.byType.map(({ entityType, line }) => [
          label(entityType),
          line.total,
          pct(line.complet / line.total, 0),
          pct(line.partiel / line.total, 0),
          pct(line.aucun / line.total, 0),
        ]),
      ),
    );
  }

  out.push(`## 8. Expérience de ré-identification`);
  out.push(
    `Attaquant disposant du registre complet (${r.meta.populationSize} assurés synthétiques) et du prompt tel qu'il sort de la passerelle. ` +
      `**Ré-identifié** : un seul candidat compatible et c'est la bonne personne. **k ≤ 5** : la personne est parmi au plus 5 candidats.`,
  );
  out.push(
    table(
      ["Configuration", ...REID_VARIANTS.map((v) => `${v} : ré-id. / k≤5`), "Global : ré-id.", "k médian"],
      r.reidentification.map((l) => [
        l.label,
        ...REID_VARIANTS.map((v) => `${pct(l.byVariant[v].reidentified / Math.max(1, l.byVariant[v].n), 0)} / ${pct(l.byVariant[v].kLe5 / Math.max(1, l.byVariant[v].n), 0)}`),
        pct(l.global.reidentified / Math.max(1, l.global.n)),
        l.global.medianK,
      ]),
    ),
  );

  renderRiskResponse(out, r);

  out.push(`## 10. Analyse d'erreurs (${best?.label ?? "—"})`);
  if (best) {
    out.push(`### Données sensibles manquées (extrait, corpus manuel en premier)`);
    out.push(
      table(
        ["Prompt", "Type attendu", "Valeur", "Contexte"],
        best.missed.map((e) => [e.sample, label(e.entityType), `\`${e.value.replace(/\n/g, " ").slice(0, 40)}\``, e.excerpt.replace(/\|/g, "/")]),
        ["l", "l", "l", "l"],
      ),
    );
    out.push(`### Fausses alertes (extrait)`);
    out.push(
      table(
        ["Prompt", "Type prédit", "Texte détecté", "Contexte"],
        best.spurious.map((e) => [e.sample, label(e.entityType), `\`${e.value.replace(/\n/g, " ").slice(0, 40)}\``, e.excerpt.replace(/\|/g, "/")]),
        ["l", "l", "l", "l"],
      ),
    );
  }
  return out.join("\n\n") + "\n";
}

function renderRiskResponse(out: string[], r: FullReport): void {
  out.push(`## 9. Réponse du scoring au risque de ré-identification`);
  out.push(
    `L'expérience précédente mesure le masquage seul. Ici, chaque scénario passe par le pipeline de décision complet de l'agent ` +
      `(score de risque → politiques équivalentes au seed → masquage → escalade sur quasi-identifiants résiduels), pour un utilisateur ` +
      `d'une direction à risque modéré écrivant à ChatGPT. Les scénarios sont classés selon leur exposition **en clair** (attaque sur le texte original). ` +
      `L'attaquant voit ensuite ce qui sort réellement : rien si BLOCK, le texte masqué si MASK, le texte en clair si ALLOW ou WARN. ` +
      `**Facteur neutralisé** : même pipeline avec le poids du facteur « combinaison de quasi-identifiants » à 0 et les trois autres renormalisés.`,
  );
  const lines = r.riskResponse;
  if (!lines.length) return;
  out.push(
    table(
      ["Configuration", "Facteur", "Exposition en clair", "n", "Score moyen", "Facteur QI moyen", "Bandes faible/modérée/élevée/critique", "ALLOW/WARN/MASK/BLOCK", "Laissés en clair", "Ré-identifiés après passerelle"],
      lines.flatMap((l) =>
        EXPOSURES.map((e) => {
          const g = l.byExposure[e];
          return [
            l.label,
            l.variant === "facteur-actif" ? "actif" : "neutralisé",
            EXPOSURE_LABEL[e],
            g.n,
            g.meanScore,
            g.meanQiFactor,
            `${g.bands.low}/${g.bands.moderate}/${g.bands.high}/${g.bands.critical}`,
            `${g.actions.ALLOW}/${g.actions.WARN}/${g.actions.MASK}/${g.actions.BLOCK}`,
            g.n ? pct(g.passedInClear / g.n, 0) : "—",
            g.n ? pct(g.reidentifiedAfter / g.n, 0) : "—",
          ];
        }),
      ),
      ["l", "l", "l", "r", "r", "r", "r", "r", "r", "r"],
    ),
  );
  const variants = ALL_VARIANTS.filter((v) => lines.some((l) => l.byVariant[v]));
  out.push(`### Par variante de scénario (facteur actif)`);
  out.push(
    table(
      ["Configuration", ...variants.map((v) => `${v} : score moyen · ALLOW/WARN/MASK/BLOCK · ré-id. après`)],
      lines
        .filter((l) => l.variant === "facteur-actif")
        .map((l) => [
          l.label,
          ...variants.map((v) => {
            const g = l.byVariant[v];
            if (!g) return "—";
            return `${g.meanScore} · ${g.actions.ALLOW}/${g.actions.WARN}/${g.actions.MASK}/${g.actions.BLOCK} · ${pct(g.reidentifiedAfter / Math.max(1, g.n), 0)}`;
          }),
        ]),
    ),
  );
}
