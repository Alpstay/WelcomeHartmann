// Test del calcolo «Hotel oggi» con dati inventati (nessuna prenotazione reale).
// Esecuzione: npx esbuild test/hotel-oggi.test.ts --bundle --platform=node --format=esm --outfile=out/ho-test.mjs && node out/ho-test.mjs
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decryptJson, encryptJson } from "../src/feed";
import { buildPayload, hoAad, isoMinute, summaryLines, windowsAt, worstFreshness } from "../src/hotel-oggi/model";
import type { HoPayload, RawData } from "../src/hotel-oggi/model";
import { canonical, follow, readCalls } from "../src/hotel-oggi/transcript";

const A = "11111111-1111-4111-8111-111111111111";
const H = "22222222-2222-4222-8222-222222222222";
const S = "33333333-3333-4333-8333-333333333333";
const day = "2026-12-27";

const res = (id: string, p: string, arr: string, dep: string, x: Record<string, unknown> = {}) => ({
  reservation_id: id, property_id: p, property_name: p === A ? "Hotel Acadia" : p === H ? "Hartmann" : "Saslong",
  arrival: arr, departure: dep, room_name: x.room ?? "1", adults: 2, children: 0, is_option: false,
  booking_status: "CONFIRMED", stay_status: "TO_ARRIVE", check_in_at: null, check_out_at: null, channel: "BOOKING", ...x,
});

const raw: RawData = {
  arrivals: [
    res("a1", A, day, "2026-12-30", { room: "212", stay_status: "IN_HOUSE", check_in_at: "2026-12-27T14:10:00+00:00" }),
    res("a2", A, day, "2026-12-29", { room: "105", children: 1 }),
    res("a2", A, day, "2026-12-29", { room: "105", children: 1 }), // doppione da pagine sovrapposte
    res("a3", A, day, "2026-12-29", { room: "9", booking_status: "CANCELLED" }),
    res("h1", H, day, "2027-01-02", { room: "121", is_option: true }),
  ],
  departures: [
    res("d1", A, "2026-12-20", day, { room: "214", stay_status: "DEPARTED", check_out_at: "2026-12-27T09:00:00+00:00" }),
    res("d2", S, "2026-12-24", day, { room: "301" }),
  ],
  inHouse: [
    res("s1", S, "2026-12-24", "2026-12-31", { room: "302", stay_status: "IN_HOUSE", adults: 3 }),
    res("d2", S, "2026-12-24", day, { room: "301", stay_status: "IN_HOUSE" }), // parte oggi: non è una fermata
    res("a1", A, day, "2026-12-30", { stay_status: "IN_HOUSE" }), // arriva oggi: non è una fermata
  ],
  created24: [
    { property_id: S, property_name: "Saslong", is_canceled: false, count_reservation_id: 4, sum_room_amount: 2100.5 },
    { property_id: S, property_name: "Saslong", is_canceled: true, count_reservation_id: 1, sum_room_amount: 0 },
  ],
  created7: [
    { property_id: A, property_name: "Hotel Acadia", is_canceled: false, count_reservation_id: 10, sum_room_amount: "5000,25" },
    { property_id: S, property_name: "Saslong", is_canceled: false, count_reservation_id: 30, sum_room_amount: 20000 },
    { property_id: S, property_name: "Saslong", is_canceled: true, count_reservation_id: 5, sum_room_amount: 0 },
  ],
  cancelled24: [{ property_id: S, property_name: "Saslong", count_reservation_id: 2 }],
  cancelled7: [{ property_id: S, property_name: "Saslong", count_reservation_id: 7 }],
  ly7: [{ property_id: S, property_name: "Saslong", count_reservation_id: 20 }],
  availability: [
    { property_id: A, day, physical_rooms: 11, closure_count: 0, confirmed_occupied: 9, option_occupied: 1 },
    { property_id: A, day, physical_rooms: 10, closure_count: 2, confirmed_occupied: 7, option_occupied: 0 },
    { property_id: A, day: "2026-12-28", physical_rooms: 21, closure_count: 0, confirmed_occupied: 20, option_occupied: 0 },
    { property_id: A, day: "2027-06-01", physical_rooms: 21, closure_count: 0, confirmed_occupied: 1, option_occupied: 0 }, // fuori orizzonte
    { property_id: H, day, physical_rooms: 9, closure_count: 9, confirmed_occupied: 0, option_occupied: 0 },
  ],
};

