import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const THEME_KEY = "acg_theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

/** Thème explicite si l'opérateur en a choisi un, sinon celui du système. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme() ?? systemTheme());

  useEffect(() => {
    if (readStoredTheme()) return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      if (!readStoredTheme()) setTheme(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* quota / private mode */
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
