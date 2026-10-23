import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { api, type AuthUser } from "./api";
import { findNav } from "./nav";
import type { Theme } from "./theme";
import type { AnalyticsSummary } from "@acg/shared";

const ROLE_LABELS: Record<string, string> = {
  RSSI: "RSSI",
  DPO: "DPO",
  ADMIN: "Administration",
  USER: "Agent métier",
};

type GatewayStatus = Pick<AnalyticsSummary, "agents" | "openAlerts" | "chainIntegrity">;

/** État global de la passerelle ; null si le rôle n'a pas accès aux indicateurs. */
function useGatewayStatus() {
  const [status, setStatus] = useState<GatewayStatus | null>(null);

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

  return status;
}

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function TopBar({
  theme,
  onToggleTheme,
  onOpenSearch,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  onOpenSearch: () => void;
}) {
  const { pathname } = useLocation();
  const status = useGatewayStatus();
  const here = findNav(pathname);
  const sub = pathname.endsWith("/nouveau") ? "Nouveau" : pathname.endsWith("/modifier") ? "Modifier" : null;

  const chainOk = status?.chainIntegrity.verified ?? true;
  const alerts = status?.openAlerts ?? 0;
  const tampered = status?.agents.tampered ?? 0;
  const agentsTone =
    tampered > 0 ? "bad" : status && status.agents.online < status.agents.total ? "warn" : "ok";

  return (
    <header className="topbar">
      <nav aria-label="Fil d'Ariane">
        <ol className="crumbs">
          {here ? <li>{here.group}</li> : null}
          {here ? (
            sub ? (
              <li>
                <Link to={here.item.href}>{here.item.label}</Link>
              </li>
            ) : (
              <li aria-current="page">{here.item.label}</li>
            )
          ) : null}
          {sub ? <li aria-current="page">{sub}</li> : null}
        </ol>
      </nav>

      <button type="button" className="search-trigger" onClick={onOpenSearch}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15ZM16 16l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span>Rechercher une page, une action…</span>
        <kbd className="kbd">{IS_MAC ? "⌘ K" : "Ctrl K"}</kbd>
      </button>

      <div className="topbar-end">
        {status ? (
          <div role="status" aria-label="État de la passerelle" style={{ display: "contents" }}>
            <Link to="/events" className={`pill${chainOk ? "" : " pill-bad"}`}>
              <span className="pill-dot" aria-hidden />
              {chainOk ? "Chaîne intègre" : "Chaîne rompue"}
            </Link>
            <Link to="/agents" className={`pill${agentsTone === "ok" ? "" : ` pill-${agentsTone}`}`}>
              <span className="pill-dot" aria-hidden />
              Agents {status.agents.online}/{status.agents.total}
            </Link>
            <Link to="/events" className={`pill${alerts > 0 ? " pill-warn is-pulse" : ""}`}>
              <span className="pill-dot" aria-hidden />
              {alerts === 0 ? "Aucune alerte" : `${alerts} alerte${alerts > 1 ? "s" : ""}`}
            </Link>
          </div>
        ) : null}
        <button
          type="button"
          className="icon-ghost is-bordered"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}
          title={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
            {theme === "dark" ? (
              <path
                d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        </button>
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
      <button type="button" className="icon-ghost" onClick={onQuit} aria-label="Se déconnecter" title="Se déconnecter">
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
