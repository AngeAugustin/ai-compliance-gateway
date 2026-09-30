import type { FormEvent, ReactNode } from "react";

export type FormStepDef = {
  id: number;
  label: string;
  hint: string;
};

export function FormStepIndicator({ steps, currentStep }: { steps: readonly FormStepDef[]; currentStep: number }) {
  return (
    <ol className="wf-steps" aria-label="Étapes du formulaire">
      {steps.map((step, index) => {
        const completed = currentStep > step.id;
        const active = currentStep === step.id;
        return (
          <li
            key={step.id}
            className={`wf-step${active ? " is-active" : ""}${completed ? " is-complete" : ""}`}
            aria-current={active ? "step" : undefined}
          >
            <span className="wf-step-marker" aria-hidden>
              {completed ? "✓" : step.id}
            </span>
            <span className="wf-step-copy">
              <span className="wf-step-label">{step.label}</span>
              <span className="wf-step-hint">{step.hint}</span>
            </span>
            {index < steps.length - 1 ? <span className="wf-step-connector" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function FormSection({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="wf-section">
      <header className="wf-section-header">
        {icon ? (
          <span className="wf-section-icon" aria-hidden>
            {icon}
          </span>
        ) : null}
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="wf-section-body">{children}</div>
    </section>
  );
}

export function FormPreviewAside({
  title = "Aperçu",
  icon,
  tip,
  children,
}: {
  title?: string;
  icon?: ReactNode;
  tip?: string;
  children: ReactNode;
}) {
  return (
    <aside className="wf-aside panel" aria-label={title}>
      <div className="wf-aside-header">
        {icon ? (
          <span className="wf-aside-icon" aria-hidden>
            {icon}
          </span>
        ) : null}
        <h3 className="wf-aside-title">{title}</h3>
      </div>
      <dl className="wf-preview-list">{children}</dl>
      {tip ? <p className="wf-aside-tip">{tip}</p> : null}
    </aside>
  );
}

export function FormPreviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

export function FormActions({
  saving,
  step,
  lastStep,
  mode,
  createLabel,
  editLabel = "Enregistrer les modifications",
  onCancel,
  onBack,
}: {
  saving: boolean;
  step: number;
  lastStep: number;
  mode: "create" | "edit";
  createLabel: string;
  editLabel?: string;
  onCancel: () => void;
  onBack?: () => void;
}) {
  const isLast = step === lastStep;
  return (
    <footer className="wf-footer">
      <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
        ← Annuler
      </button>
      <div className="wf-footer-main">
        {step > 1 && onBack ? (
          <button type="button" className="btn btn-secondary" onClick={onBack} disabled={saving}>
            Retour
          </button>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Enregistrement…" : isLast ? (mode === "create" ? createLabel : editLabel) : "Continuer"}
        </button>
      </div>
    </footer>
  );
}

export function FormWorkflow({
  mode,
  steps,
  currentStep,
  onSubmit,
  main,
  preview,
}: {
  mode: "create" | "edit";
  steps: readonly FormStepDef[];
  currentStep: number;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  main: ReactNode;
  preview: ReactNode;
}) {
  return (
    <form className={`wf-form wf-form--${mode}`} onSubmit={onSubmit} noValidate>
      <FormStepIndicator steps={steps} currentStep={currentStep} />
      <div className="wf-layout">
        <div className="wf-main panel">{main}</div>
        {preview}
      </div>
    </form>
  );
}

export function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 19v-1.2A3.8 3.8 0 0 0 12.2 14H7.8A3.8 3.8 0 0 0 4 17.8V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
    </svg>
  );
}

export function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 5 6.2v5.2c0 4.4 3 7.6 7 8.6 4-1 7-4.2 7-8.6V6.2L12 3Z" />
    </svg>
  );
}

export function IconService() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5 13.2 8H17l-3 2.3L15.2 14 12 11.8 8.8 14 10 10.3 7 8h3.8L12 4.5ZM5 18h14" />
    </svg>
  );
}

export function IconCover() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

export function IconPolicy() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 5 6.2v5.2c0 4.4 3 7.6 7 8.6 4-1 7-4.2 7-8.6V6.2L12 3Z" />
    </svg>
  );
}

export function IconRule() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}
