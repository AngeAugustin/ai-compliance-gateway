import type { AnalyticsSummary } from "@acg/shared";

const DECISION_COLORS = {
  allow: "var(--allow)",
  warn: "var(--warn)",
  mask: "var(--mask)",
  block: "var(--block)",
} as const;

export function DecisionTimeline({
  rows,
  grain,
}: {
  rows: AnalyticsSummary["timeline"];
  grain: "hour" | "day";
}) {
  if (rows.length === 0) {
    return <p style={{ color: "var(--fog)", margin: 0 }}>Aucune interaction sur la période.</p>;
  }
  const max = Math.max(1, ...rows.map((r) => r.allow + r.warn + r.mask + r.block));
  const fmt = new Intl.DateTimeFormat("fr-BJ", {
    timeZone: "Africa/Porto-Novo",
    ...(grain === "hour" ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" }),
  });

  return (
    <div>
      <div className="timeline" role="img" aria-label="Volume des décisions dans le temps">
        {rows.map((r) => {
          const total = r.allow + r.warn + r.mask + r.block;
          return (
            <div
              key={r.bucket}
              className="timeline-col"
              title={`${fmt.format(new Date(r.bucket))} · ${total} (${r.allow} A / ${r.warn} W / ${r.mask} M / ${r.block} B)`}
            >
              <span className="timeline-fill" style={{ height: `${(total / max) * 100}%` }}>
                {r.block > 0 ? <span style={{ flex: r.block, background: DECISION_COLORS.block }} /> : null}
                {r.mask > 0 ? <span style={{ flex: r.mask, background: DECISION_COLORS.mask }} /> : null}
                {r.warn > 0 ? <span style={{ flex: r.warn, background: DECISION_COLORS.warn }} /> : null}
                {r.allow > 0 ? <span style={{ flex: r.allow, background: DECISION_COLORS.allow }} /> : null}
              </span>
            </div>
          );
        })}
      </div>
      <div className="timeline-axis font-mono">
        <span>{fmt.format(new Date(rows[0]!.bucket))}</span>
        <span>{fmt.format(new Date(rows[rows.length - 1]!.bucket))}</span>
      </div>
    </div>
  );
}

export function BandStack({ byBand }: { byBand: AnalyticsSummary["byBand"] }) {
  const parts = [
    { key: "low", label: "Faible", color: "var(--allow)" },
    { key: "moderate", label: "Modéré", color: "var(--warn)" },
    { key: "high", label: "Élevé", color: "var(--mask)" },
    { key: "critical", label: "Critique", color: "var(--block)" },
  ] as const;
  const total = parts.reduce((s, p) => s + (byBand[p.key] ?? 0), 0);
  if (total === 0) return <p style={{ color: "var(--fog)", margin: 0 }}>Pas encore de scores.</p>;

  return (
    <div>
      <div className="band-stack" role="img" aria-label="Répartition des bandes de risque">
        {parts.map((p) => {
          const n = byBand[p.key] ?? 0;
          if (n === 0) return null;
          return <span key={p.key} style={{ flex: n, background: p.color }} title={`${p.label} · ${n}`} />;
        })}
      </div>
      <ul className="legend">
        {parts.map((p) => (
          <li key={p.key}>
            <i style={{ background: p.color }} />
            {p.label}
            <b className="font-mono">{byBand[p.key] ?? 0}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RankBars({
  items,
  empty,
}: {
  items: { label: string; value: number; hint?: string }[];
  empty: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p style={{ color: "var(--fog)", margin: 0 }}>{empty}</p>;
  return (
    <ul className="rank-list">
      {items.map((item) => (
        <li key={item.label}>
          <div className="rank-head">
            <span>{item.label}</span>
            <span className="font-mono">
              {item.value}
              {item.hint ? <em> · {item.hint}</em> : null}
            </span>
          </div>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
