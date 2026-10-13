// Generato da src/hotel-oggi/cli.ts con build.mjs: non modificare a mano.

// src/hotel-oggi/cli.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as join2 } from "node:path";

// src/feed.ts
var ITERATIONS = 25e4;
var subtle = () => {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto non disponibile");
  return c.subtle;
};
function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
}
function fromB64(text) {
  const s = atob(text);
  const out2 = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out2[i] = s.charCodeAt(i);
  return out2;
}
async function keyFrom(password, salt, iter, usage) {
  const base = await subtle().importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, [usage]);
}
async function encryptJson(value, password, aad) {
  const c = globalThis.crypto;
  const salt = c.getRandomValues(new Uint8Array(16));
  const iv = c.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password, salt, ITERATIONS, "encrypt");
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    key,
    new TextEncoder().encode(JSON.stringify(value))
  );
  return { alg: "AES-GCM/PBKDF2-SHA256", iter: ITERATIONS, salt: toB64(salt), iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}
async function decryptJson(enc, password, aad) {
  const key = await keyFrom(password, fromB64(enc.salt), enc.iter, "decrypt");
  const pt = await subtle().decrypt(
    { name: "AES-GCM", iv: fromB64(enc.iv), additionalData: new TextEncoder().encode(aad) },
    key,
    fromB64(enc.ct)
  );
  return JSON.parse(new TextDecoder().decode(pt));
}

