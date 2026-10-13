// Aggiornamento automatico di hotel-oggi.json (pagina «Hotel oggi» dell'AlpStay App Hub).
//
//   node tools/hotel-oggi.mjs start "<PASSWORD>"   prepara l'esecuzione (fissa giorno e finestre di tempo)
//   node tools/hotel-oggi.mjs next                  dice quale chiamata fare a La Scatola, oppure scrive il file
//   node tools/hotel-oggi.mjs verify [file] "<PASSWORD>"
//
// Le risposte di La Scatola NON si ricopiano a mano: il programma le legge dal registro della sessione,
// così gli ID di Slope restano esattamente quelli ricevuti.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decryptJson, encryptJson } from "../feed";
import type { Freshness } from "../types";
import {
  HO_APP,
  HO_FILE,
  buildPayload,
  hoAad,
  isHoEnvelope,
  lastReservationUpdate,
  summaryLines,
  windowsAt,
  worstFreshness,
} from "./model";
import type { HoEnvelope, HoPayload, HoWindows, RawData, Row } from "./model";
import { findTranscript, follow, readCalls } from "./transcript";
import type { ScatolaTool } from "./transcript";

const RUN_FILE = join(tmpdir(), "hotel-oggi-run.json");
const MAX_TRIES = 3;
const CMD = "node tools/hotel-oggi.mjs";

interface Run {
  readonly token: string;
  readonly startedAt: string;
  readonly password: string;
  readonly day: string;
  readonly windows: HoWindows;
  readonly transcript: string | null;
}

interface Step {
  readonly key: keyof RawData;
  readonly tool: ScatolaTool;
  readonly first: Record<string, unknown>;
}

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}
function fail(message: string): never {
  out(`ERRORE ${message}`);
  process.exit(2);
}

const RES = "curated_reservations";
const countAgg = { field: "reservation_id", op: "count" };
const sumAgg = { field: "room_amount", op: "sum" };

/** Le chiamate, sempre nello stesso ordine e con gli stessi argomenti per tutta l'esecuzione. */
export function plan(day: string, w: HoWindows): Step[] {
  const created = (from: string): Record<string, unknown> => ({
    view: RES,
    filters: [{ field: "creation_date", op: "gte", value: from }],
    group_by: ["property_name", "is_canceled"],
    aggregates: [countAgg, sumAgg],
    limit: 50,
  });
  const cancelled = (from: string): Record<string, unknown> => ({
    view: RES,
    filters: [{ field: "cancellation_date", op: "gte", value: from }],
    group_by: ["property_name"],
    aggregates: [countAgg],
    limit: 50,
  });
  return [
    { key: "arrivals", tool: "list_arrivals", first: { date: day, limit: 500 } },
    { key: "departures", tool: "list_departures", first: { date: day, limit: 500 } },
    { key: "inHouse", tool: "list_in_house", first: { date: day, limit: 500 } },
    { key: "created24", tool: "query_curated_view", first: created(w.t24) },
    { key: "created7", tool: "query_curated_view", first: created(w.t7) },
    { key: "cancelled24", tool: "query_curated_view", first: cancelled(w.t24) },
    { key: "cancelled7", tool: "query_curated_view", first: cancelled(w.t7) },
    {
      key: "ly7",
      tool: "query_curated_view",
      first: {
        view: RES,
        filters: [
          { field: "creation_date", op: "gte", value: w.lyFrom },
          { field: "creation_date", op: "lt", value: w.lyTo },
        ],
        group_by: ["property_name"],
        aggregates: [countAgg],
        limit: 50,
      },
    },
    {
      key: "availability",
      tool: "query_curated_view",
      first: {
        view: "curated_availability_daily",
        filters: [
          { field: "day", op: "gte", value: day },
          { field: "day", op: "lte", value: w.horizonEnd },
        ],
        limit: 500,
      },
    },
  ];
}

function loadRun(): Run {
  if (!existsSync(RUN_FILE)) fail(`nessuna esecuzione avviata: esegui prima ${CMD} start.`);
  return JSON.parse(readFileSync(RUN_FILE, "utf8")) as Run;
}

