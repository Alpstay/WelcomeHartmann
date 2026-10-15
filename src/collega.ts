// Pagina collega.html: collega una volta GitHub a La Scatola (login OAuth con PKCE) e mostra i due valori
// da salvare come segreti del repository. I valori restano solo in questa pagina, mai salvati nel browser.

import { CLIENT_FILE, parseClient, readTokenResponse } from "./scatola-client";
import type { ScatolaClient } from "./scatola-client";

const REPO = "https://github.com/Alpstay/WelcomeHartmann";
const PENDING_KEY = "welcomeHartmann.collega";

interface Pending {
  readonly state: string;
  readonly verifier: string;
  readonly redirect: string;
}

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id}`);
  return el as T;
};

const b64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random = (n: number): string => b64url(crypto.getRandomValues(new Uint8Array(n)));

async function challenge(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

/** Indirizzo di ritorno: questa pagina, senza parametri. */
const redirectUri = (): string => `${location.origin}${location.pathname}`;

function show(id: string): void {
  for (const s of ["s-start", "s-missing", "s-done", "s-error"]) $(s).hidden = s !== id;
}

function error(text: string): void {
  $("err-text").textContent = text;
  show("s-error");
}

async function login(cfg: ScatolaClient): Promise<void> {
  const pending: Pending = { state: random(24), verifier: random(48), redirect: redirectUri() };
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    error("Il browser non permette di salvare il passaggio di login (navigazione privata?). Riprova in una finestra normale.");
    return;
  }
  const q = new URLSearchParams({
    response_type: "code",
    client_id: cfg.client_id,
    redirect_uri: pending.redirect,
    scope: cfg.scope,
    state: pending.state,
    code_challenge: await challenge(pending.verifier),
    code_challenge_method: "S256",
  });
  if (cfg.resource) q.set("resource", cfg.resource);
  location.assign(`${cfg.authorize_url}?${q}`);
}

function secretRow(name: string, value: string): HTMLElement {
  const input = document.createElement("input");
  input.type = "password";
  input.readOnly = true;
  input.value = value;
  input.className = "secret";
  input.setAttribute("aria-label", `Valore di ${name}`);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "btn ghost small";
  toggle.textContent = "Mostra";
  toggle.addEventListener("click", () => {
    input.type = input.type === "password" ? "text" : "password";
    toggle.textContent = input.type === "password" ? "Mostra" : "Nascondi";
  });
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "btn dark small";
  copy.textContent = "Copia";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      input.type = "text";
      input.select();
      document.execCommand("copy");
    }
    copy.textContent = "Copiato";
    window.setTimeout(() => (copy.textContent = "Copia"), 1800);
  });
  const name_ = document.createElement("code");
  name_.textContent = name;
  const row = document.createElement("div");
  row.className = "secret-row";
  const controls = document.createElement("div");
  controls.className = "secret-controls";
  controls.append(input, toggle, copy);
  row.append(name_, controls);
  return row;
}

async function finish(cfg: ScatolaClient, params: URLSearchParams): Promise<void> {
  history.replaceState(null, "", redirectUri());
  let pending: Pending | null = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null") as Pending | null;
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    pending = null;
  }
  if (params.get("error")) {
    error(`La Scatola non ha concesso l'accesso (${(params.get("error_description") ?? params.get("error") ?? "").slice(0, 160)}).`);
    return;
  }
  if (!pending || pending.state !== params.get("state")) {
    error("Il login non corrisponde a questa pagina (scaduto o aperto in un'altra scheda). Premi di nuovo «Accedi a La Scatola».");
    return;
  }
  let res: Response;
  try {
    res = await fetch(cfg.token_url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: params.get("code") ?? "",
        redirect_uri: pending.redirect,
        client_id: cfg.client_id,
        code_verifier: pending.verifier,
      }),
    });
  } catch {
    error("La Scatola non risponde da questa pagina (rete o blocco del browser verso il server di accesso). Avvisa chi gestisce la Scatola.");
    return;
  }
  const tok = await readTokenResponse(res).catch((e: Error) => {
    error(e.message);
    return null;
  });
  if (!tok) return;
  if (!tok.refresh_token) {
    error("Il login è riuscito, ma La Scatola non ha dato un accesso rinnovabile: chiedi all'amministratore di abilitare il refresh token per questo client.");
    return;
  }
  const list = $("secrets");
  list.replaceChildren(secretRow("SCATOLA_REFRESH_TOKEN", tok.refresh_token), secretRow("SCATOLA_TOKEN_KEY", random(32)));
  show("s-done");
}

async function start(): Promise<void> {
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[data-repo]")) a.href = `${REPO}${a.dataset.repo ?? ""}`;
  let cfg: ScatolaClient;
  try {
    const res = await fetch(`${CLIENT_FILE}?t=${Date.now()}`, { cache: "no-store" });
    cfg = parseClient(await res.json());
  } catch (e) {
    error(`Configurazione non leggibile: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  const params = new URLSearchParams(location.search);
  if (params.has("code") || params.has("error")) {
    await finish(cfg, params);
    return;
  }
  if (!cfg.client_id) {
    show("s-missing");
    return;
  }
  show("s-start");
  $("login").addEventListener("click", () => void login(cfg));
}

void start();
