import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { usePagination } from "../pagination";
import { BentoPanel, NumberedPagination, PageHeader, RiskBadge } from "../ui";
import { BandStack, DecisionTimeline, RankBars } from "../charts";
import type { AnalyticsSummary } from "@acg/shared";

const PERIODS = [
  { id: "24h", label: "24 h", ms: 24 * 3600_000 },
  { id: "7d", label: "7 jours", ms: 7 * 24 * 3600_000 },
  { id: "30d", label: "30 jours", ms: 30 * 24 * 3600_000 },
] as const;

type PeriodId = (typeof PERIODS)[number]["id"];

const ENTITY_LABELS: Record<string, string> = {
  PERSON: "Personne",
  EMAIL: "Courriel",
  PHONE: "Téléphone",
  NATIONAL_ID: "Pièce d'identité",
  CNSS_INSURED_NUMBER: "N° assuré CNSS",
  CNSS_EMPLOYER_NUMBER: "N° employeur CNSS",
  FINANCIAL_AMOUNT: "Montant",
  MOBILE_MONEY: "Mobile money",
  MEDICAL: "Donnée de santé",
  API_KEY: "Clé API",
  PASSWORD: "Mot de passe",
  SALARY: "Salaire",
  ORGANIZATION: "Organisation",
  JOB_TITLE: "Fonction",
};

