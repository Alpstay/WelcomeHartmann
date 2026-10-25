/**
 * Check-in online & email · Chalet Hotel Hartmann — regole pure (nessun DOM): le usano la pagina checkin/,
 * la pagina di prova e i test.
 *
 * Obiettivo: avere in Slope l'email DIRETTA dell'ospite. Chi prenota da un portale ha in Slope solo l'indirizzo
 * di inoltro del portale (…@guest.booking.com, …@m.expediapartnercentral.com); l'indirizzo vero entra nella
 * scheda cliente solo con il check-in online. Ogni prenotazione finisce quindi in uno di quattro stati.
 * L'indirizzo di inoltro del portale conta come email NULLA: non è l'email dell'ospite.
 *
 * Promemoria per la reception: check-in online da fare → 5 giorni prima dell'arrivo; check-in fatto con email
 * mancante o da correggere → 3 giorni prima. Ad ogni aggiornamento da Slope lo stato si ricalcola (controllo
 * incrociato): chi nel frattempo ha inserito un'email valida esce da solo dalla lista. Se la richiesta resta senza
 * risposta (link di check-in: dopo 2 giorni; email: dopo 1 giorno) il promemoria torna come «telefonare».
 *
 * Regola: gli ID ricevuti da Slope (reservationId) non vengono mai modificati.
 */
import type { AvvisoItem } from "../feed";
import { RE_CHECKIN_SLOPE, linkEmail, numeroWhatsapp } from "../avvisi/testi";
import type { Lingua, Programma } from "../avvisi/testi";

// ───────────────────────── Tipi ─────────────────────────

/** Che indirizzo c'è nella scheda cliente di Slope. */
export type TipoEmail = "diretta" | "portale" | "sospetta" | "mancante";

/** Stato della prenotazione, nell'ordine in cui la reception deve lavorarle. */
export type StatoRiga = "checkin-da-fare" | "email-da-correggere" | "email-mancante" | "tutto-ok";

/** Cosa si chiede all'ospite: fare il check-in online (con il link) oppure solo l'email. */
export type Motivo = "checkin" | "email";

/** Come è stato contattato l'ospite. «testo» = testo copiato (es. chat dell'extranet del portale). */
export type Canale = "whatsapp" | "email" | "testo" | "telefono" | "altro";

export interface ControlloEmail {
  readonly tipo: TipoEmail;
  /** «Booking.com», «Expedia», … se l'indirizzo è quello di inoltro di un portale */
  readonly portale: string | null;
  /** correzione proposta per un dominio scritto male (gmial.com → gmail.com) */
  readonly suggerita: string | null;
}

/** Una prenotazione (una camera) come la vede la reception. */
export interface RigaCheckin {
  /** reservation_id di Slope, invariato */
  readonly reservationId: string;
  readonly camera: string | null;
  /** «Cognome Nome» o ragione sociale */
  readonly nome: string;
  /** «Nome Cognome» per il saluto; vuoto per le aziende */
  readonly nomeSaluto: string;
  readonly arrivo: string;
  readonly partenza: string;
  /** 0 = arriva oggi */
  readonly giorniAllArrivo: number;
  readonly notti: number;
  readonly lingua: Lingua;
  /** codice lingua com'è in Slope (es. "pt"), per l'etichetta */
  readonly linguaSlope: string | null;
  /** email dell'ospite; null se manca o se in Slope c'è solo l'inoltro del portale */
  readonly email: string | null;
  /** indirizzo di inoltro del portale (…@guest.booking.com): NON è l'email dell'ospite, ma ci si può scrivere da info@alpstay.eu */
  readonly inoltroPortale: string | null;
  readonly riferimento: Riferimento | null;
  readonly controlloEmail: ControlloEmail;
  readonly telefono: string | null;
  /** solo cifre, pronto per wa.me; null se manca o non è plausibile */
  readonly whatsapp: string | null;
  /** link personale di check-in online di Slope (credenziale: mai fuori dal file cifrato) */
  readonly checkinUrl: string | null;
  readonly checkinFatto: boolean;
  readonly stato: StatoRiga;
  /** order_id di Slope, invariato (più camere dello stesso ordine hanno lo stesso); null se La Scatola non lo dà */
  readonly ordineSlope: string | null;
  /** check-in fatto segnato a mano dalla reception (visto in Slope, La Scatola non lo mostra ancora) */
  readonly checkinAMano?: boolean;
}

/** Check-in online visto in Slope e segnato dalla reception su questo computer. Solo id Slope e date. */
export interface CheckinSegnato {
  /** reservation_id di Slope, invariato */
  readonly id: string;
  /** ISO, quando è stato segnato */
  readonly quando: string;
  /** data di arrivo, per cancellare il registro dopo il soggiorno */
  readonly arrivo: string;
}

