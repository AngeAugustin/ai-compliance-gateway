import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { ConfirmModal } from "../confirm-modal";
import {
  FormActions,
  FormPreviewAside,
  FormPreviewRow,
  FormSection,
  FormWorkflow,
  IconCover,
  IconService,
  type FormStepDef,
} from "../form-workflow";
import { useToast } from "../toast";
import { PageHeader } from "../ui";

export type AiService = {
  id: string;
  name: string;
  hostingRegion: string;
  riskBaseline: number;
  freeAccess: boolean;
  domains: string[];
  cliCommands: string[];
  enabled: boolean;
};

const EMPTY: AiService = {
  id: "",
  name: "",
  hostingRegion: "US",
  riskBaseline: 30,
  freeAccess: true,
  domains: [],
  cliCommands: [],
  enabled: true,
};

const STEPS: readonly FormStepDef[] = [
  { id: 1, label: "Identité", hint: "Nom, région et risque" },
  { id: 2, label: "Couverture", hint: "Domaines web et CLI" },
];

export function ServiceFormPage() {
  const { id } = useParams<{ id: string }>();
  const creating = !id;
  const mode = creating ? "create" : "edit";
  const navigate = useNavigate();
  const toast = useToast();
  const [draft, setDraft] = useState<AiService>({ ...EMPTY });
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
        const service = await api<AiService>(`/v1/ai-services/${encodeURIComponent(id!)}`);
        if (!cancelled) setDraft(service);
      } catch (err) {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : String(err));
        navigate("/services");
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
    if (!draft.id.trim() || !draft.name.trim()) {
      setStepError("Renseignez l'identifiant et le nom affiché.");
      return false;
    }
    if (draft.riskBaseline < 0 || draft.riskBaseline > 100) {
      setStepError("Le risque de base doit être entre 0 et 100.");
      return false;
    }
    setStepError(null);
    return true;
  }

  async function save() {
    setSaving(true);
    try {
      if (creating) {
        await api("/v1/ai-services", { method: "POST", body: JSON.stringify(draft) });
        toast.success(`${draft.name} ajouté au catalogue.`);
      } else {
        await api(`/v1/ai-services/${encodeURIComponent(draft.id)}`, { method: "PUT", body: JSON.stringify(draft) });
        toast.success(`${draft.name} mis à jour.`);
      }
      navigate("/services");
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
    void save();
  }

  async function confirmDelete() {
    setSaving(true);
    try {
      await api(`/v1/ai-services/${encodeURIComponent(draft.id)}`, { method: "DELETE" });
      toast.success(`${draft.name} retiré du catalogue.`);
      setConfirmOpen(false);
      navigate("/services");
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
        kicker="Catalogue"
        title={creating ? "Nouveau service" : "Modifier le service"}
        lead="Définissez le service en deux étapes. L'aperçu à droite reflète le catalogue tel que les agents le verront."
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
                icon={<IconService />}
                title="Identité du service"
                description="Identifiant canonique, libellé et niveau de risque de base pour le scoring."
              >
                <label className="field-label">Identifiant (domaine canonique)</label>
                <input
                  className="input"
                  value={draft.id}
                  onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                  disabled={!creating}
                  placeholder="poe.com"
                  required
                />
                <label className="field-label">Nom affiché</label>
                <input
                  className="input"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Poe"
                  required
                />
                <div className="wf-field-grid">
                  <div>
                    <label className="field-label">Hébergement</label>
                    <select
                      className="input"
                      value={draft.hostingRegion}
                      onChange={(e) => setDraft({ ...draft, hostingRegion: e.target.value })}
                    >
                      {["BJ", "US", "EU", "CN", "UK", "IN", "SG"].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Risque de base 0–100</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={100}
                      value={draft.riskBaseline}
                      onChange={(e) => setDraft({ ...draft, riskBaseline: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </FormSection>
            ) : (
              <FormSection
                icon={<IconCover />}
                title="Couverture agents"
                description="Domaines interceptés par A1 et commandes CLI surveillées par A2."
              >
                <label className="field-label">Domaines web (un par ligne)</label>
                <textarea
                  className="input"
                  value={draft.domains.join("\n")}
                  onChange={(e) =>
                    setDraft({ ...draft, domains: e.target.value.split(/\n/).map((s) => s.trim()).filter(Boolean) })
                  }
                  rows={4}
                  placeholder="poe.com"
                  style={{ fontFamily: "IBM Plex Mono, monospace" }}
                />
                <label className="field-label">Commandes CLI (une par ligne)</label>
                <textarea
                  className="input"
                  value={draft.cliCommands.join("\n")}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      cliCommands: e.target.value.split(/\n/).map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  rows={3}
                  placeholder="poe"
                  style={{ fontFamily: "IBM Plex Mono, monospace" }}
                />
                <label className="field-check">
                  <input
                    type="checkbox"
                    checked={draft.freeAccess}
                    onChange={(e) => setDraft({ ...draft, freeAccess: e.target.checked })}
                  />
                  Accès gratuit (données potentiellement réutilisées)
                </label>
                <label className="field-check">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                  />
                  Actif (surveillé par les agents)
                </label>
                {!creating ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={saving}
                    onClick={() => setConfirmOpen(true)}
                    style={{ alignSelf: "flex-start", marginTop: 8 }}
                  >
                    Supprimer le service
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
              createLabel="Ajouter au catalogue"
              onCancel={() => navigate("/services")}
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
            icon={<IconService />}
            tip={
              creating
                ? "Les agents prendront ce service au prochain sync de configuration."
                : "Une modification de couverture nécessite un sync agent pour être effective."
            }
          >
            <FormPreviewRow label="Service" value={draft.name.trim() || "—"} />
            <FormPreviewRow label="Identifiant" value={draft.id.trim() || "—"} />
            <FormPreviewRow label="Région" value={draft.hostingRegion} />
            <FormPreviewRow label="Risque de base" value={String(draft.riskBaseline)} />
            {step >= 2 || !creating ? (
              <>
                <FormPreviewRow
                  label="Domaines"
                  value={draft.domains.length ? draft.domains.join(", ") : "Aucun"}
                />
                <FormPreviewRow
                  label="CLI"
                  value={draft.cliCommands.length ? draft.cliCommands.join(", ") : "Aucune"}
                />
                <FormPreviewRow label="Statut" value={draft.enabled ? "Actif" : "Inactif"} />
              </>
            ) : (
              <FormPreviewRow label="Étape suivante" value="Couverture web & CLI" />
            )}
          </FormPreviewAside>
        }
      />

      <ConfirmModal
        open={confirmOpen}
        title="Supprimer ce service ?"
        description={`« ${draft.name} » (${draft.id}) sera retiré du catalogue. Les agents ne le surveilleront plus après le prochain sync.`}
        confirmLabel="Supprimer"
        busy={saving}
        onConfirm={() => void confirmDelete()}
        onCancel={() => !saving && setConfirmOpen(false)}
      />
    </div>
  );
}
