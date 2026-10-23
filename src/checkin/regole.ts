/**
 * Check-in online & email · Chalet Hotel Hartmann — regole pure (nessun DOM): le usano la pagina checkin/,
 * la pagina di prova e i test.
 *
 * Obiettivo: avere in Slope l'email DIRETTA dell'ospite. Chi prenota da un portale ha in Slope solo l'indirizzo
 * di inoltro del portale (…@guest.booking.com, …@m.expediapartnercentral.com); l'indirizzo vero entra nella
 * scheda cliente solo con il check-in online. Ogni prenotazione finisce quindi in uno di quattro stati.
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
export type Canale = "whatsapp" | "email" | "testo" | "altro";

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
  readonly email: string | null;
  readonly controlloEmail: ControlloEmail;
  readonly telefono: string | null;
  /** solo cifre, pronto per wa.me; null se manca o non è plausibile */
  readonly whatsapp: string | null;
  /** link personale di check-in online di Slope (credenziale: mai fuori dal file cifrato) */
  readonly checkinUrl: string | null;
  readonly checkinFatto: boolean;
  readonly stato: StatoRiga;
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

export interface Messaggio {
  readonly oggetto: string;
  readonly testo: string;
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
    spiegazione: "Ha fatto il check-in ma in Slope c'è ancora l'indirizzo del portale o un indirizzo con un errore.",
  },
  "email-mancante": {
    titolo: "Check-in fatto · email mancante",
    breve: "Email mancante",
    spiegazione: "Ha fatto il check-in senza lasciare l'email: chiederla e scriverla nella scheda cliente in Slope.",
  },
  "tutto-ok": {
    titolo: "Check-in fatto · email diretta",
    breve: "Tutto a posto",
    spiegazione: "Check-in online fatto e indirizzo diretto dell'ospite in Slope.",
  },
};

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

export function statoDa(checkinFatto: boolean, email: ControlloEmail): StatoRiga {
  if (!checkinFatto) return "checkin-da-fare";
  if (email.tipo === "mancante") return "email-mancante";
  if (email.tipo === "diretta") return "tutto-ok";
  return "email-da-correggere";
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
    email: controllo.tipo === "mancante" ? null : (x.email ?? "").trim(),
    controlloEmail: controllo,
    telefono,
    whatsapp: telefono ? numeroWhatsapp(telefono) : null,
    checkinUrl: RE_CHECKIN_SLOPE.test(url) ? url : null,
    checkinFatto,
    stato: statoDa(checkinFatto, controllo),
  };
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
    const dove = normalizza([r.nome, r.camera ?? "", r.email ?? "", r.telefono ?? "", r.whatsapp ?? ""].join(" "));
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

function saluto(lingua: Lingua, nome: string): string {
  if (lingua === "de") return nome ? `Guten Tag ${nome},` : "Guten Tag,";
  if (lingua === "it") return nome ? `Gentile ${nome},` : "Gentile ospite,";
  return nome ? `Hello ${nome},` : "Hello,";
}

/**
 * Testo per l'ospite, nella sua lingua (tedesco, italiano, inglese per tutte le altre).
 * Il Guest Pass arriva per email solo dopo il check-in online: è il motivo concreto per lasciare l'indirizzo vero.
 */