/** Contatto registrato su questo computer. Solo id Slope, motivo, canale e data: nessun dato dell'ospite. */
export interface Contatto {
  /** reservation_id di Slope, invariato */
  readonly id: string;
  readonly motivo: Motivo;
  readonly canale: Canale;
  /** ISO, quando */
  readonly quando: string;
  /** data di arrivo, per cancellare il registro dopo il soggiorno */
  readonly arrivo: string;
}

/** Numero della prenotazione per l'oggetto delle email: del portale (Booking.com, Expedia) o dell'ordine Slope. */
export interface Riferimento {
  /** «Booking.com», «Expedia»; null = numero dell'ordine Slope (prenotazione diretta) */
  readonly portale: string | null;
  readonly numero: string;
}

/** Quando la reception deve scrivere all'ospite. */
export type Quando = "in-ritardo" | "oggi" | "prossimamente";

export interface Promemoria {
  readonly riga: RigaCheckin;
  /** giorno in cui va attivata la corrispondenza (arrivo − 5 o − 3 giorni) */
  readonly giorno: string;
  readonly quando: Quando;
  /** contatto già registrato per questa cosa da chiedere (null = ancora da fare) */
  readonly contatto: Contatto | null;
  /** la richiesta è rimasta senza risposta: telefonare all'ospite */
  readonly sollecito: boolean;
}

export interface Messaggio {
  readonly oggetto: string;
  /** testo semplice: il link di check-in compare come «START: https://…» */
  readonly testo: string;
  /** testo per WhatsApp: *START* in grassetto davanti al link */
  readonly whatsapp: string;
  /** corpo dell'email in HTML, con il link di check-in come pulsante «START» */
  readonly html: string;
}

// ───────────────────────── Costanti ─────────────────────────

export const ORDINE_STATI: readonly StatoRiga[] = ["checkin-da-fare", "email-da-correggere", "email-mancante", "tutto-ok"];

export const ETICHETTE_STATO: Readonly<Record<StatoRiga, { readonly titolo: string; readonly breve: string; readonly spiegazione: string }>> = {
  "checkin-da-fare": {
    titolo: "Check-in online da fare",
    breve: "Check-in da fare",
    spiegazione: "Mandare il link personale di check-in: nel modulo l'ospite inserisce la sua email.",
  },
  "email-da-correggere": {
    titolo: "Check-in fatto · email da correggere",
    breve: "Email da correggere",
    spiegazione: "Ha fatto il check-in ma l'email sembra scritta male: verificarla con l'ospite e correggerla in Slope.",
  },
  "email-mancante": {
    titolo: "Check-in fatto · email mancante",
    breve: "Email mancante",
    spiegazione: "Ha fatto il check-in ma in Slope non c'è un'email valida (vuota o solo l'inoltro di Booking.com/Expedia): chiederla e scriverla nella scheda cliente.",
  },
  "tutto-ok": {
    titolo: "Check-in fatto · email diretta",
    breve: "Tutto a posto",
    spiegazione: "Check-in online fatto e indirizzo diretto dell'ospite in Slope.",
  },
};

/** Giorni prima dell'arrivo in cui attivare la corrispondenza, per stato. */
export const ANTICIPO_GIORNI: Readonly<Record<StatoRiga, number | null>> = {
  "checkin-da-fare": 5,
  "email-da-correggere": 3,
  "email-mancante": 3,
  "tutto-ok": null,
};

/** Giorni dopo la richiesta senza risposta in cui telefonare: link di check-in 2, email 1. */
export const SOLLECITO_DOPO_GIORNI: Readonly<Record<Motivo, number>> = { checkin: 2, email: 1 };

/** Registro dei contatti: si tiene fino a 14 giorni dopo l'arrivo. */
export const GIORNI_CONSERVAZIONE_CONTATTI = 14;

const EMAIL_VALIDA = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,24}$/i;

/** Indirizzi di inoltro dei portali: non arrivano all'ospite se non si scrive dall'indirizzo registrato nell'extranet. */
const PORTALI: ReadonlyArray<readonly [RegExp, string]> = [
  [/(^|\.)guest\.booking\.com$/, "Booking.com"],
  [/(^|\.)expediapartnercentral\.com$/, "Expedia"],
  [/(^|\.)(guest|reply)\.airbnb\.com$/, "Airbnb"],
  [/(^|\.)agoda-messaging\.com$/, "Agoda"],
];

/** Provider più usati dagli ospiti (stessa lista della pagina avvisi/): servono a riconoscere i domini scritti male. */
const DOMINI_COMUNI: readonly string[] = [
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.it", "hotmail.de", "outlook.com", "outlook.it", "outlook.de",
  "live.com", "live.it", "live.de", "yahoo.com", "yahoo.it", "yahoo.de", "icloud.com", "me.com", "libero.it",
  "virgilio.it", "alice.it", "tim.it", "tiscali.it", "fastwebnet.it", "gmx.de", "gmx.at", "gmx.net", "gmx.ch",
  "web.de", "t-online.de", "aon.at", "bluewin.ch", "orange.fr", "wp.pl", "seznam.cz",
];
const ESTENSIONI_NOTE: ReadonlySet<string> = new Set([
  "com", "net", "org", "eu", "it", "de", "at", "ch", "fr", "es", "nl", "be", "lu", "li", "pl", "cz", "sk", "si", "hr",
  "hu", "dk", "se", "no", "fi", "pt", "ie", "uk", "gr", "ro", "bg", "us", "ca", "au", "ru", "il", "ar", "br", "mx", "jp", "cn",
]);

