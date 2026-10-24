// Composizione di arrivi.json dalle righe lette da La Scatola: usata sia dall'aggiornamento in una sessione
// Claude (tools/feed.mjs) sia da quello su GitHub Actions (tools/github-feed.mjs). Gli ID di Slope passano
// così come arrivano.

import { FEED_DAYS, FEED_ITERATIONS, avvisiAad, decryptJson, encryptJson, feedAad, toFeedItem } from "./feed";
import type { AvvisiPayload, AvvisoItem, FeedEnvelope, FeedItem, FeedPayload } from "./feed";
import { PROPERTY_NAME_MATCH } from "./hotel";
import { lookupFromRows, toItems } from "./scatola";
import type { ArrivalRow, ContactFields, Freshness, FreshnessStatus, GuestStayFields, OrderFields, ReferenceFields } from "./types";

/** property_id dello Chalet Hartmann in La Scatola (copiato com'è). */
export const HARTMANN_ID = "22222222-2222-4222-8222-222222222222";

export const romeToday = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const addDays = (iso: string, n: number): string => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const dm = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/** Giorni coperti dal file: da oggi (ora italiana) a oggi+6. */
export const feedDates = (from = romeToday()): string[] => Array.from({ length: FEED_DAYS }, (_, i) => addDays(from, i));

/** Arrivi dello Hartmann, senza doppioni e senza prenotazioni cancellate. */
export function hartmannRows(arrivals: readonly ArrivalRow[]): ArrivalRow[] {
  return [...new Map(arrivals.map((r) => [r.reservation_id, r])).values()].filter(
    (r) =>
      typeof r.reservation_id === "string" &&
      (r.property_id === HARTMANN_ID || PROPERTY_NAME_MATCH.test(String(r.property_name ?? ""))) &&
      r.booking_status !== "CANCELLED",
  );
}

export interface FeedSource {
  readonly dates: readonly string[];
  /** Righe già filtrate con hartmannRows. */
  readonly rows: readonly ArrivalRow[];
  readonly stays: readonly GuestStayFields[];
  readonly contacts: readonly ContactFields[];
  readonly freshness: readonly Freshness[];
  /** curated_reservations: numero del portale e ordine Slope di ogni prenotazione (facoltativo). */
  readonly references?: readonly ReferenceFields[];
  /** curated_order_balances: numero dell'ordine Slope (facoltativo, serve per le dirette). */
  readonly orders?: readonly OrderFields[];
}

export interface BuiltFeed {
  readonly envelope: FeedEnvelope;
  /** Righe di riepilogo senza dati personali. */
  readonly summary: readonly string[];
}

const RANK: Record<FreshnessStatus, number> = { fresh: 0, unavailable: 1, stale: 2, failing: 3 };

// ——— Contatti per le email pre-arrivo (pagina avvisi/) ———

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,24}$/i;
/** Solo link di check-in di Slope: il link finisce nelle email agli ospiti. */
const CHECKIN = /^https:\/\/booking\.slope\.it\/g\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/reservations\/[0-9a-f-]{36}\/check-in$/i;
const clean = (v: unknown): string => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
/** «KIMSART» → «Kimsart»: i nomi tutti maiuscoli (frequenti da Booking) diventano leggibili nel saluto. */
const titolo = (s: string): string =>
  s && s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()) : s;

/** Nome leggibile del portale: «Booking.com», «Expedia»… (dal nome dell'agenzia o dal codice del canale). */
function nomePortale(agencyName: unknown, otaChannel: unknown): string | null {
  const canale = clean(otaChannel).toUpperCase();
  if (!canale) return null;
  if (canale === "BOOKING") return "Booking.com";
  if (canale === "EXPEDIA") return "Expedia";
  return clean(agencyName) || canale.charAt(0) + canale.slice(1).toLowerCase();
}

/**
 * Numero della prenotazione per l'oggetto delle email: per i portali il loro numero (quello che l'ospite ha nella
 * conferma), per le dirette il numero dell'ordine Slope. Gli ID passano invariati; qui si leggono soltanto.
 */
export function riferimentiPer(
  rows: readonly ArrivalRow[],
  references: readonly ReferenceFields[] = [],
  orders: readonly OrderFields[] = [],
): Map<string, Pick<AvvisoItem, "codicePortale" | "portale" | "numeroOrdine">> {
  const refById = new Map(references.map((x) => [x.reservation_id, x]));
  const numeri = new Map(orders.filter((o) => typeof o.order_number === "number").map((o) => [o.order_id, o.order_number]));
  const out = new Map<string, Pick<AvvisoItem, "codicePortale" | "portale" | "numeroOrdine">>();
  for (const r of rows) {
    const ref = refById.get(r.reservation_id);
    const portale = nomePortale(ref?.agency_name ?? r.agency_name, ref?.ota_channel ?? r.ota_channel);
    const codice = clean(ref?.agency_code);
    const ordine = numeri.get(clean(ref?.order_id) || r.order_id) ?? null;
    out.set(r.reservation_id, { codicePortale: portale && codice ? codice : null, portale: portale && codice ? portale : null, numeroOrdine: ordine });
  }
  return out;
}

