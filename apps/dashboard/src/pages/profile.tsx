import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, logoutSession, type AuthUser } from "../api";
import { ConfirmModal } from "../confirm-modal";
import { PageHeader, RiskBadge } from "../ui";

const ROLE_LABELS: Record<string, string> = {
  USER: "Collaborateur",
  RSSI: "RSSI",
  DPO: "DPO",
  ADMIN: "Administrateur",
};

const RISK_LABELS: Record<string, string> = {
  low: "Faible",
  moderate: "Modéré",
  high: "Élevé",
};

export function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [quitting, setQuitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api<AuthUser>("/v1/auth/me")
      .then((me) => {
        if (!cancelled) {
          setUser(me);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  if (error) {
    return (
      <div>
        <PageHeader kicker="Compte" title="Profil" lead="Identité de la session ouverte." />
        <p className="notice-err">{error}</p>
      </div>
    );
  }

  if (!user) {
    return <p style={{ color: "var(--fog)" }}>Chargement du profil…</p>;
  }

  const initials = user.displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  const risk = user.departmentRiskLevel;
  const riskLabel = risk ? (RISK_LABELS[risk] ?? risk) : null;

  return (
    <div>
      <PageHeader
        kicker="Compte"
        title="Profil"
        lead="Identité et périmètre de la session ouverte sur la passerelle."
        actions={
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmQuit(true)}>
            Se déconnecter
          </button>
        }
      />

      <div className="profile-layout">
        <section className="panel profile-card">
          <div className="profile-identity">
            <span className="profile-avatar" aria-hidden>
              {initials}
            </span>
            <div>
              <h2>{user.displayName}</h2>
              <p className="font-mono">{user.email}</p>
            </div>
          </div>

          <dl className="profile-grid">
            <div>
              <dt>Rôle</dt>
              <dd>{ROLE_LABELS[user.role] ?? user.role}</dd>
            </div>
            <div>
              <dt>Direction</dt>
              <dd>{user.department || "—"}</dd>
            </div>
            <div>
              <dt>Juridiction</dt>
              <dd className="font-mono">{user.jurisdiction || "—"}</dd>
            </div>
            <div>
              <dt>Risque direction</dt>
              <dd>
                {risk && riskLabel ? (
                  <span className="profile-risk">
                    <RiskBadge value={risk} />
                    <span>{riskLabel}</span>
                  </span>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="profile-grid-wide">
              <dt>Identifiant session</dt>
              <dd className="font-mono profile-id">{user.id}</dd>
            </div>
          </dl>
        </section>

        <aside className="panel profile-aside">
          <p className="panel-kicker font-mono">Session</p>
          <h2>Poste ouvert</h2>
          <p>
            Les jetons d&apos;accès sont courts ; un refresh maintient la session. La déconnexion révoque
            l&apos;accès côté serveur.
          </p>
          <ul className="profile-hints">
            <li>Access JWT à durée limitée</li>
            <li>Refresh opaque stocké côté serveur</li>
            <li>Révocation immédiate au logout</li>
          </ul>
        </aside>
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
