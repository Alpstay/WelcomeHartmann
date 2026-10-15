// Aggiornamento di arrivi.json su GitHub Actions, direttamente dal connettore La Scatola (/mcp).
//
//   node tools/github-feed.mjs token  <file-accesso>   rinnova l'accesso e lo scrive nel file indicato
//   node tools/github-feed.mjs arrivi <file-accesso>   legge La Scatola e scrive arrivi.json cifrato
//
// Segreti del repository (Settings → Secrets and variables → Actions):
//   ARRIVI_PASSWORD        password reception che cifra arrivi.json
//   SCATOLA_TOKEN_KEY      chiave che cifra il collegamento salvato in scatola-token.json
//   SCATOLA_REFRESH_TOKEN  collegamento iniziale, dato dalla pagina collega.html
//
// I registri di GitHub Actions di un repository pubblico sono pubblici: qui non si stampa mai nessun dato
// degli ospiti né il contenuto delle risposte. Gli ID di Slope passano così come arrivano.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { FEED_FILE, decryptJson, encryptJson } from "../feed";
import type { EncBlock } from "../feed";
import { HARTMANN_ID, buildFeed, feedDates, hartmannRows } from "../feed-build";
import { CLIENT_FILE, parseClient, readTokenResponse } from "../scatola-client";
import type { ScatolaClient } from "../scatola-client";
import type { ArrivalRow, BookerFields, Freshness, GuestStayFields } from "../types";

const TOKEN_FILE = "scatola-token.json";
const STATUS_FILE = "stato-arrivi.txt";
const TOKEN_AAD = "WelcomeHartmann|scatola-token";

interface TokenState {
  readonly format: 1;
  /** Impronta del collegamento iniziale (segreto SCATOLA_REFRESH_TOKEN) da cui deriva quello salvato. */
  readonly seed: string;
  readonly updated_at: string;
  readonly enc: EncBlock;
}

class Stop extends Error {}

// ——— uscita ———

const out = (line: string): void => void process.stdout.write(`${line}\n`);

const romeStamp = (): string => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};

/** Riga letta dalla pagina: "AAAA-MM-GG HH:MM non pubblicato · GitHub · motivo". */
function writeStatus(reason: string): void {
  writeFileSync(STATUS_FILE, `${romeStamp()} non pubblicato · GitHub · ${reason.replace(/\s+/g, " ").slice(0, 200)}\n`);
}

function setOutput(name: string, value: string): void {
  const f = process.env.GITHUB_OUTPUT;
  if (f) writeFileSync(f, `${name}=${value}\n`, { flag: "a" });
}

const env = (name: string): string => (process.env[name] ?? "").trim();
const fingerprint = (s: string): string => createHash("sha256").update(s).digest("hex").slice(0, 16);

function loadClient(): ScatolaClient {
  if (!existsSync(CLIENT_FILE)) throw new Stop(`${CLIENT_FILE} mancante`);
  return parseClient(JSON.parse(readFileSync(CLIENT_FILE, "utf8")));
}

// ——— collegamento (refresh token) ———

async function token(accessFile: string): Promise<void> {
  const client = loadClient();
  const key = env("SCATOLA_TOKEN_KEY");
  const seedToken = env("SCATOLA_REFRESH_TOKEN");
  if (!client.client_id || !key) {
    out(`NON COLLEGATO: ${!client.client_id ? `client_id vuoto in ${CLIENT_FILE}` : "segreto SCATOLA_TOKEN_KEY mancante"}. Nessun aggiornamento.`);
    setOutput("collegato", "false");
    return;
  }

  const seed = seedToken ? fingerprint(seedToken) : "";
  let refresh = "";
  let stateSeed = seed;
  if (existsSync(TOKEN_FILE)) {
    const state = JSON.parse(readFileSync(TOKEN_FILE, "utf8")) as TokenState;
    // Se nei segreti c'è un collegamento nuovo (impronta diversa) vale quello; altrimenti l'ultimo salvato.
    if (!seed || state.seed === seed) {
      try {
        refresh = (await decryptJson<{ refresh_token: string }>(state.enc, key, TOKEN_AAD)).refresh_token;
        stateSeed = state.seed;
      } catch {
        refresh = "";
      }
    }
  }
  if (!refresh) refresh = seedToken;
  if (!refresh) throw new Stop("collegamento a La Scatola mancante: aprire collega.html e salvare SCATOLA_REFRESH_TOKEN");

  const res = await fetch(client.token_url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: client.client_id }),
  }).catch(() => {
    throw new Stop("La Scatola non raggiungibile per il rinnovo dell'accesso");
  });
  const tok = await readTokenResponse(res).catch((e: Error) => {
    throw new Stop(`${e.message}: ricollegare da collega.html`);
  });

  // Il nuovo refresh token va salvato subito: quello vecchio non vale più.
  const next = tok.refresh_token ?? refresh;
  const state: TokenState = { format: 1, seed: stateSeed, updated_at: new Date().toISOString(), enc: await encryptJson({ refresh_token: next }, key, TOKEN_AAD) };
  writeFileSync(TOKEN_FILE, `${JSON.stringify(state)}\n`);
  writeFileSync(accessFile, tok.access_token, { mode: 0o600 });
  setOutput("collegato", "true");
  out(`Accesso a La Scatola rinnovato${tok.expires_in ? ` (valido ${Math.round(tok.expires_in / 60)} minuti)` : ""}.`);
}

// ——— lettura da La Scatola ———

