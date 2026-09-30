import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { USER_ROLES, type UserRole } from "@acg/shared";
import { api } from "../api";
import { ConfirmModal } from "../confirm-modal";
import {
  FormActions,
  FormPreviewAside,
  FormPreviewRow,
  FormSection,
  FormWorkflow,
  IconShield,
  IconUser,
  type FormStepDef,
} from "../form-workflow";
import { useToast } from "../toast";
import { PageHeader } from "../ui";

export type UserRecord = {
  id: string;
  email: string;
  displayName: string;
  department: string;
  role: UserRole;
  jurisdiction: string;
  isActive: boolean;
  createdAt?: string;
};

type Department = { name: string; riskHistoryLevel: string };

export const ROLE_LABELS: Record<UserRole, string> = {
  USER: "Collaborateur",
  RSSI: "RSSI",
  DPO: "DPO",
  ADMIN: "Administrateur",
};

type Draft = {
  email: string;
  displayName: string;
  department: string;
  role: UserRole;
  jurisdiction: string;
  password: string;
  isActive: boolean;
};

const EMPTY: Draft = {
  email: "",
  displayName: "",
  department: "Cotisations",
  role: "USER",
  jurisdiction: "BJ",
  password: "",
  isActive: true,
};

const STEPS: readonly FormStepDef[] = [
  { id: 1, label: "Identité", hint: "Nom, courriel et mot de passe" },
  { id: 2, label: "Affectation", hint: "Rôle et organisation" },
];

