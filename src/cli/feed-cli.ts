// Aggiornamento automatico di arrivi.json (WelcomeHartmann) dalle risposte del connettore La Scatola.
//
//   node tools/feed.mjs start "<PASSWORD>"   prepara l'esecuzione (giorni da oggi a +6)
//   node tools/feed.mjs next                  dice quale chiamata fare a La Scatola, oppure scrive arrivi.json
//   node tools/feed.mjs verify [file] "<PASSWORD>"
//
// Le risposte di La Scatola NON si ricopiano a mano: il programma le legge dal registro della sessione
// (~/.claude/projects/…/*.jsonl), così gli ID di Slope restano esattamente quelli ricevuti.

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { FEED_FILE, decryptJson, feedAad, isFeedEnvelope } from "../feed";
import type { FeedPayload } from "../feed";
import { HARTMANN_ID, buildFeed, feedDates, hartmannRows } from "../feed-build";
import type { ArrivalRow, BookerFields, Freshness, GuestStayFields } from "../types";
const RUN_FILE = join(tmpdir(), "welcome-hartmann-run.json");
const MAX_TRIES = 3;

interface Run {
  readonly token: string;
  readonly startedAt: string;
  readonly password: string;
  readonly dates: readonly string[];
  readonly transcript: string | null;
}

interface Envelope {
  readonly data: readonly Record<string, unknown>[];
  readonly freshness: Freshness;
  readonly next: string | null;
}

interface Call {
  readonly id: string;
  readonly at: string;
  readonly tool: "list_arrivals" | "query_curated_view";
  readonly input: Record<string, unknown>;
  page: Envelope | null;
  error: string | null;
}

// ——— uscita ———

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}
function fail(message: string): never {
  out(`ERRORE ${message}`);
  process.exit(2);
}

// ——— registro della sessione ———

function transcripts(): { path: string; mtime: number }[] {
  const found: { path: string; mtime: number }[] = [];
  const walk = (dir: string, depth: number): void => {
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const p = join(dir, name);
      try {
        const st = statSync(p);
        if (st.isDirectory()) {
          if (depth < 5) walk(p, depth + 1);
        } else if (name.endsWith(".jsonl")) found.push({ path: p, mtime: st.mtimeMs });
      } catch {
        /* file sparito nel frattempo */
      }
    }
  };
  walk(join(homedir(), ".claude", "projects"), 0);
  return found.sort((a, b) => b.mtime - a.mtime);
}

function findTranscript(run: Run): string {
  if (run.transcript) return run.transcript;
  const all = transcripts();
  if (all.length === 0) fail(`nessun registro di sessione in ${join(homedir(), ".claude", "projects")}. Passa --transcript <file> a start.`);
  const marked = all.find((t) => {
    try {
      return readFileSync(t.path, "utf8").includes(run.token);
    } catch {
      return false;
    }
  });
  if (!marked) fail(`nessun registro contiene il segno ${run.token}: riesegui start e poi next.`);
  return marked.path;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((b) => (isRec(b) && typeof b.text === "string" ? b.text : "")).join("");
  return "";
}

const SAVED_PATH = /saved to:?\s+(\/\S+?\.(?:txt|json))(?=[.,;)\s]|$)/i;