const w = windowsAt(Date.parse("2026-12-27T19:30:45.123Z"));
assert.equal(w.day, "2026-12-27");
assert.equal(w.windows.now, "2026-12-27T19:30:00Z");
assert.equal(w.windows.t24, "2026-12-26T19:30:00Z");
assert.equal(w.windows.horizonEnd, "2027-03-26");
assert.equal(isoMinute(Date.parse("2026-01-01T00:00:59.999Z")), "2026-01-01T00:00:00Z");
assert.equal(windowsAt(Date.parse("2026-12-27T23:30:00Z")).day, "2026-12-28", "giorno nel fuso Europe/Rome");

const p = buildPayload(raw, day, w.windows);
const [acadia, hartmann, saslong] = p.hotels;
assert.deepEqual(p.hotels.map((h) => h.short), ["Acadia", "Hartmann", "Saslong"]);
assert.equal(acadia.name, "Hotel Acadia");
assert.equal(acadia.arrivals.length, 2, "doppione e cancellata esclusi");
assert.deepEqual(acadia.arrivals.map((m) => m.room), ["105", "212"], "ordine numerico per camera");
assert.equal(acadia.arrivals[1].status, "IN_HOUSE");
assert.equal(acadia.arrivals[1].at, "2026-12-27T14:10:00+00:00");
assert.equal(acadia.arrivals[1].nights, 3);
assert.equal(acadia.arrivals[0].children, 1);
assert.equal(hartmann.arrivals[0].option, true);
assert.equal(acadia.departures[0].status, "DEPARTED");
assert.equal(saslong.departures[0].status, "TO_ARRIVE");
assert.equal(saslong.stayovers, 1);
assert.equal(saslong.stayoverGuests, 3);
assert.equal(acadia.stayovers, 0);
assert.deepEqual(saslong.pickup24, { created: 5, active: 4, cancelled: 2, revenue: 2100.5 });
assert.deepEqual(saslong.pickup7, { created: 35, active: 30, cancelled: 7, revenue: 20000 });
assert.deepEqual(acadia.pickup7, { created: 10, active: 10, cancelled: 0, revenue: 5000.25 }, "importo con la virgola");
assert.deepEqual(hartmann.pickup7, { created: 0, active: 0, cancelled: 0, revenue: 0 });
assert.equal(saslong.ly7, 20);
assert.equal(acadia.ly7, 0, "storico presente ma nessuna prenotazione per questa casa");
assert.equal(buildPayload({ ...raw, ly7: [] }, day, w.windows).hotels[0].ly7, null, "nessuno storico = null");
assert.equal(acadia.forecast.occ.length, 90);
assert.equal(acadia.forecast.occ[0], 16);
assert.equal(acadia.forecast.cap[0], 19, "camere chiuse tolte");
assert.equal(acadia.forecast.phys[0], 21, "camere fisiche: tutte, anche le chiuse");
assert.equal(hartmann.forecast.phys[0], 9);
assert.equal(acadia.forecast.opt[0], 1);
assert.equal(acadia.forecast.occ[1], 20);
assert.equal(hartmann.forecast.cap[0], 0, "casa chiusa");
assert.equal(saslong.forecast.cap.reduce((a, b) => a + b, 0), 0);
const lines = summaryLines(p);
assert.ok(lines[0].startsWith("Acadia: arrivi 2 (1 arrivati)"));
assert.ok(lines[0].includes("stanotte 16/21 (2 chiuse)"), lines[0]);
assert.ok(lines[1].includes("stanotte chiuso"));
assert.ok(!lines.join(" ").includes("€") && !lines.join(" ").includes("20000"), "nessun importo nel riepilogo");
assert.equal(worstFreshness([{ overall: { status: "fresh" }, sources: [] }, { overall: { status: "stale" }, sources: [] }]), "stale");

