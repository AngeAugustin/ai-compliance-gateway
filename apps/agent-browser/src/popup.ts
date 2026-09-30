const status = document.getElementById("status")!;
const api = document.getElementById("api") as HTMLInputElement;
const token = document.getElementById("token") as HTMLInputElement;
const grant = document.getElementById("grant") as HTMLButtonElement;

async function requestCatalogHosts(): Promise<boolean> {
  const info = (await chrome.runtime.sendMessage({ type: "CATALOG_ORIGINS" })) as { origins?: string[]; error?: string };
  const origins = info.origins ?? [];
  if (origins.length === 0) return true;
  const already = await chrome.permissions.contains({ origins });
  if (!already) {
    const ok = await chrome.permissions.request({ origins });
    if (!ok) return false;
  }
  await chrome.runtime.sendMessage({ type: "REGISTER_SCRIPTS" });
  return true;
}

async function refresh() {
  const s = (await chrome.runtime.sendMessage({ type: "GET_STATUS" })) as {
    enrolled?: boolean;
    agentId?: string;
    apiUrl?: string;
    error?: string;
  };
  api.value = s.apiUrl ?? "http://localhost:4000";
  grant.hidden = !s.enrolled;
  if (s.enrolled) {
    status.className = "ok";
    status.textContent = `Enrôlé · ${s.agentId}`;
  } else {
    status.className = "warn";
    status.textContent = "Non enrôlé — générez un jeton A1 dans le Dashboard.";
  }
}

document.getElementById("enroll")!.addEventListener("click", async () => {
  status.textContent = "Enrôlement…";
  await chrome.runtime.sendMessage({ type: "CONFIGURE", apiUrl: api.value, token: token.value });
  const res = (await chrome.runtime.sendMessage({ type: "ENROLL", hostname: "chrome-extension" })) as { error?: string };
  if (res?.error) {
    status.className = "warn";
    status.textContent = res.error;
    return;
  }
  const granted = await requestCatalogHosts();
  await refresh();
  if (!granted) {
    status.className = "warn";
    status.textContent = `${status.textContent} · autorisez les sites du catalogue pour les nouveaux domaines.`;
  }
});

grant.addEventListener("click", async () => {
  const ok = await requestCatalogHosts();
  status.className = ok ? "ok" : "warn";
  status.textContent = ok
    ? "Sites du catalogue autorisés — les nouveaux domaines sont interceptés sans reconstruire l'extension."
    : "Permission refusée. Les sites déjà listés dans le manifeste restent protégés.";
});

void refresh();
