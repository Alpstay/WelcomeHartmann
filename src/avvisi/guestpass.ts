/**
 * Guest Pass personale (Val Gardena Guest Pass, portale feratel) per la pagina avvisi.
 * La reception incolla l'email del Guest Pass (o solo i link): si ricavano nomi e link, si trova la prenotazione
 * dal nome e si invia all'ospite un link alla pagina d'arrivo con i suoi pass (#gp=…&gn=…), che la Directory
 * (repo 5DAYTO-ARRIVAL) legge, toglie dalla barra dell'indirizzo e ricorda sul telefono.
 * Il link feratel è personale: è una credenziale. Non si salva mai: resta solo nella finestra della reception.
 * Regola: gli ID ricevuti da Slope non vengono mai modificati.
 */
import { LINK_ARRIVO } from "./testi";
import type { Lingua } from "./testi";
import type { EncBlock } from "../feed";

/** Un Guest Pass trovato: nome dell'ospite (può mancare) e codice del link feratel (parametro m). */
export interface PassTrovato {
  readonly nome: string;
  readonly codice: string;
}

export interface TestoGuestPass {
  readonly oggetto: string;
  /** {LINK_GUESTPASS} = link personale; *testo* = grassetto WhatsApp (tolto nell'email). */
  readonly corpo: string;
}

export const SEGNAPOSTO_LINK_GUESTPASS = "{LINK_GUESTPASS}";
export const HOST_PASS = "card-mobile-identification.feratel.com";
export const PERCORSO_PASS = "/v1/sgp01/mobile";
const RE_CODICE = /^[A-Za-z0-9_-]{20,300}$/;
const RE_URL = /https:\/\/card-mobile-identification\.feratel\.com\/[^\s<>"')\]]+/g;
const MAX_PASS = 12;

// ───────────────────────── Lettura dell'email ─────────────────────────

/** Codice del pass se il link è un Guest Pass feratel valido (il link del PDF e i link estranei sono scartati). */
export function codiceDaLink(grezzo: string): string | null {
  let url: URL;
  try {
    url = new URL(grezzo.trim().replace(/&amp;/g, "&"));
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== HOST_PASS || url.pathname !== PERCORSO_PASS) return null;
  const m = url.searchParams.get("m");
  return m !== null && RE_CODICE.test(m) ? m : null;
}

/** Nome leggibile: niente link, niente testi generici dell'email, niente caratteri che rompono il link. */
export function pulisciNomePass(grezzo: string): string {
  const s = grezzo.replace(/\s+/g, " ").replace(/[<>"'`\\$~]/g, "").trim();
  if (!s || /^https?:/i.test(s) || s.length > 60) return "";
  if (/^(here|hier|qui|link|guest ?pass( link)?( for:?)?|add to wallet)$/i.test(s)) return "";
  return s;
}

function aggiungi(lista: PassTrovato[], nome: string, codice: string): void {
  const i = lista.findIndex((p) => p.codice === codice);
  if (i === -1) {
    if (lista.length < MAX_PASS) lista.push({ nome, codice });
  } else if (!lista[i]!.nome && nome) {
    lista[i] = { nome, codice };
  }
}

/** Dall'email copiata (Outlook, Gmail): i nomi sono il testo dei link; in una tabella, la cella del nome. */
export function passDaHtml(html: string, parser: Pick<DOMParser, "parseFromString">): PassTrovato[] {
  const out: PassTrovato[] = [];
  const doc = parser.parseFromString(html, "text/html");
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    const codice = codiceDaLink(a.getAttribute("href") ?? "");
    if (!codice) continue;
    let nome = pulisciNomePass(a.textContent ?? "");
    if (!nome) {
      // riga di tabella (es. elenco dei pass generati): il nome è la cella con sole lettere
      const riga = a.closest("tr");
      const celle = riga ? Array.from(riga.querySelectorAll("td, th")).map((c) => (c.textContent ?? "").trim()) : [];
      nome = pulisciNomePass(celle.find((t) => /^[\p{L}][\p{L}' .-]{2,58}$/u.test(t) && !/\d/.test(t)) ?? "");
    }
    aggiungi(out, nome, codice);
  }
  return out;
}

/** Entità HTML con nome: le base più tutte le lettere Latin-1 (&uuml; &eacute; &szlig; …), in ordine da U+00A0. */
const LATIN1 =
  "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest " +
  "Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig " +
  "agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml";
const ENTITA: Readonly<Record<string, string>> = {
  ...Object.fromEntries(LATIN1.split(" ").map((nome, i) => [nome, String.fromCodePoint(0xa0 + i)])),
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  OElig: "Œ", oelig: "œ", Scaron: "Š", scaron: "š", Yuml: "Ÿ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘",
};
const codiceValido = (n: number): boolean => Number.isInteger(n) && n > 0 && n <= 0x10ffff && (n < 0xd800 || n > 0xdfff);
/** Decodifica le entità HTML (numeriche e con nome); quelle sconosciute restano come sono. */
export const decodificaEntita = (t: string): string =>
  t.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] !== "#") return ENTITA[e] ?? ENTITA[e.toLowerCase()] ?? m;
    const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return codiceValido(n) ? String.fromCodePoint(n) : m;
  });
const decodifica = decodificaEntita;
/** Testo leggibile di un frammento HTML (senza tag, entità decodificate). */
export const testoDaHtml = (html: string): string =>
  decodifica(html.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<[^>]*>/g, " "));

