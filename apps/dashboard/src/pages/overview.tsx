import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { PageHeader } from "../ui";
import { AreaTimeline, DecisionLegend, RankBars, Sparkline, fillTimeline } from "../charts";
import { ENTITY_DEFINITIONS, isEntityType, type AnalyticsSummary } from "@acg/shared";

const PERIODS = [
  { id: "24h", label: "24 h", long: "les dernières 24 heures", ms: 24 * 3600_000 },
  { id: "7d", label: "7 jours", long: "les 7 derniers jours", ms: 7 * 24 * 3600_000 },
  { id: "30d", label: "30 jours", long: "les 30 derniers jours", ms: 30 * 24 * 3600_000 },
] as const;

type PeriodId = (typeof PERIODS)[number]["id"];

/** Libellé du catalogue partagé ; rouge si la catégorie est technique ou très sensible. */
function entityView(type: string) {
  if (!isEntityType(type)) return { label: type, critical: false };
  const def = ENTITY_DEFINITIONS[type];
  return { label: def.label, critical: def.family === "technical" || def.sensitivity >= 0.9 };
}

const num = new Intl.NumberFormat("fr-FR");
const dec = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function rate(part: number, whole: number) {
  return whole ? (part / whole) * 100 : 0;
}

function signed(value: number, unit: string, digits = 1) {
  const abs = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(Math.abs(value));
  if (abs === "0") return "=";
  return `${value > 0 ? "+" : "−"}${abs}${unit ? ` ${unit}` : ""}`;
}

type Delta = { text: string; tone: "good" | "bad" | "flat" } | null;

/** Hausse = mauvais signe pour les taux et le risque ; neutre pour le volume. */
function delta(current: number, previous: number | null, unit: string, mode: "relative" | "absolute", higherIsBad: boolean): Delta {
  if (previous == null) return null;
  const diff = mode === "relative" ? (previous ? ((current - previous) / previous) * 100 : null) : current - previous;
  if (diff == null) return null;
  const text = signed(diff, unit, mode === "relative" ? 0 : 1);
  if (Math.abs(diff) < 0.05 || !higherIsBad) return { text, tone: "flat" };
  return { text, tone: diff > 0 ? "bad" : "good" };
}

/**
 * Score indicatif de posture (0–100) : on part de 100 et on retire des points
 * pour chaque signal qui affaiblit la preuve ou la couverture.
 */
function postureScore(d: AnalyticsSummary) {
  const offline = Math.max(0, d.agents.total - d.agents.online - d.agents.tampered);
  let score = 100;
  if (!d.chainIntegrity.verified) score -= 40;
  score -= Math.min(30, d.agents.tampered * 15);
  if (d.agents.total > 0) score -= Math.round((20 * offline) / d.agents.total);
  score -= Math.min(15, d.openAlerts * 3);
  if (d.totals.interactions > 0) score -= Math.round((10 * d.totals.degraded) / d.totals.interactions);
  return Math.max(0, Math.min(100, score));
}

const SCORE_RULE =
  "Indicatif : 100 − 40 si la chaîne est rompue − 15 par agent altéré (max 30) − 20 × part d'agents hors ligne − 3 par alerte ouverte (max 15) − 10 × part d'analyses en mode dégradé.";

type Todo = { id: string; tone: "bad" | "warn" | "info"; title: string; detail: string; action: string; to: string };

