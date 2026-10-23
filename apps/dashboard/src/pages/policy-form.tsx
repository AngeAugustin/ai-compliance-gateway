import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { compileCondition, describeConditionExpr, parseConditionDraft, type PolicyAction } from "@acg/shared";
import { api } from "../api";
import { ConditionBuilder } from "../condition-builder";
import { ConfirmModal } from "../confirm-modal";
import {
  FormActions,
  FormPreviewAside,
  FormPreviewRow,
  FormSection,
  FormWorkflow,
  IconPolicy,
  IconRule,
  type FormStepDef,
} from "../form-workflow";
import { useToast } from "../toast";
import { PageHeader } from "../ui";

export type Policy = {
  id: string;
  name: string;
  description: string | null;
  conditionExpr: string;
  action: PolicyAction;
  priority: number;
  version: number;
  enabled: boolean;
  referenceFrameworks: string[];
};

export const ACTION_LABELS: Record<PolicyAction, string> = {
  ALLOW: "Autoriser",
  WARN: "Avertir l'utilisateur",
  MASK: "Masquer avant envoi",
  BLOCK: "Bloquer l'envoi",
};

const EMPTY: Policy = {
  id: "",
  name: "",
  description: "",
  conditionExpr: "",
  action: "MASK",
  priority: 50,
  version: 1,
  enabled: true,
  referenceFrameworks: ["OWASP-LLM02"],
};

const STEPS: readonly FormStepDef[] = [
  { id: 1, label: "Identité", hint: "Nom, priorité et références" },
  { id: 2, label: "Règle", hint: "Critères et décision" },
];