// ───────────────────────── Date ─────────────────────────

const giornoUtc = (iso: string): number => Date.parse(`${iso}T12:00:00Z`);

export function oggiRoma(adesso: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(adesso);
}

export function aggiungiGiorni(iso: string, giorni: number): string {
  return new Date(giornoUtc(iso) + giorni * 86_400_000).toISOString().slice(0, 10);
}

export function differenzaGiorni(da: string, a: string): number {
  return Math.round((giornoUtc(a) - giornoUtc(da)) / 86_400_000);
}

const LOCALE: Readonly<Record<Lingua, string>> = { it: "it-IT", de: "de-DE", en: "en-GB" };

/** «sabato 24 ottobre» / «Samstag, 24. Oktober» / «Saturday 24 October». */
export function dataLunga(iso: string, lingua: Lingua): string {
  return new Intl.DateTimeFormat(LOCALE[lingua], { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(giornoUtc(iso)));
}

// ───────────────────────── Email ─────────────────────────

function distanza(a: string, b: string): number {
  const riga = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let precedente = riga[0];
    riga[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = riga[j];
      riga[j] = Math.min(riga[j] + 1, riga[j - 1] + 1, precedente + (a[i - 1] === b[j - 1] ? 0 : 1));
      precedente = temp;
    }
  }
  return riga[b.length];
}

/** Propone la correzione di un dominio scritto male (gmail.con → gmail.com, gmial.com → gmail.com). */
export function suggerisciEmail(email: string): string | null {
  const [utente, dominio] = email.toLowerCase().split("@");
  if (!utente || !dominio || DOMINI_COMUNI.includes(dominio)) return null;
  const parti = dominio.split(".");
  const estensione = parti.slice(1).join(".");
  const stessoProvider = DOMINI_COMUNI.filter((d) => d.split(".")[0] === parti[0]);
  if (stessoProvider.length > 0) return ESTENSIONI_NOTE.has(estensione) ? null : `${utente}@${stessoProvider[0]}`;
  const soglia = dominio.length >= 8 ? 2 : 1;
  let migliore: string | null = null;
  let minima = soglia + 1;
  for (const d of DOMINI_COMUNI) {
    const x = distanza(dominio, d);
    if (x < minima) {
      minima = x;
      migliore = d;
    }
  }
  return migliore ? `${utente}@${migliore}` : null;
}

export function portaleDi(email: string): string | null {
  const dominio = email.split("@")[1]?.toLowerCase() ?? "";
  for (const [re, nome] of PORTALI) if (re.test(dominio)) return nome;
  return null;
}

export function controllaEmail(valore: string | null | undefined): ControlloEmail {
  const email = (valore ?? "").trim();
  if (!email || !EMAIL_VALIDA.test(email)) return { tipo: "mancante", portale: null, suggerita: null };
  const portale = portaleDi(email);
  if (portale) return { tipo: "portale", portale, suggerita: null };
  const suggerita = suggerisciEmail(email);
  return suggerita ? { tipo: "sospetta", portale: null, suggerita } : { tipo: "diretta", portale: null, suggerita: null };
}

// ───────────────────────── Stato ─────────────────────────

/** L'inoltro del portale vale come email mancante; un dominio scritto male va corretto. */
export function statoDa(checkinFatto: boolean, email: ControlloEmail): StatoRiga {
  if (!checkinFatto) return "checkin-da-fare";
  if (email.tipo === "mancante" || email.tipo === "portale") return "email-mancante";
  if (email.tipo === "sospetta") return "email-da-correggere";
  return "tutto-ok";
}

/** Numero del portale se c'è, altrimenti numero dell'ordine Slope. */
export function riferimentoDa(x: AvvisoItem): Riferimento | null {
  const codice = (x.codicePortale ?? "").trim();
  if (codice) return { portale: (x.portale ?? "").trim() || null, numero: codice };
  return typeof x.numeroOrdine === "number" && Number.isFinite(x.numeroOrdine) ? { portale: null, numero: String(x.numeroOrdine) } : null;
}

export function mappaLingua(codice: string | null | undefined): Lingua {
  const c = (codice ?? "").trim().toLowerCase().slice(0, 2);
  return c === "de" ? "de" : c === "it" ? "it" : "en";
}

/** «KIMSART» → «Kimsart»: i nomi tutti maiuscoli (frequenti da Booking) diventano leggibili. */
export function maiuscoleNome(nome: string): string {
  const t = nome.trim().replace(/\s+/g, " ");
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
}

