const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

const ACCESS_KEY = "acg_token";
const REFRESH_KEY = "acg_refresh";

export function getToken(): string | null {
  return sessionStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_KEY);
}

export function setSession(accessToken: string, refreshToken: string): void {
  sessionStorage.setItem(ACCESS_KEY, accessToken);
  sessionStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearSession(): void {
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API}/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        accessToken?: string;
        token?: string;
        refreshToken: string;
      };
      const access = data.accessToken ?? data.token;
      if (!access || !data.refreshToken) return false;
      setSession(access, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function logoutSession(): Promise<void> {
  const token = getToken();
  const refreshToken = getRefreshToken();
  try {
    if (token) {
      await fetch(`${API}/v1/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ refreshToken: refreshToken ?? undefined, revokeAll: false }),
      });
    }
  } catch {
    /* best-effort revoke */
  } finally {
    clearSession();
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const doFetch = async (token: string | null) =>
    fetch(`${API}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });

  let res = await doFetch(getToken());

  if (res.status === 401 && getRefreshToken()) {
    const ok = await tryRefresh();
    if (ok) {
      res = await doFetch(getToken());
    }
  }

  if (res.status === 401) {
    clearSession();
    window.location.href = "/login";
    throw new Error("Session expirée");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatApiError(text) || res.statusText);
  }
  return res.json() as Promise<T>;
}

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  department: string;
  departmentRiskLevel?: "low" | "moderate" | "high";
  role: string;
  jurisdiction: string;
};

export type LoginErrorPayload = {
  statusCode?: number;
  code?: string;
  message?: string | string[];
  remainingAttempts?: number;
  retryAfterSeconds?: number;
  lockedUntil?: string;
};

export function formatApiError(text: string): string {
  try {
    const parsed = JSON.parse(text) as { message?: string | string[] };
    if (typeof parsed.message === "string") return parsed.message;
    if (Array.isArray(parsed.message)) return parsed.message.join(" · ");
  } catch {
    /* corps non JSON */
  }
  return text;
}

export function parseLoginError(text: string, status: number): LoginErrorPayload {
  try {
    const parsed = JSON.parse(text) as LoginErrorPayload;
    return { ...parsed, statusCode: parsed.statusCode ?? status };
  } catch {
    return { statusCode: status, message: text || "Échec de connexion" };
  }
}
