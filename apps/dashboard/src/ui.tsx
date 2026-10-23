import { pageWindow } from "./pagination";

const COLORS: Record<string, string> = {
  ALLOW: "var(--allow)",
  WARN: "var(--warn)",
  MASK: "var(--mask)",
  BLOCK: "var(--block)",
  low: "var(--allow)",
  moderate: "var(--warn)",
  high: "var(--mask)",
  critical: "var(--block)",
};

export function RiskBadge({ value }: { value: string }) {
  const color = COLORS[value] ?? "var(--fog)";
  return (
    <span
      className="stamp font-mono"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, var(--paper))`,
        border: `1px solid color-mix(in srgb, ${color} 32%, var(--line))`,
      }}
    >
      {value}
    </span>
  );
}

export function PageHeader({
  kicker,
  title,
  lead,
  actions,
}: {
  kicker?: string;
  title: string;
  lead?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {kicker ? <p className="page-kicker font-mono">{kicker}</p> : null}
        <h1>{title}</h1>
        {lead ? <p className="page-lead">{lead}</p> : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div> : null}
    </header>
  );
}

export function BentoPanel({ title, eyebrow, children }: { title: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <section className="panel" style={{ minHeight: 140 }}>
      {eyebrow ? <p className="panel-kicker font-mono">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function RiskGauge({ value }: { value: number }) {
  const color = value >= 75 ? "var(--block)" : value >= 50 ? "var(--mask)" : value >= 25 ? "var(--warn)" : "var(--allow)";
  return (
    <div>
      <div className="font-mono" style={{ fontSize: 44, color, letterSpacing: "-0.05em", fontWeight: 600, fontFamily: "Inter, system-ui, sans-serif" }}>
        {value.toFixed(0)}
        <span style={{ fontSize: 15, color: "var(--fog)", fontWeight: 500 }}>/100</span>
      </div>
      <div style={{ height: 8, background: "var(--canvas)", borderRadius: 99, overflow: "hidden", marginTop: 10 }}>
        <div style={{ width: `${Math.min(100, value)}%`, height: "100%", background: color, borderRadius: 99 }} />
      </div>
    </div>
  );
}

export function NumberedPagination({
  page,
  pageCount,
  total,
  from,
  to,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;

  const numbers = pageWindow(page, pageCount);

  return (
    <nav className="pager" aria-label="Pagination">
      <p className="pager-meta font-mono">
        {from}–{to} / {total}
      </p>
      <div className="pager-controls">
        <button
          type="button"
          className="pager-btn"
          disabled={page <= 1}
          aria-label="Page précédente"
          onClick={() => onPageChange(page - 1)}
        >
          ‹
        </button>
        {numbers.map((n, i) =>
          n === "…" ? (
            <span key={`e-${i}`} className="pager-ellipsis" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              className={`pager-btn${n === page ? " is-current" : ""}`}
              aria-label={`Page ${n}`}
              aria-current={n === page ? "page" : undefined}
              onClick={() => onPageChange(n)}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          className="pager-btn"
          disabled={page >= pageCount}
          aria-label="Page suivante"
          onClick={() => onPageChange(page + 1)}
        >
          ›
        </button>
      </div>
    </nav>
  );
}