/** Dalla riga del blocco «avvisi» di arrivi.json alla riga della pagina. L'ID Slope passa invariato. */
export function versoRiga(x: AvvisoItem, oggi: string): RigaCheckin {
  const controllo = controllaEmail(x.email);
  const checkinFatto = x.checkinFatto === true;
  const url = (x.checkinUrl ?? "").trim();
  const telefono = (x.phone ?? "").trim() || null;
  return {
    reservationId: x.reservationId,
    camera: (x.room ?? "").trim() || null,
    nome: maiuscoleNome(x.name || "") || "Ospite senza nome",
    nomeSaluto: maiuscoleNome(x.greetingName ?? ""),
    arrivo: x.arrival,
    partenza: x.departure,
    giorniAllArrivo: differenzaGiorni(oggi, x.arrival),
    notti: Math.max(0, differenzaGiorni(x.arrival, x.departure)),
    lingua: mappaLingua(x.lang),
    linguaSlope: (x.lang ?? "").trim().toLowerCase() || null,
    email: controllo.tipo === "mancante" || controllo.tipo === "portale" ? null : (x.email ?? "").trim(),
    inoltroPortale: controllo.tipo === "portale" ? (x.email ?? "").trim() : null,
    riferimento: riferimentoDa(x),
    controlloEmail: controllo,
    telefono,
    whatsapp: telefono ? numeroWhatsapp(telefono) : null,
    checkinUrl: RE_CHECKIN_SLOPE.test(url) ? url : null,
    checkinFatto,
    stato: statoDa(checkinFatto, controllo),
    ordineSlope: typeof x.ordineSlope === "string" && UUID_SLOPE.test(x.ordineSlope) ? x.ordineSlope : null,
  };
}

// ───────────────────────── Slope (backoffice) ─────────────────────────

/** Backoffice di Slope e codice della struttura Chalet Hotel Hartmann (dalla barra dell'indirizzo di Slope, 24/10/2026). */
export const SLOPE_BACKOFFICE = "https://backoffice.slope.it";
export const SLOPE_STRUTTURA_HARTMANN = "c6055fa5-edaa-4b8f-a518-541322f3ac1e";
const UUID_SLOPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pagina della prenotazione (ordine) nel backoffice di Slope: da lì l'estensione «Slope X LTS Guest Pass» e la scheda
 * cliente dove scrivere l'email. Serve l'accesso a Slope (il link da solo non apre niente). order_id invariato.
 */
export function linkSlope(r: Pick<RigaCheckin, "ordineSlope">, struttura: string = SLOPE_STRUTTURA_HARTMANN): string | null {
  return r.ordineSlope && UUID_SLOPE.test(r.ordineSlope) && UUID_SLOPE.test(struttura)
    ? `${SLOPE_BACKOFFICE}/${struttura}/orders/${r.ordineSlope}/view`
    : null;
}

/** Righe raggruppate per ordine Slope (stessa pagina in Slope, un solo passaggio); senza ordine, una per riga. */
export function perOrdine(righe: readonly RigaCheckin[]): RigaCheckin[][] {
  const gruppi = new Map<string, RigaCheckin[]>();
  for (const r of righe) {
    const k = r.ordineSlope ?? `prenotazione:${r.reservationId}`;
    const g = gruppi.get(k);
    if (g) g.push(r);
    else gruppi.set(k, [r]);
  }
  return [...gruppi.values()];
}

/** Righe della pagina: una per prenotazione (doppioni tolti), in ordine di stato, arrivo, camera. */
export function righeDa(items: readonly AvvisoItem[], oggi: string): RigaCheckin[] {
  const viste = new Set<string>();
  return items
    .filter((x) => typeof x.reservationId === "string" && x.arrival >= oggi)
    .filter((x) => (viste.has(x.reservationId) ? false : (viste.add(x.reservationId), true)))
    .map((x) => versoRiga(x, oggi))
    .sort(confronta);
}

/**
 * Check-in segnato a mano: quando La Scatola è indietro (o ferma) ma in Slope il check-in online è fatto, la reception
 * lo segna e la riga prosegue (email, Guest Pass) senza aspettare l'aggiornamento. Appena Slope lo conferma la riga
 * resta com'è e il segno non serve più. L'email resta quella letta da Slope.
 */
export function conCheckinSegnato(r: RigaCheckin, segnati: ReadonlyMap<string, CheckinSegnato>): RigaCheckin {
  if (r.checkinFatto || !segnati.has(r.reservationId)) return r;
  return { ...r, checkinFatto: true, checkinAMano: true, stato: statoDa(true, r.controlloEmail) };
}

