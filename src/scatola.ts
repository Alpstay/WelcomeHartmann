// Lettura dati da La Scatola tramite il connettore dell'utente (capability `mcp`).
// Solo letture. Gli ID di Slope (reservation_id, property_id, lodging_id) non vengono mai modificati.

import { PROPERTY_NAME_MATCH } from "./hotel";
import { normalizeGuestName, normalizeLang } from "./letter";
import type {
  ArrivalItem,
  ArrivalRow,
  BookerFields,
  Envelope,
  Freshness,
  GuestStayFields,
  LangCode,
  LangSource,
} from "./types";

export const SERVER = "La Scatola";

type Mcp = typeof Claude.mcp;
type McpError = Claude.mcp.McpError;

export const isMcpError = (e: unknown): e is McpError =>
  typeof e === "object" && e !== null && typeof (e as { code?: unknown }).code === "string";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function asEnvelope<T>(payload: unknown): Envelope<T> {
  let p: unknown = payload;
  if (typeof p === "string") {
    try {
      p = JSON.parse(p);
    } catch {
      /* gestito sotto */
    }
  }
  const env = p as Partial<Envelope<T>> | null;
  if (!env || !Array.isArray(env.data)) {
    const err: McpError = { code: "tool_error", message: "Risposta di La Scatola in un formato inatteso." };
    throw err;
  }
  return {
    data: env.data,
    freshness: env.freshness ?? { overall: { status: "unavailable" }, sources: [] },
    page: env.page ?? { returned: env.data.length, truncated: false, next_cursor: null },
  };
}

/** Una lettura, con un solo nuovo tentativo se l'errore è marcato come ripetibile. */
async function read<T>(mcp: Mcp, tool: string, input: Record<string, unknown>): Promise<Envelope<T>> {
  try {
    return asEnvelope<T>((await mcp.callTool(SERVER, tool, input)).payload);
  } catch (e) {
    if (isMcpError(e) && e.retryable) {
      await sleep(e.retryAfterMs ?? 700 + Math.random() * 900);
      return asEnvelope<T>((await mcp.callTool(SERVER, tool, input)).payload);
    }
    throw e;
  }
}

/** Tutte le pagine di un risultato, al massimo 10 (protezione da cicli). */
async function readAll<T>(mcp: Mcp, tool: string, input: Record<string, unknown>): Promise<Envelope<T>> {
  const rows: T[] = [];
  let cursor: string | null = null;
  let last: Envelope<T> | null = null;
  for (let i = 0; i < 10; i++) {
    last = await read<T>(mcp, tool, cursor ? { ...input, cursor } : input);
    rows.push(...last.data);
    cursor = last.page.next_cursor;
    if (!cursor) break;
  }
  return { data: rows, freshness: last!.freshness, page: { returned: rows.length, truncated: Boolean(cursor), next_cursor: cursor } };
}

export interface ArrivalsResult {
  readonly rows: readonly ArrivalRow[];
  readonly freshness: Freshness;
}

/** Arrivi del giorno allo Chalet Hartmann (prenotazioni non cancellate). */
export async function fetchArrivals(mcp: Mcp, date: string): Promise<ArrivalsResult> {
  const env = await readAll<ArrivalRow>(mcp, "list_arrivals", { date, limit: 200 });
  const rows = env.data.filter((r) => PROPERTY_NAME_MATCH.test(r.property_name) && r.booking_status !== "CANCELLED");
  return { rows, freshness: env.freshness };
}

interface GuestInfo {
  readonly name: string;
  readonly lang: string | null;
}