interface Page {
  readonly data: Record<string, unknown>[];
  readonly freshness: Freshness;
  readonly next: string | null;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function asPage(v: unknown): Page | null {
  if (typeof v === "string") {
    try {
      return asPage(JSON.parse(v));
    } catch {
      return null;
    }
  }
  if (!isRec(v) || !Array.isArray(v.data)) return null;
  const page = isRec(v.page) ? v.page : {};
  const freshness = isRec(v.freshness) ? (v.freshness as unknown as Freshness) : { overall: { status: "unavailable" as const }, sources: [] };
  return { data: v.data as Record<string, unknown>[], freshness, next: typeof page.next_cursor === "string" ? page.next_cursor : null };
}

const textOf = (content: unknown): string =>
  Array.isArray(content) ? content.map((b) => (isRec(b) && typeof b.text === "string" ? b.text : "")).join("") : "";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

class Scatola {
  calls = 0;
  private constructor(private readonly client: Client) {}

  static async open(cfg: ScatolaClient, access: string): Promise<Scatola> {
    const transport = new StreamableHTTPClientTransport(new URL(cfg.mcp_url), {
      requestInit: { headers: { Authorization: `Bearer ${access}` } },
    });
    const client = new Client({ name: "welcomehartmann-github", version: "1.0.0" });
    try {
      await client.connect(transport);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = /\b(401|403|404|5\d\d)\b/.exec(msg)?.[1];
      throw new Stop(`connessione al connettore La Scatola non riuscita${status ? ` (HTTP ${status})` : ""}`);
    }
    return new Scatola(client);
  }

  async close(): Promise<void> {
    await this.client.close().catch(() => undefined);
  }

  /** Una chiamata, con un secondo tentativo. Gli errori non riportano mai il contenuto delle risposte. */
  private async call(tool: string, args: Record<string, unknown>): Promise<Page> {
    let last = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await sleep(2500);
      this.calls++;
      try {
        const res = await this.client.callTool({ name: tool, arguments: args });
        if (res.isError) {
          last = `${tool}: errore dello strumento`;
          continue;
        }
        const page = asPage(res.structuredContent) ?? asPage(textOf(res.content));
        if (page) return page;
        last = `${tool}: risposta non riconosciuta`;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        const status = /\b(401|403|404|429|5\d\d)\b/.exec(msg)?.[1];
        last = `${tool}: chiamata non riuscita${status ? ` (HTTP ${status})` : ""}`;
      }
    }
    throw new Stop(last);
  }

  /** Tutte le pagine di una lettura (al massimo 50). */
  async all(tool: string, args: Record<string, unknown>): Promise<{ rows: Record<string, unknown>[]; freshness: Freshness[] }> {
    const rows: Record<string, unknown>[] = [];
    const freshness: Freshness[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 50; i++) {
      const page: Page = await this.call(tool, cursor ? { ...args, cursor } : args);
      rows.push(...page.data);
      freshness.push(page.freshness);
      cursor = page.next;
      if (!cursor) return { rows, freshness };
    }
    throw new Stop(`${tool}: troppe pagine`);
  }
}

async function arrivi(accessFile: string): Promise<void> {
  const password = env("ARRIVI_PASSWORD");
  if (password.length < 8) throw new Stop("segreto ARRIVI_PASSWORD mancante");
  if (!existsSync(accessFile)) throw new Stop("accesso a La Scatola non disponibile");
  const cfg = loadClient();
  const scatola = await Scatola.open(cfg, readFileSync(accessFile, "utf8").trim());
  try {
    const dates = feedDates();
    const arrivals: ArrivalRow[] = [];
    const freshness: Freshness[] = [];
    for (const date of dates) {
      const r = await scatola.all("list_arrivals", { date, property_id: HARTMANN_ID, limit: 100 });
      arrivals.push(...(r.rows as unknown as ArrivalRow[]));
      freshness.push(...r.freshness);
    }
    const rows = hartmannRows(arrivals);

    // Nomi e lingue: viste con dati personali, lette e tenute solo in memoria.
    const ids = rows.map((r) => r.reservation_id).sort();
    const stays: GuestStayFields[] = [];
    const contacts: BookerFields[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const filters = [{ field: "reservation_id", op: "in", value: ids.slice(i, i + 50) }];
      stays.push(...((await scatola.all("query_curated_view", { view: "curated_guest_stays", filters, limit: 500 })).rows as unknown as GuestStayFields[]));
      contacts.push(...((await scatola.all("query_curated_view", { view: "curated_reservation_contacts", filters, limit: 100 })).rows as unknown as BookerFields[]));
    }

    const built = await buildFeed({ dates, rows, stays, contacts, freshness }, password).catch((e: unknown) => {
      throw new Stop(e instanceof Error ? e.message : "composizione non riuscita");
    });
    writeFileSync(FEED_FILE, `${JSON.stringify(built.envelope)}\n`);
    for (const line of built.summary) out(line);
    out(`RIEPILOGO chiamate a La Scatola: ${scatola.calls}`);
    out(`PRONTO ${FEED_FILE} scritto e verificato`);
  } finally {
    await scatola.close();
  }
}

// ——— avvio ———

const [cmd, file] = process.argv.slice(2);
const job = cmd === "token" ? token : cmd === "arrivi" ? arrivi : null;
if (!job || !file) {
  out("uso: node tools/github-feed.mjs token|arrivi <file-accesso>");
  process.exit(2);
}
job(file).catch((e: unknown) => {
  // Solo messaggi nostri: un errore imprevisto non viene stampato per intero (potrebbe contenere dati).
  const reason = e instanceof Stop ? e.message : `errore imprevisto (${e instanceof Error ? e.name : "sconosciuto"})`;
  writeStatus(reason);
  out(`ERRORE ${reason}`);
  process.exit(1);
});