/** Registro dei check-in segnati a mano: si tiene fino a 14 giorni dopo l'arrivo. */
export function registroCheckinSegnati(voci: unknown, oggi: string): Map<string, CheckinSegnato> {
  const dal = aggiungiGiorni(oggi, -GIORNI_CONSERVAZIONE_CONTATTI);
  const mappa = new Map<string, CheckinSegnato>();
  for (const v of Array.isArray(voci) ? (voci as Partial<CheckinSegnato>[]) : []) {
    if (!v || typeof v.id !== "string" || typeof v.arrivo !== "string" || v.arrivo < dal) continue;
    mappa.set(v.id, { id: v.id, quando: String(v.quando ?? ""), arrivo: v.arrivo });
  }
  return mappa;
}

export function confronta(a: RigaCheckin, b: RigaCheckin): number {
  return (
    ORDINE_STATI.indexOf(a.stato) - ORDINE_STATI.indexOf(b.stato) ||
    a.arrivo.localeCompare(b.arrivo) ||
    (a.camera ?? "~").localeCompare(b.camera ?? "~", "it", { numeric: true }) ||
    a.nome.localeCompare(b.nome)
  );
}

export function conteggi(righe: readonly RigaCheckin[]): Record<StatoRiga, number> {
  const c: Record<StatoRiga, number> = { "checkin-da-fare": 0, "email-da-correggere": 0, "email-mancante": 0, "tutto-ok": 0 };
  for (const r of righe) c[r.stato]++;
  return c;
}

const normalizza = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Ricerca su nome, camera, email e telefono. */
export function cerca(righe: readonly RigaCheckin[], testo: string): RigaCheckin[] {
  const parole = normalizza(testo).split(/\s+/).filter(Boolean);
  if (!parole.length) return [...righe];
  return righe.filter((r) => {
    const dove = normalizza([r.nome, r.camera ?? "", r.email ?? "", r.inoltroPortale ?? "", r.telefono ?? "", r.whatsapp ?? "", r.riferimento?.numero ?? ""].join(" "));
    return parole.every((p) => dove.includes(p));
  });
}

// ───────────────────────── Messaggi all'ospite ─────────────────────────

/** Cosa chiedere all'ospite in questo stato; null = niente da fare. */
export function motivoPer(r: RigaCheckin): Motivo | null {
  if (r.stato === "tutto-ok") return null;
  if (r.stato === "checkin-da-fare") return r.checkinUrl ? "checkin" : "email";
  return "email";
}

const FIRMA: Readonly<Record<Lingua, string>> = {
  it: "Reception Chalet Hotel Hartmann",
  de: "Rezeption Chalet Hotel Hartmann",
  en: "Reception Chalet Hotel Hartmann",
};

const PAROLA_PRENOTAZIONE: Readonly<Record<Lingua, { readonly parola: string; readonly numero: string }>> = {
  it: { parola: "Prenotazione", numero: "n." },
  de: { parola: "Buchung", numero: "Nr." },
  en: { parola: "Reservation", numero: "no." },
};

/** «Prenotazione Booking.com 6123456789» / «Buchung Nr. 8086376»; null se Slope non ha dato il numero. */
export function testoRiferimento(r: RigaCheckin, lingua: Lingua = r.lingua): string | null {
  if (!r.riferimento) return null;
  const p = PAROLA_PRENOTAZIONE[lingua];
  return r.riferimento.portale ? `${p.parola} ${r.riferimento.portale} ${r.riferimento.numero}` : `${p.parola} ${p.numero} ${r.riferimento.numero}`;
}

/** Oggetto con il riferimento della prenotazione: numero e nome dell'ospite (o della ditta). */
export function oggettoCompleto(base: string, r: RigaCheckin): string {
  const nome = r.nomeSaluto || (r.nome === "Ospite senza nome" ? "" : r.nome);
  return [base, testoRiferimento(r), nome].filter(Boolean).join(" · ");
}

function saluto(lingua: Lingua, nome: string): string {
  if (lingua === "de") return nome ? `Guten Tag ${nome},` : "Guten Tag,";
  if (lingua === "it") return nome ? `Gentile ${nome},` : "Gentile ospite,";
  return nome ? `Hello ${nome},` : "Hello,";
}

/** Parte di un messaggio: testo, oppure il link personale di check-in (pulsante «START»). */
type Parte = string | { readonly link: string };

/** Testo del pulsante del link di check-in, uguale in tutte le lingue. */
export const ETICHETTA_LINK = "START";