// src/hotel-oggi/model.ts
var HO_FILE = "hotel-oggi.json";
var HO_APP = "HotelOggi";
var HO_HORIZON_DAYS = 90;
var hoAad = (day) => `${HO_APP}|${day}`;
var HO_HOTELS = [
  { id: "11111111-1111-4111-8111-111111111111", short: "Acadia" },
  { id: "22222222-2222-4222-8222-222222222222", short: "Hartmann" },
  { id: "33333333-3333-4333-8333-333333333333", short: "Saslong" }
];
function isHoEnvelope(v) {
  const e = v;
  return !!e && e.format === 1 && e.app === HO_APP && typeof e.day === "string" && !!e.enc && typeof e.enc.ct === "string";
}
var addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
var romeDay = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
var isoMinute = (t) => new Date(Math.floor(t / 6e4) * 6e4).toISOString().replace(/\.\d{3}Z$/, "Z");
function windowsAt(nowMs) {
  const day = romeDay(nowMs);
  const H = 36e5;
  return {
    day,
    windows: {
      now: isoMinute(nowMs),
      t24: isoMinute(nowMs - 24 * H),
      t7: isoMinute(nowMs - 7 * 24 * H),
      lyFrom: isoMinute(nowMs - (7 + 364) * 24 * H),
      lyTo: isoMinute(nowMs - 364 * 24 * H),
      horizonEnd: addDays(day, HO_HORIZON_DAYS - 1)
    }
  };
}
var str = (v) => typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
var num = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};
var bool = (v) => v === true || v === "true" || v === 1;
var nightsOf = (a, d) => {
  if (!a || !d) return 0;
  const n = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
var isCancelled = (r) => str(r.booking_status) === "CANCELLED" || bool(r.is_canceled);
function statusOf(r) {
  const s = str(r.stay_status);
  if (s === "IN_HOUSE" || s === "DEPARTED" || s === "TO_ARRIVE") return s;
  if (str(r.check_out_at)) return "DEPARTED";
  if (str(r.check_in_at)) return "IN_HOUSE";
  return "TO_ARRIVE";
}
var byProperty = (rows, propertyId) => rows.filter((r) => r.property_id === propertyId);
function unique(rows) {
  const seen = /* @__PURE__ */ new Map();
  const out2 = [];
  for (const r of rows) {
    const id = str(r.reservation_id);
    if (id) {
      if (!seen.has(id)) {
        seen.set(id, r);
        out2.push(r);
      }
    } else out2.push(r);
  }
  return out2;
}
function toMove(r, kind) {
  const status = statusOf(r);
  return {
    room: str(r.room_name),
    adults: num(r.adults),
    children: num(r.children),
    nights: nightsOf(str(r.arrival), str(r.departure)),
    channel: str(r.channel) ?? str(r.agency_name) ?? str(r.sale_source),
    status,
    at: kind === "arrival" ? str(r.check_in_at) : str(r.check_out_at),
    option: bool(r.is_option)
  };
}
var roomSort = (a, b) => (a.room ?? "~").localeCompare(b.room ?? "~", "it", { numeric: true }) || a.adults - b.adults;
function grouped(rows, propertyId) {
  let count = 0;
  let amount = 0;
  let cancelledCount = 0;
  for (const r of byProperty(rows, propertyId)) {
    const c = num(r.count_reservation_id);
    count += c;
    if (bool(r.is_canceled)) cancelledCount += c;
    else amount += num(r.sum_room_amount);
  }
  return { count, amount: Math.round(amount * 100) / 100, cancelledCount };
}
function pick(created, cancelled, propertyId) {
  const c = grouped(created, propertyId);
  return { created: c.count, active: c.count - c.cancelledCount, cancelled: grouped(cancelled, propertyId).count, revenue: c.amount };
}
function forecast(rows, propertyId, from, days) {
  const occ = new Array(days).fill(0);
  const cap = new Array(days).fill(0);
  const opt = new Array(days).fill(0);
  const base = Date.parse(`${from}T12:00:00Z`);
  for (const r of byProperty(rows, propertyId)) {
    const d = str(r.day);
    if (!d) continue;
    const i = Math.round((Date.parse(`${d.slice(0, 10)}T12:00:00Z`) - base) / 864e5);
    if (!(i >= 0 && i < days)) continue;
    occ[i] += num(r.confirmed_occupied);
    cap[i] += Math.max(0, num(r.physical_rooms) - num(r.closure_count));
    opt[i] += num(r.option_occupied);
  }
  return { from, occ, cap, opt };
}
function buildHotel(raw, hotel, day) {
  const live = (rows) => unique(byProperty(rows, hotel.id)).filter((r) => !isCancelled(r));
  const arrivals = live(raw.arrivals).filter((r) => str(r.arrival) === day);
  const departures = live(raw.departures).filter((r) => str(r.departure) === day);
  const stay = live(raw.inHouse).filter((r) => (str(r.arrival) ?? "") < day && (str(r.departure) ?? "") > day);
  const named = [...raw.arrivals, ...raw.departures, ...raw.inHouse, ...raw.created7].find((r) => r.property_id === hotel.id && str(r.property_name));
  return {
    propertyId: hotel.id,
    name: named && str(named.property_name) || hotel.short,
    short: hotel.short,
    arrivals: arrivals.map((r) => toMove(r, "arrival")).sort(roomSort),
    departures: departures.map((r) => toMove(r, "departure")).sort(roomSort),
    stayovers: stay.length,
    stayoverGuests: stay.reduce((n, r) => n + num(r.adults) + num(r.children), 0),
    pickup24: pick(raw.created24, raw.cancelled24, hotel.id),
    pickup7: pick(raw.created7, raw.cancelled7, hotel.id),
    // nessuna riga in assoluto = nessuno storico dell'anno scorso (non «zero prenotazioni»)
    ly7: raw.ly7.length ? grouped(raw.ly7, hotel.id).count : null,
    forecast: forecast(raw.availability, hotel.id, day, HO_HORIZON_DAYS)
  };
}
function buildPayload(raw, day, windows) {
  return { day, windows, hotels: HO_HOTELS.map((h) => buildHotel(raw, h, day)) };
}
var RANK = { fresh: 0, unavailable: 1, stale: 2, failing: 3 };
function worstFreshness(list) {
  return list.reduce((w, f) => {
    const s = f?.overall?.status;
    return s && RANK[s] !== void 0 && RANK[s] > RANK[w] ? s : w;
  }, "fresh");
}
function lastReservationUpdate(list) {
  const ids = new Set(HO_HOTELS.map((h) => h.id));
  const times = list.flatMap((f) => Array.isArray(f?.sources) ? f.sources : []).filter((s) => s.resource === "lodging_reservation" && ids.has(s.property_id) && s.last_success_at).map((s) => Date.parse(String(s.last_success_at))).filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}
function summaryLines(p) {
  return p.hotels.map((h) => {
    const arrived = h.arrivals.filter((m) => m.status !== "TO_ARRIVE").length;
    const left = h.departures.filter((m) => m.status === "DEPARTED").length;
    const occ0 = h.forecast.cap[0] ? `${h.forecast.occ[0]}/${h.forecast.cap[0]}` : "chiuso";
    return `${h.short}: arrivi ${h.arrivals.length} (${arrived} arrivati) \xB7 partenze ${h.departures.length} (${left} partiti) \xB7 fermate ${h.stayovers} \xB7 stanotte ${occ0} \xB7 pickup 24h +${h.pickup24.created}/\u2212${h.pickup24.cancelled} \xB7 7 giorni +${h.pickup7.created}/\u2212${h.pickup7.cancelled}${h.ly7 === null ? "" : ` (anno scorso ${h.ly7})`}`;
  });
}

// src/hotel-oggi/transcript.ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
var TOOLS = ["list_arrivals", "list_departures", "list_in_house", "query_curated_view"];
var isRec = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (isRec(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
function transcripts() {
  const found = [];
  const walk = (dir, depth) => {
    let names = [];
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
      }
    }
  };
  walk(join(homedir(), ".claude", "projects"), 0);
  return found.sort((a, b) => b.mtime - a.mtime);
}
function findTranscript(token) {
  for (const t of transcripts()) {
    try {
      if (readFileSync(t.path, "utf8").includes(token)) return t.path;
    } catch {
    }
  }
  return null;
}
function resultText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((b) => isRec(b) && typeof b.text === "string" ? b.text : "").join("");
  return "";
}
var SAVED_PATH = /saved to:?\s+(\/\S+?\.(?:txt|json))(?=[.,;)\s]|$)/i;
function asPage(v, depth = 0) {
  if (typeof v === "string") {
    const t = v.trim();
    if (depth > 3 || !/^[{["]/.test(t)) return null;
    try {
      return asPage(JSON.parse(t), depth + 1);
    } catch {
      return null;
    }
  }
  if (Array.isArray(v)) return asPage(v.map((b) => isRec(b) && typeof b.text === "string" ? b.text : "").join(""), depth + 1);
  if (!isRec(v) || !Array.isArray(v.data)) return null;
  const page = isRec(v.page) ? v.page : {};
  const fresh = isRec(v.freshness) ? v.freshness : { overall: { status: "unavailable" }, sources: [] };
  return { data: v.data, freshness: fresh, next: typeof page.next_cursor === "string" ? page.next_cursor : null };
}
function parseResult(body, isError) {
  const raw = body.trim();
  if (isError) return { page: null, error: raw.replace(/\s+/g, " ").slice(0, 160) || "errore dello strumento" };
  let page = asPage(raw);
  if (!page) {
    const saved = SAVED_PATH.exec(raw);
    if (saved) {
      if (!existsSync(saved[1])) return { page: null, error: `file della risposta non trovato (${basename(saved[1])})` };
      page = asPage(readFileSync(saved[1], "utf8"));
    }
  }
  return page ? { page, error: null } : { page: null, error: `risposta non riconosciuta (${raw.length} caratteri)` };
}
function readCalls(transcript, since) {
  const byId = /* @__PURE__ */ new Map();
  for (const line of readFileSync(transcript, "utf8").split("\n")) {
    if (!line || !line.includes("Scatola") && !line.includes("tool_result")) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRec(o) || !isRec(o.message) || !Array.isArray(o.message.content)) continue;
    const at = typeof o.timestamp === "string" ? o.timestamp : "";
    for (const block of o.message.content) {
      if (!isRec(block)) continue;
      if (block.type === "tool_use" && typeof block.name === "string" && /scatola/i.test(block.name) && typeof block.id === "string" && isRec(block.input)) {
        const name = block.name;
        const tool = TOOLS.find((t) => name.endsWith(t)) ?? null;
        if (tool && at >= since) byId.set(block.id, { id: block.id, at, tool, input: block.input, page: null, error: "nessuna risposta" });
      } else if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
        const call = byId.get(block.tool_use_id);
        if (call) Object.assign(call, parseResult(resultText(block.content), block.is_error === true));
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at));
}
function follow(calls, tool, first) {
  const want = canonical(first);
  const mine = calls.filter((c) => {
    if (c.tool !== tool) return false;
    const rest2 = { ...c.input };
    delete rest2.cursor;
    return canonical(rest2) === want;
  });
  const lastError = mine.filter((c) => c.error).pop()?.error ?? null;
  const starts = mine.filter((c) => !c.input.cursor);
  const ok = starts.filter((c) => c.page).pop();
  if (!ok) return { rows: [], freshness: [], next: first, failures: starts.length, lastError };
  const rows = [];
  const freshness = [];
  let cur = ok;
  for (let guard = 0; guard < 200; guard++) {
    rows.push(...cur.page.data);
    freshness.push(cur.page.freshness);
    const cursor = cur.page.next;
    if (!cursor) return { rows, freshness, next: null, failures: 0, lastError };
    const tries = mine.filter((c) => c.input.cursor === cursor && c.at >= ok.at);
    const good = tries.filter((c) => c.page).pop();
    if (!good) return { rows, freshness, next: { ...first, cursor }, failures: tries.length, lastError };
    cur = good;
  }
  throw new Error("la lettura a pagine non termina");
}

// src/hotel-oggi/cli.ts
var RUN_FILE = join2(tmpdir(), "hotel-oggi-run.json");
var MAX_TRIES = 3;
var CMD = "node tools/hotel-oggi.mjs";
function out(line) {
  process.stdout.write(`${line}
`);
}
function fail(message) {
  out(`ERRORE ${message}`);
  process.exit(2);
}
var RES = "curated_reservations";
var countAgg = { field: "reservation_id", op: "count" };
var sumAgg = { field: "room_amount", op: "sum" };
function plan(day, w) {
  const created = (from) => ({
    view: RES,
    filters: [{ field: "creation_date", op: "gte", value: from }],
    group_by: ["property_name", "is_canceled"],
    aggregates: [countAgg, sumAgg],
    limit: 50
  });
  const cancelled = (from) => ({
    view: RES,
    filters: [{ field: "cancellation_date", op: "gte", value: from }],
    group_by: ["property_name"],
    aggregates: [countAgg],
    limit: 50
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
          { field: "creation_date", op: "lt", value: w.lyTo }
        ],
        group_by: ["property_name"],
        aggregates: [countAgg],
        limit: 50
      }
    },
    {
      key: "availability",
      tool: "query_curated_view",
      first: {
        view: "curated_availability_daily",
        filters: [
          { field: "day", op: "gte", value: day },
          { field: "day", op: "lte", value: w.horizonEnd }
        ],
        limit: 500
      }
    }
  ];
}
function loadRun() {
  if (!existsSync2(RUN_FILE)) fail(`nessuna esecuzione avviata: esegui prima ${CMD} start.`);
  return JSON.parse(readFileSync2(RUN_FILE, "utf8"));
}
function start(args) {
  const password = args[0];
  if (!password || password.length < 12) fail(`serve la password: ${CMD} start "<PASSWORD>"`);
  if (!existsSync2("tools/hotel-oggi.mjs")) fail("esegui il comando dalla cartella del repository WelcomeHartmann.");
  const ti = args.indexOf("--transcript");
  const { day, windows } = windowsAt(Date.now());
  const run2 = {
    token: `HO-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    startedAt: new Date(Date.now() - 1e3).toISOString(),
    password,
    day,
    windows,
    transcript: ti >= 0 ? args[ti + 1] ?? null : null
  };
  writeFileSync(RUN_FILE, JSON.stringify(run2), { mode: 384 });
  out(`SEGNO ${run2.token}`);
  out(`Giorno ${day} \xB7 pickup dalle ${windows.t24} e dalle ${windows.t7} \xB7 portafoglio fino al ${windows.horizonEnd}`);
  out(`Ora esegui: ${CMD} next`);
}
async function next() {
  const run2 = loadRun();
  const transcript = run2.transcript ?? findTranscript(run2.token);
  if (!transcript) fail(`nessun registro contiene il segno ${run2.token}: riesegui start e poi next.`);
  const calls = readCalls(transcript, run2.startedAt);
  const raw = {
    arrivals: [],
    departures: [],
    inHouse: [],
    created24: [],
    created7: [],
    cancelled24: [],
    cancelled7: [],
    ly7: [],
    availability: []
  };
  const fresh = [];
  for (const step of plan(run2.day, run2.windows)) {
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
  const payload = buildPayload(raw, run2.day, run2.windows);
  if (!payload.hotels.some((h) => h.arrivals.length || h.departures.length || h.stayovers || h.forecast.cap.some((c) => c > 0)))
    fail("La Scatola non ha restituito nessun dato per le tre case. Non pubblicare.");
  const envelope = {
    format: 1,
    app: HO_APP,
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    scatola_updated_at: lastReservationUpdate(fresh),
    freshness: worstFreshness(fresh),
    day: run2.day,
    enc: await encryptJson(payload, run2.password, hoAad(run2.day))
  };
  const back = await decryptJson(envelope.enc, run2.password, hoAad(run2.day));
  if (JSON.stringify(back) !== JSON.stringify(payload)) fail("la verifica della cifratura non torna. Non pubblicare.");
  writeFileSync(HO_FILE, `${JSON.stringify(envelope)}
`);
  for (const line of summaryLines(payload)) out(`RIEPILOGO ${line}`);
  out(`RIEPILOGO La Scatola: ${envelope.freshness}${envelope.scatola_updated_at ? `, prenotazioni aggiornate alle ${envelope.scatola_updated_at}` : ""} \xB7 chiamate lette: ${calls.length}`);
  out(`PRONTO ${HO_FILE} scritto e verificato`);
}
async function verify(args) {
  const file = args.length > 1 ? args[0] : HO_FILE;
  const password = args.length > 1 ? args[1] : args[0];
  if (!password) fail(`uso: ${CMD} verify [${HO_FILE}] "<PASSWORD>"`);
  const env = JSON.parse(readFileSync2(file, "utf8"));
  if (!isHoEnvelope(env)) fail(`${file} non \xE8 un file Hotel oggi valido`);
  const p = await decryptJson(env.enc, password, hoAad(env.day)).catch(() => fail("password errata o file alterato"));
  if (p.day !== env.day || p.hotels.length !== 3) fail("contenuto incompleto");
  const n = (k) => p.hotels.reduce((s, h) => s + h[k].length, 0);
  out(`verifica OK: ${env.day}, ${n("arrivals")} arrivi, ${n("departures")} partenze, scritto ${env.generated_at}`);
}
var [cmd, ...rest] = process.argv.slice(2);
var run = cmd === "start" ? async () => start(rest) : cmd === "next" ? next : cmd === "verify" ? () => verify(rest) : null;
if (!run) fail('comandi: start "<PASSWORD>" \xB7 next \xB7 verify [file] "<PASSWORD>"');
run().catch((e) => fail(e instanceof Error ? e.message : String(e)));
export {
  plan
};