const chunk = <T,>(list: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/** Da ogni riga tiene solo nome, tipo e lingua: documenti, contatti e link di check-in vengono scartati subito. */
const pickGuest = (r: GuestStayFields): GuestStayFields => ({
  reservation_id: r.reservation_id,
  guest_type: r.guest_type ?? null,
  is_primary_guest: r.is_primary_guest ?? null,
  first_name: r.first_name ?? null,
  last_name: r.last_name ?? null,
  language: r.language ?? null,
});

const pickBooker = (r: BookerFields): BookerFields => ({
  reservation_id: r.reservation_id,
  booker_type: r.booker_type ?? null,
  first_name: r.first_name ?? null,
  last_name: r.last_name ?? null,
  language: r.language ?? null,
  company_language: r.company_language ?? null,
});

const isLeadGuest = (g: GuestStayFields): boolean =>
  g.is_primary_guest === true || /HEAD|SINGLE/i.test(g.guest_type ?? "");

export interface GuestLookup {
  readonly guests: ReadonlyMap<string, GuestInfo>;
  readonly bookers: ReadonlyMap<string, GuestInfo>;
}

/** Costruisce nome e lingua per prenotazione dalle righe lette (stessa regola nel browser e nell'aggiornamento automatico). */
export function lookupFromRows(stays: readonly GuestStayFields[], contacts: readonly BookerFields[]): GuestLookup {
  const guests = new Map<string, GuestInfo>();
  const bookers = new Map<string, GuestInfo>();
  for (const g of stays.map(pickGuest)) {
    if (!isLeadGuest(g) || guests.has(g.reservation_id)) continue;
    guests.set(g.reservation_id, { name: normalizeGuestName(g.first_name, g.last_name), lang: g.language });
  }
  for (const c of contacts.map(pickBooker)) {
    const individual = c.booker_type !== "COMPANY";
    bookers.set(c.reservation_id, {
      name: individual ? normalizeGuestName(c.first_name, c.last_name) : "",
      lang: individual ? c.language : (c.company_language ?? c.language),
    });
  }
  return { guests, bookers };
}

/** Nome e lingua: ospite principale registrato e intestatario della prenotazione. */
export async function fetchGuestInfo(mcp: Mcp, reservationIds: readonly string[]): Promise<GuestLookup> {
  const stays: GuestStayFields[] = [];
  const contacts: BookerFields[] = [];
  for (const ids of chunk(reservationIds, 50)) {
    const filters = [{ field: "reservation_id", op: "in", value: ids }];
    const [s, c] = await Promise.all([
      readAll<GuestStayFields>(mcp, "query_curated_view", { view: "curated_guest_stays", filters, limit: 500 }),
      readAll<BookerFields>(mcp, "query_curated_view", { view: "curated_reservation_contacts", filters, limit: 100 }),
    ]);
    stays.push(...s.data);
    contacts.push(...c.data);
  }
  return lookupFromRows(stays, contacts);
}

export interface LangChoice {
  readonly lang: LangCode;
  readonly source: LangSource;
  readonly raw: string | null;
  /** Testo d'aiuto quando ospite e prenotazione indicano lingue diverse. */
  readonly note: string | null;
}

/**
 * Lingua proposta. La lingua dell'ospite registrato vale di più, tranne quando è "it" e la
 * prenotazione dice altro: in Slope "it" è spesso il valore predefinito dei componenti aggiunti a mano.
 */
export function chooseLang(guestLang: string | null, bookerLang: string | null): LangChoice {
  const g = normalizeLang(guestLang);
  const bk = normalizeLang(bookerLang);
  const differ = g.raw && bk.raw && g.raw.toLowerCase() !== bk.raw.toLowerCase();
  const note = differ ? `Slope: ospite ${g.raw!.toUpperCase()}, prenotazione ${bk.raw!.toUpperCase()}` : null;
  if (g.raw && !(g.raw.toLowerCase().startsWith("it") && bk.raw && differ)) {
    return { lang: g.lang, source: "ospite", raw: g.raw, note };
  }
  if (bk.raw) return { lang: bk.lang, source: "prenotazione", raw: bk.raw, note };
  return { lang: "en", source: "predefinita", raw: null, note };
}

export function toItems(rows: readonly ArrivalRow[], lookup: GuestLookup | null): ArrivalItem[] {
  return rows
    .map((r): ArrivalItem => {
      const guest = lookup?.guests.get(r.reservation_id) ?? null;
      const booker = lookup?.bookers.get(r.reservation_id) ?? null;
      const choice = chooseLang(guest?.lang ?? null, booker?.lang ?? null);
      return {
        key: r.reservation_id,
        reservationId: r.reservation_id,
        room: r.room_name?.trim() || null,
        arrival: r.arrival,
        departure: r.departure,
        adults: r.adults,
        children: r.children,
        isOption: r.is_option || r.booking_status === "OPTION",
        inHouse: r.stay_status === "IN_HOUSE",
        manual: false,
        rawLang: choice.raw,
        langSource: choice.source,
        langNote: choice.note,
        name: guest?.name || booker?.name || "",
        note: "",
        lang: choice.lang,
        selected: true,
      };
    })
    .sort((a, b) => (a.room ?? "zzz").localeCompare(b.room ?? "zzz", "it", { numeric: true }));
}

/** Ora dell'ultimo aggiornamento prenotazioni per lo Hartmann, in ora italiana. */
export function freshnessTime(f: Freshness, propertyIds: readonly string[]): string | null {
  const relevant = f.sources.filter(
    (s) => s.resource === "lodging_reservation" && (propertyIds.length === 0 || propertyIds.includes(s.property_id)),
  );
  const times = relevant.map((s) => (s.last_success_at ? Date.parse(s.last_success_at) : NaN)).filter(Number.isFinite);
  if (times.length === 0) return null;
  return new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(
    new Date(Math.max(...times)),
  );
}