function parti(r: RigaCheckin, motivo: Motivo): { oggetto: string; parti: Parte[] } {
  const l = r.lingua;
  const data = dataLunga(r.arrivo, l);
  const link: Parte = { link: r.checkinUrl ?? "" };
  if (l === "it") {
    return motivo === "checkin"
      ? {
          oggetto: "Il suo check-in online · Chalet Hotel Hartmann",
          parti: [
            saluto("it", r.nomeSaluto),
            `la aspettiamo allo Chalet Hotel Hartmann ${data}. Per arrivare senza attese, completi il check-in online qui:`,
            link,
            "Nel modulo inserisca il suo indirizzo email personale: è lì che le inviamo il Guest Pass per i mezzi pubblici e le informazioni per il soggiorno.",
            "A presto!",
            FIRMA.it,
          ],
        }
      : {
          oggetto: "Il suo indirizzo email · Chalet Hotel Hartmann",
          parti: [
            saluto("it", r.nomeSaluto),
            r.checkinFatto
              ? "grazie per aver completato il check-in online! Ci manca solo il suo indirizzo email personale: ce lo può scrivere in risposta a questo messaggio?"
              : `la aspettiamo allo Chalet Hotel Hartmann ${data}. Ci può scrivere in risposta a questo messaggio il suo indirizzo email personale?`,
            "Ci serve per inviarle il Guest Pass per i mezzi pubblici e le informazioni per il soggiorno.",
            "Grazie e a presto!",
            FIRMA.it,
          ],
        };
  }
  if (l === "de") {
    return motivo === "checkin"
      ? {
          oggetto: "Ihr Online-Check-in · Chalet Hotel Hartmann",
          parti: [
            saluto("de", r.nomeSaluto),
            `wir freuen uns, Sie am ${data} im Chalet Hotel Hartmann zu begrüßen. Damit Sie ohne Wartezeit ankommen, erledigen Sie bitte hier Ihren Online-Check-in:`,
            link,
            "Bitte geben Sie im Formular Ihre persönliche E-Mail-Adresse an: Dorthin senden wir Ihnen den Guest Pass für die öffentlichen Verkehrsmittel und die Infos zu Ihrem Aufenthalt.",
            "Bis bald!",
            FIRMA.de,
          ],
        }
      : {
          oggetto: "Ihre E-Mail-Adresse · Chalet Hotel Hartmann",
          parti: [
            saluto("de", r.nomeSaluto),
            r.checkinFatto
              ? "vielen Dank für Ihren Online-Check-in! Uns fehlt nur noch Ihre persönliche E-Mail-Adresse: Könnten Sie sie uns als Antwort auf diese Nachricht schicken?"
              : `wir freuen uns, Sie am ${data} im Chalet Hotel Hartmann zu begrüßen. Könnten Sie uns als Antwort auf diese Nachricht Ihre persönliche E-Mail-Adresse schicken?`,
            "Wir brauchen sie, um Ihnen den Guest Pass für die öffentlichen Verkehrsmittel und die Infos zu Ihrem Aufenthalt zu senden.",
            "Vielen Dank und bis bald!",
            FIRMA.de,
          ],
        };
  }
  return motivo === "checkin"
    ? {
        oggetto: "Your online check-in · Chalet Hotel Hartmann",
        parti: [
          saluto("en", r.nomeSaluto),
          `we look forward to welcoming you at Chalet Hotel Hartmann on ${data}. To arrive without waiting, please complete your online check-in here:`,
          link,
          "Please enter your personal email address in the form: that is where we send your Guest Pass for public transport and the information for your stay.",
          "See you soon!",
          FIRMA.en,
        ],
      }
    : {
        oggetto: "Your email address · Chalet Hotel Hartmann",
        parti: [
          saluto("en", r.nomeSaluto),
          r.checkinFatto
            ? "thank you for completing your online check-in! We are only missing your personal email address: could you reply to this message with it?"
            : `we look forward to welcoming you at Chalet Hotel Hartmann on ${data}. Could you reply to this message with your personal email address?`,
          "We need it to send you the Guest Pass for public transport and the information for your stay.",
          "Thank you and see you soon!",
          FIRMA.en,
        ],
      };
}

const escHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/**
 * Testo per l'ospite, nella sua lingua (tedesco, italiano, inglese per tutte le altre), in tre forme:
 * - `html`: per l'email, con il link di check-in come pulsante «START» (si incolla in Outlook o Gmail);
 * - `testo`: testo semplice (email aperta da link, chat dell'extranet), con «START:» davanti al link;
 * - `whatsapp`: come il testo, con *START* in grassetto.
 * Il Guest Pass arriva per email solo dopo il check-in online: è il motivo concreto per lasciare l'indirizzo vero.
 */
export function messaggio(r: RigaCheckin, motivo: Motivo): Messaggio {
  const m = parti(r, motivo);
  const testo = m.parti.map((x) => (typeof x === "string" ? x : `${ETICHETTA_LINK}: ${x.link}`)).join("\n\n");
  const whatsapp = m.parti.map((x) => (typeof x === "string" ? x : `*${ETICHETTA_LINK}* ${x.link}`)).join("\n\n");
  const html = m.parti
    .map((x) =>
      typeof x === "string"
        ? `<p style="margin:0 0 14px">${escHtml(x)}</p>`
        : `<p style="margin:0 0 18px"><a href="${escHtml(x.link)}" style="display:inline-block;padding:10px 26px;background:#94752f;color:#ffffff;font-weight:bold;letter-spacing:.08em;text-decoration:none;border-radius:6px">${ETICHETTA_LINK}</a></p>`,
    )
    .join("");
  return {
    oggetto: oggettoCompleto(m.oggetto, r),
    testo,
    whatsapp,
    html: `<div style="font-family:Lato,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#161512">${html}</div>`,
  };
}