export function OverviewPage() {
  const [period, setPeriod] = useState<PeriodId>("7d");
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const spec = PERIODS.find((p) => p.id === period)!;
    const to = new Date();
    const from = new Date(to.getTime() - spec.ms);
    return { from: from.toISOString(), to: to.toISOString(), grain: spec.ms > 48 * 3600_000 ? "day" : "hour" } as const;
  }, [period]);

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

  const departments = data?.byDepartment ?? [];
  const deptPager = usePagination(departments, 10, period);

  if (error) {
    return (
      <div>
        <PageHeader kicker="FR-09 · Dashboard BI" title="Tableau de bord" lead="Indicateurs agrégés, sans valeur en clair." />
        <p className="notice-err">{error.includes("Rôle") || error.includes("Forbidden") ? "Réservé au RSSI et au DPO." : error}</p>
      </div>
    );
  }
  if (!data) return <p style={{ color: "var(--fog)" }}>Chargement des indicateurs…</p>;

  const blockedPct = data.totals.interactions ? Math.round((data.totals.block / data.totals.interactions) * 100) : 0;
  const maskedPct = data.totals.interactions ? Math.round((data.totals.mask / data.totals.interactions) * 100) : 0;
  const periodLabel = PERIODS.find((p) => p.id === period)!.label;
  const avgRisk = data.totals.averageRiskScore;

  return (
    <div>
      <PageHeader
        kicker={`${data.activeFramework ?? "—"} · chaîne ${data.chainIntegrity.verified ? "intègre" : "rompue"}`}
        title="Tableau de bord"
        lead="Volume, décisions et points de tension — catégories uniquement, jamais le contenu des prompts."
        actions={
          <>
            <div className="filter-row" style={{ margin: 0 }}>
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`chip ${period === p.id ? "is-on" : ""}`}
                  onClick={() => setPeriod(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => exportComplianceCsv(data, periodLabel)}>
              Exporter le rapport
            </button>
          </>
        }
      />

      <div className="kpi-row">
        <Kpi label="Interactions" value={String(data.totals.interactions)} hint={periodLabel} />
        <Kpi label="Blocages" value={`${blockedPct} %`} hint={`${data.totals.block} BLOCK`} tone="block" />
        <Kpi label="Masquages" value={`${maskedPct} %`} hint={`${data.totals.mask} MASK`} tone="mask" />
        <KpiRisk
          value={avgRisk}
          hint={
            data.totals.p95ProcessingTimeMs != null
              ? `P95 : ${data.totals.p95ProcessingTimeMs} ms`
              : "Score agrégé"
          }
        />
        <Kpi
          label="Mode dégradé"
          value={String(data.totals.degraded)}
          hint="détection incomplète"
          tone={data.totals.degraded > 0 ? "warn" : undefined}
        />
      </div>

      <div className="metrics-grid">
        <div className="span-12">
          <BentoPanel eyebrow="Série" title={range.grain === "hour" ? "Décisions par heure" : "Décisions par jour"}>
            <DecisionTimeline rows={data.timeline} grain={range.grain} />
            <ul className="legend" style={{ marginTop: 12 }}>
              <li>
                <i style={{ background: "var(--allow)" }} /> Autorisées
              </li>
              <li>
                <i style={{ background: "var(--warn)" }} /> Averties
              </li>
              <li>
                <i style={{ background: "var(--mask)" }} /> Masquées
              </li>
              <li>
                <i style={{ background: "var(--block)" }} /> Bloquées
              </li>
            </ul>
          </BentoPanel>
        </div>

        <div className="span-6">
          <BentoPanel eyebrow="Bandes" title="Répartition du risque">
            <BandStack byBand={data.byBand} />
          </BentoPanel>
        </div>
        <div className="span-6">
          <BentoPanel eyebrow="Présence" title="Agents endpoint">
            <p className="font-mono" style={{ marginTop: 0, fontSize: 22, fontWeight: 600 }}>
              {data.agents.online}/{data.agents.total}
              <span style={{ fontSize: 13, color: "var(--fog)", fontWeight: 400 }}> en ligne</span>
            </p>
            <p style={{ color: "var(--fog)", fontSize: 13, marginBottom: 0 }}>
              {data.agents.missing} silencieux · {data.agents.tampered} altérés · {data.openAlerts} alertes ouvertes
            </p>
          </BentoPanel>
        </div>

        <div className="span-6">
          <BentoPanel eyebrow="Catalogue" title="Services IA visés">
            <RankBars
              empty="Aucun service sur la période."
              items={data.byService.map((s) => ({
                label: s.aiServiceId,
                value: s.count,
                hint: s.crossBorder ? `${s.hostingRegion ?? "?"} · hors BJ` : s.hostingRegion ?? undefined,
              }))}
            />
          </BentoPanel>
        </div>
        <div className="span-6">
          <BentoPanel eyebrow="Catégories" title="Entités les plus vues">
            <RankBars
              empty="Aucune entité détectée."
              items={data.topEntities.map((e) => ({
                label: ENTITY_LABELS[e.entityType] ?? e.entityType,
                value: e.count,
              }))}
            />
          </BentoPanel>
        </div>

        <div className="span-12">
          <BentoPanel eyebrow="Métiers" title="Par direction">
            <div className="table-panel">
              <div className="table-wrap" style={{ boxShadow: "none" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Direction</th>
                      <th>Volume</th>
                      <th>Blocages</th>
                      <th>Risque moy.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deptPager.pageItems.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ color: "var(--fog)" }}>
                          Pas encore d'interactions métier.
                        </td>
                      </tr>
                    ) : (
                      deptPager.pageItems.map((d) => (
                        <tr key={d.department}>
                          <td>{d.department}</td>
                          <td className="font-mono">{d.count}</td>
                          <td className="font-mono">{d.blocked}</td>
                          <td>
                            <RiskBadge
                              value={d.avgRisk >= 75 ? "critical" : d.avgRisk >= 50 ? "high" : d.avgRisk >= 25 ? "moderate" : "low"}
                            />
                            <span className="font-mono" style={{ marginLeft: 8 }}>
                              {d.avgRisk}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <NumberedPagination
                page={deptPager.page}
                pageCount={deptPager.pageCount}
                total={deptPager.total}
                from={deptPager.from}
                to={deptPager.to}
                onPageChange={deptPager.setPage}
              />
            </div>
          </BentoPanel>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" | "mask" | "block" }) {
  return (
    <div className="kpi">
      <div className="field-label">{label}</div>
      <div className="font-mono kpi-value" style={tone ? { color: `var(--${tone})` } : undefined}>
        {value}
      </div>
      {hint ? <div className="kpi-hint">{hint}</div> : null}
    </div>
  );
}

function riskTone(value: number): "allow" | "warn" | "mask" | "block" {
  if (value >= 75) return "block";
  if (value >= 50) return "mask";
  if (value >= 25) return "warn";
  return "allow";
}

function KpiRisk({ value, hint }: { value: number; hint?: string }) {
  const tone = riskTone(value);
  return (
    <div className="kpi">
      <div className="field-label">Risque moyen</div>
      <div className="font-mono kpi-value" style={{ color: `var(--${tone})` }}>
        {value.toFixed(0)}
        <span className="kpi-risk-denom">/100</span>
      </div>
      <div className="kpi-risk-bar" aria-hidden>
        <div className="kpi-risk-fill" style={{ width: `${Math.min(100, value)}%`, background: `var(--${tone})` }} />
      </div>
      {hint ? <div className="kpi-hint">{hint}</div> : null}
    </div>
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
