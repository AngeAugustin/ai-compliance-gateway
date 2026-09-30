import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ToastKind = "success" | "error";

type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
};

type ToastInput = {
  kind: ToastKind;
  message: string;
  duration?: number;
};

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback(({ kind, message, duration = 4200 }: ToastInput) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push({ kind: "success", message }),
      error: (message) => push({ kind: "error", message }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role="status">
            <span className="toast-icon" aria-hidden>
              {t.kind === "success" ? "✓" : "!"}
            </span>
            <p className="toast-message">{t.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
