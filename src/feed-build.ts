// Composizione di arrivi.json dalle righe lette da La Scatola: usata sia dall'aggiornamento in una sessione
// Claude (tools/feed.mjs) sia da quello su GitHub Actions (tools/github-feed.mjs). Gli ID di Slope passano
// così come arrivano.

import { FEED_DAYS, FEED_ITERATIONS, decryptJson, encryptJson, feedAad, toFeedItem } from "./feed";
import type { FeedEnvelope, FeedItem, FeedPayload } from "./feed";
import { PROPERTY_NAME_MATCH } from "./hotel";
import { lookupFromRows, toItems } from "./scatola";
import type { ArrivalRow, BookerFields, Freshness, FreshnessStatus, GuestStayFields } from "./types";

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
  readonly contacts: readonly BookerFields[];
  readonly freshness: readonly Freshness[];
}

export interface BuiltFeed {
  readonly envelope: FeedEnvelope;
  /** Righe di riepilogo senza dati personali. */
  readonly summary: readonly string[];
}

const RANK: Record<FreshnessStatus, number> = { fresh: 0, unavailable: 1, stale: 2, failing: 3 };

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
  };
  const back = await decryptJson<FeedPayload>(envelope.enc, password, feedAad(from));
  if (JSON.stringify(back) !== JSON.stringify(payload)) throw new Error("la verifica della cifratura non torna");

  const noRoom = src.rows.filter((r) => !r.room_name).length;
  const noName = Object.values(days).flat().filter((i) => !i.name).length;
  return {
    envelope,
    summary: [
      `RIEPILOGO arrivi ${src.dates.map((d) => `${dm(d)}: ${counts[d]}`).join(" · ")}`,
      `RIEPILOGO La Scatola: ${worst}${envelope.scatola_updated_at ? `, prenotazioni aggiornate alle ${envelope.scatola_updated_at}` : ""}`,
      `RIEPILOGO senza camera: ${noRoom} · senza nome: ${noName}`,
    ],
  };
}