function todosFor(d: AnalyticsSummary): Todo[] {
  const list: Todo[] = [];
  const offline = Math.max(0, d.agents.total - d.agents.online - d.agents.tampered);
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
  if (!d.chainIntegrity.verified) {
    list.push({
      id: "chain",
      tone: "bad",
      title: "Chaîne de preuve rompue",
      detail:
        d.chainIntegrity.firstBrokenSequence != null
          ? `Première rupture à la séquence ${d.chainIntegrity.firstBrokenSequence}`
          : "Une empreinte ne correspond plus",
      action: "Vérifier",
      to: "/events",
    });
  }
  if (d.agents.tampered > 0) {
    list.push({
      id: "tampered",
      tone: "bad",
      title: d.agents.tampered > 1 ? "Agents altérés" : "Agent altéré",
      detail: `${plural(d.agents.tampered, "poste")} avec une intégrité invalide`,
      action: "Voir",
      to: "/agents",
    });
  }
  if (d.openAlerts > 0) {
    list.push({
      id: "alerts",
      tone: "warn",
      title: d.openAlerts > 1 ? "Alertes ouvertes" : "Alerte ouverte",
      detail: `${plural(d.openAlerts, "alerte")} non acquittée${d.openAlerts > 1 ? "s" : ""}`,
      action: "Examiner",
      to: "/events",
    });
  }
  if (offline > 0) {
    list.push({
      id: "offline",
      tone: "warn",
      title: offline > 1 ? "Agents silencieux" : "Agent silencieux",
      detail: `${plural(offline, "poste")} sans heartbeat récent`,
      action: "Voir",
      to: "/agents",
    });
  }
  if (d.totals.degraded > 0) {
    list.push({
      id: "degraded",
      tone: "info",
      title: "Mode dégradé",
      detail: `${plural(d.totals.degraded, "analyse")} sans couche NER · règles et mots-clés seuls`,
      action: "Voir",
      to: "/events",
    });
  }
  return list;
}