export function PolicyFormPage() {
  const { id } = useParams<{ id: string }>();
  const creating = !id;
  const mode = creating ? "create" : "edit";
  const navigate = useNavigate();
  const toast = useToast();
  const [draft, setDraft] = useState<Policy>({ ...EMPTY });
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!creating);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (creating) return;
    let cancelled = false;
    async function load() {
      try {
        const list = await api<Policy[]>("/v1/policies");
        const found = list.find((p) => p.id === id);
        if (!found) throw new Error("Politique introuvable.");
        if (!cancelled) setDraft({ ...found, description: found.description ?? "" });
      } catch (err) {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : String(err));
        navigate("/policies");
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
    if (!draft.name.trim()) {
      setStepError("Donnez un nom à la règle.");
      return false;
    }
    setStepError(null);
    return true;
  }

  function validateStep2(): boolean {
    const parsed = parseConditionDraft(draft.conditionExpr);
    if (parsed.ok) {
      const compiled = compileCondition(parsed.draft);
      if (compiled.errors.length) {
        setStepError(compiled.errors.join(" · "));
        return false;
      }
    } else if (!draft.conditionExpr.trim()) {
      setStepError("Ajoutez au moins un critère.");
      return false;
    }
    setStepError(null);
    return true;
  }

  async function save() {
    const payload = {
      name: draft.name,
      description: draft.description || null,
      conditionExpr: draft.conditionExpr,
      action: draft.action,
      priority: draft.priority,
      enabled: draft.enabled,
      referenceFrameworks: draft.referenceFrameworks,
    };
    setSaving(true);
    try {
      if (creating) {
        await api("/v1/policies", { method: "POST", body: JSON.stringify(payload) });
        toast.success(`${draft.name} créée.`);
      } else {
        await api(`/v1/policies/${encodeURIComponent(draft.id)}`, { method: "PUT", body: JSON.stringify(payload) });
        toast.success(`${draft.name} enregistrée.`);
      }
      navigate("/policies");
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

  async function confirmDelete() {
    setSaving(true);
    try {
      await api(`/v1/policies/${encodeURIComponent(draft.id)}`, { method: "DELETE" });
      toast.success(`${draft.name} supprimée.`);
      setConfirmOpen(false);
      navigate("/policies");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStepError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const conditionPreview = describeConditionExpr(draft.conditionExpr) ?? draft.conditionExpr;

  if (loading) {
    return <p style={{ color: "var(--fog)" }}>Chargement du formulaire…</p>;
  }

  return (
    <div>
      <PageHeader
        kicker="Règles"
        title={creating ? "Nouvelle règle" : `Modifier · v${draft.version}`}
        lead="Construisez la politique en deux étapes. L'aperçu à droite résume la décision telle qu'elle sera évaluée."
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
                icon={<IconPolicy />}
                title="Identité de la règle"
                description="Nom, priorité d'évaluation et références réglementaires."
              >
                <label className="field-label">Nom</label>
                <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
                <label className="field-label">Description</label>
                <input
                  className="input"
                  value={draft.description ?? ""}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
                <div className="wf-field-grid">
                  <div>
                    <label className="field-label">Priorité (plus petit = d'abord)</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={10000}
                      value={draft.priority}
                      onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <label className="field-check" style={{ marginBottom: 10 }}>
                      <input
                        type="checkbox"
                        checked={draft.enabled}
                        onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                      />
                      Règle active
                    </label>
                  </div>
                </div>
                <label className="field-label">Références réglementaires (une par ligne)</label>
                <textarea
                  className="input"
                  value={draft.referenceFrameworks.join("\n")}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      referenceFrameworks: e.target.value.split(/\n/).map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  rows={2}
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                />
              </FormSection>
            ) : (
              <FormSection
                icon={<IconRule />}
                title="Critères et décision"
                description="Quand la condition est vraie, la décision choisie s'applique (première règle vraie gagne)."
              >
                <ConditionBuilder
                  value={draft.conditionExpr}
                  onChange={(conditionExpr) => setDraft((d) => ({ ...d, conditionExpr }))}
                />
                <div className="si-panel">
                  <div className="si-rail">ALORS</div>
                  <div style={{ flex: 1 }}>
                    <label className="field-label">Décision</label>
                    <select
                      className="input"
                      value={draft.action}
                      onChange={(e) => setDraft({ ...draft, action: e.target.value as PolicyAction })}
                    >
                      {(["ALLOW", "WARN", "MASK", "BLOCK"] as const).map((a) => (
                        <option key={a} value={a}>
                          {ACTION_LABELS[a]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {!creating ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={saving}
                    onClick={() => setConfirmOpen(true)}
                    style={{ alignSelf: "flex-start", marginTop: 8 }}
                  >
                    Supprimer la règle
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
              createLabel="Créer la règle"
              onCancel={() => navigate("/policies")}
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
            icon={<IconPolicy />}
            tip={
              creating
                ? "Les agents appliqueront la règle au prochain sync de politiques."
                : "L'enregistrement crée une nouvelle version de la politique."
            }
          >
            <FormPreviewRow label="Nom" value={draft.name.trim() || "—"} />
            <FormPreviewRow label="Priorité" value={String(draft.priority)} />
            <FormPreviewRow label="Statut" value={draft.enabled ? "Active" : "Inactive"} />
            {draft.referenceFrameworks.length ? (
              <FormPreviewRow label="Références" value={draft.referenceFrameworks.join(", ")} />
            ) : null}
            {step >= 2 || !creating ? (
              <>
                <FormPreviewRow label="Décision" value={ACTION_LABELS[draft.action]} />
                <FormPreviewRow label="Quand" value={conditionPreview.trim() || "—"} />
              </>
            ) : (
              <FormPreviewRow label="Étape suivante" value="Critères et décision" />
            )}
          </FormPreviewAside>
        }
      />

      <ConfirmModal
        open={confirmOpen}
        title="Supprimer cette règle ?"
        description={`La politique « ${draft.name} » sera définitivement supprimée. Les agents ne l'appliqueront plus après le prochain sync.`}
        confirmLabel="Supprimer"
        busy={saving}
        onConfirm={() => void confirmDelete()}
        onCancel={() => !saving && setConfirmOpen(false)}
      />
    </div>
  );
}
