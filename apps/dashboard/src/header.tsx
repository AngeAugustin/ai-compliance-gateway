import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { api, type AuthUser } from "./api";
import type { AnalyticsSummary } from "@acg/shared";

const ROLE_LABELS: Record<string, string> = {
  RSSI: "RSSI",
  DPO: "DPO",
  ADMIN: "Administration",
  USER: "Agent métier",
};

export function GatewayMark({ size = 40 }: { size?: number }) {
  return (
    <span className="gateway-mark" style={{ width: size, height: size }} aria-hidden>
      <span className="gateway-mark-post" />
      <span className="gateway-mark-beam" />
      <span className="gateway-mark-post" />
    </span>
  );
}

export function DutyHeader() {
  const [clock, setClock] = useState(() => formatCotonou(new Date()));
  const [status, setStatus] = useState<Pick<AnalyticsSummary, "agents" | "openAlerts" | "chainIntegrity"> | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatCotonou(new Date())), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api<AnalyticsSummary>("/v1/analytics/summary");
        if (!cancelled) {
          setStatus({
            agents: data.agents,
            openAlerts: data.openAlerts,
            chainIntegrity: data.chainIntegrity,
          });
        }
      } catch {
        if (!cancelled) setStatus(null);
      }
    }
    void load();
    const id = window.setInterval(() => void load(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const chainOk = status?.chainIntegrity.verified ?? true;
  const alerts = status?.openAlerts ?? 0;
  const agentsOnline = status?.agents.online;
  const agentsTotal = status?.agents.total;
  const tampered = status?.agents.tampered ?? 0;

  return (
    <header className="duty-header">
      <div className="duty-header-inner">
        <NavLink to="/" className="duty-brand" end>
          <span className="brand-avatar" aria-hidden>
            ACG
          </span>
          <span className="duty-title">AI Compliance Gateway</span>
        </NavLink>

        <div className="duty-cluster">
          <time className="duty-clock" dateTime={new Date().toISOString()} title="Heure de Cotonou">
            {clock}
            <span>WAT · Cotonou</span>
          </time>
          <div className="duty-lamps" role="status" aria-label="État de la passerelle">
            <StatusLamp label="Chaîne" value={chainOk ? "intègre" : "rompue"} tone={chainOk ? "ok" : "bad"} />
            <StatusLamp
              label="Agents"
              value={agentsOnline == null ? "—" : `${agentsOnline}/${agentsTotal}`}
              tone={tampered > 0 ? "bad" : agentsOnline != null && agentsTotal != null && agentsOnline < agentsTotal ? "warn" : "ok"}
            />
            <StatusLamp label="Alertes" value={String(alerts)} tone={alerts > 0 ? "warn" : "ok"} pulse={alerts > 0} />
          </div>
        </div>
      </div>
    </header>
  );
}

export function OperatorDock({ user, onQuit }: { user: AuthUser; onQuit: () => void }) {
  const initials = user.displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div className="duty-operator">
      <NavLink
        to="/profil"
        className="duty-who"
        title={`Profil · ${user.displayName} · ${ROLE_LABELS[user.role] ?? user.role}`}
      >
        <span className="duty-avatar" aria-hidden>
          {initials}
        </span>
        <span>
          <strong>{user.displayName}</strong>
          <em>
            {ROLE_LABELS[user.role] ?? user.role}
            {user.department ? ` · ${user.department}` : ""}
          </em>
        </span>
      </NavLink>
      <button type="button" className="duty-quit" onClick={onQuit} aria-label="Se déconnecter" title="Se déconnecter">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

function StatusLamp({
  label,
  value,
  tone,
  pulse,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "bad";
  pulse?: boolean;
}) {
  return (
    <div className={`lamp lamp-${tone}${pulse ? " is-pulse" : ""}`}>
      <span className="lamp-glass" />
      <span>
        <span className="lamp-label">{label}</span>
        <span className="lamp-value">{value}</span>
      </span>
    </div>
  );
}

function formatCotonou(date: Date): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    timeZone: "Africa/Porto-Novo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