export function messaggio(r: RigaCheckin, motivo: Motivo): Messaggio {
  const l = r.lingua;
  const data = dataLunga(r.arrivo, l);
  const link = r.checkinUrl ?? "";
  const testi: Record<Lingua, Record<Motivo, Messaggio>> = {
    it: {
      checkin: {
        oggetto: "Il suo check-in online · Chalet Hotel Hartmann",
        testo: [
          saluto("it", r.nomeSaluto),
          `la aspettiamo allo Chalet Hotel Hartmann ${data}. Per arrivare senza attese, completi il check-in online qui:`,
          link,
          "Nel modulo inserisca il suo indirizzo email personale: è lì che le inviamo il Guest Pass per i mezzi pubblici e le informazioni per il soggiorno.",
          "A presto!",
          FIRMA.it,
        ].join("\n\n"),
      },
      email: {
        oggetto: "Il suo indirizzo email · Chalet Hotel Hartmann",
        testo: [
          saluto("it", r.nomeSaluto),
          r.checkinFatto
            ? "grazie per aver completato il check-in online! Ci manca solo il suo indirizzo email personale: ce lo può scrivere in risposta a questo messaggio?"
            : `la aspettiamo allo Chalet Hotel Hartmann ${data}. Ci può scrivere in risposta a questo messaggio il suo indirizzo email personale?`,
          "Ci serve per inviarle il Guest Pass per i mezzi pubblici e le informazioni per il soggiorno.",
          "Grazie e a presto!",
          FIRMA.it,
        ].join("\n\n"),
      },
    },
    de: {
      checkin: {
        oggetto: "Ihr Online-Check-in · Chalet Hotel Hartmann",
        testo: [
          saluto("de", r.nomeSaluto),
          `wir freuen uns, Sie am ${data} im Chalet Hotel Hartmann zu begrüßen. Damit Sie ohne Wartezeit ankommen, erledigen Sie bitte hier Ihren Online-Check-in:`,
          link,
          "Bitte geben Sie im Formular Ihre persönliche E-Mail-Adresse an: Dorthin senden wir Ihnen den Guest Pass für die öffentlichen Verkehrsmittel und die Infos zu Ihrem Aufenthalt.",
          "Bis bald!",
          FIRMA.de,
        ].join("\n\n"),
      },
      email: {
        oggetto: "Ihre E-Mail-Adresse · Chalet Hotel Hartmann",
        testo: [
          saluto("de", r.nomeSaluto),
          r.checkinFatto
            ? "vielen Dank für Ihren Online-Check-in! Uns fehlt nur noch Ihre persönliche E-Mail-Adresse: Könnten Sie sie uns als Antwort auf diese Nachricht schicken?"
            : `wir freuen uns, Sie am ${data} im Chalet Hotel Hartmann zu begrüßen. Könnten Sie uns als Antwort auf diese Nachricht Ihre persönliche E-Mail-Adresse schicken?`,
          "Wir brauchen sie, um Ihnen den Guest Pass für die öffentlichen Verkehrsmittel und die Infos zu Ihrem Aufenthalt zu senden.",
          "Vielen Dank und bis bald!",
          FIRMA.de,
        ].join("\n\n"),
      },
    },
    en: {
      checkin: {
        oggetto: "Your online check-in · Chalet Hotel Hartmann",
        testo: [
          saluto("en", r.nomeSaluto),
          `we look forward to welcoming you at Chalet Hotel Hartmann on ${data}. To arrive without waiting, please complete your online check-in here:`,
          link,
          "Please enter your personal email address in the form: that is where we send your Guest Pass for public transport and the information for your stay.",
          "See you soon!",
          FIRMA.en,
        ].join("\n\n"),
      },
      email: {
        oggetto: "Your email address · Chalet Hotel Hartmann",
        testo: [
          saluto("en", r.nomeSaluto),
          r.checkinFatto
            ? "thank you for completing your online check-in! We are only missing your personal email address: could you reply to this message with it?"
            : `we look forward to welcoming you at Chalet Hotel Hartmann on ${data}. Could you reply to this message with your personal email address?`,
          "We need it to send you the Guest Pass for public transport and the information for your stay.",
          "Thank you and see you soon!",
          FIRMA.en,
        ].join("\n\n"),
      },
    },
  };
  return testi[l][motivo];
}

export function linkWhatsapp(r: RigaCheckin, motivo: Motivo): string | null {
  return r.whatsapp ? `https://wa.me/${r.whatsapp}?text=${encodeURIComponent(messaggio(r, motivo).testo)}` : null;
}

/** Email all'indirizzo in Slope (anche quello di inoltro del portale: arriva se si scrive da info@alpstay.eu). */
export function linkPosta(r: RigaCheckin, motivo: Motivo, programma: Programma): string | null {
  if (!r.email) return null;
  const m = messaggio(r, motivo);
  return linkEmail(programma, [r.email], m.oggetto, m.testo);
}

// ───────────────────────── Registro contatti ─────────────────────────

/** Legge il registro salvato, scartando voci rotte e quelle oltre 14 giorni dopo l'arrivo. */
export function registroValido(voci: unknown, oggi: string): Map<string, Contatto> {
  const dal = aggiungiGiorni(oggi, -GIORNI_CONSERVAZIONE_CONTATTI);
  const canali: readonly Canale[] = ["whatsapp", "email", "testo", "altro"];
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