// cifratura andata e ritorno, con AAD legata al giorno
const enc = await encryptJson(p, "password-di-prova-123", hoAad(day));
const back = await decryptJson<HoPayload>(enc, "password-di-prova-123", hoAad(day));
assert.deepEqual(back, p);
await assert.rejects(decryptJson(enc, "password-sbagliata-123", hoAad(day)));
await assert.rejects(decryptJson(enc, "password-di-prova-123", hoAad("2026-12-28")), "file di un altro giorno");

// registro della sessione: chiamate riconosciute, argomenti confrontati senza badare all'ordine delle chiavi
assert.equal(canonical({ b: 1, a: [{ y: 2, x: 1 }] }), canonical({ a: [{ x: 1, y: 2 }], b: 1 }));
const dir = mkdtempSync(join(tmpdir(), "ho-"));
const page = (data: unknown[], next: string | null) => JSON.stringify({ data, freshness: { overall: { status: "fresh" }, sources: [] }, page: { next_cursor: next } });
const big = join(dir, "grande.txt");
writeFileSync(big, page([{ n: 2 }], null));
const lines2 = [
  { timestamp: "2026-12-27T19:31:00Z", message: { content: [{ type: "tool_use", id: "u1", name: "mcp__La_Scatola__list_arrivals", input: { limit: 500, date: day } }] } },
  { timestamp: "2026-12-27T19:31:01Z", message: { content: [{ type: "tool_result", tool_use_id: "u1", content: [{ type: "text", text: page([{ n: 1 }], "C1") }] }] } },
  { timestamp: "2026-12-27T19:31:02Z", message: { content: [{ type: "tool_use", id: "u2", name: "mcp__La_Scatola__list_arrivals", input: { date: day, limit: 500, cursor: "C1" } }] } },
  { timestamp: "2026-12-27T19:31:03Z", message: { content: [{ type: "tool_result", tool_use_id: "u2", content: `Output too large, saved to: ${big}` }] } },
  { timestamp: "2026-12-27T19:31:04Z", message: { content: [{ type: "tool_use", id: "u3", name: "mcp__La_Scatola__list_departures", input: { date: day, limit: 500 } }] } },
  { timestamp: "2026-12-27T19:31:05Z", message: { content: [{ type: "tool_result", tool_use_id: "u3", is_error: true, content: "timeout" }] } },
  { timestamp: "2026-12-27T19:20:00Z", message: { content: [{ type: "tool_use", id: "old", name: "mcp__La_Scatola__list_in_house", input: { date: day, limit: 500 } }] } },
];
const tr = join(dir, "sessione.jsonl");
writeFileSync(tr, lines2.map((l) => JSON.stringify(l)).join("\n"));
const calls = readCalls(tr, "2026-12-27T19:30:59Z");
assert.equal(calls.length, 3, "chiamate prima dell'avvio ignorate");
const ch = follow(calls, "list_arrivals", { date: day, limit: 500 });
assert.equal(ch.next, null);
assert.deepEqual(ch.rows, [{ n: 1 }, { n: 2 }], "pagine ricomposte, anche dal file salvato");
const dep = follow(calls, "list_departures", { date: day, limit: 500 });
assert.deepEqual(dep.next, { date: day, limit: 500 });
assert.equal(dep.failures, 1);
assert.equal(dep.lastError, "timeout");
assert.deepEqual(follow(calls, "list_arrivals", { date: day, limit: 100 }).next, { date: day, limit: 100 }, "argomenti diversi = altra chiamata");

console.log("hotel-oggi: tutti i test superati");