export function linkWhatsapp(r: RigaCheckin, motivo: Motivo): string | null {
  return r.whatsapp ? `https://wa.me/${r.whatsapp}?text=${encodeURIComponent(messaggio(r, motivo).whatsapp)}` : null;
}

/**
 * Email all'ospite. Senza email valida si può scrivere all'inoltro del portale (arriva solo se spedita da
 * info@alpstay.eu, l'indirizzo registrato nell'extranet): l'ospite risponde con il suo indirizzo.
 */
export function linkPosta(r: RigaCheckin, motivo: Motivo, programma: Programma, conCorpo = true): string | null {
  const a = r.email ?? r.inoltroPortale;
  if (!a) return null;
  const m = messaggio(r, motivo);
  // Senza corpo: il testo con il pulsante START si incolla dagli appunti (gli indirizzi mailto portano solo testo semplice).
  return linkEmail(programma, [a], m.oggetto, conCorpo ? m.testo : "");
}

// ───────────────────────── Promemoria (calendario della reception) ─────────────────────────

/** Giorno in cui attivare la corrispondenza: arrivo − 5 (check-in da fare) o − 3 giorni (email); null se è tutto a posto. */
export function giornoContatto(r: RigaCheckin): string | null {
  const anticipo = ANTICIPO_GIORNI[r.stato];
  return anticipo === null ? null : aggiungiGiorni(r.arrivo, -anticipo);
}

/** Giorno in cui telefonare se la richiesta resta senza risposta (mai dopo il giorno di arrivo). */
export function giornoSollecito(c: Contatto): string {
  const scritto = Number.isFinite(Date.parse(c.quando)) ? oggiRoma(new Date(c.quando)) : c.arrivo;
  const g = aggiungiGiorni(scritto, SOLLECITO_DOPO_GIORNI[c.motivo]);
  return g > c.arrivo ? c.arrivo : g;
}

/**
 * Tutti i promemoria delle prenotazioni da sistemare, in ordine di giorno, arrivo e camera.
 * «in-ritardo» = il giorno è passato e l'ospite non è ancora stato contattato per la cosa che manca.
 * Con un contatto già fatto e ancora nessuna risposta, dal giorno del sollecito il promemoria torna: telefonare.
 */
export function promemoria(righe: readonly RigaCheckin[], registro: ReadonlyMap<string, Contatto>, oggi: string): Promemoria[] {
  const out: Promemoria[] = [];
  for (const r of righe) {
    const primo = giornoContatto(r);
    if (!primo || r.arrivo < oggi) continue;
    const contatto = contattoAttuale(r, registro);
    if (contatto) {
      const g = giornoSollecito(contatto);
      const sollecito = g <= oggi;
      out.push({ riga: r, giorno: sollecito ? g : primo, quando: sollecito ? "oggi" : primo > oggi ? "prossimamente" : "oggi", contatto, sollecito });
      continue;
    }
    const quando: Quando = primo > oggi ? "prossimamente" : primo < oggi ? "in-ritardo" : "oggi";
    out.push({ riga: r, giorno: primo, quando, contatto: null, sollecito: false });
  }
  return out.sort(
    (a, b) =>
      a.giorno.localeCompare(b.giorno) ||
      a.riga.arrivo.localeCompare(b.riga.arrivo) ||
      (a.riga.camera ?? "~").localeCompare(b.riga.camera ?? "~", "it", { numeric: true }),
  );
}

/** Da fare oggi: giorno arrivato (o passato) e nessun contatto registrato, oppure richiesta senza risposta (telefonare). */
export const daFareOggi = (lista: readonly Promemoria[]): Promemoria[] => lista.filter((p) => p.quando !== "prossimamente" && (!p.contatto || p.sollecito));

/**
 * Fin dove il calendario è completo: il file copre gli arrivi fino a `ultimoArrivo`, quindi i promemoria del
 * check-in (−5) sono noti fino a ultimoArrivo−5 e quelli dell'email (−3) fino a ultimoArrivo−3.
 */
export function calendarioCompletoFino(ultimoArrivo: string): string {
  return aggiungiGiorni(ultimoArrivo, -Math.max(...Object.values(ANTICIPO_GIORNI).filter((n): n is number => n !== null)));
}

// ───────────────────────── Registro contatti ─────────────────────────

/** Legge il registro salvato, scartando voci rotte e quelle oltre 14 giorni dopo l'arrivo. */
export function registroValido(voci: unknown, oggi: string): Map<string, Contatto> {
  const dal = aggiungiGiorni(oggi, -GIORNI_CONSERVAZIONE_CONTATTI);
  const canali: readonly Canale[] = ["whatsapp", "email", "testo", "telefono", "altro"];
  const mappa = new Map<string, Contatto>();
  for (const v of Array.isArray(voci) ? (voci as Partial<Contatto>[]) : []) {
    if (!v || typeof v.id !== "string" || typeof v.arrivo !== "string" || v.arrivo < dal) continue;
    if (v.motivo !== "checkin" && v.motivo !== "email") continue;
    if (!canali.includes(v.canale as Canale) || typeof v.quando !== "string") continue;
    mappa.set(v.id, { id: v.id, motivo: v.motivo, canale: v.canale as Canale, quando: v.quando, arrivo: v.arrivo });
  }
  return mappa;
}

