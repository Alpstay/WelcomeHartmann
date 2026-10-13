// «Hotel oggi» per l'AlpStay App Hub (www.saslong.ai): arrivi, partenze, fermate, pickup e barometro
// delle tre case, calcolati dalle risposte di La Scatola e pubblicati cifrati in hotel-oggi.json.
//
// Solo dati senza nomi (viste PII-free). Gli ID di Slope / La Scatola restano quelli ricevuti:
// qui si contano e si sommano le righe, non si riscrive nessun identificativo.

import type { EncBlock } from "../feed";
import type { Freshness, FreshnessStatus } from "../types";

export const HO_FILE = "hotel-oggi.json";
export const HO_APP = "HotelOggi";
/** Giorni di portafoglio (occupazione già venduta) da oggi in avanti. */
export const HO_HORIZON_DAYS = 90;
export const hoAad = (day: string): string => `${HO_APP}|${day}`;

/** Le tre case con il property_id di La Scatola copiato com'è. */
export const HO_HOTELS: readonly { readonly id: string; readonly short: string }[] = [
  { id: "11111111-1111-4111-8111-111111111111", short: "Acadia" },
  { id: "22222222-2222-4222-8222-222222222222", short: "Hartmann" },
  { id: "33333333-3333-4333-8333-333333333333", short: "Saslong" },
];

export type StayStatus = "TO_ARRIVE" | "IN_HOUSE" | "DEPARTED";

/** Un arrivo o una partenza del giorno, senza dati personali. */
export interface HoMove {
  readonly room: string | null;
  readonly adults: number;
  readonly children: number;
  readonly nights: number;
  readonly channel: string | null;
  readonly status: StayStatus;
  /** Ora effettiva di check-in (arrivi) o di check-out (partenze), ISO UTC; null se non ancora fatto. */
  readonly at: string | null;
  readonly option: boolean;
}

/** Prenotazioni create in una finestra di tempo. */
export interface HoPick {
  /** Create nella finestra (anche quelle poi cancellate). */
  readonly created: number;
  /** Create nella finestra e ancora valide. */
  readonly active: number;
  /** Cancellate nella finestra (qualunque fosse la data di creazione). */
  readonly cancelled: number;
  /** Importo camera delle create ancora valide (IVA inclusa, senza extra e tassa di soggiorno). */
  readonly revenue: number;
}

/** Occupazione già in portafoglio, un valore per giorno a partire da `from`. */
export interface HoForecast {
  readonly from: string;
  /** Camere confermate. */
  readonly occ: readonly number[];
  /** Camere vendibili: fisiche meno chiuse. */
  readonly cap: readonly number[];
  /** Camere fisiche della casa (tutte, anche quelle chiuse o fuori servizio). */
  readonly phys: readonly number[];
  /** Camere in opzione. */
  readonly opt: readonly number[];
}

export interface HoHotel {
  readonly propertyId: string;
  readonly name: string;
  readonly short: string;
  readonly arrivals: readonly HoMove[];
  readonly departures: readonly HoMove[];
  /** Fermate: soggiorni iniziati prima di oggi che finiscono dopo oggi. */
  readonly stayovers: number;
  readonly stayoverGuests: number;
  readonly pickup24: HoPick;
  readonly pickup7: HoPick;
  /** Prenotazioni create negli stessi 7 giorni dell'anno scorso (364 giorni fa, stesso giorno della settimana). */
  readonly ly7: number | null;
  readonly forecast: HoForecast;
}

export interface HoWindows {
  readonly now: string;
  readonly t24: string;
  readonly t7: string;
  readonly lyFrom: string;
  readonly lyTo: string;
  readonly horizonEnd: string;
}

export interface HoPayload {
  readonly day: string;
  readonly windows: HoWindows;
  readonly hotels: readonly HoHotel[];
}

export interface HoEnvelope {
  readonly format: 1;
  readonly app: typeof HO_APP;
  /** Quando è stato scritto il file (ISO, UTC). */
  readonly generated_at: string;
  /** Ultimo aggiornamento delle prenotazioni in La Scatola (ISO, UTC). */
  readonly scatola_updated_at: string | null;
  readonly freshness: FreshnessStatus;
  readonly day: string;
  readonly enc: EncBlock;
}

export function isHoEnvelope(v: unknown): v is HoEnvelope {
  const e = v as Partial<HoEnvelope> | null;
  return !!e && e.format === 1 && e.app === HO_APP && typeof e.day === "string" && !!e.enc && typeof e.enc.ct === "string";
}