/** Una riga per prenotazione confermata (niente opzioni né cancellate), con i contatti dell'intestatario. */
export function avvisiItems(
  rows: readonly ArrivalRow[],
  contacts: readonly ContactFields[],
  references: readonly ReferenceFields[] = [],
  orders: readonly OrderFields[] = [],
): AvvisoItem[] {
  const byId = new Map(contacts.map((c) => [c.reservation_id, c]));
  const rif = riferimentiPer(rows, references, orders);
  return rows
    .filter((r) => !r.is_option && r.booking_status !== "OPTION" && r.booking_status !== "CANCELLED")
    .map((r): AvvisoItem => {
      const c = byId.get(r.reservation_id);
      const azienda = c?.booker_type === "COMPANY" ? clean(c.organization_name) : "";
      const first = titolo(clean(c?.first_name));
      const last = titolo(clean(c?.last_name));
      const url = clean(c?.checkin_url);
      const lang = azienda ? clean(c?.company_language) || clean(c?.language) : clean(c?.language) || clean(c?.company_language);
      return {
        reservationId: r.reservation_id,
        arrival: r.arrival,
        departure: r.departure,
        name: azienda || [last, first].filter(Boolean).join(" "),
        greetingName: azienda ? "" : [first, last].filter(Boolean).join(" "),
        email: [c?.primary_email, c?.company_email].map(clean).find((e) => EMAIL.test(e)) ?? null,
        phone: [c?.primary_phone_number, c?.company_phone].map(clean).find(Boolean) ?? null,
        lang: lang || null,
        checkinUrl: CHECKIN.test(url) ? url : null,
        checkinFatto: c?.is_privacy_policy_acknowledged === true && typeof c.identity_document === "object" && c.identity_document !== null,
        room: clean(r.room_name) || null,
        ...rif.get(r.reservation_id),
      };
    })
    .sort((a, b) => a.arrival.localeCompare(b.arrival) || a.name.localeCompare(b.name));
}

/** Compone, cifra e ricontrolla il file. Lancia un errore se la verifica non torna. */
export async function buildFeed(src: FeedSource, password: string): Promise<BuiltFeed> {
  const lookup = lookupFromRows(src.stays, src.contacts);
  const days: Record<string, FeedItem[]> = {};
  const counts: Record<string, number> = {};
  for (const date of src.dates) {
    const items = toItems(src.rows.filter((r) => r.arrival === date), lookup).map(toFeedItem);
    days[date] = items;
    counts[date] = items.length;
  }
  const worst = src.freshness.reduce<FreshnessStatus>((w, f) => (RANK[f.overall.status] > RANK[w] ? f.overall.status : w), "fresh");
  const times = src.freshness
    .flatMap((f) => f.sources)
    .filter((s) => s.resource === "lodging_reservation" && s.property_id === HARTMANN_ID && s.last_success_at)
    .map((s) => Date.parse(s.last_success_at!))
    .filter(Number.isFinite);
  const from = src.dates[0];
  const payload: FeedPayload = { days };
  const avvisi: AvvisiPayload = { items: avvisiItems(src.rows, src.contacts, src.references, src.orders) };
  const envelope: FeedEnvelope = {
    format: 1,
    app: "WelcomeHartmann",
    generated_at: new Date().toISOString(),
    scatola_updated_at: times.length ? new Date(Math.max(...times)).toISOString() : null,
    freshness: worst,
    from,
    to: src.dates[src.dates.length - 1],
    counts,
    enc: await encryptJson(payload, password, feedAad(from), FEED_ITERATIONS),
    avvisi_count: avvisi.items.length,
    avvisi: await encryptJson(avvisi, password, avvisiAad(from), FEED_ITERATIONS),
  };
  const back = await decryptJson<FeedPayload>(envelope.enc, password, feedAad(from));
  if (JSON.stringify(back) !== JSON.stringify(payload)) throw new Error("la verifica della cifratura non torna");
  const backAvvisi = await decryptJson<AvvisiPayload>(envelope.avvisi!, password, avvisiAad(from));
  if (JSON.stringify(backAvvisi) !== JSON.stringify(avvisi)) throw new Error("la verifica della cifratura dei contatti non torna");

  const noRoom = src.rows.filter((r) => !r.room_name).length;
  const noName = Object.values(days).flat().filter((i) => !i.name).length;
  return {
    envelope,
    summary: [
      `RIEPILOGO arrivi ${src.dates.map((d) => `${dm(d)}: ${counts[d]}`).join(" · ")}`,
      `RIEPILOGO La Scatola: ${worst}${envelope.scatola_updated_at ? `, prenotazioni aggiornate alle ${envelope.scatola_updated_at}` : ""}`,
      `RIEPILOGO senza camera: ${noRoom} · senza nome: ${noName}`,
      `RIEPILOGO avvisi: ${avvisi.items.length} prenotazioni confermate · ${avvisi.items.filter((i) => i.email).length} con email · ${avvisi.items.filter((i) => i.checkinUrl).length} con link di check-in · ${avvisi.items.filter((i) => i.checkinFatto).length} con check-in già fatto · ${avvisi.items.filter((i) => i.codicePortale || i.numeroOrdine).length} con numero di prenotazione`,
    ],
  };
}