/** Come passDaHtml ma senza DOM (per il programma che legge la casella in Node): i nomi sono il testo dei link. */
export function passDaHtmlSenzaDom(html: string): PassTrovato[] {
  const out: PassTrovato[] = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi;
  for (const m of html.matchAll(re)) {
    const codice = codiceDaLink(decodifica(m[2]!));
    if (codice) aggiungi(out, pulisciNomePass(decodifica(m[3]!.replace(/<[^>]*>/g, " "))), codice);
  }
  return out;
}

/** Da testo semplice: «Nome <https://…>» (Outlook) oppure solo i link. */
export function passDaTesto(testo: string): PassTrovato[] {
  const out: PassTrovato[] = [];
  for (const m of testo.matchAll(RE_URL)) {
    const codice = codiceDaLink(m[0]);
    if (!codice) continue;
    const prima = testo.slice(0, m.index).split("\n").pop() ?? "";
    const conNome = /([^<>\n]{2,60})<\s*$/.exec(prima);
    aggiungi(out, conNome ? pulisciNomePass(conNome[1]!) : "", codice);
  }
  return out;
}

/** Unisce i pass trovati in HTML e in testo, senza doppioni (vince il nome non vuoto). */
export function unisciPass(...liste: readonly (readonly PassTrovato[])[]): PassTrovato[] {
  const out: PassTrovato[] = [];
  for (const l of liste) for (const p of l) aggiungi(out, p.nome, p.codice);
  return out;
}

/** Lingua dell'email del Guest Pass, se si riconosce (serve solo per gli ospiti non in Slope). */
export function linguaEmail(testo: string): Lingua | null {
  const t = testo.toLowerCase();
  const conta = (parole: readonly string[]): number => parole.filter((w) => t.includes(w)).length;
  const de = conta(["wir wünschen", "bitte öffnen", "weitere", "nicht übertragbar", "gastgeber"]);
  const it = conta(["vi auguriamo", "aprite", "ulteriori", "non trasferibile", "struttura ricettiva"]);
  const en = conta(["we wish you", "please open", "further useful", "non-transferable", "accommodation provider"]);
  const max = Math.max(de, it, en);
  if (max === 0) return null;
  return de === max ? "de" : it === max ? "it" : "en";
}

// ───────────────────────── Abbinamento alla prenotazione ─────────────────────────

/** Parole del nome senza accenti, maiuscole e punteggiatura («SCOTT TRAVIS» → ["scott","travis"]). */
export function paroleNome(nome: string): string[] {
  return nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 2);
}

/** Quante parole del nome di un pass compaiono nel nome della prenotazione (il miglior pass vince). */
export function punteggioNome(nomiPass: readonly string[], nomePrenotazione: string): number {
  const pren = new Set(paroleNome(nomePrenotazione));
  let migliore = 0;
  for (const n of nomiPass) {
    const comuni = paroleNome(n).filter((w) => pren.has(w)).length;
    if (comuni > migliore) migliore = comuni;
  }
  return migliore;
}

export interface Candidato {
  readonly id: string;
  readonly nome: string;
}

