import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, getToken, logoutSession, type AuthUser } from "./api";
import { ConfirmModal } from "./confirm-modal";
import { DutyHeader, OperatorDock } from "./header";

const NAV = [
  {
    label: "Pilotage",
    items: [
      { href: "/", label: "Tableau de bord", icon: "dashboard" },
      { href: "/events", label: "Journal", icon: "journal" },
      { href: "/users", label: "Utilisateurs", icon: "users" },
    ],
  },
  {
    label: "Règles",
    items: [
      { href: "/policies", label: "Politiques", icon: "policies" },
      { href: "/services", label: "Services IA", icon: "services" },
    ],
  },
  {
    label: "Poste",
    items: [
      { href: "/agents", label: "Agents", icon: "agents" },
      { href: "/inspect", label: "Inspection", icon: "inspect" },
      { href: "/profil", label: "Profil", icon: "profile" },
    ],
  },
] as const;

type NavIconName = (typeof NAV)[number]["items"][number]["icon"];

function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      {name === "dashboard" ? (
        <path
          d="M4 4h7v9H4V4Zm9 0h7v5h-7V4ZM4 16h7v4H4v-4Zm9-4h7v8h-7v-8Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      ) : null}
      {name === "journal" ? (
        <path
          d="M7 4h9a2 2 0 0 1 2 2v13l-2.2-1.4L14 19l-1.8-1.4L10 19l-1.8-1.4L6 19V6a2 2 0 0 1 2-2ZM9 8h6M9 12h6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {name === "users" ? (
        <path
          d="M16 19v-1.2A3.8 3.8 0 0 0 12.2 14H7.8A3.8 3.8 0 0 0 4 17.8V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 19v-1a3 3 0 0 0-2.2-2.9M15.5 4.2a3 3 0 0 1 0 5.6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {name === "policies" ? (
        <path
          d="M12 3 5 6.2v5.2c0 4.4 3 7.6 7 8.6 4-1 7-4.2 7-8.6V6.2L12 3Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      ) : null}
      {name === "services" ? (
        <path
          d="M12 4.5 13.2 8H17l-3 2.3L15.2 14 12 11.8 8.8 14 10 10.3 7 8h3.8L12 4.5ZM5 18h14"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {name === "agents" ? (
        <path
          d="M4 5h16v11H4V5Zm3 16h10M12 16v5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {name === "inspect" ? (
        <path
          d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15ZM16 16l5 5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      ) : null}
      {name === "profile" ? (
        <path
          d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4ZM4 20a8 8 0 0 1 16 0"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}

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

  useEffect(() => {
    if (!getToken()) {
      navigate("/login");
      return;
    }
    void api<AuthUser>("/v1/auth/me").then(setUser).catch(() => navigate("/login"));
  }, [navigate]);

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
        Ouverture de la salle de contrôle…
      </div>
    );
  }

  return (
    <div className="app-frame">
      <DutyHeader />
      <div className={`app-body${folded ? " is-folded" : ""}`}>
        <aside className="app-aside" id="app-aside">
          <button
            type="button"
            className="aside-fold"
            onClick={toggleAside}
            aria-expanded={!folded}
            aria-controls="app-aside"
            aria-label={folded ? "Déplier le menu" : "Replier le menu"}
            title={folded ? "Déplier le menu" : "Replier le menu"}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              {folded ? (
                <path
                  d="M8 6l6 6-6 6M15 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <path
                  d="M16 6l-6 6 6 6M9 6l-6 6 6 6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
          </button>
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
        <main className="app-main">
          <Outlet />
        </main>
      </div>

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
