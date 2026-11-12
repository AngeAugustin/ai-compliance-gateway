/**
 * Extension A1 dans un vrai navigateur (Chromium piloté par Playwright, extension non empaquetée
 * chargée depuis apps/agent-browser/dist) — `pnpm test:e2e:extension`.
 *
 * Le vrai ChatGPT exige un compte : le test sert à l'adresse https://chatgpt.com/ une page de
 * discussion simulée (champ #prompt-textarea, bouton d'envoi, champ fichier, appels
 * POST /backend-api/conversation et /backend-api/files comme le vrai site). Le navigateur et
 * l'extension ne voient qu'une page chatgpt.com : content script et page-hook s'y injectent
 * comme en production. Le « service d'IA » est le gestionnaire de route : on voit exactement ce
 * qui lui parvient.
 *
 * Partie 1 : extension non enrôlée (politiques embarquées). Partie 2 (si ACG_E2E_API est défini) :
 * extension enrôlée auprès d'une API réelle (base jetable), politiques du seed, journal vérifié.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type BrowserContext, type Page, type Worker } from "playwright";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const EXT = resolve(__dirname, "../dist");
const SECRET = "sk-abcdefghijklmnopqrstuvwxyz012345";
const API = process.env.ACG_E2E_API; // ex. http://localhost:4000 (base …_charge)
const DATABASE_URL = process.env.DATABASE_URL ?? "";

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>ChatGPT (simulé)</title></head><body>
<main>
  <div id="answers"></div>
  <form id="composer" data-testid="composer">
    <textarea id="prompt-textarea" rows="3"></textarea>
    <input type="file" id="upload" multiple>
    <button type="submit" data-testid="send-button" aria-label="Send prompt">Envoyer</button>
  </form>
</main>
<script>
  const ta = document.getElementById("prompt-textarea");
  const answers = document.getElementById("answers");
  async function send() {
    const text = ta.value.trim();
    if (!text) return;
    ta.value = "";
    const r = await fetch("/backend-api/conversation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "next", messages: [{ author: { role: "user" }, content: { content_type: "text", parts: [text] } }] }),
    });
    const j = await r.json().catch(() => ({}));
    const p = document.createElement("p");
    p.className = "answer";
    p.textContent = r.ok ? j.answer : "refusé " + r.status;
    answers.appendChild(p);
  }
  document.getElementById("composer").addEventListener("submit", (e) => { e.preventDefault(); send(); });
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  document.getElementById("upload").addEventListener("change", async (e) => {
    for (const f of e.target.files) {
      const fd = new FormData();
      fd.append("file", f, f.name);
      await fetch("/backend-api/files", { method: "POST", body: fd });
    }
  });
  // Envoi direct par le script de la page, sans passer par le formulaire (autre chemin du site).
  window.directSend = (text) => fetch("/backend-api/conversation", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ content: { parts: [text] } }] }),
  }).then((r) => r.status);
</script></body></html>`;

interface Received {
  prompts: string[];
  uploads: { name: string; content: string }[];
}

let context: BrowserContext;
let worker: Worker;
let userDir: string;
let filesDir: string;
const received: Received = { prompts: [], uploads: [] };

async function openChat(): Promise<Page> {
  const page = await context.newPage();
  await page.goto("https://chatgpt.com/");
  // Le content script s'injecte à document_idle : attendre qu'il réponde au gate.
  await page.waitForFunction(() => document.readyState === "complete");
  await page.waitForTimeout(500);
  return page;
}

async function waitQuiet(page: Page, ms = 1500) {
  await page.waitForTimeout(ms);
}

beforeAll(async () => {
  userDir = mkdtempSync(join(tmpdir(), "acg-ext-"));
  filesDir = mkdtempSync(join(tmpdir(), "acg-ext-files-"));
  context = await chromium.launchPersistentContext(userDir, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  await context.route("https://chatgpt.com/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "POST" && url.pathname === "/backend-api/conversation") {
      const body = JSON.parse(req.postData() ?? "{}");
      const text = (body.messages?.at(-1)?.content?.parts ?? []).join("\n");
      received.prompts.push(text);
      return route.fulfill({ json: { answer: `Réponse à : ${text}` } });
    }
    if (req.method() === "POST" && url.pathname === "/backend-api/files") {
      const raw = req.postDataBuffer()?.toString("utf8") ?? "";
      const name = raw.match(/filename="([^"]+)"/)?.[1] ?? "?";
      const content = raw.split(/\r\n\r\n/)[1]?.split(/\r\n--/)[0] ?? "";
      received.uploads.push({ name, content });
      return route.fulfill({ json: { file_id: "file-1" } });
    }
    if (req.method() === "GET" && url.pathname === "/") return route.fulfill({ contentType: "text/html", body: PAGE });
    return route.fulfill({ status: 404, body: "" });
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
}, 60_000);

afterAll(async () => {
  await context?.close();
  rmSync(userDir, { recursive: true, force: true });
  rmSync(filesDir, { recursive: true, force: true });
});

beforeEach(() => {
  received.prompts.length = 0;
  received.uploads.length = 0;
});

describe("extension A1 non enrôlée (politiques embarquées)", () => {
  it("le service worker de l'extension est chargé", () => {
    expect(worker.url()).toMatch(/^chrome-extension:\/\/.+\/background\.js$/);
  });

  it("touche Entrée : un prompt anodin part tel quel", async () => {
    const page = await openChat();
    await page.fill("#prompt-textarea", "Résume la procédure d'archivage en trois points");
    await page.press("#prompt-textarea", "Enter");
    await page.waitForSelector(".answer");
    expect(received.prompts).toEqual(["Résume la procédure d'archivage en trois points"]);
    await page.close();
  });

  it("touche Entrée : un secret est bloqué, rien ne part et le champ est vidé", async () => {
    const page = await openChat();
    await page.fill("#prompt-textarea", `Pourquoi ma clé ${SECRET} est refusée ?`);
    await page.press("#prompt-textarea", "Enter");
    await page.waitForSelector("#acg-agent-banner");
    await waitQuiet(page);
    expect(await page.textContent("#acg-agent-banner")).toContain("BLOCK");
    expect(await page.inputValue("#prompt-textarea")).toBe("");
    expect(received.prompts).toEqual([]);
    await page.close();
  });

  it("Maj+Entrée insère un saut de ligne sans rien envoyer", async () => {
    const page = await openChat();
    await page.fill("#prompt-textarea", "Première ligne");
    await page.press("#prompt-textarea", "Shift+Enter");
    await waitQuiet(page, 800);
    expect(received.prompts).toEqual([]);
    expect(await page.$("#acg-agent-banner")).toBeNull();
    await page.close();
  });

  it("clic sur le bouton d'envoi : un secret est bloqué", async () => {
    const page = await openChat();
    await page.fill("#prompt-textarea", `Configure l'API avec ${SECRET}`);
    await page.click('button[data-testid="send-button"]');
    await page.waitForSelector("#acg-agent-banner");
    await waitQuiet(page);
    expect(received.prompts).toEqual([]);
    await page.close();
  });

  it("envoi direct par le script de la page (sans le formulaire) : le page-hook bloque l'appel", async () => {
    const page = await openChat();
    const status = await page.evaluate((s) => (window as unknown as { directSend: (t: string) => Promise<number> }).directSend(`clé ${s}`), SECRET);
    expect(status).toBe(403);
    expect(received.prompts).toEqual([]);
    const ok = await page.evaluate(() => (window as unknown as { directSend: (t: string) => Promise<number> }).directSend("Bonjour"));
    expect(ok).toBe(200);
    expect(received.prompts).toEqual(["Bonjour"]);
    await page.close();
  });

  it("pièce jointe contenant un secret : retirée avant tout envoi", async () => {
    const file = join(filesDir, "config.env");
    writeFileSync(file, `OPENAI_API_KEY=${SECRET}\nDATABASE_URL=postgres://cnss:P@ssw0rd@10.0.0.5:5432/cotisations\n`);
    const page = await openChat();
    await page.setInputFiles("#upload", file);
    await page.waitForSelector("#acg-agent-banner");
    await waitQuiet(page);
    expect(await page.textContent("#acg-agent-banner")).toContain("BLOCK");
    expect(received.uploads).toEqual([]);
    expect(await page.evaluate(() => (document.getElementById("upload") as HTMLInputElement).files?.length ?? 0)).toBe(0);
    await page.close();
  });

  it("pièce jointe anodine : réinjectée et envoyée intacte", async () => {
    const file = join(filesDir, "procedure.txt");
    writeFileSync(file, "Archiver les dossiers clos après cinq ans.\n");
    const page = await openChat();
    await page.setInputFiles("#upload", file);
    await page.waitForFunction(() => true);
    await waitQuiet(page, 2500);
    expect(received.uploads.map((u) => u.name)).toEqual(["procedure.txt"]);
    expect(received.uploads[0]!.content).toContain("Archiver les dossiers clos");
    await page.close();
  });
});

describe.skipIf(!API)("extension A1 enrôlée auprès de l'API (politiques du seed)", () => {
  let db: import("pg").Client;
  let agentId: string;

  beforeAll(async () => {
    if (!/_charge$/.test(new URL(DATABASE_URL).pathname)) throw new Error("DATABASE_URL doit viser une base jetable …_charge");
    const { Client } = await import("pg");
    db = new Client({ connectionString: DATABASE_URL });
    await db.connect();
    const user = (await db.query<{ id: string }>(`SELECT id FROM app_user WHERE role = 'USER' ORDER BY email LIMIT 1`)).rows[0]!;
    const token = `e2e-extension-${Date.now()}`;
    await db.query(
      `INSERT INTO enrollment_token(token_hash, modules, user_id, expires_at) VALUES ($1, ARRAY['A1'], $2, now() + interval '1 hour')`,
      [createHash("sha256").update(token).digest("hex"), user.id],
    );
    // Même parcours que la fenêtre de l'extension : CONFIGURE puis ENROLL.
    const page = await context.newPage();
    const extId = new URL(worker.url()).host;
    await page.goto(`chrome-extension://${extId}/popup.html`);
    const res = await page.evaluate(
      async ([api, tok]) => {
        await chrome.runtime.sendMessage({ type: "CONFIGURE", apiUrl: api, token: tok });
        return chrome.runtime.sendMessage({ type: "ENROLL", hostname: "e2e-extension" });
      },
      [API!, token],
    );
    expect(res.ok).toBe(true);
    agentId = res.agentId;
    await page.close();
  }, 60_000);

  afterAll(async () => {
    await db?.end();
  });

  it("masque un identifiant direct : le service d'IA reçoit le jeton, la page ne voit jamais la valeur", async () => {
    const page = await openChat();
    await page.fill("#prompt-textarea", "Rédige un courrier pour koffi.adjovi@exemple.bj au sujet de son dossier");
    await page.press("#prompt-textarea", "Enter");
    await page.waitForSelector(".answer", { timeout: 20_000 });
    await waitQuiet(page);
    expect(received.prompts).toHaveLength(1);
    expect(received.prompts[0]).not.toContain("koffi.adjovi@exemple.bj");
    expect(received.prompts[0]).toMatch(/[A-Z]+_\d{3}/);
    // La réponse de l'IA cite le jeton. Choix de sécurité (rehydrate.ts) : la page n'est jamais
    // réécrite ; la valeur d'origine s'affiche dans un panneau à Shadow DOM fermé, hors de portée
    // des scripts de la page.
    await page.waitForTimeout(1500);
    expect(await page.textContent(".answer")).not.toContain("koffi.adjovi@exemple.bj");
    expect(await page.evaluate(() => document.body.innerHTML.includes("koffi.adjovi@exemple.bj"))).toBe(false);
    const panel = await page.evaluate(() => {
      const host = document.getElementById("acg-restore-host");
      return host ? { visible: host.style.display !== "none", shadowReadable: host.shadowRoot !== null } : null;
    });
    expect(panel).toEqual({ visible: true, shadowReadable: false });
    await page.close();
  });

  it("chaque décision est journalisée côté serveur avec l'action appliquée", async () => {
    const page = await openChat();
    await page.fill("#prompt-textarea", `Ma clé ${SECRET} ne marche plus`);
    await page.press("#prompt-textarea", "Enter");
    await page.waitForSelector("#acg-agent-banner");
    await waitQuiet(page, 2500);
    await page.close();
    const ev = await db.query<{ action: string }>(`SELECT action FROM analytics.security_event WHERE agent_id = $1 ORDER BY sequence`, [agentId]);
    expect(ev.rows.map((r) => r.action)).toEqual(["MASK", "BLOCK"]);
  });

  // Défaut trouvé sur le vrai ChatGPT (sites-reels/protocole.md) : quand l'envoi est intercepté par le
  // page-hook plutôt que par Entrée / bouton, le prompt était masqué sans aucune bannière.
  it("envoi masqué par le page-hook : l'utilisateur voit la bannière MASK", async () => {
    const page = await openChat();
    const status = await page.evaluate(
      () => (window as unknown as { directSend: (t: string) => Promise<number> }).directSend("Rédige un courrier pour l'assuré n° CNSS A12345678 au sujet de son dossier"),
    );
    expect(status).toBe(200);
    expect(received.prompts).toHaveLength(1);
    expect(received.prompts[0]).not.toContain("A12345678");
    await page.waitForSelector("#acg-agent-banner", { timeout: 10_000 });
    expect(await page.textContent("#acg-agent-banner")).toContain("MASK");
    await page.close();
  });
});
