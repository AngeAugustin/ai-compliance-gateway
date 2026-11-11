/**
 * Dépouillement de l'évaluation d'utilisabilité — `pnpm eval:utilisabilite`.
 * Lit docs/evaluation/utilisabilite/reponses-sus.csv et taches.csv (protocole : protocole.md),
 * écrit docs/evaluation/resultats/utilisabilite.md et .json.
 * `--exemple` calcule sur des données inventées pour vérifier le script, sans rien écrire.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve("docs/evaluation/utilisabilite");
const OUT = resolve("docs/evaluation/resultats");

export interface SusRow {
  participant: string;
  role: string;
  answers: number[];
}
export interface TaskRow {
  participant: string;
  role: string;
  task: string;
  success: number;
  seconds: number;
  errors: number;
}

/** Score SUS (Brooke 1996) : impairs → r − 1, pairs → 5 − r, somme × 2,5. */
export function susScore(answers: number[]): number {
  if (answers.length !== 10 || answers.some((a) => !Number.isInteger(a) || a < 1 || a > 5)) {
    throw new Error(`10 réponses entières de 1 à 5 attendues, reçu : ${answers.join(",")}`);
  }
  return answers.reduce((s, a, i) => s + (i % 2 === 0 ? a - 1 : 5 - a), 0) * 2.5;
}

/** Quantile 0,975 de la loi de Student (petits échantillons). */
function t975(df: number): number {
  const table = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086];
  return df >= 1 && df <= table.length ? table[df - 1]! : 1.96;
}

export function meanCi(xs: number[]): { mean: number; sd: number; low: number; high: number } {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const half = n > 1 ? (t975(n - 1) * sd) / Math.sqrt(n) : 0;
  // Le SUS est borné : l'intervalle est ramené dans [0 ; 100].
  return { mean, sd, low: Math.max(0, mean - half), high: Math.min(100, mean + half) };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Lecture selon Bangor, Kortum et Miller (2009). */
export function susLabel(score: number): string {
  if (score < 51) return "médiocre";
  if (score < 68) return "passable";
  if (score < 80.3) return "bon";
  return "excellent";
}

function readCsv(path: string): Record<string, string>[] {
  const [head, ...lines] = readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!head) return [];
  const cols = head.split(/[;,]/).map((c) => c.trim());
  return lines.map((l) => {
    const cells = l.split(/[;,](?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""]));
  });
}

const num = (s: string) => Number(s.replace(",", "."));

export function analyse(sus: SusRow[], tasks: TaskRow[]) {
  const scores = sus.map((r) => ({ ...r, score: susScore(r.answers) }));
  const global = scores.length ? meanCi(scores.map((s) => s.score)) : null;
  const roles = [...new Set(scores.map((s) => s.role))].map((role) => {
    const xs = scores.filter((s) => s.role === role).map((s) => s.score);
    return { role, n: xs.length, mean: xs.reduce((a, b) => a + b, 0) / xs.length };
  });
  const taskIds = [...new Set(tasks.map((t) => t.task))].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  const perTask = taskIds.map((task) => {
    const rows = tasks.filter((t) => t.task === task);
    return {
      task,
      n: rows.length,
      success: rows.reduce((s, r) => s + r.success, 0) / rows.length,
      medianSeconds: median(rows.map((r) => r.seconds)),
      meanErrors: rows.reduce((s, r) => s + r.errors, 0) / rows.length,
    };
  });
  return { scores, global, roles, perTask };
}