// ——— letture grezze (righe come arrivano da La Scatola) ———

export type Row = Readonly<Record<string, unknown>>;

export interface RawData {
  readonly arrivals: readonly Row[];
  readonly departures: readonly Row[];
  readonly inHouse: readonly Row[];
  readonly created24: readonly Row[];
  readonly created7: readonly Row[];
  readonly cancelled24: readonly Row[];
  readonly cancelled7: readonly Row[];
  readonly ly7: readonly Row[];
  readonly availability: readonly Row[];
}

// ——— date ———

export const addDays = (iso: string, n: number): string => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const romeDay = (t: number): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
/** ISO UTC al minuto, senza millisecondi: è il valore che si copia nei filtri. */
export const isoMinute = (t: number): string => new Date(Math.floor(t / 60_000) * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");

export function windowsAt(nowMs: number): { day: string; windows: HoWindows } {
  const day = romeDay(nowMs);
  const H = 3_600_000;
  return {
    day,
    windows: {
      now: isoMinute(nowMs),
      t24: isoMinute(nowMs - 24 * H),
      t7: isoMinute(nowMs - 7 * 24 * H),
      lyFrom: isoMinute(nowMs - (7 + 364) * 24 * H),
      lyTo: isoMinute(nowMs - 364 * 24 * H),
      horizonEnd: addDays(day, HO_HORIZON_DAYS - 1),
    },
  };
}

// ——— conversioni prudenti (i campi possono mancare o arrivare come testo) ———

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const num = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};
const bool = (v: unknown): boolean => v === true || v === "true" || v === 1;
const nightsOf = (a: string | null, d: string | null): number => {
  if (!a || !d) return 0;
  const n = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const isCancelled = (r: Row): boolean => str(r.booking_status) === "CANCELLED" || bool(r.is_canceled);

function statusOf(r: Row): StayStatus {
  const s = str(r.stay_status);
  if (s === "IN_HOUSE" || s === "DEPARTED" || s === "TO_ARRIVE") return s;
  if (str(r.check_out_at)) return "DEPARTED";
  if (str(r.check_in_at)) return "IN_HOUSE";
  return "TO_ARRIVE";
}

const byProperty = (rows: readonly Row[], propertyId: string): Row[] => rows.filter((r) => r.property_id === propertyId);

/** Righe uniche per reservation_id (le pagine possono sovrapporsi): l'ID resta quello ricevuto. */
function unique(rows: readonly Row[]): Row[] {
  const seen = new Map<string, Row>();
  const out: Row[] = [];
  for (const r of rows) {
    const id = str(r.reservation_id);
    if (id) {
      if (!seen.has(id)) {
        seen.set(id, r);
        out.push(r);
      }
    } else out.push(r);
  }
  return out;
}

function toMove(r: Row, kind: "arrival" | "departure"): HoMove {
  const status = statusOf(r);
  return {
    room: str(r.room_name),
    adults: num(r.adults),
    children: num(r.children),
    nights: nightsOf(str(r.arrival), str(r.departure)),
    channel: str(r.channel) ?? str(r.agency_name) ?? str(r.sale_source),
    status,
    at: kind === "arrival" ? str(r.check_in_at) : str(r.check_out_at),
    option: bool(r.is_option),
  };
}

const roomSort = (a: HoMove, b: HoMove): number =>
  (a.room ?? "~").localeCompare(b.room ?? "~", "it", { numeric: true }) || a.adults - b.adults;

/** Somma le righe di una query raggruppata per struttura (count_reservation_id, sum_room_amount). */
function grouped(rows: readonly Row[], propertyId: string): { count: number; amount: number; cancelledCount: number } {
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

function pick(created: readonly Row[], cancelled: readonly Row[], propertyId: string): HoPick {
  const c = grouped(created, propertyId);
  return { created: c.count, active: c.count - c.cancelledCount, cancelled: grouped(cancelled, propertyId).count, revenue: c.amount };
}

function forecast(rows: readonly Row[], propertyId: string, from: string, days: number): HoForecast {
  const occ = new Array<number>(days).fill(0);
  const cap = new Array<number>(days).fill(0);
  const opt = new Array<number>(days).fill(0);
  const phys = new Array<number>(days).fill(0);
  const base = Date.parse(`${from}T12:00:00Z`);
  for (const r of byProperty(rows, propertyId)) {
    const d = str(r.day);
    if (!d) continue;
    const i = Math.round((Date.parse(`${d.slice(0, 10)}T12:00:00Z`) - base) / 86_400_000);
    if (!(i >= 0 && i < days)) continue;
    occ[i] += num(r.confirmed_occupied);
    phys[i] += num(r.physical_rooms);
    cap[i] += Math.max(0, num(r.physical_rooms) - num(r.closure_count));
    opt[i] += num(r.option_occupied);
  }
  return { from, occ, cap, opt, phys };
}

/** Compone i dati di una casa. Pura: stessi ingressi, stessa uscita. */
export function buildHotel(raw: RawData, hotel: { id: string; short: string }, day: string): HoHotel {
  const live = (rows: readonly Row[]): Row[] => unique(byProperty(rows, hotel.id)).filter((r) => !isCancelled(r));
  const arrivals = live(raw.arrivals).filter((r) => str(r.arrival) === day);
  const departures = live(raw.departures).filter((r) => str(r.departure) === day);
  const stay = live(raw.inHouse).filter((r) => (str(r.arrival) ?? "") < day && (str(r.departure) ?? "") > day);
  const named = [...raw.arrivals, ...raw.departures, ...raw.inHouse, ...raw.created7].find((r) => r.property_id === hotel.id && str(r.property_name));
  return {
    propertyId: hotel.id,
    name: (named && str(named.property_name)) || hotel.short,
    short: hotel.short,
    arrivals: arrivals.map((r) => toMove(r, "arrival")).sort(roomSort),
    departures: departures.map((r) => toMove(r, "departure")).sort(roomSort),
    stayovers: stay.length,
    stayoverGuests: stay.reduce((n, r) => n + num(r.adults) + num(r.children), 0),
    pickup24: pick(raw.created24, raw.cancelled24, hotel.id),
    pickup7: pick(raw.created7, raw.cancelled7, hotel.id),
    // nessuna riga in assoluto = nessuno storico dell'anno scorso (non «zero prenotazioni»)
    ly7: raw.ly7.length ? grouped(raw.ly7, hotel.id).count : null,
    forecast: forecast(raw.availability, hotel.id, day, HO_HORIZON_DAYS),
  };
}

export function buildPayload(raw: RawData, day: string, windows: HoWindows): HoPayload {
  return { day, windows, hotels: HO_HOTELS.map((h) => buildHotel(raw, h, day)) };
}

const RANK: Record<FreshnessStatus, number> = { fresh: 0, unavailable: 1, stale: 2, failing: 3 };

export function worstFreshness(list: readonly Freshness[]): FreshnessStatus {
  return list.reduce<FreshnessStatus>((w, f) => {
    const s = f?.overall?.status;
    return s && RANK[s] !== undefined && RANK[s] > RANK[w] ? s : w;
  }, "fresh");
}

export function lastReservationUpdate(list: readonly Freshness[]): string | null {
  const ids = new Set(HO_HOTELS.map((h) => h.id));
  const times = list
    .flatMap((f) => (Array.isArray(f?.sources) ? f.sources : []))
    .filter((s) => s.resource === "lodging_reservation" && ids.has(s.property_id) && s.last_success_at)
    .map((s) => Date.parse(String(s.last_success_at)))
    .filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

/** Righe RIEPILOGO senza dati personali né importi. */
export function summaryLines(p: HoPayload): string[] {
  return p.hotels.map((h) => {
    const arrived = h.arrivals.filter((m) => m.status !== "TO_ARRIVE").length;
    const left = h.departures.filter((m) => m.status === "DEPARTED").length;
    const f = h.forecast, closed = (f.phys[0] ?? 0) - (f.cap[0] ?? 0);
    const occ0 = f.cap[0] ? `${f.occ[0]}/${f.phys[0]}${closed > 0 ? ` (${closed} chiuse)` : ""}` : "chiuso";
    return `${h.short}: arrivi ${h.arrivals.length} (${arrived} arrivati) · partenze ${h.departures.length} (${left} partiti) · fermate ${h.stayovers} · stanotte ${occ0} · pickup 24h +${h.pickup24.created}/−${h.pickup24.cancelled} · 7 giorni +${h.pickup7.created}/−${h.pickup7.cancelled}${h.ly7 === null ? "" : ` (anno scorso ${h.ly7})`}`;
  });
}