/** Il contatto vale solo se chiedeva la cosa che manca ancora (chi aveva il link ora deve solo dare l'email). */
export function contattoAttuale(r: RigaCheckin, registro: ReadonlyMap<string, Contatto>): Contatto | null {
  const c = registro.get(r.reservationId);
  const m = motivoPer(r);
  return c && m && c.motivo === m ? c : null;
}

// ───────────────────────── Email nuova annotata dalla reception ─────────────────────────
//
// L'ospite manda la sua email (WhatsApp, risposta, al banco): una risposta può perdersi per una svista, quindi la
// reception la annota subito nella riga della camera. Finché Slope non la mostra, la riga lampeggia in rosso
// «da inserire in Slope»; ad ogni aggiornamento orario si controlla se è arrivata.

/** Email annotata su questo computer (id Slope invariato). Si cancella quando è in Slope o 14 giorni dopo l'arrivo. */
export interface EmailNuova {
  readonly id: string;
  readonly email: string;
  /** ISO, quando è stata annotata */
  readonly quando: string;
  readonly arrivo: string;
}

export type EsitoEmailNuova =
  | { readonly ok: true; readonly email: string }
  | { readonly ok: false; readonly errore: string; readonly suggerita: string | null };

/** Controlla l'email scritta dalla reception: formato, inoltro dei portali (non vale) e domini scritti male. */
export function validaEmailNuova(valore: string, forza = false): EsitoEmailNuova {
  const email = valore.trim().replace(/^mailto:/i, "").replace(/\s+/g, "");
  const c = controllaEmail(email);
  if (c.tipo === "mancante") return { ok: false, errore: "Indirizzo non valido: controlla @ e dominio.", suggerita: null };
  if (c.tipo === "portale") return { ok: false, errore: `È l'indirizzo di inoltro di ${c.portale}: non vale come email dell'ospite.`, suggerita: null };
  if (c.tipo === "sospetta" && !forza) return { ok: false, errore: `Il dominio sembra scritto male: forse ${c.suggerita}?`, suggerita: c.suggerita };
  const [utente, dominio] = email.split("@");
  return { ok: true, email: `${utente}@${dominio.toLowerCase()}` };
}

export function registroEmailNuove(voci: unknown, oggi: string): Map<string, EmailNuova> {
  const dal = aggiungiGiorni(oggi, -GIORNI_CONSERVAZIONE_CONTATTI);
  const mappa = new Map<string, EmailNuova>();
  for (const v of Array.isArray(voci) ? (voci as Partial<EmailNuova>[]) : []) {
    if (!v || typeof v.id !== "string" || typeof v.email !== "string" || typeof v.arrivo !== "string" || v.arrivo < dal) continue;
    if (!validaEmailNuova(v.email, true).ok) continue;
    mappa.set(v.id, { id: v.id, email: v.email, quando: typeof v.quando === "string" ? v.quando : "", arrivo: v.arrivo });
  }
  return mappa;
}

/**
 * Controllo incrociato con Slope: «inserita» se Slope mostra la stessa email, «diversa» se in Slope c'è
 * un'altra email diretta, altrimenti «da-inserire».
 */
export function confrontaConSlope(r: RigaCheckin, n: EmailNuova): "da-inserire" | "inserita" | "diversa" {
  const slope = (r.email ?? "").trim().toLowerCase();
  if (slope && slope === n.email.trim().toLowerCase()) return "inserita";
  if (slope && r.controlloEmail.tipo === "diretta") return "diversa";
  return "da-inserire";
}

/** Righe con un'email annotata ancora da portare in Slope (anche quelle con un'email diversa in Slope, da controllare). */
export function emailDaInserire(righe: readonly RigaCheckin[], nuove: ReadonlyMap<string, EmailNuova>): { riga: RigaCheckin; nuova: EmailNuova; esito: "da-inserire" | "diversa" }[] {
  const out: { riga: RigaCheckin; nuova: EmailNuova; esito: "da-inserire" | "diversa" }[] = [];
  for (const r of righe) {
    const n = nuove.get(r.reservationId);
    if (!n) continue;
    const esito = confrontaConSlope(r, n);
    if (esito !== "inserita") out.push({ riga: r, nuova: n, esito });
  }
  return out;
}

/** La riga può ricevere un'email annotata: manca un'email diretta valida in Slope. */
export const serveEmail = (r: RigaCheckin): boolean => r.controlloEmail.tipo !== "diretta";