function asEnvelope(v: unknown, depth = 0): Envelope | null {
  if (typeof v === "string") {
    const t = v.trim();
    if (depth > 3 || !/^[{["]/.test(t)) return null;
    try {
      return asEnvelope(JSON.parse(t), depth + 1);
    } catch {
      return null;
    }
  }
  if (Array.isArray(v)) return asEnvelope(v.map((b) => (isRec(b) && typeof b.text === "string" ? b.text : "")).join(""), depth + 1);
  if (!isRec(v) || !Array.isArray(v.data)) return null;
  const page = isRec(v.page) ? v.page : {};
  const fresh = isRec(v.freshness) ? (v.freshness as unknown as Freshness) : { overall: { status: "unavailable" as const }, sources: [] };
  return { data: v.data as Record<string, unknown>[], freshness: fresh, next: typeof page.next_cursor === "string" ? page.next_cursor : null };
}

function parseResult(body: string, isError: boolean): { page: Envelope | null; error: string | null } {
  const raw = body.trim();
  if (isError) return { page: null, error: raw.replace(/\s+/g, " ").slice(0, 160) || "errore dello strumento" };
  let env = asEnvelope(raw);
  if (!env) {
    const saved = SAVED_PATH.exec(raw);
    if (saved) {
      if (!existsSync(saved[1])) return { page: null, error: `file della risposta non trovato (${basename(saved[1])})` };
      env = asEnvelope(readFileSync(saved[1], "utf8"));
    }
  }
  return env ? { page: env, error: null } : { page: null, error: `risposta non riconosciuta (${raw.length} caratteri)` };
}

function readCalls(transcript: string, since: string): Call[] {
  const byId = new Map<string, Call>();
  for (const line of readFileSync(transcript, "utf8").split("\n")) {
    if (!line || (!line.includes("Scatola") && !line.includes("tool_result"))) continue;
    let o: unknown;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRec(o) || !isRec(o.message) || !Array.isArray(o.message.content)) continue;
    const at = typeof o.timestamp === "string" ? o.timestamp : "";
    for (const block of o.message.content as unknown[]) {
      if (!isRec(block)) continue;
      if (block.type === "tool_use" && typeof block.name === "string" && /scatola/i.test(block.name) && typeof block.id === "string" && isRec(block.input)) {
        const tool = /list_arrivals$/.test(block.name) ? "list_arrivals" : /query_curated_view$/.test(block.name) ? "query_curated_view" : null;
        if (tool && at >= since) byId.set(block.id, { id: block.id, at, tool, input: block.input, page: null, error: "nessuna risposta" });
      } else if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
        const call = byId.get(block.tool_use_id);
        if (call) Object.assign(call, parseResult(resultText(block.content), block.is_error === true));
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at));
}

// ——— confronto delle chiamate ———

const sameIds = (a: unknown, b: readonly string[]): boolean =>
  Array.isArray(a) && a.length === b.length && [...a].map(String).sort().join("|") === [...b].sort().join("|");

type Matcher = (c: Call) => boolean;

interface Chain {
  readonly rows: Record<string, unknown>[];
  readonly freshness: Freshness[];
  readonly next: Record<string, unknown> | null;
  readonly failures: number;
}

/** Ricompone una lettura a pagine: prima pagina senza cursore, poi i cursori in ordine. */
function follow(calls: readonly Call[], match: Matcher, first: Record<string, unknown>): Chain {
  const mine = calls.filter(match);
  const starts = mine.filter((c) => !c.input.cursor);
  const ok = starts.filter((c) => c.page).pop();
  if (!ok) return { rows: [], freshness: [], next: first, failures: starts.length };
  const rows: Record<string, unknown>[] = [];
  const freshness: Freshness[] = [];
  let cur: Call = ok;
  for (let guard = 0; guard < 200; guard++) {
    rows.push(...cur.page!.data);
    freshness.push(cur.page!.freshness);
    const cursor = cur.page!.next;
    if (!cursor) return { rows, freshness, next: null, failures: 0 };
    const tries = mine.filter((c) => c.input.cursor === cursor && c.at >= ok.at);
    const good = tries.filter((c) => c.page).pop();
    if (!good) return { rows, freshness, next: { ...first, cursor }, failures: tries.length };
    cur = good;
  }
  return fail("la lettura a pagine non termina");
}

function ask(tool: string, input: Record<string, unknown>, failures: number, lastError: string | null): never {
  if (failures >= MAX_TRIES) fail(`La Scatola non risponde a ${tool} dopo ${failures} tentativi (${lastError ?? "errore"}). Non pubblicare.`);
  out(`CHIAMA mcp__La_Scatola__${tool} ${JSON.stringify(input)}`);
  out("Copia gli argomenti identici, poi riesegui: node tools/feed.mjs next");
  process.exit(0);
}

const lastError = (calls: readonly Call[], match: Matcher): string | null => calls.filter(match).filter((c) => c.error).pop()?.error ?? null;

// ——— comandi ———

function loadRun(): Run {
  if (!existsSync(RUN_FILE)) fail("nessuna esecuzione avviata: esegui prima start.");
  return JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
}

function start(args: string[]): void {
  const password = args[0];
  if (!password || password.length < 8) fail('serve la password: node tools/feed.mjs start "<PASSWORD>"');
  if (!existsSync("index.html")) fail("esegui il comando dalla cartella del repository WelcomeHartmann.");
  const ti = args.indexOf("--transcript");
  const run: Run = {
    token: `WH-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    startedAt: new Date(Date.now() - 1000).toISOString(),
    password,
    dates: feedDates(),
    transcript: ti >= 0 ? args[ti + 1] ?? null : null,
  };
  writeFileSync(RUN_FILE, JSON.stringify(run), { mode: 0o600 });
  out(`SEGNO ${run.token}`);
  out(`Giorni: ${run.dates[0]} → ${run.dates[run.dates.length - 1]}`);
  out("Ora esegui: node tools/feed.mjs next");
}

async function next(): Promise<void> {
  const run = loadRun();
  const calls = readCalls(findTranscript(run), run.startedAt);

  // 1) arrivi giorno per giorno
  const arrivals: ArrivalRow[] = [];
  const fresh: Freshness[] = [];
  for (const date of run.dates) {
    const first = { date, property_id: HARTMANN_ID, limit: 100 };
    const match: Matcher = (c) => c.tool === "list_arrivals" && c.input.date === date && c.input.property_id === HARTMANN_ID && c.input.limit === 100;
    const chain = follow(calls, match, first);
    if (chain.next) ask("list_arrivals", chain.next, chain.failures, lastError(calls, match));
    arrivals.push(...(chain.rows as unknown as ArrivalRow[]));
    fresh.push(...chain.freshness);
  }
  const rows = hartmannRows(arrivals);

  // 2) nomi e lingue (viste con dati personali: le legge solo il programma)
  const ids = rows.map((r) => r.reservation_id).sort();
  const stays: GuestStayFields[] = [];
  const contacts: BookerFields[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const views: [string, number, (r: Record<string, unknown>[]) => void][] = [
      ["curated_guest_stays", 500, (r) => stays.push(...(r as unknown as GuestStayFields[]))],
      ["curated_reservation_contacts", 100, (r) => contacts.push(...(r as unknown as BookerFields[]))],
    ];
    for (const [view, limit, sink] of views) {
      const first = { view, filters: [{ field: "reservation_id", op: "in", value: chunk }], limit };
      const match: Matcher = (c) => {
        const f = Array.isArray(c.input.filters) ? (c.input.filters as Record<string, unknown>[]) : [];
        return (
          c.tool === "query_curated_view" &&
          c.input.view === view &&
          c.input.limit === limit &&
          f.length === 1 &&
          f[0].field === "reservation_id" &&
          f[0].op === "in" &&
          sameIds(f[0].value, chunk)
        );
      };
      const chain = follow(calls, match, first);
      if (chain.next) ask("query_curated_view", chain.next, chain.failures, lastError(calls, match));
      sink(chain.rows);
    }
  }

  // 3) composizione, cifratura, verifica
  const built = await buildFeed({ dates: run.dates, rows, stays, contacts, freshness: fresh }, run.password).catch((e: unknown) =>
    fail(`${e instanceof Error ? e.message : String(e)}. Non pubblicare.`),
  );
  writeFileSync(FEED_FILE, `${JSON.stringify(built.envelope)}\n`);
  for (const line of built.summary) out(line.startsWith("RIEPILOGO senza") ? `${line} · chiamate lette: ${calls.length}` : line);
  out(`PRONTO ${FEED_FILE} scritto e verificato`);
}

async function verify(args: string[]): Promise<void> {
  const file = args.length > 1 ? args[0] : FEED_FILE;
  const password = args.length > 1 ? args[1] : args[0];
  if (!password) fail('uso: node tools/feed.mjs verify [arrivi.json] "<PASSWORD>"');
  const env: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isFeedEnvelope(env)) fail(`${file} non è un file arrivi valido`);
  const payload = await decryptJson<FeedPayload>(env.enc, password, feedAad(env.from)).catch(() => fail("password errata o file alterato"));
  const total = Object.values(payload.days).reduce((n, d) => n + d.length, 0);
  const ok = Object.entries(env.counts).every(([d, n]) => (payload.days[d]?.length ?? -1) === n);
  if (!ok) fail("i conteggi in chiaro non corrispondono al contenuto cifrato");
  out(`verifica OK: ${env.from} → ${env.to}, ${total} arrivi, scritto ${env.generated_at}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const run = cmd === "start" ? async () => start(rest) : cmd === "next" ? next : cmd === "verify" ? () => verify(rest) : null;
if (!run) fail('comandi: start "<PASSWORD>" · next · verify [file] "<PASSWORD>"');
run().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