export function UserFormPage() {
  const { id } = useParams<{ id: string }>();
  const creating = !id;
  const mode = creating ? "create" : "edit";
  const navigate = useNavigate();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>({ ...EMPTY });
  const [departments, setDepartments] = useState<Department[]>([]);
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!creating);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const deps = await api<Department[]>("/v1/users/departments");
        if (cancelled) return;
        setDepartments(deps);

        if (creating) {
          setDraft({ ...EMPTY, department: deps[0]?.name ?? "Cotisations" });
          setLoading(false);
          return;
        }

        const user = await api<UserRecord>(`/v1/users/${encodeURIComponent(id!)}`);
        if (cancelled) return;
        setDraft({
          email: user.email,
          displayName: user.displayName,
          department: user.department,
          role: user.role,
          jurisdiction: user.jurisdiction,
          password: "",
          isActive: user.isActive,
        });
      } catch (err) {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : String(err));
        navigate("/users");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [creating, id, navigate, toast]);

  function validateStep1(): boolean {
    if (!draft.displayName.trim() || !draft.email.trim()) {
      setStepError("Renseignez le nom affiché et le courriel.");
      return false;
    }
    if (creating && (!draft.password || draft.password.length < 8)) {
      setStepError("Mot de passe requis (8 caractères minimum).");
      return false;
    }
    setStepError(null);
    return true;
  }

  function validateStep2(): boolean {
    if (!draft.department || !draft.role || !draft.jurisdiction.trim()) {
      setStepError("Renseignez la direction, le rôle et la juridiction.");
      return false;
    }
    setStepError(null);
    return true;
  }

  async function save() {
    setSaving(true);
    try {
      if (creating) {
        await api("/v1/users", {
          method: "POST",
          body: JSON.stringify({
            email: draft.email,
            displayName: draft.displayName,
            department: draft.department,
            role: draft.role,
            jurisdiction: draft.jurisdiction,
            password: draft.password,
            isActive: draft.isActive,
          }),
        });
        toast.success(`${draft.displayName} créé.`);
      } else {
        const payload: Record<string, unknown> = {
          email: draft.email,
          displayName: draft.displayName,
          department: draft.department,
          role: draft.role,
          jurisdiction: draft.jurisdiction,
          isActive: draft.isActive,
        };
        if (draft.password.trim()) payload.password = draft.password;
        await api(`/v1/users/${encodeURIComponent(id!)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success(`${draft.displayName} mis à jour.`);
      }
      navigate("/users");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStepError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step === 1) {
      if (!validateStep1()) return;
      setStep(2);
      return;
    }
    if (!validateStep2()) return;
    void save();
  }

  async function confirmDeactivate() {
    if (!id) return;
    setSaving(true);
    try {
      await api(`/v1/users/${encodeURIComponent(id)}`, { method: "DELETE" });
      toast.success(`${draft.displayName} désactivé.`);
      setConfirmOpen(false);
      navigate("/users");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStepError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p style={{ color: "var(--fog)" }}>Chargement du formulaire…</p>;
  }

  return (
    <div>
      <PageHeader
        kicker="Administration"
        title={creating ? "Nouvel utilisateur" : "Modifier l'utilisateur"}
        lead={
          creating
            ? "Créez le compte en deux étapes. Un aperçu se met à jour à droite."
            : "Mettez à jour le profil, le rôle ou le mot de passe."
        }
      />

      <FormWorkflow
        mode={mode}
        steps={STEPS}
        currentStep={step}
        onSubmit={handleSubmit}
        main={
          <>
            {step === 1 ? (
              <FormSection
                icon={<IconUser />}
                title="Identité du compte"
                description="Coordonnées visibles dans la salle de contrôle et utilisées pour l'authentification."
              >
                <label className="field-label" htmlFor="user-name">
                  Nom affiché
                </label>
                <input
                  id="user-name"
                  className="input"
                  required
                  value={draft.displayName}
                  onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
                />
                <label className="field-label" htmlFor="user-email">
                  Courriel
                </label>
                <input
                  id="user-email"
                  className="input"
                  type="email"
                  required
                  value={draft.email}
                  onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                />
                <label className="field-label" htmlFor="user-pass">
                  {creating ? "Mot de passe" : "Nouveau mot de passe (optionnel)"}
                </label>
                <input
                  id="user-pass"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  minLength={creating ? 8 : undefined}
                  required={creating}
                  value={draft.password}
                  onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                />
              </FormSection>
            ) : (
              <FormSection
                icon={<IconShield />}
                title="Affectation"
                description="Le rôle détermine les permissions ; la direction alimente les indicateurs métier."
              >
                <div className="wf-field-grid">
                  <div>
                    <label className="field-label" htmlFor="user-dept">
                      Direction
                    </label>
                    <select
                      id="user-dept"
                      className="input"
                      value={draft.department}
                      onChange={(e) => setDraft((d) => ({ ...d, department: e.target.value }))}
                    >
                      {departments.map((d) => (
                        <option key={d.name} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="user-role">
                      Rôle
                    </label>
                    <select
                      id="user-role"
                      className="input"
                      value={draft.role}
                      onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as UserRole }))}
                    >
                      {USER_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <label className="field-label" htmlFor="user-jur">
                  Juridiction
                </label>
                <input
                  id="user-jur"
                  className="input"
                  required
                  value={draft.jurisdiction}
                  onChange={(e) => setDraft((d) => ({ ...d, jurisdiction: e.target.value }))}
                />
                {!creating ? (
                  <label className="field-check">
                    <input
                      type="checkbox"
                      checked={draft.isActive}
                      onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
                    />
                    Compte actif
                  </label>
                ) : null}
                {!creating ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={saving}
                    onClick={() => setConfirmOpen(true)}
                    style={{ alignSelf: "flex-start", marginTop: 8 }}
                  >
                    Désactiver le compte
                  </button>
                ) : null}
              </FormSection>
            )}
            {stepError ? <p className="wf-error">{stepError}</p> : null}
            <FormActions
              saving={saving}
              step={step}
              lastStep={2}
              mode={mode}
              createLabel="Créer l'utilisateur"
              onCancel={() => navigate("/users")}
              onBack={
                step > 1
                  ? () => {
                      setStepError(null);
                      setStep(1);
                    }
                  : undefined
              }
            />
          </>
        }
        preview={
          <FormPreviewAside
            icon={<IconUser />}
            tip={
              creating
                ? "Le compte sera disponible immédiatement pour l'émission d'un jeton d'agent."
                : "Les changements de rôle s'appliquent à la prochaine requête authentifiée."
            }
          >
            <FormPreviewRow label="Nom" value={draft.displayName.trim() || "—"} />
            <FormPreviewRow label="Courriel" value={draft.email.trim() || "—"} />
            {step >= 2 || !creating ? (
              <>
                <FormPreviewRow label="Direction" value={draft.department || "—"} />
                <FormPreviewRow label="Rôle" value={ROLE_LABELS[draft.role]} />
                <FormPreviewRow label="Juridiction" value={draft.jurisdiction.trim() || "—"} />
                {!creating ? <FormPreviewRow label="Statut" value={draft.isActive ? "Actif" : "Inactif"} /> : null}
              </>
            ) : (
              <FormPreviewRow label="Étape suivante" value="Affectation (rôle & organisation)" />
            )}
          </FormPreviewAside>
        }
      />

      <ConfirmModal
        open={confirmOpen}
        title="Désactiver cet utilisateur ?"
        description={`Le compte « ${draft.displayName} » sera désactivé. L'historique et les agents déjà enrôlés sont conservés.`}
        confirmLabel="Désactiver"
        busy={saving}
        onConfirm={() => void confirmDeactivate()}
        onCancel={() => !saving && setConfirmOpen(false)}
      />
    </div>
  );
}
