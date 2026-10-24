// Formato del file arrivi.json pubblicato su GitHub e cifratura (WebCrypto, uguale in Node e nel browser).
// Nel repository pubblico tutto ciò che riguarda gli ospiti è cifrato; in chiaro restano solo date e conteggi.

import type { ArrivalItem, FreshnessStatus, LangCode, LangSource } from "./types";

export const FEED_FILE = "arrivi.json";
export const FEED_DAYS = 7;
const ITERATIONS = 250_000;
/** Iterazioni per arrivi.json (nomi degli ospiti in un repository pubblico): valore consigliato OWASP per
 *  PBKDF2-SHA256. Chi decifra legge il numero dal file, quindi i file vecchi a 250 000 restano leggibili. */
export const FEED_ITERATIONS = 600_000;

export interface EncBlock {
  readonly alg: "AES-GCM/PBKDF2-SHA256";
  readonly iter: number;
  readonly salt: string;
  readonly iv: string;
  readonly ct: string;
}

/** Una riga di arrivo come pubblicata (cifrata). reservation_id è quello di Slope, invariato. */
export interface FeedItem {
  readonly reservationId: string | null;
  readonly room: string | null;
  readonly arrival: string;
  readonly departure: string;
  readonly adults: number;
  readonly children: number;
  readonly isOption: boolean;
  readonly inHouse: boolean;
  readonly name: string;
  readonly lang: LangCode;
  readonly langSource: LangSource;
  readonly rawLang: string | null;
  readonly langNote: string | null;
}

export interface FeedPayload {
  readonly days: Readonly<Record<string, readonly FeedItem[]>>;
}

/**
 * Contatti per le email pre-arrivo (pagina avvisi/): una riga per prenotazione confermata, cifrata a parte.
 * reservationId è quello di Slope, invariato.
 */
export interface AvvisoItem {
  readonly reservationId: string;
  readonly arrival: string;
  readonly departure: string;
  /** «Cognome Nome» (o ragione sociale) per l'elenco della reception. */
  readonly name: string;
  /** «Nome Cognome» per il saluto; vuoto per le aziende. */
  readonly greetingName: string;
  readonly email: string | null;
  readonly phone: string | null;
  /** Lingua dell'intestatario così come in Slope (es. "en"). */
  readonly lang: string | null;
  /** Link personale di check-in online di Slope (solo https://booking.slope.it/…). */
  readonly checkinUrl: string | null;
  /** Check-in online già fatto (documento registrato in Slope). Assente nei file più vecchi. */
  readonly checkinFatto?: boolean;
  /** Camera assegnata (room_name di Slope), per distinguere i link quando un intestatario ha più camere. */
  readonly room?: string | null;
  /** Numero di prenotazione del portale (agency_code di Slope), solo per le prenotazioni dai portali. */
  readonly codicePortale?: string | null;
  /** Nome del portale per il riferimento («Booking.com», «Expedia»); null per le dirette. */
  readonly portale?: string | null;
  /** Numero dell'ordine in Slope (order_number), per le prenotazioni dirette. */
  readonly numeroOrdine?: number | null;
}

export interface AvvisiPayload {
  readonly items: readonly AvvisoItem[];
}

export const avvisiAad = (from: string): string => `WelcomeHartmann|avvisi|${from}`;

export interface FeedEnvelope {
  readonly format: 1;
  readonly app: "WelcomeHartmann";
  /** Quando è stato scritto il file (ISO, UTC). */
  readonly generated_at: string;
  /** Ultimo aggiornamento delle prenotazioni Hartmann in La Scatola (ISO, UTC). */
  readonly scatola_updated_at: string | null;
  readonly freshness: FreshnessStatus;
  readonly from: string;
  readonly to: string;
  /** Numero di arrivi per giorno (nessun dato personale). */
  readonly counts: Readonly<Record<string, number>>;
  readonly enc: EncBlock;
  /** Numero di prenotazioni nel blocco avvisi (nessun dato personale). Assente nei file più vecchi. */
  readonly avvisi_count?: number;
  /** Contatti per le email pre-arrivo, cifrati con la stessa password (AvvisiPayload). */
  readonly avvisi?: EncBlock;
}

export const feedAad = (from: string): string => `WelcomeHartmann|${from}`;

const subtle = (): SubtleCrypto => {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) throw new Error("WebCrypto non disponibile");
  return c.subtle;
};

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function keyFrom(password: string, salt: Uint8Array<ArrayBuffer>, iter: number, usage: KeyUsage): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, [usage]);
}

export async function encryptJson(value: unknown, password: string, aad: string, iter = ITERATIONS): Promise<EncBlock> {
  const c = (globalThis as { crypto: Crypto }).crypto;
  const salt = c.getRandomValues(new Uint8Array(16));
  const iv = c.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password, salt, iter, "encrypt");
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return { alg: "AES-GCM/PBKDF2-SHA256", iter, salt: toB64(salt), iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

/** Lancia un errore se la password è sbagliata o il file è stato alterato. */
export async function decryptJson<T>(enc: EncBlock, password: string, aad: string): Promise<T> {
  const key = await keyFrom(password, fromB64(enc.salt), enc.iter, "decrypt");
  const pt = await subtle().decrypt(
    { name: "AES-GCM", iv: fromB64(enc.iv), additionalData: new TextEncoder().encode(aad) },
    key,
    fromB64(enc.ct),
  );
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

export const toFeedItem = (i: ArrivalItem): FeedItem => ({
  reservationId: i.reservationId,
  room: i.room,
  arrival: i.arrival ?? "",
  departure: i.departure ?? "",
  adults: i.adults,
  children: i.children,
  isOption: i.isOption,
  inHouse: i.inHouse,
  name: i.name,
  lang: i.lang,
  langSource: i.langSource,
  rawLang: i.rawLang,
  langNote: i.langNote,
});

export const fromFeedItem = (f: FeedItem, index: number): ArrivalItem => ({
  key: f.reservationId ?? `riga-${index}`,
  reservationId: f.reservationId,
  room: f.room,
  arrival: f.arrival || null,
  departure: f.departure || null,
  adults: f.adults,
  children: f.children,
  isOption: f.isOption,
  inHouse: f.inHouse,
  manual: false,
  rawLang: f.rawLang,
  langNote: f.langNote,
  langSource: f.langSource,
  name: f.name,
  note: "",
  pin: "",
  lang: f.lang,
  selected: true,
});

export function isFeedEnvelope(v: unknown): v is FeedEnvelope {
  const e = v as Partial<FeedEnvelope> | null;
  return !!e && e.format === 1 && e.app === "WelcomeHartmann" && typeof e.from === "string" && typeof e.to === "string" && !!e.enc;
}