export function OverviewPage() {
  const [period, setPeriod] = useState<PeriodId>("7d");
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [previous, setPrevious] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const spec = PERIODS.find((p) => p.id === period)!;
  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - spec.ms);
    const prevFrom = new Date(from.getTime() - spec.ms);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      prevFrom: prevFrom.toISOString(),
      grain: spec.ms > 48 * 3600_000 ? "day" : "hour",
    } as const;
  }, [spec.ms]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const summary = await api<AnalyticsSummary>(
          `/v1/analytics/summary?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
        );
        if (!cancelled) {
          setData(summary);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    void load();
    const id = window.setInterval(() => void load(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [range.from, range.to]);

  useEffect(() => {
    let cancelled = false;
    setPrevious(null);
    void api<AnalyticsSummary>(
      `/v1/analytics/summary?from=${encodeURIComponent(range.prevFrom)}&to=${encodeURIComponent(range.from)}`,
    )
      .then((summary) => {
        if (!cancelled) setPrevious(summary);
      })
      .catch(() => {
        /* les variations restent masquées */
      });
    return () => {
      cancelled = true;
    };
  }, [range.prevFrom, range.from]);

  const points = useMemo(
    () => (data ? fillTimeline(data.timeline, data.period.from, data.period.to, range.grain) : []),
    [data, range.grain],
  );

  const header = (
    <PageHeader
      title="Tableau de bord"
      lead={`Volume, décisions et points de tension sur ${spec.long}. Catégories uniquement, jamais le contenu des prompts.`}
      actions={
        <>
          <div className="seg" role="group" aria-label="Période">
            {PERIODS.map((p) => (
              <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!data}
            onClick={() => data && exportComplianceCsv(data, spec.label)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Exporter le rapport
          </button>
        </>
      }
    />
  );

  if (error) {
    return (
      <div>
        {header}
        <p className="notice-err">{error.includes("Rôle") || error.includes("Forbidden") ? "Réservé au RSSI, au DPO et à l'administration." : error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="dash" aria-busy="true">
        {header}
        <div className="skeleton" style={{ height: 150 }} />
        <div className="kpi-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 118 }} />
          ))}
        </div>
        <div className="skeleton" style={{ height: 340 }} />
        <span className="sr-only">Chargement des indicateurs…</span>
      </div>
    );
  }

  const t = data.totals;
  const p = previous && previous.totals.interactions > 0 ? previous.totals : null;
  const blockRate = rate(t.block, t.interactions);
  const maskRate = rate(t.mask, t.interactions);
  const score = postureScore(data);
  const scoreColor = score >= 85 ? "var(--seal)" : score >= 60 ? "var(--warn)" : "var(--block)";
  const todos = todosFor(data);
  const circ = 2 * Math.PI * 44;

  const verdict = !data.chainIntegrity.verified
    ? "La chaîne de preuve est rompue : le journal doit être vérifié."
    : data.agents.tampered > 0
      ? "Un agent altéré exige une intervention."
      : t.interactions === 0
        ? `Aucune interaction sur ${spec.long}.`
        : `Passerelle opérationnelle : ${num.format(t.block)} envoi${t.block > 1 ? "s" : ""} bloqué${t.block > 1 ? "s" : ""} et ${num.format(t.mask)} masqué${t.mask > 1 ? "s" : ""} sur ${spec.long}.`;

  const kpis = [
    {
      label: "Interactions",
      value: num.format(t.interactions),
      sub: `sur ${spec.label}`,
      delta: delta(t.interactions, p?.interactions ?? null, "%", "relative", false),
      spark: points.map((x) => x.allow + x.warn + x.mask + x.block),
      color: "var(--seal)",
    },
    {
      label: "Taux de blocage",
      value: `${dec.format(blockRate)} %`,
      sub: `${num.format(t.block)} BLOCK`,
      delta: delta(blockRate, p ? rate(p.block, p.interactions) : null, "pt", "absolute", true),
      spark: points.map((x) => rate(x.block, x.allow + x.warn + x.mask + x.block)),
      color: "var(--block)",
    },
    {
      label: "Taux de masquage",
      value: `${dec.format(maskRate)} %`,
      sub: `${num.format(t.mask)} MASK · prompts jetonnés`,
      delta: delta(maskRate, p ? rate(p.mask, p.interactions) : null, "pt", "absolute", true),
      spark: points.map((x) => rate(x.mask, x.allow + x.warn + x.mask + x.block)),
      color: "var(--mask)",
    },
    {
      label: "Risque moyen",
      value: `${num.format(Math.round(t.averageRiskScore))} / 100`,
      sub: t.p95ProcessingTimeMs != null ? `P95 analyse : ${num.format(t.p95ProcessingTimeMs)} ms` : "Score agrégé",
      delta: delta(t.averageRiskScore, p?.averageRiskScore ?? null, "", "absolute", true),
      spark: null,
      color: "var(--warn)",
    },
  ];

  const departments = data.byDepartment.slice(0, 8);
  const deptMax = {
    count: Math.max(1, ...departments.map((d) => d.count)),
    block: Math.max(0.1, ...departments.map((d) => rate(d.blocked, d.count))),
    risk: Math.max(1, ...departments.map((d) => d.avgRisk)),
  };
  const heat = (value: number, max: number, color: string) => {
    const strength = Math.round(8 + 64 * (value / max));
    return {
      background: `color-mix(in srgb, ${color} ${strength}%, transparent)`,
      color: strength > 48 ? "var(--paper)" : "var(--ink)",
    };
  };

  const serviceTotal = data.byService.reduce((s, x) => s + x.count, 0);
  const serviceMax = Math.max(1, ...data.byService.map((s) => s.count));

  return (
    <div className="dash">
      {header}

      <section className="posture" aria-label="Posture de conformité">
        <div className="posture-main">
          <div className="score-ring" title={SCORE_RULE}>
            <svg width="104" height="104" viewBox="0 0 104 104" role="img" aria-label={`Score de posture : ${score} sur 100`}>
              <circle cx="52" cy="52" r="44" fill="none" stroke="var(--sunk)" strokeWidth="8" />
              <circle
                cx="52"
                cy="52"
                r="44"
                fill="none"
                stroke={scoreColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${((score / 100) * circ).toFixed(1)} ${circ.toFixed(1)}`}
                transform="rotate(-90 52 52)"
              />
            </svg>
            <div className="score-ring-value" aria-hidden>
              <strong>{score}</strong>
              <span>/ 100</span>
            </div>
          </div>
          <div>
            <p className="posture-kicker">Posture de conformité</p>
            <p className="posture-verdict">{verdict}</p>
            <p className="posture-sub">
              {todos.length === 0
                ? "Rien à traiter pour le moment."
                : `${todos.length} point${todos.length > 1 ? "s demandent" : " demande"} votre attention.`}
            </p>
          </div>
        </div>
        <dl className="posture-facts">
          <div>
            <dt>Chaîne de preuve</dt>
            <dd>
              <span className="pill-dot" aria-hidden style={{ background: data.chainIntegrity.verified ? "var(--allow)" : "var(--block)" }} />
              {data.chainIntegrity.verified ? "Intègre" : "Rompue"}
            </dd>
            <dd>{num.format(data.chainIntegrity.checkedEvents)} derniers événements vérifiés</dd>
          </div>
          <div>
            <dt>Couverture agents</dt>
            <dd className="tabular">
              {data.agents.online} / {data.agents.total} en ligne
            </dd>
            <dd>
              {data.agents.missing} silencieux · {data.agents.tampered} altéré{data.agents.tampered > 1 ? "s" : ""}
            </dd>
          </div>
          <div>
            <dt>Référentiel actif</dt>
            <dd>{data.activeFramework ?? "Aucun"}</dd>
            <dd>Cadre réglementaire appliqué</dd>
          </div>
        </dl>
      </section>

      <section className="kpi-grid" aria-label="Indicateurs clés">
        {kpis.map((k) => (
          <Link key={k.label} to="/events" className="kpi-card">
            <span className="kpi-card-head">
              <span className="kpi-label">{k.label}</span>
              {k.delta ? (
                <span className={`delta delta-${k.delta.tone}`} title="Par rapport à la période précédente">
                  {k.delta.text}
                </span>
              ) : null}
            </span>
            <span className="kpi-card-body">
              <span>
                <span className="kpi-figure">{k.value}</span>
                <span className="kpi-sub">{k.sub}</span>
              </span>
              {k.spark ? <Sparkline values={k.spark} color={k.color} /> : null}
            </span>
          </Link>
        ))}
      </section>

      <div className="dash-row">
        <section className="card dash-wide" aria-label="Décisions dans le temps">
          <div className="card-head">
            <div>
              <h2>{range.grain === "hour" ? "Décisions par heure" : "Décisions par jour"}</h2>
              <p>
                {num.format(t.interactions)} interactions · {num.format(t.mask)} masquées · {num.format(t.warn)} averties ·{" "}
                {num.format(t.block)} bloquées
              </p>
            </div>
            <DecisionLegend />
          </div>
          <AreaTimeline points={points} grain={range.grain} />
        </section>

        <section className="card dash-narrow" aria-label="À traiter">
          <div className="card-head">
            <h2>À traiter</h2>
            <span className="tag">{todos.length}</span>
          </div>
          {todos.length === 0 ? (
            <p className="todo-clear">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 12.5 10 17l9-10" stroke="var(--allow)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Aucun point ouvert : agents, chaîne et alertes sont au vert.
            </p>
          ) : (
            <ul className="todo-list">
              {todos.map((todo) => (
                <li key={todo.id} className={`todo-${todo.tone}`}>
                  <span className="todo-icon" aria-hidden>
                    <TodoIcon tone={todo.tone} />
                  </span>
                  <span className="todo-copy">
                    <strong>{todo.title}</strong>
                    <span>{todo.detail}</span>
                  </span>
                  <Link to={todo.to} className="todo-action">
                    {todo.action}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="/events" className="card-link">
            Ouvrir le journal →
          </Link>
        </section>
      </div>

      <div className="dash-grid">
        <section className="card" aria-label="Données détectées">
          <div className="card-head">
            <div>
              <h2>Données détectées</h2>
              <p>Catégories, jamais les valeurs</p>
            </div>
          </div>
          <RankBars
            empty="Aucune entité détectée."
            items={data.topEntities.slice(0, 7).map((e) => {
              const view = entityView(e.entityType);
              return { label: view.label, value: e.count, color: view.critical ? "var(--block)" : undefined };
            })}
          />
        </section>

        <section className="card" aria-label="Directions">
          <div className="card-head">
            <div>
              <h2>Par direction</h2>
              <p>Plus la case est foncée, plus la valeur est élevée</p>
            </div>
          </div>
          {departments.length === 0 ? (
            <p className="card-empty">Pas encore d'interactions métier.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="heat-table">
                <thead>
                  <tr>
                    <th scope="col">Direction</th>
                    <th scope="col">Volume</th>
                    <th scope="col" style={{ color: "var(--block)" }}>
                      Blocages
                    </th>
                    <th scope="col" style={{ color: "var(--warn)" }}>
                      Risque moy.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((d) => {
                    const blocked = rate(d.blocked, d.count);
                    return (
                      <tr key={d.department}>
                        <th scope="row" title={d.department}>
                          {d.department}
                        </th>
                        <td style={heat(d.count, deptMax.count, "var(--seal)")}>{num.format(d.count)}</td>
                        <td style={heat(blocked, deptMax.block, "var(--block)")}>{dec.format(blocked)} %</td>
                        <td style={heat(d.avgRisk, deptMax.risk, "var(--warn)")}>{num.format(Math.round(d.avgRisk))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {data.byDepartment.length > departments.length ? (
                <p className="card-empty" style={{ fontSize: 12, marginTop: 6 }}>
                  + {data.byDepartment.length - departments.length} autres directions dans le rapport exporté
                </p>
              ) : null}
            </div>
          )}
        </section>

        <section className="card" aria-label="Services IA">
          <div className="card-head">
            <div>
              <h2>Services IA visés</h2>
              <p>Part du trafic et lieu d'hébergement</p>
            </div>
          </div>
          {data.byService.length === 0 ? (
            <p className="card-empty">Aucun service sur la période.</p>
          ) : (
            <ul className="svc-list">
              {data.byService.slice(0, 6).map((s) => (
                <li key={`${s.aiServiceId}-${s.hostingRegion ?? ""}`}>
                  <span className="svc-badge" aria-hidden>
                    {s.aiServiceId.replace(/[^a-z0-9]/gi, "").slice(0, 2)}
                  </span>
                  <span className="svc-main">
                    <span>
                      <b>{s.aiServiceId}</b>
                      <em>{Math.round(rate(s.count, serviceTotal))} %</em>
                    </span>
                    <span className="thin-track">
                      <span style={{ width: `${(s.count / serviceMax) * 100}%` }} />
                    </span>
                  </span>
                  <span className={`tag${s.crossBorder ? " tag-warn" : ""}`}>
                    {s.hostingRegion ?? "?"}
                    {s.crossBorder ? " · hors BJ" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="dash-foot">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 11V8a6 6 0 1 1 12 0v3M5 11h14v10H5V11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Indicateurs agrégés par catégorie. Aucun contenu de prompt n'est stocké ni affiché.
      </p>
    </div>
  );
}

function TodoIcon({ tone }: { tone: Todo["tone"] }) {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d={
          tone === "bad"
            ? "M12 3 5 6.2v5.2c0 4.4 3 7.6 7 8.6 4-1 7-4.2 7-8.6V6.2L12 3ZM12 9v4M12 16h.01"
            : tone === "warn"
              ? "M12 4 2.5 20h19L12 4ZM12 10v4M12 17h.01"
              : "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        }
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function exportComplianceCsv(data: AnalyticsSummary, periodLabel: string) {
  const lines: string[] = [
    "rapport,Passerelle IA — indicateurs de conformité",
    `cadre,${data.activeFramework ?? ""}`,
    `periode,${periodLabel}`,
    `du,${data.period.from}`,
    `au,${data.period.to}`,
    `chaine_integre,${data.chainIntegrity.verified ? "oui" : "non"}`,
    `score_posture,${postureScore(data)}`,
    "",
    "indicateur,valeur",
    `interactions,${data.totals.interactions}`,
    `allow,${data.totals.allow}`,
    `warn,${data.totals.warn}`,
    `mask,${data.totals.mask}`,
    `block,${data.totals.block}`,
    `degrade,${data.totals.degraded}`,
    `risque_moyen,${data.totals.averageRiskScore}`,
    `p95_ms,${data.totals.p95ProcessingTimeMs ?? ""}`,
    `alertes_ouvertes,${data.openAlerts}`,
    "",
    "direction,volume,blocages,risque_moyen",
    ...data.byDepartment.map((d) => `${csv(d.department)},${d.count},${d.blocked},${d.avgRisk}`),
    "",
    "service,region,volume,transfrontalier",
    ...data.byService.map((s) => `${csv(s.aiServiceId)},${csv(s.hostingRegion ?? "")},${s.count},${s.crossBorder ? "oui" : "non"}`),
    "",
    "entite,volume",
    ...data.topEntities.map((e) => `${csv(e.entityType)},${e.count}`),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `acg-conformite-${data.period.from.slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csv(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}