function start(args: string[]): void {
  const password = args[0];
  if (!password || password.length < 12) fail(`serve la password: ${CMD} start "<PASSWORD>"`);
  if (!existsSync("tools/hotel-oggi.mjs")) fail("esegui il comando dalla cartella del repository WelcomeHartmann.");
  const ti = args.indexOf("--transcript");
  const { day, windows } = windowsAt(Date.now());
  const run: Run = {
    token: `HO-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    startedAt: new Date(Date.now() - 1000).toISOString(),
    password,
    day,
    windows,
    transcript: ti >= 0 ? args[ti + 1] ?? null : null,
  };
  writeFileSync(RUN_FILE, JSON.stringify(run), { mode: 0o600 });
  out(`SEGNO ${run.token}`);
  out(`Giorno ${day} · pickup dalle ${windows.t24} e dalle ${windows.t7} · portafoglio fino al ${windows.horizonEnd}`);
  out(`Ora esegui: ${CMD} next`);
}

async function next(): Promise<void> {
  const run = loadRun();
  const transcript = run.transcript ?? findTranscript(run.token);
  if (!transcript) fail(`nessun registro contiene il segno ${run.token}: riesegui start e poi next.`);
  const calls = readCalls(transcript, run.startedAt);

  const raw: Record<keyof RawData, Row[]> = {
    arrivals: [],
    departures: [],
    inHouse: [],
    created24: [],
    created7: [],
    cancelled24: [],
    cancelled7: [],
    ly7: [],
    availability: [],
  };
  const fresh: Freshness[] = [];
  for (const step of plan(run.day, run.windows)) {
    const chain = follow(calls, step.tool, step.first);
    if (chain.next) {
      if (chain.failures >= MAX_TRIES) fail(`La Scatola non risponde a ${step.tool} dopo ${chain.failures} tentativi (${chain.lastError ?? "errore"}). Non pubblicare.`);
      out(`CHIAMA mcp__La_Scatola__${step.tool} ${JSON.stringify(chain.next)}`);
      out(`Copia gli argomenti identici, poi riesegui: ${CMD} next`);
      process.exit(0);
    }
    raw[step.key] = chain.rows;
    fresh.push(...chain.freshness);
  }

  const payload: HoPayload = buildPayload(raw, run.day, run.windows);
  if (!payload.hotels.some((h) => h.arrivals.length || h.departures.length || h.stayovers || h.forecast.cap.some((c) => c > 0)))
    fail("La Scatola non ha restituito nessun dato per le tre case. Non pubblicare.");
  const envelope: HoEnvelope = {
    format: 1,
    app: HO_APP,
    generated_at: new Date().toISOString(),
    scatola_updated_at: lastReservationUpdate(fresh),
    freshness: worstFreshness(fresh),
    day: run.day,
    enc: await encryptJson(payload, run.password, hoAad(run.day)),
  };
  const back = await decryptJson<HoPayload>(envelope.enc, run.password, hoAad(run.day));
  if (JSON.stringify(back) !== JSON.stringify(payload)) fail("la verifica della cifratura non torna. Non pubblicare.");
  writeFileSync(HO_FILE, `${JSON.stringify(envelope)}\n`);

  for (const line of summaryLines(payload)) out(`RIEPILOGO ${line}`);
  out(`RIEPILOGO La Scatola: ${envelope.freshness}${envelope.scatola_updated_at ? `, prenotazioni aggiornate alle ${envelope.scatola_updated_at}` : ""} · chiamate lette: ${calls.length}`);
  out(`PRONTO ${HO_FILE} scritto e verificato`);
}

async function verify(args: string[]): Promise<void> {
  const file = args.length > 1 ? args[0] : HO_FILE;
  const password = args.length > 1 ? args[1] : args[0];
  if (!password) fail(`uso: ${CMD} verify [${HO_FILE}] "<PASSWORD>"`);
  const env: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isHoEnvelope(env)) fail(`${file} non è un file Hotel oggi valido`);
  const p = await decryptJson<HoPayload>(env.enc, password, hoAad(env.day)).catch(() => fail("password errata o file alterato"));
  if (p.day !== env.day || p.hotels.length !== 3) fail("contenuto incompleto");
  const n = (k: "arrivals" | "departures"): number => p.hotels.reduce((s, h) => s + h[k].length, 0);
  out(`verifica OK: ${env.day}, ${n("arrivals")} arrivi, ${n("departures")} partenze, scritto ${env.generated_at}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const run = cmd === "start" ? async () => start(rest) : cmd === "next" ? next : cmd === "verify" ? () => verify(rest) : null;
if (!run) fail('comandi: start "<PASSWORD>" · next · verify [file] "<PASSWORD>"');
run().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