/**
 * Prenotazione da proporre: con nome e cognome uguali (2 parole) sicura; con una sola parola uguale solo se
 * nessun'altra prenotazione ha lo stesso punteggio. Altrimenti null: sceglie la receptionist.
 */
export function prenotazioneProposta(nomiPass: readonly string[], candidati: readonly Candidato[]): { id: string; sicura: boolean } | null {
  const punti = candidati.map((c) => ({ id: c.id, p: punteggioNome(nomiPass, c.nome) })).filter((x) => x.p > 0);
  if (punti.length === 0) return null;
  const max = Math.max(...punti.map((x) => x.p));
  const migliori = punti.filter((x) => x.p === max);
  if (migliori.length !== 1) return null;
  return { id: migliori[0]!.id, sicura: max >= 2 };
}

// ───────────────────────── Link e testi ─────────────────────────

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Link personale alla pagina d'arrivo con i pass (nel frammento #: non arriva a nessun server).
 * `prenotazioni` = reservation_id Slope a cui appartengono i pass (&gr=…, copiati identici): la Directory mostra i
 * pass solo con il link di quella prenotazione, così su un dispositivo condiviso un ospite non vede quelli di un altro.
 */
export function linkGuestPass(lingua: Lingua, pass: readonly PassTrovato[], prenotazioni: readonly string[] = []): string {
  const gp = pass.map((p) => p.codice).join("~");
  const gn = pass.some((p) => p.nome) ? "&gn=" + pass.map((p) => encodeURIComponent(p.nome)).join("~") : "";
  const ids = prenotazioni.filter((id) => RE_UUID.test(id)).slice(0, 12);
  const gr = ids.length ? "&gr=" + ids.join("~") : "";
  return `${LINK_ARRIVO}?lang=${lingua}#gp=${gp}${gn}${gr}`;
}

/** Testi del 22/10/2026 (bozza, modificabile nel riquadro prima dell'invio). Firma come gli avvisi pre-arrivo. */
export const TESTI_GUESTPASS: Readonly<Record<Lingua, TestoGuestPass>> = {
  it: {
    oggetto: "Il vostro Guest Pass · Chalet Hotel Hartmann",
    corpo: [
      "Il vostro *Guest Pass* per i mezzi pubblici della Val Gardena è pronto.",
      "",
      "Lo trovate qui, insieme a tutte le informazioni per l'arrivo, e potete salvarlo nel Wallet del telefono:",
      SEGNAPOSTO_LINK_GUESTPASS,
      "",
      "Il Guest Pass è personale: obliteratelo prima di salire, a ogni corsa.",
      "",
      "A presto in Val Gardena!",
      "Ezio Prinoth",
      "Il team dello Chalet Hotel Hartmann",
    ].join("\n"),
  },
  de: {
    oggetto: "Ihr Guest Pass · Chalet Hotel Hartmann",
    corpo: [
      "Ihr *Guest Pass* für die öffentlichen Verkehrsmittel in Gröden ist bereit.",
      "",
      "Sie finden ihn hier, zusammen mit allen Informationen zur Anreise, und können ihn im Wallet Ihres Smartphones speichern:",
      SEGNAPOSTO_LINK_GUESTPASS,
      "",
      "Der Guest Pass ist persönlich: Bitte bei jeder Fahrt vor dem Einsteigen entwerten.",
      "",
      "Bis bald in Gröden!",
      "Ezio Prinoth",
      "Das Team des Chalet Hotel Hartmann",
    ].join("\n"),
  },
  en: {
    oggetto: "Your Guest Pass · Chalet Hotel Hartmann",
    corpo: [
      "Your *Guest Pass* for public transport in Val Gardena is ready.",
      "",
      "You will find it here, together with all the information for your arrival, and you can save it to your phone's Wallet:",
      SEGNAPOSTO_LINK_GUESTPASS,
      "",
      "The Guest Pass is personal: please validate it before boarding, on every ride.",
      "",
      "See you soon in Val Gardena!",
      "Ezio Prinoth",
      "The Chalet Hotel Hartmann team",
    ].join("\n"),
  },
};

