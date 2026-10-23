import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, getToken, logoutSession, type AuthUser } from "./api";
import { CommandPalette } from "./command-palette";
import { ConfirmModal } from "./confirm-modal";
import { OperatorDock, TopBar } from "./header";
import { NAV, NavIcon } from "./nav";
import { useTheme } from "./theme";

const ASIDE_KEY = "acg_aside";

function readFolded() {
  try {
    return localStorage.getItem(ASIDE_KEY) === "folded";
  } catch {
    return false;
  }
}

export function Shell() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [folded, setFolded] = useState(readFolded);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    if (!getToken()) {
      navigate("/login");
      return;
    }
    void api<AuthUser>("/v1/auth/me").then(setUser).catch(() => navigate("/login"));
  }, [navigate]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleAside() {
    setFolded((current) => {
      const next = !current;
      try {
        localStorage.setItem(ASIDE_KEY, next ? "folded" : "open");
      } catch {
        /* quota / private mode */
      }
      return next;
    });
  }

  async function confirmLogout() {
    setQuitting(true);
    try {
      await logoutSession();
      navigate("/login");
    } finally {
      setQuitting(false);
      setConfirmQuit(false);
    }
  }

  if (!user) {
    return (
      <div className="boot-screen">
        Ouverture de la console…
      </div>
    );
  }

  return (
    <div className={`app-frame${folded ? " is-folded" : ""}`}>
      <aside className="app-aside" id="app-aside">
        <div className="aside-head">
          <NavLink to="/" end className="brand" aria-label="AI Compliance Gateway — Tableau de bord">
            <span className="brand-mark" aria-hidden>
              ACG
            </span>
            <span className="brand-text">
              <strong>AI Compliance Gateway</strong>
              <span>Console de conformité</span>
            </span>
          </NavLink>
          <button
            type="button"
            className="icon-ghost aside-fold"
            onClick={toggleAside}
            aria-expanded={!folded}
            aria-controls="app-aside"
            aria-label={folded ? "Déplier le menu" : "Replier le menu"}
            title={folded ? "Déplier le menu" : "Replier le menu"}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d={folded ? "M4 5h16v14H4V5Zm5 0v14M13 10l2 2-2 2" : "M4 5h16v14H4V5Zm5 0v14M15 10l-2 2 2 2"}
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <nav className="app-nav" aria-label="Navigation principale">
          {NAV.map((group) => (
            <div key={group.label} className="nav-group">
              <p className="nav-label">{group.label}</p>
              {group.items.map((item) => (
                <NavLink key={item.href} to={item.href} end={item.href === "/"} title={item.label} aria-label={item.label}>
                  <NavIcon name={item.icon} />
                  <span className="nav-text">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <OperatorDock user={user} onQuit={() => setConfirmQuit(true)} />
      </aside>

      <div className="app-column">
        <TopBar theme={theme} onToggleTheme={toggleTheme} onOpenSearch={() => setSearchOpen(true)} />
        <main className="app-main">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} onToggleTheme={toggleTheme} />
      <ConfirmModal
        open={confirmQuit}
        title="Se déconnecter ?"
        description="La session sera révoquée sur le serveur. Vous devrez vous authentifier à nouveau pour rouvrir le poste."
        confirmLabel="Se déconnecter"
        cancelLabel="Rester connecté"
        danger
        busy={quitting}
        onConfirm={() => void confirmLogout()}
        onCancel={() => !quitting && setConfirmQuit(false)}
      />
    </div>
  );
}