function report(a: ReturnType<typeof analyse>): string {
  const f = (x: number, d = 1) => x.toFixed(d).replace(".", ",");
  const lines = [
    `# Utilisabilité du tableau de bord`,
    `Date : ${new Date().toISOString().slice(0, 10)} · protocole : [protocole.md](../utilisabilite/protocole.md) · ${a.scores.length} participant(s).`,
    `## SUS`,
  ];
  if (a.global) {
    lines.push(
      `Score moyen **${f(a.global.mean)}** / 100 (${susLabel(a.global.mean)}), écart-type ${f(a.global.sd)}, IC 95 % [${f(a.global.low)} ; ${f(a.global.high)}]. Référence : 68 = moyenne des études publiées.`,
      `| Participant | Rôle | Score |`,
      `| :--- | :--- | ---: |`,
      ...a.scores.map((s) => `| ${s.participant} | ${s.role} | ${f(s.score)} |`),
      `### Par rôle`,
      `| Rôle | Participants | SUS moyen |`,
      `| :--- | ---: | ---: |`,
      ...a.roles.map((r) => `| ${r.role} | ${r.n} | ${f(r.mean)} |`),
    );
  } else lines.push(`Aucune réponse.`);
  lines.push(
    `## Tâches`,
    `| Tâche | Participants | Réussite | Temps médian | Erreurs moyennes |`,
    `| :--- | ---: | ---: | ---: | ---: |`,
    ...a.perTask.map((t) => `| ${t.task} | ${t.n} | ${f(100 * t.success, 0)} % | ${Math.round(t.medianSeconds)} s | ${f(t.meanErrors)} |`),
    `## Lecture`,
    `- Réussite : 1 sans aide, 0,5 avec un indice, 0 échec ; moyenne par tâche.`,
    `- Avec moins de 8 participants l'intervalle de confiance du SUS est large : comparer à 68 seulement si l'intervalle ne le contient pas.`,
  );
  return lines.reduce((md, line, i, all) => md + (i === 0 ? "" : (line.startsWith("|") && all[i - 1]!.startsWith("|")) || (line.startsWith("- ") && all[i - 1]!.startsWith("- ")) ?"\n" : "\n\n") + line, "") + "\n";
}

function exemple(): { sus: SusRow[]; tasks: TaskRow[] } {
  const sus: SusRow[] = [
    { participant: "P1", role: "RSSI", answers: [4, 2, 4, 2, 4, 1, 4, 2, 4, 2] },
    { participant: "P2", role: "DPO", answers: [3, 2, 4, 3, 4, 2, 4, 2, 3, 3] },
    { participant: "P3", role: "Métier", answers: [3, 3, 3, 4, 3, 2, 3, 3, 3, 4] },
  ];
  const tasks: TaskRow[] = sus.flatMap((p, k) =>
    ["1", "2", "3"].map((task, i) => ({ participant: p.participant, role: p.role, task, success: (k + i) % 3 === 2 ? 0.5 : 1, seconds: 40 + 30 * i + 15 * k, errors: k })),
  );
  return { sus, tasks };
}

function main() {
  if (process.argv.includes("--exemple")) {
    const { sus, tasks } = exemple();
    process.stdout.write(report(analyse(sus, tasks)));
    return;
  }
  const susPath = join(DIR, "reponses-sus.csv");
  const taskPath = join(DIR, "taches.csv");
  if (!existsSync(susPath) || !existsSync(taskPath)) throw new Error(`fichiers attendus : ${susPath}, ${taskPath}`);
  const sus: SusRow[] = readCsv(susPath).map((r) => ({
    participant: r.participant!,
    role: r.role!,
    answers: Array.from({ length: 10 }, (_, i) => num(r[`q${i + 1}`] ?? "")),
  }));
  const tasks: TaskRow[] = readCsv(taskPath).map((r) => ({
    participant: r.participant!,
    role: r.role!,
    task: r.tache!,
    success: num(r.reussite ?? "0"),
    seconds: num(r.temps_s ?? "0"),
    errors: num(r.erreurs ?? "0"),
  }));
  if (sus.length === 0) {
    console.log("[utilisabilité] aucune réponse dans reponses-sus.csv : faites passer les séances (protocole.md), ou --exemple pour tester le script.");
    return;
  }
  const a = analyse(sus, tasks);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "utilisabilite.md"), report(a), "utf8");
  writeFileSync(join(OUT, "utilisabilite.json"), JSON.stringify(a, null, 2), "utf8");
  console.log(`[utilisabilité] SUS ${a.global!.mean.toFixed(1)} (${a.scores.length} participants) → ${join(OUT, "utilisabilite.md")}`);
}

if (process.argv[1] && /utilisabilite\.ts$/.test(process.argv[1])) main();