export function testoGuestPass(lingua: Lingua, pass: readonly PassTrovato[], prenotazioni: readonly string[] = []): string {
  return TESTI_GUESTPASS[lingua].corpo.split(SEGNAPOSTO_LINK_GUESTPASS).join(linkGuestPass(lingua, pass, prenotazioni));
}

// ───────────────────────── File guestpass.json (casella Guest Pass) ─────────────────────────

/**
 * Un'email «Südtirol Guest Pass» letta dalla casella dedicata (workflow «Guest Pass dalla casella»).
 * id = impronta del Message-ID: serve al registro «inviato» della reception, non contiene dati.
 */
export interface EmailGuestPass {
  readonly id: string;
  /** quando è arrivata (ISO, UTC) */
  readonly ricevuta: string;
  readonly lingua: Lingua | null;
  /** true se Gmail ha verificato la firma di feratel.tv (DKIM o DMARC): altrimenti va controllata a mano */
  readonly firmata: boolean;
  readonly pass: readonly PassTrovato[];
}

export interface GuestPassPayload {
  readonly items: readonly EmailGuestPass[];
}

/** guestpass.json: in chiaro solo date e conteggio; nomi e link cifrati con la password reception. */
export interface GuestPassEnvelope {
  readonly format: 1;
  readonly app: "WelcomeHartmann";
  readonly kind: "guestpass";
  readonly generated_at: string;
  /** giorno (Europe/Rome) usato nell'AAD della cifratura */
  readonly from: string;
  readonly count: number;
  readonly enc: EncBlock;
}

export const GUESTPASS_FILE = "guestpass.json";
export const guestpassAad = (from: string): string => `WelcomeHartmann|guestpass|${from}`;

export function isGuestPassEnvelope(v: unknown): v is GuestPassEnvelope {
  const e = v as Partial<GuestPassEnvelope> | null;
  return !!e && e.format === 1 && e.app === "WelcomeHartmann" && e.kind === "guestpass" && typeof e.from === "string" && !!e.enc;
}

const RE_ID_EMAIL = /^[0-9a-f]{20}$/;

/** Voci decifrate di guestpass.json, ricontrollate una per una: solo link feratel validi, nomi ripuliti. */
export function emailGuestPassValide(dati: unknown): EmailGuestPass[] {
  const items = (dati as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  const out: EmailGuestPass[] = [];
  for (const v of items as Partial<Record<keyof EmailGuestPass, unknown>>[]) {
    if (!v || typeof v.id !== "string" || !RE_ID_EMAIL.test(v.id) || typeof v.ricevuta !== "string" || Number.isNaN(Date.parse(v.ricevuta))) continue;
    const pass: PassTrovato[] = [];
    for (const p of Array.isArray(v.pass) ? (v.pass as Partial<PassTrovato>[]) : []) {
      if (p && typeof p.codice === "string" && RE_CODICE.test(p.codice)) aggiungi(pass, pulisciNomePass(typeof p.nome === "string" ? p.nome : ""), p.codice);
    }
    if (pass.length === 0) continue;
    const lingua = v.lingua === "de" || v.lingua === "it" || v.lingua === "en" ? v.lingua : null;
    out.push({ id: v.id, ricevuta: v.ricevuta, lingua, firmata: v.firmata === true, pass });
  }
  return out.sort((a, b) => b.ricevuta.localeCompare(a.ricevuta));
}

/**
 * Firma del mittente verificata da Gmail: si legge solo l'intestazione Authentication-Results aggiunta da
 * mx.google.com (quelle scritte da chi invia non contano), con dkim=pass per feratel.tv o dmarc=pass.
 */
export function firmaFeratel(intestazioniAuth: readonly string[]): boolean {
  const gmail = intestazioniAuth.map((h) => h.replace(/\r?\n[ \t]+/g, " ").replace(/^authentication-results:\s*/i, "")).find((h) => /^mx\.google\.com\s*;/i.test(h));
  if (!gmail) return false;
  const dkim = /\bdkim=pass\b[^;]*\bheader\.(?:i=@?|d=)(?:[a-z0-9-]+\.)*feratel\.tv(?=[\s;)]|$)/i.test(gmail);
  const dmarc = /\bdmarc=pass\b[^;]*\bheader\.from=(?:[a-z0-9-]+\.)*feratel\.tv(?=[\s;)]|$)/i.test(gmail);
  return dkim || dmarc;
}
