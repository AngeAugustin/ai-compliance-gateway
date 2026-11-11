/**
 * Tableau de bord dans un vrai navigateur (Chromium piloté par Playwright) contre l'API réelle
 * sur une base jetable — `pnpm test:e2e:dashboard`.
 *
 * Prérequis : une API sur la base …_charge, dont CORS_ORIGINS autorise http://localhost:3100,
 *   ACG_E2E_API=http://localhost:4100  DATABASE_URL=…_charge  pnpm test:e2e:dashboard
 * Le test lance lui-même le serveur Vite du tableau de bord (port 3100) pointé sur cette API.
 *
 * Comptes : ceux du seed (SEED_ADMIN_* / SEED_DPO_*, valeurs par défaut du seed sinon). La double
 * authentification est réinitialisée en base avant le test, puis activée par le vrai parcours :
 * le test lit le secret renvoyé par /v1/auth/mfa/setup et calcule le code TOTP comme le ferait une
 * application d'authentification.
 */
import { resolve } from "node:path";
import { Client } from "pg";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { base32Decode, hotp, totpStep } from "../../api/src/auth/totp.js";

const API = process.env.ACG_E2E_API ?? "";
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const RSSI = { email: process.env.SEED_ADMIN_EMAIL ?? "rssi@cnss.bj", password: process.env.SEED_ADMIN_PASSWORD ?? "Admin!2026" };
const DPO = { email: process.env.SEED_DPO_EMAIL ?? "dpo@cnss.bj", password: process.env.SEED_DPO_PASSWORD ?? "Dpo!2026" };
const USER = { email: "marie.agbodji@cnss.bj", password: "User!2026" };

/** Pages du menu : chemin et un texte qui prouve que la page a rendu ses données. */
const PAGES = ["/", "/events", "/users", "/policies", "/services", "/agents", "/inspect", "/profil"];

let vite: ViteDevServer;
let browser: Browser;
let db: Client;

interface Watch {
  consoleErrors: string[];
  apiErrors: string[];
}

