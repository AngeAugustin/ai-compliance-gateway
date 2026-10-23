import type { AnalyticsSummary } from "@acg/shared";

export type TimelinePoint = { t: number; allow: number; warn: number; mask: number; block: number };

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/**
 * L'API ne renvoie que les tranches non vides : on recrée la série complète
 * en s'alignant sur la première tranche reçue (date_trunc côté serveur).
 */
export function fillTimeline(
  rows: AnalyticsSummary["timeline"],
  fromIso: string,
  toIso: string,
  grain: "hour" | "day",
): TimelinePoint[] {
  const step = grain === "hour" ? HOUR : DAY;
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  let start = rows.length ? Date.parse(rows[0]!.bucket) : Math.floor(to / step) * step;
  while (start > from) start -= step;

  const points: TimelinePoint[] = [];
  for (let t = start; t <= to; t += step) points.push({ t, allow: 0, warn: 0, mask: 0, block: 0 });
  for (const r of rows) {
    const point = points[Math.round((Date.parse(r.bucket) - start) / step)];
    if (point) {
      point.allow += r.allow;
      point.warn += r.warn;
      point.mask += r.mask;
      point.block += r.block;
    }
  }
  return points;
}

const W = 720;
const H = 240;
const LAYERS = [
  { key: "allow", label: "Autorisées", fill: "color-mix(in srgb, var(--allow) 30%, transparent)", stroke: "var(--allow)" },
  { key: "mask", label: "Masquées", fill: "var(--mask)", stroke: "var(--paper)" },
  { key: "warn", label: "Avertissements", fill: "var(--warn)", stroke: "var(--paper)" },
  { key: "block", label: "Bloquées", fill: "var(--block)", stroke: "var(--paper)" },
] as const;

export function DecisionLegend() {
  return (
    <ul className="legend-row">
      {LAYERS.map((l) => (
        <li key={l.key}>
          <i
            aria-hidden
            style={{ background: l.fill, border: l.key === "allow" ? "1px solid var(--allow)" : undefined }}
          />
          {l.label}
        </li>
      ))}
    </ul>
  );
}

function niceCeil(value: number) {
  if (value <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

export function AreaTimeline({ points, grain }: { points: TimelinePoint[]; grain: "hour" | "day" }) {
  const totals = points.map((p) => p.allow + p.warn + p.mask + p.block);
  if (totals.every((t) => t === 0)) {
    return <p className="card-empty">Aucune interaction sur la période.</p>;
  }

  const yTop = niceCeil(Math.max(...totals) * 1.05);
  const n = points.length;
  const x = (i: number) => (n === 1 ? W / 2 : (i * W) / (n - 1));
  const y = (v: number) => H - (v / yTop) * H;
  const fmt = new Intl.DateTimeFormat("fr-BJ", {
    timeZone: "Africa/Porto-Novo",
    ...(grain === "hour" ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }),
  });
  const num = new Intl.NumberFormat("fr-FR");

  const cum = points.map(() => 0);
  const areas = LAYERS.map((layer) => {
    const lower = cum.slice();
    points.forEach((p, i) => {
      cum[i]! += p[layer.key];
    });
    const top = points.map((_, i) => `${x(i).toFixed(1)},${y(cum[i]!).toFixed(1)}`);
    const bottom = points.map((_, i) => `${x(i).toFixed(1)},${y(lower[i]!).toFixed(1)}`).reverse();
    return { ...layer, d: `M${top.join(" L")} L${bottom.join(" L")} Z` };
  });

  const labelEvery = Math.max(1, Math.ceil(n / 7));
  const labelIdx: number[] = [];
  for (let i = 0; i < n; i += labelEvery) labelIdx.push(i);
  if (labelIdx[labelIdx.length - 1] !== n - 1) {
    if (n - 1 - labelIdx[labelIdx.length - 1]! < labelEvery * 0.6) labelIdx.pop();
    labelIdx.push(n - 1);
  }
  const labels = labelIdx.map((i) => ({ i, text: fmt.format(new Date(points[i]!.t)) }));
  const slot = n === 1 ? W : W / (n - 1);

  return (
    <div className="area-chart">
      <div className="area-chart-y" aria-hidden>
        <span>{num.format(yTop)}</span>
        <span>{num.format(yTop / 2)}</span>
        <span>0</span>
      </div>
      <div className="area-chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Décisions empilées dans le temps">
          <line x1="0" y1="0" x2={W} y2="0" stroke="var(--line)" strokeDasharray="3 4" />
          <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="var(--line)" strokeDasharray="3 4" />
          <line x1="0" y1={H} x2={W} y2={H} stroke="var(--line)" />
          {areas.map((a) => (
            <path key={a.key} d={a.d} fill={a.fill} stroke={a.stroke} strokeWidth={a.key === "allow" ? 1.5 : 1} strokeLinejoin="round" />
          ))}
          {points.map((p, i) => (
            <rect
              key={p.t}
              className="area-chart-hit"
              x={Math.max(0, x(i) - slot / 2)}
              y={0}
              width={slot}
              height={H}
              fill="transparent"
            >
              <title>
                {`${fmt.format(new Date(p.t))} — ${num.format(totals[i]!)} interactions · ${p.allow} autorisées · ${p.mask} masquées · ${p.warn} averties · ${p.block} bloquées`}
              </title>
            </rect>
          ))}
        </svg>
        <div className="area-chart-x" aria-hidden>
          {labels.map(({ i, text }) => (
            <span
              key={i}
              style={{
                left: `${(x(i) / W) * 100}%`,
                transform: `translateX(${i === 0 ? "0" : i === n - 1 ? "-100%" : "-50%"})`,
              }}
            >
              {text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pts = values.map((v, i) => [(i * 100) / (values.length - 1), 28 - ((v - min) / (max - min || 1)) * 24] as const);
  const line = `M${pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" L")}`;
  return (
    <svg className="sparkline" width="96" height="32" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden>
      <path d={`${line} L100,32 L0,32 Z`} fill={`color-mix(in srgb, ${color} 14%, transparent)`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function RankBars({
  items,
  empty,
}: {
  items: { label: string; value: number; hint?: string; color?: string }[];
  empty: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="card-empty">{empty}</p>;
  return (
    <ul className="rank-list">
      {items.map((item) => (
        <li key={item.label}>
          <div className="rank-head">
            <span>{item.label}</span>
            <span className="tabular" style={{ color: "var(--fog)" }}>
              {item.value}
              {item.hint ? <em> · {item.hint}</em> : null}
            </span>
          </div>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(item.value / max) * 100}%`, background: item.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