function watch(page: Page): Watch {
  const w: Watch = { consoleErrors: [], apiErrors: [] };
  page.on("console", (m) => {
    if (m.type() === "error") w.consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => w.consoleErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.url().startsWith(API) && r.status() >= 400) w.apiErrors.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  return w;
}

/**
 * Connexion complète par le formulaire, MFA comprise (activation au premier passage).
 * La connexion est limitée à 5 tentatives par minute et par adresse, et ce fichier en fait
 * davantage : si la page l'annonce, on attend le délai indiqué puis on recommence.
 */
async function login(page: Page, account: { email: string; password: string }): Promise<void> {
  try {
    await loginOnce(page, account);
  } catch (err) {
    const wait = String(err).match(/Réessayez dans (\d+) s/);
    if (!wait) throw err;
    await page.waitForTimeout((Number(wait[1]) + 2) * 1000);
    await loginOnce(page, account);
  }
}

async function loginOnce(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto(`${BASE}/login`);
  await page.fill("#login-email", account.email);
  await page.fill("#login-password", account.password);
  const setup = page.waitForResponse((r) => r.url().endsWith("/v1/auth/mfa/setup"), { timeout: 10_000 }).catch(() => null);
  await page.click("button.login-submit");
  const res = await setup;
  if (!res) {
    // La MFA est réinitialisée avant le test : sans écran d'activation, le mot de passe a été refusé.
    const notice = await page.locator(".notice-err, [role='alert']").allInnerTexts().catch(() => []);
    throw new Error(`${account.email} : pas d'activation MFA après le mot de passe ${notice.join(" | ")}`);
  }
  const { secret } = (await res.json()) as { secret: string };
  // Un code n'est accepté qu'une fois : on attend le début d'une nouvelle fenêtre de 30 s si besoin.
  const remaining = 30_000 - (Date.now() % 30_000);
  if (remaining < 3_000) await page.waitForTimeout(remaining + 200);
  const code = hotp(base32Decode(secret), totpStep());
  const input = page.locator("input[autocomplete='one-time-code'], input[inputmode='numeric']").first();
  await input.fill(code);
  await page.click("button.login-submit");
  await page.waitForURL(`${BASE}/`, { timeout: 15_000 }).catch(async (err: Error) => {
    // Message affiché par la page (code refusé, limite de tentatives…) : sans lui, l'échec est muet.
    const notice = await page.locator(".notice-err, [role='alert']").allInnerTexts().catch(() => []);
    throw new Error(`${account.email} : connexion non aboutie (${page.url()}) ${notice.join(" | ")}\n${err.message}`);
  });
}

beforeAll(async () => {
  if (!API) throw new Error("ACG_E2E_API requis (ex. http://localhost:4100)");
  if (!/_charge$/.test(new URL(DATABASE_URL).pathname)) throw new Error("DATABASE_URL doit viser une base jetable …_charge");
  db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  await db.query(
    `UPDATE app_user SET totp_secret_encrypted = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE email = ANY($1)`,
    [[RSSI.email, DPO.email]],
  );
  process.env.VITE_API_URL = API;
  vite = await createServer({ root: resolve(__dirname, ".."), configFile: resolve(__dirname, "../vite.config.ts"), server: { port: PORT, strictPort: true }, logLevel: "error" });
  await vite.listen();
  browser = await chromium.launch({ channel: "chromium", headless: true });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await vite?.close();
  await db?.end();
});

describe("connexion", () => {
  it("mot de passe faux : message d'erreur, aucune session", async () => {
    const page = await browser.newPage();
    await page.goto(`${BASE}/login`);
    await page.fill("#login-email", RSSI.email);
    await page.fill("#login-password", "mauvais-mot-de-passe");
    await page.click("button.login-submit");
    await expect.poll(() => page.locator(".notice-err").textContent(), { timeout: 10_000 }).toBeTruthy();
    expect(page.url()).toContain("/login");
    expect(await page.evaluate(() => sessionStorage.getItem("acg_token"))).toBeNull();
    await page.close();
  });

  it("page protégée sans session : renvoi vers la connexion", async () => {
    const page = await browser.newPage();
    await page.goto(`${BASE}/events`);
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await page.close();
  });

  it("un collaborateur (rôle USER) n'obtient pas de session sur le tableau de bord", async () => {
    const page = await browser.newPage();
    await page.goto(`${BASE}/login`);
    await page.fill("#login-email", USER.email);
    await page.fill("#login-password", USER.password);
    await page.click("button.login-submit");
    await page.waitForTimeout(2_000);
    const token = await page.evaluate(() => sessionStorage.getItem("acg_token"));
    if (token) {
      // Session ouverte malgré tout : aucune donnée d'administration ne doit être servie.
      const status = await page.evaluate(async ([api, t]) => (await fetch(`${api}/v1/users`, { headers: { Authorization: `Bearer ${t}` } })).status, [API, token]);
      expect(status).toBe(403);
    } else {
      expect(page.url()).toContain("/login");
    }
    await page.close();
  });
});

describe("RSSI : double authentification puis chaque page", () => {
  let page: Page;
  let w: Watch;

  beforeAll(async () => {
    page = await browser.newPage();
    w = watch(page);
    await login(page, RSSI);
  }, 150_000);

  afterAll(async () => {
    await page?.close();
  });

  it("la MFA est activée en base après le premier passage", async () => {
    const r = await db.query<{ on: boolean }>(`SELECT totp_enabled_at IS NOT NULL AS on FROM app_user WHERE email = $1`, [RSSI.email]);
    expect(r.rows[0]?.on).toBe(true);
  });

  for (const path of PAGES) {
    it(`${path} : rendu sans erreur JavaScript ni refus de l'API`, async () => {
      w.consoleErrors.length = 0;
      w.apiErrors.length = 0;
      await page.goto(`${BASE}${path}`);
      await page.waitForLoadState("networkidle");
      expect(page.url()).not.toContain("/login");
      const text = (await page.locator("main").first().innerText().catch(() => page.locator("body").innerText())).trim();
      expect(text.length).toBeGreaterThan(20);
      expect(w.apiErrors).toEqual([]);
      expect(w.consoleErrors.filter((e) => !/favicon|DevTools/i.test(e))).toEqual([]);
    });
  }

  it("le journal affiche des événements de la base", async () => {
    const total = Number((await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM analytics.security_event`)).rows[0]!.n);
    expect(total).toBeGreaterThan(0);
    await page.goto(`${BASE}/events`);
    await page.waitForLoadState("networkidle");
    const rows = await page.locator("table tbody tr").count();
    expect(rows).toBeGreaterThan(0);
  });

  it("déconnexion : session effacée, retour à la connexion", async () => {
    await page.goto(`${BASE}/`);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      sessionStorage.removeItem("acg_token");
      sessionStorage.removeItem("acg_refresh");
    });
    await page.goto(`${BASE}/policies`);
    await page.waitForURL(/\/login/, { timeout: 10_000 });
  });
});

describe("DPO : accès limité", () => {
  let page: Page;
  let w: Watch;

  beforeAll(async () => {
    page = await browser.newPage();
    w = watch(page);
    await login(page, DPO);
  }, 150_000);

  afterAll(async () => {
    await page?.close();
  });

  it("vue d'ensemble et journal accessibles", async () => {
    for (const path of ["/", "/events"]) {
      w.apiErrors.length = 0;
      await page.goto(`${BASE}${path}`);
      await page.waitForLoadState("networkidle");
      expect(page.url()).not.toContain("/login");
      expect(w.apiErrors.filter((e) => e.startsWith("403"))).toEqual([]);
    }
  });

  it("administration refusée par l'API (utilisateurs, écriture des politiques), lecture des politiques permise, sans plantage de la page", async () => {
    const token = await page.evaluate(() => sessionStorage.getItem("acg_token"));
    const call = (method: string, path: string, body?: unknown) =>
      page.evaluate(
        async ([api, m, p, t, b]) =>
          (
            await fetch(`${api}${p}`, {
              method: m,
              headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
              body: b === undefined ? undefined : JSON.stringify(b),
            })
          ).status,
        [API, method, path, token!, body] as const,
      );
    expect(await call("GET", "/v1/users")).toBe(403);
    expect(await call("POST", "/v1/users", {})).toBe(403);
    expect(await call("POST", "/v1/policies", {})).toBe(403);
    // Contrôle de conformité : le DPO lit les politiques sans pouvoir les modifier.
    expect(await call("GET", "/v1/policies")).toBe(200);
    w.consoleErrors.length = 0;
    await page.goto(`${BASE}/users`);
    await page.waitForLoadState("networkidle");
    expect(w.consoleErrors.filter((e) => /Uncaught|TypeError|ReferenceError/.test(e))).toEqual([]);
  });
});

