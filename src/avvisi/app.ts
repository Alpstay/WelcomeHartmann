/**
 * Avvisi Arrivo Hartmann · pagina online (GitHub Pages: https://alpstay.github.io/WelcomeHartmann/avvisi/)
 * Email (o WhatsApp) pre-arrivo agli ospiti dello Chalet Hotel Hartmann: un messaggio per ospite, nella sua lingua,
 * con il suo link personale alla pagina d'arrivo (check-in online Slope, parcheggio, indicazioni). Testi in testi.ts.
 *
 * Dati:      ../arrivi.json, blocco «avvisi» cifrato, rigenerato ogni ora da La Scatola dall'attività pianificata
 *            di WelcomeHartmann (tools/AGGIORNA.md). Si decifra con la password reception, la stessa delle lettere.
 * Sul computer (localStorage): registro «già avvisati», email aggiunte a mano, impostazioni.
 * Regola:    gli ID ricevuti da Slope non vengono mai modificati.
 */
import { avvisiAad, decryptJson, isFeedEnvelope } from "../feed";
import type { AvvisiPayload, AvvisoItem, FeedEnvelope } from "../feed";
import { VERSIONE_TESTI, TESTI_PREDEFINITI, numeroWhatsapp, mostraNumero, senzaGrassetto, componi, linkEmail } from "./testi";
import type { Lingua, Programma, TestoLingua, Membro } from "./testi";
import {
  TESTI_GUESTPASS,
  emailGuestPassValide,
  guestpassAad,
  isGuestPassEnvelope,
  linguaEmail,
  linkGuestPass,
  passDaHtml,
  passDaTesto,
  prenotazioneProposta,
  testoGuestPass,
  unisciPass,
} from "./guestpass";
import type { EmailGuestPass, PassTrovato } from "./guestpass";

// ───────────────────────── Costanti ─────────────────────────

const FEED_URL = "../arrivi.json";
/** Stessa chiave della pagina delle lettere: sullo stesso computer la password si inserisce una volta sola. */
const PW_KEY = "welcomeHartmann.password";
const K_INVII = "avvisiHartmann.invii";
const K_MANUALI = "avvisiHartmann.manuali";
const K_IMPOSTAZIONI = "avvisiHartmann.impostazioni";
/** Registro «Guest Pass inviato» (solo id Slope, canale, data: mai i link dei pass). */
const K_GUESTPASS = "avvisiHartmann.guestpass";
/** Email del Guest Pass già gestite (inviate o nascoste) su questo computer: solo l'impronta dell'email, mai i link. */
const K_GUESTPASS_EMAIL = "avvisiHartmann.guestpassEmail";
/** Guest Pass letti dalla casella dedicata (workflow «Guest Pass dalla casella», avviato dalla Gmail appena arriva un pass). */
const GUESTPASS_URL = "../guestpass.json";
const STATO_GUESTPASS_URL = "../stato-guestpass.txt";
/** La casella tiene 8 giorni di email: il registro delle email gestite qualche giorno in più. */
const GIORNI_CONSERVAZIONE_EMAIL_GP = 12;
const AGGIORNA_GP_OGNI_MS = 5 * 60_000;
/** Valore della scelta «ospite non in lista» nel riquadro Guest Pass. */
const GP_ALTRO = "__altro";
const TZ = "Europe/Rome";
/** Chrome ed Edge su Windows non aprono link mailto più lunghi di 2083 caratteri: si resta sotto con margine. */
const MAX_LUNGHEZZA_MAILTO = 2000;
const MAX_LUNGHEZZA_GMAIL = 7500;
const GIORNI_CONSERVAZIONE_MANUALI = 30;
const GIORNI_CONSERVAZIONE_INVII = 30;
/** arrivi.json copre da oggi a oggi+6: l'anticipo massimo è 6 giorni. */
const MAX_ANTICIPO = 6;
const AGGIORNA_OGNI_MS = 10 * 60_000;
/** Oltre questa età, in orario di lavoro, i dati si segnalano come fermi. */
const DATI_VECCHI_MS = 3 * 60 * 60_000;

// ───────────────────────── Tipi: app ─────────────────────────

type Canale = "email" | "whatsapp";
type TipoDestinatario = "prenotazione" | "manuale";

/** Prenotazione letta dalla Scatola, normalizzata. */
interface Arrivo {
  /** reservation_id Slope, invariato */
  reservationId: string;
  arrivo: string;
  partenza: string;
  nome: string;
  /** nome per il saluto, nell'ordine Nome Cognome */
  nomeSaluto: string;
  email: string | null;
  telefono: string | null;
  lingua: Lingua;
  relayOta: string | null;
  giorniAllArrivo: number;
  checkinUrl: string | null;
  /** check-in online già fatto: il link porta alla pagina d'arrivo senza check-in */
  checkinFatto: boolean;
  camera: string | null;
}

/** Contatto inserito a mano dalla reception: email e/o numero WhatsApp. */
interface EmailManuale {
  /** reservation_id Slope (tipo "prenotazione") oppure "manuale-<uuid>" (tipo "manuale") */
  id: string;
  tipo: TipoDestinatario;
  /** reservation_id Slope, invariato; null per gli indirizzi liberi */
  reservationId: string | null;
  email: string | null;
  /** numero WhatsApp in formato internazionale («+49 170…»); ha la precedenza su quello di Slope */
  telefono: string | null;
  lingua: Lingua;
  arrivo: string;
  /** solo per gli indirizzi liberi */
  nome: string | null;
  /** solo per le prenotazioni: true = si invia solo a questo indirizzo, non a quello della Scatola */
  sostituisce: boolean;
  creatoIl: string;
}

/** Chi riceve l'email: una prenotazione della Scatola oppure un indirizzo libero. */
interface Destinatario {
  /** chiave del registro: reservation_id Slope oppure id dell'indirizzo libero */
  id: string;
  tipo: TipoDestinatario;
  prenotazione: Arrivo | null;
  manuale: EmailManuale | null;
  nome: string;
  dataArrivo: string;
  giorniAllArrivo: number;
  lingua: Lingua;
  emails: string[];
  emailScatola: string | null;
  scatolaSostituita: boolean;
  relayOta: string | null;
  telefono: string | null;
  nomeSaluto: string;
  checkinUrl: string | null;
  checkinFatto: boolean;
  /** prenotazioni coperte da questo messaggio (almeno una: la stessa del destinatario) */
  membri: Membro[];
}

interface RegistroInvio {
  id: string;
  tipo: TipoDestinatario;
  arrival: string;
  canale: Canale;
  lingua: Lingua;
  inviatoIl: string;
}

/** Email pronta per un ospite. */
interface EmailOspite {
  a: string[];
  oggetto: string;
  corpo: string;
  url: string;
  troppoLunga: boolean;
}

interface Impostazioni {
  /** versione dei testi predefiniti da cui partono i testi salvati */
  versioneTesti: number;
  programma: Programma;
  giorniAnticipo: number;
  testi: Record<Lingua, TestoLingua>;
}

interface ErroreVista {
  titolo: string;
  dettaglio: string;
  riprova: boolean;
}

/** Contesto del dialogo per l'email a mano. */
interface Dialogo {
  modo: TipoDestinatario;
  /** id del documento esistente, se si modifica */
  idEsistente: string | null;
  /** prenotazione a cui si aggiunge l'email (modo "prenotazione") */
  prenotazione: Arrivo | null;
}

/** Guest Pass inviato a una prenotazione (registro su questo computer, senza i link dei pass). */
interface InvioGuestPass {
  /** reservation_id Slope, invariato */
  id: string;
  arrival: string;
  canale: Canale;
  pass: number;
  inviatoIl: string;
  /** impronta dell'email della casella da cui venivano i pass (null se incollati a mano) */
  emailId: string | null;
}

/** Guest Pass arrivati nella casella dedicata, decifrati con la password reception: solo in memoria. */
interface CasellaGuestPass {
  /** false finché il workflow non ha pubblicato guestpass.json: il riquadro resta come prima */
  attiva: boolean;
  email: EmailGuestPass[];
  /** problema da mostrare alla reception (casella o file), null se va tutto bene */
  problema: string | null;
}

/** Riquadro «Guest Pass»: i link restano solo in memoria, in questa finestra. */
interface StatoGuestPass {
  pass: PassTrovato[];
  /** email della casella da cui vengono i pass, null se incollati */
  emailId: string | null;
  /** reservation_id Slope della prenotazione scelta, GP_ALTRO per un ospite non in lista, null se da scegliere */
  sceltaId: string | null;
  proposta: "sicura" | "probabile" | null;
  linguaEmail: Lingua | null;
  /** lingua scelta a mano (altrimenti quella della prenotazione) */
  lingua: Lingua | null;
  /** solo per GP_ALTRO */
  email: string;
  telefono: string;
  aperto: Canale | null;
  avviso: string | null;
}

interface Stato {
  caricamento: "attesa" | "in-corso" | "ok" | "errore" | "bloccata";
  errore: ErroreVista | null;
  arrivi: Arrivo[];
  aggiornatoAlle: string | null;
  finestra: { da: string; a: string; oggi: string };
  registro: Map<string, RegistroInvio>;
  /** false se questo browser non salva i dati (navigazione privata o archivio bloccato) */
  archivioOk: boolean;
  /** messaggio sotto il campo password */
  erroreSblocco: string | null;
  manuali: Map<string, EmailManuale>;
  impostazioni: Impostazioni;
  /** id degli ospiti di cui è stata aperta l'email in questa sessione, in attesa di «Segna inviata» */
  aperte: Set<string>;
  inScrittura: boolean;
  dialogo: Dialogo | null;
  /** tutti gli arrivi del file (da oggi a +6), per abbinare i Guest Pass anche a chi arriva oggi */
  tuttiArrivi: Arrivo[];
  gp: StatoGuestPass;
  inviiGuestPass: Map<string, InvioGuestPass>;
  casella: CasellaGuestPass;
  /** impronta email → quando è stata gestita (inviata o nascosta) */
  emailGestite: Map<string, string>;
}

// ───────────────────────── Testi predefiniti ─────────────────────────

const NOMI_LINGUA: Record<Lingua, string> = { de: "Deutsch", it: "Italiano", en: "English" };
const ORDINE_LINGUE: Lingua[] = ["de", "it", "en"];

function impostazioniPredefinite(): Impostazioni {
  return {
    versioneTesti: VERSIONE_TESTI,
    programma: "mailto",
    giorniAnticipo: 5,
    testi: structuredClone(TESTI_PREDEFINITI),
  };
}

// ───────────────────────── Date (Europe/Rome) ─────────────────────────

function oggiRoma(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function aggiungiGiorni(iso: string, giorni: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + giorni);
  return d.toISOString().slice(0, 10);
}

function differenzaGiorni(da: string, a: string): number {
  return Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(da + "T00:00:00Z")) / 86_400_000);
}

function dataValida(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(iso + "T00:00:00Z"));
}

const fmtGiorno = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fmtOra = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ });

function etichettaGiorno(iso: string): string {
  return fmtGiorno.format(new Date(iso + "T00:00:00Z"));
}

function etichettaDistanza(giorni: number): string {
  if (giorni <= 0) return "oggi";
  if (giorni === 1) return "domani";
  return `fra ${giorni} giorni`;
}

function etaDati(iso: string | null): string {
  if (!iso) return "età dei dati non disponibile";
  const minuti = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minuti < 1) return "dati Slope aggiornati ora";
  if (minuti < 60) return `dati Slope di ${minuti} min fa`;
  return `dati Slope delle ${fmtOra.format(new Date(iso))}`;
}

// ───────────────────────── Normalizzazione ─────────────────────────

function mappaLingua(codice: string | null): Lingua {
  const c = (codice ?? "").trim().toLowerCase().slice(0, 2);
  if (c === "de") return "de";
  if (c === "it") return "it";
  return "en";
}

function pulisciEmail(valore: string | null): string | null {
  const v = (valore ?? "").trim();
  return /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,24}$/i.test(v) ? v : null;
}

/** Provider di posta più usati dagli ospiti: servono a riconoscere gli errori di battitura nel dominio. */
const DOMINI_COMUNI: readonly string[] = [
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.it", "hotmail.de", "outlook.com", "outlook.it", "outlook.de",
  "live.com", "live.it", "live.de", "yahoo.com", "yahoo.it", "yahoo.de", "icloud.com", "me.com", "libero.it",
  "virgilio.it", "alice.it", "tim.it", "tiscali.it", "fastwebnet.it", "gmx.de", "gmx.at", "gmx.net", "gmx.ch",
  "web.de", "t-online.de", "aon.at", "bluewin.ch", "orange.fr", "wp.pl", "seznam.cz",
];

/** Estensioni reali: con un provider noto, un'estensione fuori da questa lista è quasi sempre un errore (gmail.comcom, gmail.con). */
const ESTENSIONI_NOTE: ReadonlySet<string> = new Set([
  "com", "net", "org", "eu", "it", "de", "at", "ch", "fr", "es", "nl", "be", "lu", "li", "pl", "cz", "sk", "si", "hr",
  "hu", "dk", "se", "no", "fi", "pt", "ie", "uk", "gr", "ro", "bg", "us", "ca", "au", "ru", "il", "ar", "br", "mx", "jp", "cn",
]);

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

/** Propone la correzione di un dominio scritto male (gmail.comcom → gmail.com, gmial.com → gmail.com). */
function suggerisciEmail(email: string): string | null {
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

function relayOta(email: string | null): string | null {
  if (!email) return null;
  const dominio = email.split("@")[1]?.toLowerCase() ?? "";
  if (dominio.endsWith("guest.booking.com")) return "Booking.com";
  if (dominio.includes("expediapartnercentral.com")) return "Expedia";
  return null;
}

/** «KIMSART» → «Kimsart»: i nomi tutti in maiuscolo (frequenti da Booking) diventano leggibili nel saluto. */
function maiuscoleNome(nome: string): string {
  const t = nome.trim().replace(/\s+/g, " ");
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
}

/** Accetta solo link https di Slope: il link viene da dati esterni e finisce in un'email. */
function linkCheckin(url: string | null): string | null {
  const u = (url ?? "").trim();
  return /^https:\/\/[a-z0-9.-]*slope\.it\/\S+$/i.test(u) ? u : null;
}

function versoArrivo(x: AvvisoItem, oggi: string): Arrivo {
  const email = pulisciEmail(x.email);
  return {
    reservationId: x.reservationId,
    arrivo: x.arrival,
    partenza: x.departure,
    nome: x.name || "Ospite senza nome",
    nomeSaluto: maiuscoleNome(x.greetingName ?? ""),
    email,
    telefono: (x.phone ?? "").trim() || null,
    lingua: mappaLingua(x.lang),
    relayOta: relayOta(email),
    giorniAllArrivo: differenzaGiorni(oggi, x.arrival),
    checkinUrl: x.checkinFatto === true ? null : linkCheckin(x.checkinUrl),
    checkinFatto: x.checkinFatto === true,
    camera: (x.room ?? "").trim() || null,
  };
}

function nuovoIdManuale(): string {
  const casuale =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `manuale-${casuale}`;
}

function leggiManuale(id: string, v: Record<string, unknown> | undefined): EmailManuale | null {
  if (!v) return null;
  const email = pulisciEmail(typeof v.email === "string" ? v.email : null);
  const tel = typeof v.telefono === "string" ? v.telefono.trim() : "";
  const telefono = tel && numeroWhatsapp(tel) ? tel : null;
  const arrivo = typeof v.arrivo === "string" ? v.arrivo : "";
  if ((!email && !telefono) || !dataValida(arrivo)) return null;
  const tipo: TipoDestinatario = v.tipo === "prenotazione" ? "prenotazione" : "manuale";
  return {
    id,
    tipo,
    reservationId: tipo === "prenotazione" && typeof v.reservationId === "string" ? v.reservationId : null,
    email,
    telefono,
    lingua: mappaLingua(typeof v.lingua === "string" ? v.lingua : null),
    arrivo,
    nome: typeof v.nome === "string" && v.nome.trim() ? v.nome.trim() : null,
    sostituisce: v.sostituisce === true,
    creatoIl: typeof v.creatoIl === "string" ? v.creatoIl : "",
  };
}

// ───────────────────────── Composizione messaggi ─────────────────────────

function emailPer(x: Destinatario, imp: Impostazioni): EmailOspite {
  const testo = imp.testi[x.lingua];
  const corpo = senzaGrassetto(componi(testo.corpo, x.lingua, x.nomeSaluto, x.membri));
  const oggetto = senzaGrassetto(testo.oggetto);
  const url = linkEmail(imp.programma, x.emails, oggetto, corpo);
  const max = imp.programma === "gmail" ? MAX_LUNGHEZZA_GMAIL : MAX_LUNGHEZZA_MAILTO;
  return { a: x.emails, oggetto, corpo, url, troppoLunga: url.length > max };
}

function whatsappPer(x: Destinatario, imp: Impostazioni): string {
  const testo = imp.testi[x.lingua];
  return componi(testo.whatsapp, x.lingua, x.nomeSaluto, x.membri);
}

function linkWhatsappPer(x: Destinatario, imp: Impostazioni): string | null {
  const numero = x.telefono ? numeroWhatsapp(x.telefono) : null;
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(whatsappPer(x, imp))}` : null;
}

// ───────────────────────── Stato ─────────────────────────

const stato: Stato = {
  caricamento: "attesa",
  errore: null,
  arrivi: [],
  aggiornatoAlle: null,
  finestra: { da: "", a: "", oggi: "" },
  registro: new Map(),
  archivioOk: true,
  erroreSblocco: null,
  manuali: new Map(),
  impostazioni: impostazioniPredefinite(),
  aperte: new Set(),
  inScrittura: false,
  dialogo: null,
  tuttiArrivi: [],
  gp: gpVuoto(),
  inviiGuestPass: new Map(),
  casella: casellaVuota(),
  emailGestite: new Map(),
};

let password: string | null = null;
let ultimoFeed: FeedEnvelope | null = null;
let impostazioniModificate = false;

function aggiornaFinestra(): void {
  const oggi = oggiRoma();
  const giorni = Math.min(MAX_ANTICIPO, Math.max(1, Math.round(stato.impostazioni.giorniAnticipo) || 5));
  stato.finestra = { oggi, da: aggiungiGiorni(oggi, 1), a: aggiungiGiorni(oggi, giorni) };
}

// ───────────────────────── Destinatari ─────────────────────────

/** Unisce le prenotazioni della Scatola e gli indirizzi a mano in un'unica lista di destinatari. */
function destinatari(): Destinatario[] {
  const { oggi, da, a } = stato.finestra;
  const lista: Destinatario[] = stato.arrivi.map((x) => {
    const m = stato.manuali.get(x.reservationId);
    const manuale = m && m.tipo === "prenotazione" ? m : null;
    const usaScatola = Boolean(x.email) && !(manuale && manuale.email && manuale.sostituisce);
    const emails = [...new Set([usaScatola ? x.email : null, manuale?.email ?? null].filter((e): e is string => Boolean(e)).map((e) => e.toLowerCase()))];
    return {
      id: x.reservationId,
      tipo: "prenotazione",
      prenotazione: x,
      manuale,
      nome: x.nome,
      dataArrivo: x.arrivo,
      giorniAllArrivo: x.giorniAllArrivo,
      lingua: manuale?.lingua ?? x.lingua,
      emails,
      emailScatola: x.email,
      scatolaSostituita: Boolean(x.email && manuale?.email && manuale.sostituisce),
      relayOta: usaScatola ? x.relayOta : null,
      telefono: manuale?.telefono ?? x.telefono,
      nomeSaluto: x.nomeSaluto,
      checkinUrl: x.checkinUrl,
      checkinFatto: x.checkinFatto,
      membri: [{ id: x.reservationId, camera: x.camera, checkinUrl: x.checkinUrl, checkinFatto: x.checkinFatto }],
    };
  });
  for (const m of stato.manuali.values()) {
    if (m.tipo !== "manuale" || m.arrivo < da || m.arrivo > a) continue;
    lista.push({
      id: m.id,
      tipo: "manuale",
      prenotazione: null,
      manuale: m,
      nome: m.nome ?? m.email ?? m.telefono ?? "Ospite",
      dataArrivo: m.arrivo,
      giorniAllArrivo: differenzaGiorni(oggi, m.arrivo),
      lingua: m.lingua,
      emails: m.email ? [m.email.toLowerCase()] : [],
      emailScatola: null,
      scatolaSostituita: false,
      relayOta: null,
      telefono: m.telefono,
      nomeSaluto: maiuscoleNome(m.nome ?? ""),
      checkinUrl: null,
      checkinFatto: false,
      membri: [{ id: m.id, camera: null, checkinUrl: null, checkinFatto: false }],
    });
  }
  return lista.sort((x, y) => x.dataArrivo.localeCompare(y.dataArrivo) || x.nome.localeCompare(y.nome));
}

/**
 * Più camere dello stesso intestatario (stessa email, oppure stesso WhatsApp se manca l'email, e stesso giorno di
 * arrivo) diventano un solo messaggio con un link di check-in per camera. Gli ID Slope restano quelli dei membri.
 */
function raggruppa(lista: readonly Destinatario[]): Destinatario[] {
  const chiave = (x: Destinatario): string | null => {
    if (x.tipo !== "prenotazione") return null;
    if (x.emails.length) return `e|${x.dataArrivo}|${[...x.emails].sort().join(";")}`;
    const n = x.telefono ? numeroWhatsapp(x.telefono) : null;
    return n ? `w|${x.dataArrivo}|${n}` : null;
  };
  const perCamera = (a: Membro, b: Membro): number => (a.camera ?? "~").localeCompare(b.camera ?? "~", "it", { numeric: true });
  const gruppi = new Map<string, Destinatario[]>();
  const out: Destinatario[] = [];
  for (const x of lista) {
    const k = chiave(x);
    const g = k ? gruppi.get(k) : undefined;
    if (k && g) {
      g.push(x);
      continue;
    }
    const nuovo = [x];
    if (k) gruppi.set(k, nuovo);
    out.push(x);
  }
  return out.map((x) => {
    const k = chiave(x);
    const g = k ? gruppi.get(k) : undefined;
    if (!g || g.length < 2) return x;
    const membri = g.flatMap((d) => d.membri).sort(perCamera);
    const primo = g.find((d) => d.membri.some((m) => m.id === membri[0]?.id)) ?? x;
    return { ...primo, membri, checkinFatto: membri.every((m) => m.checkinFatto) };
  });
}

/** Indirizzi liberi con arrivo oltre la finestra: compariranno più avanti. */
function manualiInAttesa(): EmailManuale[] {
  return [...stato.manuali.values()].filter((m) => m.tipo === "manuale" && m.arrivo > stato.finestra.a).sort((x, y) => x.arrivo.localeCompare(y.arrivo));
}

// ───────────────────────── Dati da arrivi.json ─────────────────────────

function leggiPassword(): string | null {
  try {
    return localStorage.getItem(PW_KEY);
  } catch {
    return null;
  }
}

function salvaPassword(pw: string | null): void {
  try {
    if (pw) localStorage.setItem(PW_KEY, pw);
    else localStorage.removeItem(PW_KEY);
  } catch {
    /* archivio non disponibile: la password andrà reinserita */
  }
}

async function scaricaFeed(): Promise<FeedEnvelope> {
  const r = await fetch(`${FEED_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const v: unknown = await r.json();
  if (!isFeedEnvelope(v)) throw new Error("formato non riconosciuto");
  return v;
}

/** Scarica arrivi.json e decifra i contatti. Con `pwNuova` prova la password appena inserita. */
async function caricaArrivi(pwNuova?: string): Promise<void> {
  aggiornaFinestra();
  stato.caricamento = "in-corso";
  stato.errore = null;
  render();

  let env: FeedEnvelope;
  try {
    env = await scaricaFeed();
  } catch {
    stato.caricamento = "errore";
    stato.errore = { titolo: "Non riesco a scaricare gli arrivi", dettaglio: "Controlla la connessione a internet e premi Riprova.", riprova: true };
    render();
    return;
  }
  ultimoFeed = env;
  if (!env.avvisi) {
    stato.caricamento = "errore";
    stato.errore = {
      titolo: "Email e link di check-in non ancora disponibili",
      dettaglio: "Arrivano con il prossimo aggiornamento orario degli arrivi (alle :40, dalle 7:40 alle 17:40). Riprova più tardi.",
      riprova: true,
    };
    render();
    return;
  }

  const pw = pwNuova ?? password ?? leggiPassword();
  if (!pw) {
    stato.caricamento = "bloccata";
    render();
    return;
  }
  try {
    const dati = await decryptJson<AvvisiPayload>(env.avvisi, pw, avvisiAad(env.from));
    password = pw;
    if (pwNuova) salvaPassword(pw);
    const { da, a, oggi } = stato.finestra;
    const visti = new Set<string>();
    stato.arrivi = dati.items
      .filter((x) => x.arrival >= da && x.arrival <= a)
      .filter((x) => (visti.has(x.reservationId) ? false : (visti.add(x.reservationId), true)))
      .map((x) => versoArrivo(x, oggi))
      .sort((x, y) => x.arrivo.localeCompare(y.arrivo) || x.nome.localeCompare(y.nome));
    const vistiGp = new Set<string>();
    stato.tuttiArrivi = dati.items
      .filter((x) => x.arrival >= oggi)
      .filter((x) => (vistiGp.has(x.reservationId) ? false : (vistiGp.add(x.reservationId), true)))
      .map((x) => versoArrivo(x, oggi))
      .sort((x, y) => x.arrivo.localeCompare(y.arrivo) || x.nome.localeCompare(y.nome));
    stato.aggiornatoAlle = env.scatola_updated_at ?? env.generated_at;
    stato.erroreSblocco = null;
    stato.caricamento = "ok";
  } catch {
    password = null;
    stato.erroreSblocco = pwNuova ? "Password errata. Riprova." : "La password salvata non apre i dati: inseriscila di nuovo.";
    stato.caricamento = "bloccata";
  }
  render();
  if (stato.caricamento === "ok") await aggiornaCasella();
}

// ───────────────────────── Archivio su questo computer ─────────────────────────

function leggiJson<T>(chiave: string, predefinito: T): T {
  try {
    const v = localStorage.getItem(chiave);
    return v ? (JSON.parse(v) as T) : predefinito;
  } catch {
    stato.archivioOk = false;
    return predefinito;
  }
}

function scriviJson(chiave: string, valore: unknown): boolean {
  try {
    localStorage.setItem(chiave, JSON.stringify(valore));
    return true;
  } catch {
    stato.archivioOk = false;
    return false;
  }
}

// ───────────────────────── Registro invii ─────────────────────────

function caricaRegistro(): void {
  const dal = aggiungiGiorni(oggiRoma(), -GIORNI_CONSERVAZIONE_INVII);
  const voci = leggiJson<Partial<RegistroInvio>[]>(K_INVII, []);
  const mappa = new Map<string, RegistroInvio>();
  for (const v of Array.isArray(voci) ? voci : []) {
    if (!v || typeof v.id !== "string" || String(v.arrival ?? "") < dal) continue;
    mappa.set(v.id, {
      id: v.id,
      tipo: v.tipo === "manuale" ? "manuale" : "prenotazione",
      arrival: String(v.arrival ?? ""),
      canale: v.canale === "whatsapp" ? "whatsapp" : "email",
      lingua: mappaLingua(v.lingua ?? null),
      inviatoIl: String(v.inviatoIl ?? ""),
    });
  }
  stato.registro = mappa;
}

function salvaRegistro(): boolean {
  return scriviJson(K_INVII, [...stato.registro.values()]);
}

async function segnaInviati(lista: Destinatario[], canale: Canale): Promise<void> {
  const adesso = new Date().toISOString();
  const voci: RegistroInvio[] = lista.flatMap((x) =>
    x.membri.map((m) => ({ id: m.id, tipo: x.tipo, arrival: x.dataArrivo, canale, lingua: x.lingua, inviatoIl: adesso })),
  );
  caricaRegistro();
  for (const x of lista) stato.aperte.delete(x.id);
  for (const v of voci) {
    stato.registro.set(v.id, v);
    stato.aperte.delete(v.id);
  }
  const ok = salvaRegistro();
  render();
  if (!ok) {
    mostraToast("Segnati solo finché la pagina resta aperta: questo browser non salva i dati.");
    return;
  }
  mostraToast(voci.length === 1 ? "1 prenotazione segnata come avvisata." : `${voci.length} prenotazioni segnate come avvisate.`, async () => {
    await annullaInvii(voci.map((v) => v.id));
  });
}

async function annullaInvii(ids: string[]): Promise<void> {
  caricaRegistro();
  for (const id of ids) stato.registro.delete(id);
  salvaRegistro();
  render();
  mostraToast("Annullato.");
}

// ───────────────────────── Email a mano ─────────────────────────

/** Legge le email a mano; quelle con arrivo passato da oltre 30 giorni si cancellano (minimizzazione dei dati). */
function caricaManuali(): void {
  const limite = aggiungiGiorni(oggiRoma(), -GIORNI_CONSERVAZIONE_MANUALI);
  const voci = leggiJson<Record<string, unknown>[]>(K_MANUALI, []);
  const mappa = new Map<string, EmailManuale>();
  let scartate = 0;
  for (const v of Array.isArray(voci) ? voci : []) {
    const m = v && typeof v.id === "string" ? leggiManuale(v.id, v) : null;
    if (m && m.arrivo >= limite) mappa.set(m.id, m);
    else scartate++;
  }
  stato.manuali = mappa;
  if (scartate) salvaManuali();
}

function salvaManuali(): boolean {
  return scriviJson(K_MANUALI, [...stato.manuali.values()]);
}

async function salvaManuale(m: EmailManuale): Promise<boolean> {
  caricaManuali();
  const precedente = stato.manuali.get(m.id);
  stato.manuali.set(m.id, m);
  if (!salvaManuali()) {
    mostraToast("Contatto aggiunto solo finché la pagina resta aperta: questo browser non salva i dati.");
  } else {
    mostraToast(precedente ? "Contatto aggiornato." : "Contatto aggiunto.");
  }
  render();
  return true;
}

async function rimuoviManuale(id: string): Promise<void> {
  caricaManuali();
  const precedente = stato.manuali.get(id);
  if (!precedente) return;
  stato.manuali.delete(id);
  salvaManuali();
  render();
  mostraToast("Contatto rimosso.", async () => {
    await salvaManuale(precedente);
  });
}

// ───────────────────────── Impostazioni ─────────────────────────

function normalizzaImpostazioni(v: Partial<Impostazioni> | undefined): Impostazioni {
  const base = impostazioniPredefinite();
  if (!v) return base;
  const testi = { ...base.testi };
  // testi salvati con i predefiniti di una versione precedente: si riparte da quelli nuovi
  const testiValidi = v.versioneTesti === VERSIONE_TESTI;
  for (const l of ORDINE_LINGUE) {
    const t = testiValidi ? v.testi?.[l] : undefined;
    if (t) {
      testi[l] = {
        oggetto: t.oggetto || base.testi[l].oggetto,
        corpo: t.corpo || base.testi[l].corpo,
        whatsapp: t.whatsapp || base.testi[l].whatsapp,
      };
    }
  }
  return {
    versioneTesti: VERSIONE_TESTI,
    programma: v.programma === "gmail" ? "gmail" : "mailto",
    giorniAnticipo: Number.isFinite(v.giorniAnticipo) ? Math.min(MAX_ANTICIPO, Math.max(1, Number(v.giorniAnticipo))) : 5,
    testi,
  };
}

function caricaImpostazioni(): void {
  stato.impostazioni = normalizzaImpostazioni(leggiJson<Partial<Impostazioni> | undefined>(K_IMPOSTAZIONI, undefined));
}

async function salvaImpostazioni(nuove: Impostazioni): Promise<boolean> {
  const giorniCambiati = nuove.giorniAnticipo !== stato.impostazioni.giorniAnticipo;
  stato.impostazioni = nuove;
  if (!scriviJson(K_IMPOSTAZIONI, nuove)) {
    mostraToast("Impostazioni valide solo finché la pagina resta aperta: questo browser non salva i dati.");
  }
  impostazioniModificate = false;
  render();
  if (giorniCambiati) void caricaArrivi();
  return true;
}

// ───────────────────────── DOM helpers ─────────────────────────

function $(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`Elemento mancante: ${sel}`);
  return el;
}

function campo<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id: string): T {
  return document.getElementById(id) as T;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

let timerToast: number | undefined;
function mostraToast(testo: string, annulla?: () => Promise<void>): void {
  const t = $("#toast");
  t.innerHTML = `<span>${esc(testo)}</span>${annulla ? '<button type="button" class="link" id="toast-annulla">Annulla</button>' : ""}`;
  t.hidden = false;
  if (annulla) {
    document.getElementById("toast-annulla")?.addEventListener("click", () => {
      t.hidden = true;
      void annulla();
    });
  }
  window.clearTimeout(timerToast);
  timerToast = window.setTimeout(() => (t.hidden = true), annulla ? 12_000 : 6_000);
}

async function copia(testo: string, bottone: HTMLElement): Promise<void> {
  const conferma = (): void => {
    const prima = bottone.textContent;
    bottone.textContent = "Copiato";
    window.setTimeout(() => (bottone.textContent = prima), 1500);
  };
  try {
    await navigator.clipboard.writeText(testo);
    conferma();
    return;
  } catch {
    /* fallback sotto */
  }
  const area = document.createElement("textarea");
  area.value = testo;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  if (ok) conferma();
  else mostraToast("Copia non riuscita: seleziona il testo e premi Ctrl+C.");
}

// ───────────────────────── Render ─────────────────────────

/** Messaggi ancora da mandare: le prenotazioni non registrate, con le camere dello stesso intestatario unite. */
function daAvvisare(): Destinatario[] {
  return raggruppa(destinatari().filter((x) => !stato.registro.has(x.id)));
}

/** Il messaggio (anche di più camere) che ha questo id, oppure la singola prenotazione. */
function trovaDestinatario(id: string | undefined): Destinatario | undefined {
  return id ? (daAvvisare().find((a) => a.id === id) ?? destinatari().find((a) => a.id === id)) : undefined;
}

function renderTesta(): void {
  const { da, a, oggi } = stato.finestra;
  const finestra = da ? `Arrivi da ${etichettaGiorno(da)} a ${etichettaGiorno(a)}` : "Arrivi dei prossimi giorni";
  $("#finestra").textContent = `${finestra} · oggi ${oggi ? etichettaGiorno(oggi) : ""}`;

  const fresch = $("#freschezza");
  fresch.textContent = stato.caricamento === "ok" ? etaDati(stato.aggiornatoAlle) : stato.caricamento === "in-corso" ? "lettura dalla Scatola…" : "";
  (document.getElementById("aggiorna") as HTMLButtonElement).disabled = stato.caricamento === "in-corso" || stato.caricamento === "bloccata";

  const riepilogo = $("#riepilogo");
  if (stato.caricamento !== "ok") {
    riepilogo.innerHTML = "";
    return;
  }
  const aperti = daAvvisare();
  const senza = aperti.filter((x) => x.emails.length === 0).length;
  const fatti = destinatari().filter((x) => stato.registro.has(x.id)).length;
  riepilogo.innerHTML = [
    `<span class="chip ${aperti.length - senza > 0 ? "chip-da-fare" : "chip-ok"}"><b>${aperti.length - senza}</b> da avvisare via email</span>`,
    senza ? `<span class="chip chip-attenzione"><b>${senza}</b> senza email</span>` : "",
    `<span class="chip chip-ok"><b>${fatti}</b> già avvisati</span>`,
  ].join("");
}

/** Dati fermi: l'aggiornamento orario non è riuscito, oppure il file non copre ancora tutti i giorni. */
function avvisoDatiVecchi(env: FeedEnvelope): { titolo: string; dettaglio: string } | null {
  const scritto = Date.parse(env.generated_at);
  const ora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date()));
  if (Number.isFinite(scritto) && Date.now() - scritto > DATI_VECCHI_MS && ora >= 9 && ora <= 19) {
    return {
      titolo: `Dati fermi alle ${fmtOra.format(new Date(scritto))}.`,
      dettaglio: "L'aggiornamento orario da Slope non è riuscito: le prenotazioni più recenti potrebbero mancare.",
    };
  }
  if (env.to < stato.finestra.a) {
    return { titolo: `Arrivi disponibili fino al ${etichettaGiorno(env.to)}.`, dettaglio: "Gli arrivi successivi compariranno con il prossimo aggiornamento." };
  }
  return null;
}

function renderAvvisi(): void {
  const box = $("#avvisi");
  const avvisi: string[] = [];
  const vecchi = ultimoFeed && stato.caricamento === "ok" ? avvisoDatiVecchi(ultimoFeed) : null;
  if (vecchi) avvisi.push(`<div class="avviso"><strong>${esc(vecchi.titolo)}</strong> <span>${esc(vecchi.dettaglio)}</span></div>`);
  if (!stato.archivioOk) {
    avvisi.push(`<div class="avviso"><strong>Questo browser non salva i dati.</strong> <span>Chi è già stato avvisato e le email aggiunte a mano si perdono chiudendo la pagina: non usare la navigazione privata.</span></div>`);
  }
  box.innerHTML = avvisi.join("");
}

const ospiti = (n: number): string => (n === 1 ? "1 ospite" : `${n} ospiti`);

function quando(x: Destinatario, conDistanza = true): string {
  return `<span class="quando"><span class="giorno">${esc(etichettaGiorno(x.dataArrivo))}</span>${conDistanza ? ` <span class="distanza">${esc(etichettaDistanza(x.giorniAllArrivo))}</span>` : ""}</span>`;
}

function contattoEmail(x: Destinatario): string {
  const parti: string[] = [];
  if (x.emailScatola && x.scatolaSostituita) {
    parti.push(`<s title="Sostituito dall'email aggiunta a mano">${esc(x.emailScatola)}</s>`);
  } else if (x.emailScatola) {
    parti.push(
      `<span>${esc(x.emailScatola)}</span>${
        x.relayOta ? ` <span class="badge" title="Indirizzo di inoltro ${esc(x.relayOta)}: arriva solo se spedisci dall'indirizzo registrato nell'extranet">${esc(x.relayOta)}</span>` : ""
      }`,
    );
  }
  if (x.manuale?.email) parti.push(`<span>${esc(x.manuale.email)}</span> <span class="badge badge-mano">a mano</span>`);
  return parti.join("<br>");
}

/** «3 camere: 105 · 107 · 108» quando un messaggio copre più prenotazioni. */
function badgeCamere(x: Destinatario): string {
  if (x.membri.length < 2) return "";
  const nomi = x.membri.map((m) => m.camera).filter((c): c is string => Boolean(c));
  const dettaglio = nomi.length ? `: ${nomi.join(" · ")}` : "";
  return ` <span class="badge" title="Stesso intestatario: un solo messaggio con un link di check-in per camera">${x.membri.length} camere${esc(dettaglio)}</span>`;
}

function badgeCheckin(x: Destinatario): string {
  if (x.membri.length > 1) {
    const daFare = x.membri.filter((m) => m.checkinUrl && !m.checkinFatto).length;
    if (!daFare) return `<span class="badge badge-ok" title="Documenti già registrati in Slope: il link porta alla pagina d'arrivo senza check-in">check-in fatto</span>`;
    return `<span class="badge badge-ok" title="Nel testo una riga con il link personale per ogni camera con il check-in da fare">${daFare === 1 ? "1 link check-in" : `${daFare} link check-in`}</span>`;
  }
  if (x.checkinFatto) return `<span class="badge badge-ok" title="Documento già registrato in Slope: il link porta alla pagina d'arrivo senza check-in">check-in fatto</span>`;
  if (x.checkinUrl) return `<span class="badge badge-ok" title="Il link personale nel testo porta al suo check-in online">check-in online</span>`;
  return x.tipo === "prenotazione" ? `<span class="badge" title="Slope non ha fornito il link di check-in: il link porta alla pagina d'arrivo senza check-in">senza link check-in</span>` : "";
}

function rigaEmail(x: Destinatario): string {
  const imp = stato.impostazioni;
  const email = emailPer(x, imp);
  const aperta = stato.aperte.has(x.id);
  const etichettaModifica = x.tipo === "manuale" ? "Modifica" : x.manuale ? "Cambia email" : "Aggiungi email";
  const apri =
    email.troppoLunga
      ? `<button type="button" class="btn btn-piccolo btn-primario" disabled title="Testo troppo lungo per aprirsi da solo: usa Copia testo">Apri email</button>`
      : `<a class="btn btn-piccolo${aperta ? "" : " btn-primario"}" href="${esc(email.url)}" target="_blank" rel="noopener" data-azione="apri" data-id="${esc(x.id)}">${aperta ? "Riapri email" : "Apri email"}</a>`;
  return `
    <li class="ospite ospite-email${aperta ? " aperta" : ""}">
      <span class="ospite-nome"><span>${esc(x.nome)}${x.tipo === "manuale" ? ' <span class="badge badge-mano">non in Slope</span>' : ""}${badgeCamere(x)}</span></span>
      ${quando(x)}
      <span class="contatto">${contattoEmail(x)}<br><span class="codice" title="${NOMI_LINGUA[x.lingua]}">${x.lingua.toUpperCase()}</span> ${badgeCheckin(x)}${
        email.troppoLunga ? ' <span class="motivo">Testo troppo lungo: usa «Copia testo».</span>' : ""
      }</span>
      <span class="azioni-riga">
        ${apri}
        <button type="button" class="btn btn-piccolo${aperta ? " btn-conferma" : ""}" data-azione="segna-uno" data-canale="email" data-id="${esc(x.id)}" ${stato.inScrittura ? "disabled" : ""}>Segna inviata</button>
        <button type="button" class="link link-piccolo" data-azione="copia-testo" data-id="${esc(x.id)}">Copia testo</button>
        <button type="button" class="link link-piccolo" data-azione="modifica-email" data-id="${esc(x.id)}">${etichettaModifica}</button>
      </span>
    </li>`;
}

/** Messaggi aperti (email o WhatsApp) in attesa di conferma: un clic li segna tutti come inviati. */
function renderBarraAperte(): string {
  const aperte = daAvvisare().filter((x) => stato.aperte.has(x.id));
  if (!aperte.length) return "";
  const email = aperte.filter((x) => x.emails.length > 0).length;
  const wa = aperte.length - email;
  const parti = [email ? (email === 1 ? "1 email" : `${email} email`) : "", wa ? (wa === 1 ? "1 WhatsApp" : `${wa} WhatsApp`) : ""].filter(Boolean).join(" e ");
  return `<div class="barra-aperte"><span>${parti} aperti: li hai spediti?</span><button type="button" class="btn btn-conferma" data-azione="segna-aperte" ${stato.inScrittura ? "disabled" : ""}>Segna inviati (${aperte.length})</button></div>`;
}

function renderDaAvvisare(): string {
  const lista = daAvvisare().filter((x) => x.emails.length > 0);
  if (lista.length === 0) return "";
  const aperte = lista.filter((x) => stato.aperte.has(x.id));
  const nomeProgramma = stato.impostazioni.programma === "gmail" ? "Gmail" : "Outlook";
  return `
    <section class="gruppo" aria-labelledby="titolo-email">
      <header class="gruppo-testa">
        <h3 id="titolo-email">Da avvisare via email</h3>
        <span class="conta">${ospiti(lista.length)}${aperte.length ? ` · ${aperte.length} aperte` : ""}</span>
      </header>
      <p class="nota">Ogni ospite riceve la sua email, nella sua lingua e con il suo link personale di check-in (con più camere, un link per camera nella stessa email). Premi <b>Apri email</b>, controlla in ${nomeProgramma} e premi Invia.</p>
      <ul class="ospiti">${lista.map(rigaEmail).join("")}</ul>
    </section>`;
}

function rigaWhatsapp(x: Destinatario): string {
  const imp = stato.impostazioni;
  const numero = x.telefono ? numeroWhatsapp(x.telefono) : null;
  const url = linkWhatsappPer(x, imp);
  const aperta = stato.aperte.has(x.id);
  const contatto = numero
    ? `<span>WhatsApp ${esc(mostraNumero(numero))}</span>${x.manuale?.telefono ? ' <span class="badge badge-mano">a mano</span>' : ""}`
    : `<span>${esc(x.telefono ?? "Nessun numero in Slope")}</span>`;
  // check-in già fatto e nessun contatto: avvisarlo è facoltativo
  const facoltativo = x.checkinFatto && !url;
  const motivo = facoltativo
    ? "Check-in online già fatto e nessun contatto in Slope: aggiungi il numero se ce l'hai, altrimenti «Segna fatto»."
    : !x.telefono
      ? "Aggiungi il numero WhatsApp o l'email."
      : !numero
        ? "Numero non utilizzabile per WhatsApp (manca il prefisso internazionale o è un numero fittizio del portale): correggilo."
        : "";
  const apri = url
    ? `<a class="btn btn-piccolo${aperta ? "" : " btn-primario"}" href="${esc(url)}" target="_blank" rel="noopener" data-azione="apri" data-id="${esc(x.id)}">${aperta ? "Riapri WhatsApp" : "Apri WhatsApp"}</a>`
    : `<button type="button" class="btn btn-piccolo${facoltativo ? "" : " btn-primario"}" data-azione="modifica-email" data-id="${esc(x.id)}">${x.telefono ? "Correggi numero" : "Aggiungi numero"}</button>`;
  return `
    <li class="ospite ospite-email${aperta ? " aperta" : ""}">
      <span class="ospite-nome"><span>${esc(x.nome)}${x.tipo === "manuale" ? ' <span class="badge badge-mano">non in Slope</span>' : ""}${badgeCamere(x)}</span></span>
      ${quando(x)}
      <span class="contatto">${contatto}<br><span class="codice" title="${NOMI_LINGUA[x.lingua]}">${x.lingua.toUpperCase()}</span> ${badgeCheckin(x)}${motivo ? ` <span class="motivo">${esc(motivo)}</span>` : ""}</span>
      <span class="azioni-riga">
        ${apri}
        <button type="button" class="btn btn-piccolo${aperta ? " btn-conferma" : ""}" data-azione="segna-uno" data-canale="whatsapp" data-id="${esc(x.id)}" ${stato.inScrittura ? "disabled" : ""}>${facoltativo ? "Segna fatto" : "Segna inviato"}</button>
        <button type="button" class="link link-piccolo" data-azione="copia-wa" data-id="${esc(x.id)}">Copia testo</button>
        <button type="button" class="link link-piccolo" data-azione="modifica-email" data-id="${esc(x.id)}">${numero ? "Cambia numero o aggiungi email" : "Aggiungi email"}</button>
      </span>
    </li>`;
}

function renderSenzaEmail(): string {
  // prima chi si può avvisare subito, poi chi ha bisogno del numero, in fondo chi ha già fatto il check-in
  const peso = (x: Destinatario): number => (x.telefono && numeroWhatsapp(x.telefono) ? 0 : x.checkinFatto ? 2 : 1);
  const senza = daAvvisare()
    .filter((x) => x.emails.length === 0)
    .sort((a, b) => peso(a) - peso(b));
  if (senza.length === 0) return "";
  const conNumero = senza.filter((x) => x.telefono && numeroWhatsapp(x.telefono)).length;
  return `
    <section class="gruppo gruppo-senza" aria-labelledby="titolo-senza">
      <header class="gruppo-testa"><h3 id="titolo-senza">Senza email: avviso su WhatsApp</h3><span class="conta">${ospiti(senza.length)} · ${conNumero} con numero</span></header>
      <p class="nota">Premi <b>Apri WhatsApp</b>: si apre la chat con l'ospite e il messaggio già scritto nella sua lingua, con il suo link personale di check-in. Controlla e premi Invia. Se manca il numero o non ha il prefisso internazionale, aggiungilo o correggilo.</p>
      <ul class="ospiti">${senza.map(rigaWhatsapp).join("")}</ul>
    </section>`;
}

function renderInAttesa(): string {
  const attesa = manualiInAttesa();
  if (attesa.length === 0) return "";
  const voci = attesa
    .map(
      (m) => `
        <li class="ospite">
          <span class="ospite-nome"><span>${esc(m.nome ?? m.email ?? m.telefono ?? "")}</span></span>
          <span class="quando"><span class="giorno">${esc(etichettaGiorno(m.arrivo))}</span> <span class="distanza">in lista dal ${esc(etichettaGiorno(aggiungiGiorni(m.arrivo, -stato.impostazioni.giorniAnticipo)))}</span></span>
          <span class="contatto">${esc(m.email ?? `WhatsApp ${m.telefono ?? ""}`)} <span class="codice">${m.lingua.toUpperCase()}</span></span>
          <span class="azioni-riga"><button type="button" class="btn btn-piccolo" data-azione="modifica-email" data-id="${esc(m.id)}">Modifica</button></span>
        </li>`,
    )
    .join("");
  return `
    <details class="gruppo gruppo-attesa">
      <summary class="gruppo-testa"><h3>Aggiunti a mano, in arrivo più avanti</h3><span class="conta">${attesa.length}</span></summary>
      <ul class="ospiti">${voci}</ul>
    </details>`;
}

function renderGiaAvvisati(): string {
  const fatti = destinatari().filter((x) => stato.registro.has(x.id));
  if (fatti.length === 0) return "";
  const voci = fatti
    .map((x) => {
      const r = stato.registro.get(x.id) as RegistroInvio;
      const ora = r.inviatoIl ? fmtOra.format(new Date(r.inviatoIl)) : "";
      return `
        <li class="ospite fatto">
          <span class="ospite-nome"><span>${esc(x.nome)}</span></span>
          ${quando(x, false)}
          <span class="contatto">${r.canale === "whatsapp" ? "WhatsApp" : "Email"} · ${esc(ora)}</span>
          <span class="azioni-riga"><button type="button" class="btn btn-piccolo" data-azione="annulla" data-id="${esc(x.id)}">Annulla</button></span>
        </li>`;
    })
    .join("");
  return `
    <details class="gruppo gruppo-fatti">
      <summary class="gruppo-testa"><h3>Già avvisati</h3><span class="conta">${ospiti(fatti.length)}</span></summary>
      <ul class="ospiti">${voci}</ul>
    </details>`;
}

function renderLista(): void {
  const box = $("#lista");
  const aperti = new Set([...box.querySelectorAll<HTMLDetailsElement>("details[data-chiave][open]")].map((d) => d.dataset.chiave));

  if (stato.caricamento === "attesa" || (stato.caricamento === "in-corso" && stato.arrivi.length === 0)) {
    box.innerHTML = `<div class="vuoto"><p class="vuoto-titolo">Scarico gli arrivi dello Chalet Hartmann…</p><p>Qui compariranno gli ospiti dei prossimi ${stato.impostazioni.giorniAnticipo} giorni, divisi per lingua, con il pulsante per aprire l'email.</p></div>`;
    return;
  }
  if (stato.caricamento === "bloccata") {
    box.innerHTML = `
      <form class="vuoto sblocco" id="form-sblocco" autocomplete="on">
        <p class="vuoto-titolo">Password reception</p>
        <p>È la stessa della pagina delle lettere di benvenuto. Su questo computer basta inserirla una volta.</p>
        <div class="riga-setup">
          <label class="sr" for="sblocco-pw">Password reception</label>
          <input id="sblocco-pw" type="password" autocomplete="current-password" required>
          <button class="btn btn-primario" type="submit">Apri</button>
        </div>
        ${stato.erroreSblocco ? `<p class="errore" role="alert">${esc(stato.erroreSblocco)}</p>` : ""}
      </form>`;
    window.setTimeout(() => (document.getElementById("sblocco-pw") as HTMLInputElement | null)?.focus(), 30);
    return;
  }
  if (stato.caricamento === "errore" && stato.errore) {
    box.innerHTML = `<div class="vuoto vuoto-errore"><p class="vuoto-titolo">${esc(stato.errore.titolo)}</p><p>${esc(stato.errore.dettaglio)}</p>${
      stato.errore.riprova ? '<button type="button" class="btn btn-primario" data-azione="riprova">Riprova</button>' : ""
    }</div>`;
    return;
  }
  const gruppi = renderDaAvvisare();
  const senza = renderSenzaEmail();
  const nessuno =
    destinatari().length === 0
      ? `<div class="vuoto"><p class="vuoto-titolo">Nessun arrivo confermato tra ${esc(etichettaGiorno(stato.finestra.da))} e ${esc(etichettaGiorno(stato.finestra.a))}.</p><p>Non c'è nulla da inviare oggi. Se un ospite manca in Slope, usa <b>Aggiungi ospite a mano</b> qui sopra.</p></div>`
      : !gruppi && !senza
        ? `<div class="vuoto vuoto-ok"><p class="vuoto-titolo">Tutti gli ospiti in arrivo sono già stati avvisati.</p><p>Torna domani: compariranno i nuovi arrivi.</p></div>`
        : "";
  box.innerHTML = nessuno + renderBarraAperte() + gruppi + senza + renderInAttesa() + renderGiaAvvisati();

  box.querySelector(".gruppo-attesa")?.setAttribute("data-chiave", "attesa");
  box.querySelector(".gruppo-fatti")?.setAttribute("data-chiave", "fatti");
  for (const chiave of aperti) {
    const d = box.querySelector<HTMLDetailsElement>(`details[data-chiave="${chiave}"]`);
    if (d) d.open = true;
  }
}

function render(): void {
  renderTesta();
  renderAvvisi();
  renderGuestPass();
  renderLista();
}

// ───────────────────────── Guest Pass personale ─────────────────────────

function gpVuoto(): StatoGuestPass {
  return { pass: [], emailId: null, sceltaId: null, proposta: null, linguaEmail: null, lingua: null, email: "", telefono: "", aperto: null, avviso: null };
}

function caricaInviiGuestPass(): void {
  const dal = aggiungiGiorni(oggiRoma(), -GIORNI_CONSERVAZIONE_INVII);
  const voci = leggiJson<Partial<InvioGuestPass>[]>(K_GUESTPASS, []);
  const mappa = new Map<string, InvioGuestPass>();
  for (const v of Array.isArray(voci) ? voci : []) {
    if (!v || typeof v.id !== "string" || String(v.arrival ?? "") < dal) continue;
    mappa.set(v.id, {
      id: v.id,
      arrival: String(v.arrival ?? ""),
      canale: v.canale === "whatsapp" ? "whatsapp" : "email",
      pass: Number(v.pass) || 0,
      inviatoIl: String(v.inviatoIl ?? ""),
      emailId: typeof v.emailId === "string" ? v.emailId : null,
    });
  }
  stato.inviiGuestPass = mappa;
}

function casellaVuota(): CasellaGuestPass {
  return { attiva: false, email: [], problema: null };
}

function caricaEmailGestite(): void {
  const dal = Date.now() - GIORNI_CONSERVAZIONE_EMAIL_GP * 864e5;
  const voci = leggiJson<unknown>(K_GUESTPASS_EMAIL, []);
  const mappa = new Map<string, string>();
  for (const v of Array.isArray(voci) ? voci : []) {
    if (!Array.isArray(v) || typeof v[0] !== "string" || typeof v[1] !== "string") continue;
    const t = Date.parse(v[1]);
    if (!Number.isNaN(t) && t >= dal) mappa.set(v[0], v[1]);
  }
  stato.emailGestite = mappa;
}

function salvaEmailGestite(): boolean {
  return scriviJson(K_GUESTPASS_EMAIL, [...stato.emailGestite.entries()]);
}

/** Segna come gestita (o di nuovo da gestire) un'email della casella, rileggendo prima il registro di altre schede. */
function segnaEmailGestita(id: string, gestita: boolean): void {
  caricaEmailGestite();
  if (gestita) stato.emailGestite.set(id, new Date().toISOString());
  else stato.emailGestite.delete(id);
  salvaEmailGestite();
}

/** Testo di stato-guestpass.txt → avviso per la reception (il file contiene solo «ok» o il tipo di errore). */
function problemaCasella(testo: string): string | null {
  if (!testo.startsWith("errore")) return null;
  return testo.includes("rifiutato")
    ? "La casella Guest Pass non si apre: la password per le app è stata cambiata o revocata. Va rifatta e aggiornata su GitHub (segreto GUESTPASS_APP_PASSWORD). Intanto incolla l'email qui sotto."
    : "La casella Guest Pass non ha risposto all'ultimo controllo: riprovo da solo. Se serve subito, incolla l'email qui sotto.";
}

/** Scarica guestpass.json e lo decifra con la password reception. Senza file (404) il riquadro resta come prima. */
async function caricaCasella(pw: string): Promise<CasellaGuestPass> {
  let problema: string | null = null;
  try {
    const r = await fetch(`${STATO_GUESTPASS_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (r.ok) problema = problemaCasella((await r.text()).trim());
  } catch {
    /* stato non disponibile: non è un problema */
  }
  let env: unknown;
  try {
    const r = await fetch(`${GUESTPASS_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return { attiva: problema !== null, email: [], problema };
    env = await r.json();
  } catch {
    return { attiva: problema !== null, email: [], problema };
  }
  if (!isGuestPassEnvelope(env)) return { attiva: true, email: [], problema: problema ?? "Il file dei Guest Pass arrivati non è nel formato atteso." };
  try {
    const dati = await decryptJson<unknown>(env.enc, pw, guestpassAad(env.from));
    return { attiva: true, email: emailGuestPassValide(dati), problema };
  } catch {
    return {
      attiva: true,
      email: [],
      problema: "I Guest Pass arrivati non si aprono con la password reception: su GitHub il segreto ARRIVI_PASSWORD deve essere la stessa password. Intanto incolla l'email qui sotto.",
    };
  }
}

async function aggiornaCasella(): Promise<void> {
  const pw = password;
  if (!pw) return;
  const nuova = await caricaCasella(pw);
  if (password !== pw || stato.caricamento !== "ok") return; // bloccata nel frattempo
  stato.casella = nuova;
  renderGuestPass();
}

/** Email della casella ancora da gestire su questo computer, dalla più recente. */
function emailDaGestire(): EmailGuestPass[] {
  return stato.casella.email.filter((e) => !stato.emailGestite.has(e.id) && e.id !== stato.gp.emailId);
}

/** Prenotazione proposta per dei pass, dal nome (tra gli arrivi da oggi in poi). */
function propostaPer(pass: readonly PassTrovato[]): { id: string; sicura: boolean } | null {
  const nomi = pass.map((p) => p.nome).filter(Boolean);
  return prenotazioneProposta(nomi, stato.tuttiArrivi.map((a) => ({ id: a.reservationId, nome: `${a.nome} ${a.nomeSaluto}` })));
}

function proponiPrenotazione(gp: StatoGuestPass): void {
  if (gp.sceltaId) return;
  const proposta = propostaPer(gp.pass);
  if (proposta) {
    gp.sceltaId = proposta.id;
    gp.proposta = proposta.sicura ? "sicura" : "probabile";
  }
}

/** «Prepara»: i pass dell'email della casella passano nel riquadro, con la prenotazione già proposta. */
function preparaDaEmail(id: string): void {
  const e = stato.casella.email.find((x) => x.id === id);
  if (!e) return;
  const gp = gpVuoto();
  gp.pass = [...e.pass];
  gp.emailId = e.id;
  gp.linguaEmail = e.lingua;
  proponiPrenotazione(gp);
  stato.gp = gp;
  renderGuestPass();
  const box = document.getElementById("guestpass");
  box?.scrollIntoView({ block: "start" });
  window.setTimeout(() => document.getElementById("gp-prenotazione")?.focus({ preventScroll: true }), 30);
}

function renderCasella(): string {
  const c = stato.casella;
  if (!c.attiva) return "";
  const problema = c.problema ? `<p class="errore" role="alert">${esc(c.problema)}</p>` : "";
  const lista = emailDaGestire();
  if (lista.length === 0) {
    return `${problema}<p class="aiuto gp-casella-vuota">Nessun Guest Pass nuovo dalla casella. La pagina ricontrolla da sola ogni 5 minuti.</p>`;
  }
  const righe = lista
    .map((e) => {
      const nomi = e.pass.map((p, i) => p.nome || `Ospite ${i + 1}`).join(", ");
      const proposta = propostaPer(e.pass);
      const a = proposta ? stato.tuttiArrivi.find((x) => x.reservationId === proposta.id) : undefined;
      const camera = a?.camera ? ` · camera ${a.camera}` : "";
      const prenotazione = a
        ? `${esc(a.nome)} · ${esc(etichettaGiorno(a.arrivo))}${esc(camera)}${proposta && !proposta.sicura ? " (da controllare)" : ""}`
        : "prenotazione da scegliere";
      const giaInviato = a && stato.inviiGuestPass.has(a.reservationId) ? ' <span class="badge">già inviato a questa prenotazione</span>' : "";
      const firma = e.firmata ? "" : ' <span class="badge badge-errore">mittente non verificato: controlla l\'email originale</span>';
      return `
        <li>
          <div class="gp-email-testo">
            <span class="gp-nome">${esc(nomi)}</span>
            <span class="aiuto">${e.pass.length === 1 ? "1 pass" : `${e.pass.length} pass`} · arrivato ${esc(fmtOra.format(new Date(e.ricevuta)))} · ${prenotazione}${giaInviato}${firma}</span>
          </div>
          <button type="button" class="btn btn-primario" data-azione="gp-prepara" data-email="${esc(e.id)}">Prepara</button>
          <button type="button" class="link link-piccolo" data-azione="gp-nascondi" data-email="${esc(e.id)}">Nascondi</button>
        </li>`;
    })
    .join("");
  return `${problema}
    <div class="gp-arrivati">
      <h4>Guest Pass arrivati <span class="conta">${lista.length}</span></h4>
      <ul class="gp-email">${righe}</ul>
    </div>`;
}

/** Destinatario del Guest Pass: la prenotazione scelta (contatti Slope o a mano) oppure l'ospite non in lista. */
interface DestinatarioGuestPass {
  id: string | null;
  /** reservation_id Slope a cui legare i pass nel link: la prenotazione scelta e le altre camere dello stesso intestatario */
  prenotazioni: string[];
  /** link di check-in Slope della prenotazione scelta: il link del Guest Pass apre la pagina d'arrivo completa */
  checkinUrl: string | null;
  nome: string;
  arrivo: string | null;
  emails: string[];
  relayOta: string | null;
  telefono: string | null;
  lingua: Lingua;
}

function destinatarioGuestPass(): DestinatarioGuestPass | null {
  const gp = stato.gp;
  if (gp.sceltaId === GP_ALTRO) {
    const email = pulisciEmail(gp.email);
    return { id: null, prenotazioni: [], checkinUrl: null, nome: "Ospite non in lista", arrivo: null, emails: email ? [email.toLowerCase()] : [], relayOta: relayOta(email), telefono: gp.telefono.trim() || null, lingua: gp.lingua ?? gp.linguaEmail ?? "en" };
  }
  const a = gp.sceltaId ? stato.tuttiArrivi.find((x) => x.reservationId === gp.sceltaId) : undefined;
  if (!a) return null;
  const m = stato.manuali.get(a.reservationId);
  const manuale = m && m.tipo === "prenotazione" ? m : null;
  const usaScatola = Boolean(a.email) && !(manuale && manuale.email && manuale.sostituisce);
  const emails = [...new Set([usaScatola ? a.email : null, manuale?.email ?? null].filter((e): e is string => Boolean(e)).map((e) => e.toLowerCase()))];
  // altre camere dello stesso intestatario (stessa email o stesso numero, stesso giorno): stessi pass, stesso link
  const chiaveContatto = (x: Arrivo): string | null => (x.email ? x.email.toLowerCase() : x.telefono ? x.telefono.replace(/\D/g, "") : null);
  const mio = chiaveContatto(a);
  const camere = mio
    ? stato.tuttiArrivi.filter((x) => x.reservationId !== a.reservationId && x.arrivo === a.arrivo && chiaveContatto(x) === mio).map((x) => x.reservationId)
    : [];
  return {
    id: a.reservationId,
    prenotazioni: [a.reservationId, ...camere],
    checkinUrl: a.checkinUrl,
    nome: a.nome,
    arrivo: a.arrivo,
    emails,
    relayOta: usaScatola ? a.relayOta : null,
    telefono: manuale?.telefono ?? a.telefono,
    lingua: gp.lingua ?? manuale?.lingua ?? a.lingua,
  };
}

function gestisciIncollaGuestPass(html: string, testo: string): void {
  const trovati = unisciPass(html ? passDaHtml(html, new DOMParser()) : [], passDaTesto(testo));
  if (trovati.length === 0) {
    stato.gp.avviso = "Nessun Guest Pass trovato. Apri l'email del Guest Pass, seleziona tutto (Ctrl+A), copia (Ctrl+C) e incolla qui.";
    renderGuestPass();
    return;
  }
  const gp = stato.gp;
  gp.pass = unisciPass(gp.pass, trovati);
  gp.avviso = null;
  const testoEmail = testo || new DOMParser().parseFromString(html, "text/html").body.textContent || "";
  gp.linguaEmail = linguaEmail(testoEmail) ?? gp.linguaEmail;
  proponiPrenotazione(gp);
  renderGuestPass();
}

function opzioniPrenotazioni(): string {
  const scelta = stato.gp.sceltaId;
  const voci = stato.tuttiArrivi.map((a) => {
    const inviato = stato.inviiGuestPass.has(a.reservationId) ? " · Guest Pass già inviato" : "";
    const camera = a.camera ? ` · camera ${a.camera}` : "";
    return `<option value="${esc(a.reservationId)}"${a.reservationId === scelta ? " selected" : ""}>${esc(a.nome)} · ${esc(etichettaGiorno(a.arrivo))}${esc(camera)}${esc(inviato)}</option>`;
  });
  return [
    `<option value=""${scelta ? "" : " selected"}>Scegli la prenotazione…</option>`,
    ...voci,
    `<option value="${GP_ALTRO}"${scelta === GP_ALTRO ? " selected" : ""}>Ospite non in lista (già arrivato o non in Slope)</option>`,
  ].join("");
}

function renderGuestPass(): void {
  const box = document.getElementById("guestpass");
  if (!box) return;
  box.hidden = stato.caricamento !== "ok";
  if (box.hidden) return;
  const gp = stato.gp;
  const zona = `
    <div id="gp-zona" class="gp-zona" contenteditable="true" role="textbox" aria-label="Incolla qui l'email del Guest Pass" tabindex="0">
      <b>Clicca qui e premi Ctrl+V</b>
      <span>Nell'email del Guest Pass: seleziona tutto (Ctrl+A) e copia (Ctrl+C). Vanno bene anche solo i link.</span>
    </div>`;
  const avviso = gp.avviso ? `<p class="errore" role="alert">${esc(gp.avviso)}</p>` : "";
  const testa = `
    <header class="gruppo-testa"><h3 id="gp-titolo">Guest Pass</h3><span class="conta">${stato.inviiGuestPass.size ? `${stato.inviiGuestPass.size} inviati` : ""}</span></header>
    <p class="nota">${
      stato.casella.attiva
        ? "I Guest Pass inviati alla casella dedicata compaiono qui da soli: premi «Prepara», controlla la prenotazione e invia. Gli altri si possono ancora incollare."
        : "Incolla l'email del Guest Pass: trovo la prenotazione dal nome e preparo il messaggio nella lingua dell'ospite, con un pulsante per ogni pass nella sua pagina d'arrivo."
    }</p>`;
  if (gp.pass.length === 0) {
    box.innerHTML = testa + renderCasella() + zona + avviso;
    return;
  }

  const elenco = gp.pass
    .map((p, i) => `<li><span class="gp-nome">${esc(p.nome || `Ospite ${i + 1}`)}</span><span class="badge badge-ok">pass valido</span><button type="button" class="link link-piccolo" data-azione="gp-togli" data-indice="${i}">Togli</button></li>`)
    .join("");
  const d = destinatarioGuestPass();
  const etichettaProposta =
    gp.sceltaId === GP_ALTRO ? "Scrivi email o WhatsApp dell'ospite." :
    gp.proposta === "sicura" ? "Trovata dal nome nell'email del Guest Pass." :
    gp.proposta === "probabile" ? "Trovata da una parte del nome: controlla che sia giusta." :
    gp.sceltaId ? "" : "Nessuna prenotazione con questo nome tra oggi e i prossimi giorni: sceglila dall'elenco.";

  let contatti = "";
  if (gp.sceltaId === GP_ALTRO) {
    contatti = `
      <div class="campo"><label for="gp-email">Email</label><input id="gp-email" type="email" inputmode="email" autocomplete="off" placeholder="nome@esempio.it" value="${esc(gp.email)}"></div>
      <div class="campo"><label for="gp-telefono">WhatsApp</label><input id="gp-telefono" type="tel" inputmode="tel" autocomplete="off" placeholder="+49 170 1234567" value="${esc(gp.telefono)}"></div>`;
  } else if (d) {
    const wa = d.telefono ? numeroWhatsapp(d.telefono) : null;
    const email = d.emails.length ? esc(d.emails.join(", ")) + (d.relayOta ? ` <span class="badge">${esc(d.relayOta)}</span>` : "") : '<span class="motivo">Nessuna email</span>';
    const tel = wa ? esc(mostraNumero(wa)) : d.telefono ? `<span class="motivo">${esc(d.telefono)}: numero non utilizzabile</span>` : '<span class="motivo">Nessun cellulare</span>';
    contatti = `<p class="contatto campo-largo">Email: ${email}<br>WhatsApp: ${tel}<br><span class="aiuto">Per correggere un contatto usa «Cambia email» sulla riga dell'ospite qui sotto.</span></p>`;
  }
  const lingua = d ? d.lingua : gp.lingua ?? gp.linguaEmail ?? "en";
  const scelte = `
    <div class="campi">
      <div class="campo campo-largo"><label for="gp-prenotazione">Prenotazione</label><select id="gp-prenotazione">${opzioniPrenotazioni()}</select>${etichettaProposta ? `<p class="aiuto">${esc(etichettaProposta)}</p>` : ""}</div>
      ${contatti}
      <div class="campo"><label for="gp-lingua">Lingua del messaggio</label><select id="gp-lingua">${ORDINE_LINGUE.map((l) => `<option value="${l}"${l === lingua ? " selected" : ""}>${NOMI_LINGUA[l]}</option>`).join("")}</select></div>
    </div>`;

  let azioni = "";
  if (d) {
    const corpo = testoGuestPass(d.lingua, gp.pass, d.prenotazioni, d.checkinUrl);
    const oggetto = TESTI_GUESTPASS[d.lingua].oggetto;
    const urlEmail = d.emails.length ? linkEmail(stato.impostazioni.programma, d.emails, oggetto, senzaGrassetto(corpo)) : null;
    const max = stato.impostazioni.programma === "gmail" ? MAX_LUNGHEZZA_GMAIL : MAX_LUNGHEZZA_MAILTO;
    const wa = d.telefono ? numeroWhatsapp(d.telefono) : null;
    const giaInviato = d.id ? stato.inviiGuestPass.get(d.id) : undefined;
    const aperto = gp.aperto !== null;
    const bottoneEmail = !urlEmail
      ? ""
      : urlEmail.length > max
        ? `<button type="button" class="btn btn-primario" disabled title="Testo troppo lungo: usa Copia testo">Apri email</button>`
        : `<a class="btn${gp.aperto === "email" ? "" : " btn-primario"}" href="${esc(urlEmail)}" target="_blank" rel="noopener" data-azione="gp-apri" data-canale="email">${gp.aperto === "email" ? "Riapri email" : "Apri email"}</a>`;
    const bottoneWa = wa
      ? `<a class="btn${gp.aperto === "whatsapp" ? "" : " btn-primario"}" href="https://wa.me/${wa}?text=${esc(encodeURIComponent(corpo))}" target="_blank" rel="noopener" data-azione="gp-apri" data-canale="whatsapp">${gp.aperto === "whatsapp" ? "Riapri WhatsApp" : "Apri WhatsApp"}</a>`
      : "";
    const nessunContatto = !urlEmail && !wa ? `<p class="motivo">Manca un contatto: usa «Copia testo» o «Copia link» e invialo come preferisci.</p>` : "";
    const nota = giaInviato ? `<p class="nota">Guest Pass già inviato a questa prenotazione il ${esc(new Date(giaInviato.inviatoIl).toLocaleString("it-IT", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))} (${giaInviato.canale === "whatsapp" ? "WhatsApp" : "email"}).</p>` : "";
    azioni = `
      ${nota}${nessunContatto}
      <div class="gruppo-azioni">
        ${bottoneEmail}${bottoneWa}
        <button type="button" class="btn${aperto ? " btn-conferma" : ""}" data-azione="gp-segna" ${stato.inScrittura ? "disabled" : ""}>Segna inviato</button>
        <button type="button" class="link link-piccolo" data-azione="gp-copia-testo">Copia testo</button>
        <button type="button" class="link link-piccolo" data-azione="gp-copia-link">Copia link</button>
        <button type="button" class="link link-piccolo" data-azione="gp-svuota">Svuota</button>
      </div>
      <p class="aiuto">L'email parte da Outlook: inviala da info@alpstay.eu. Non aprire il link dell'ospite da questo computer, altrimenti i suoi pass restano memorizzati qui.</p>`;
  } else {
    azioni = `<div class="gruppo-azioni"><button type="button" class="link link-piccolo" data-azione="gp-svuota">Svuota</button></div>`;
  }

  const daEmail = gp.emailId ? stato.casella.email.find((e) => e.id === gp.emailId) : undefined;
  const origine = daEmail
    ? `<p class="aiuto">Dalla casella Guest Pass, arrivato ${esc(fmtOra.format(new Date(daEmail.ricevuta)))}.${daEmail.firmata ? "" : ' <span class="badge badge-errore">mittente non verificato: controlla l\'email originale prima di inviare</span>'}</p>`
    : "";
  // pass presi dalla casella: la zona per incollare non serve e distrae
  box.innerHTML = testa + (daEmail ? "" : zona) + avviso + origine + `<ul class="gp-pass">${elenco}</ul>` + scelte + azioni;
}

async function segnaGuestPassInviato(): Promise<void> {
  const d = destinatarioGuestPass();
  const gp = stato.gp;
  const canale: Canale = gp.aperto ?? (d && d.emails.length ? "email" : "whatsapp");
  if (d?.id) {
    caricaInviiGuestPass();
    stato.inviiGuestPass.set(d.id, { id: d.id, arrival: d.arrivo ?? oggiRoma(), canale, pass: gp.pass.length, inviatoIl: new Date().toISOString(), emailId: gp.emailId });
    scriviJson(K_GUESTPASS, [...stato.inviiGuestPass.values()]);
  }
  if (gp.emailId) segnaEmailGestita(gp.emailId, true);
  const quanti = gp.pass.length;
  stato.gp = gpVuoto();
  renderGuestPass();
  mostraToast(quanti === 1 ? "Guest Pass segnato come inviato." : `${quanti} Guest Pass segnati come inviati.`);
  window.setTimeout(() => document.getElementById("gp-zona")?.focus(), 30);
}

function collegaGuestPass(): void {
  const app = $("#app");
  const inZona = (t: EventTarget | null): boolean => t instanceof Node && Boolean((t instanceof Element ? t : t.parentElement)?.closest("#gp-zona"));
  app.addEventListener("paste", (ev) => {
    if (!inZona(ev.target)) return;
    ev.preventDefault();
    gestisciIncollaGuestPass(ev.clipboardData?.getData("text/html") ?? "", ev.clipboardData?.getData("text/plain") ?? "");
  });
  app.addEventListener("drop", (ev) => {
    if (!inZona(ev.target)) return;
    ev.preventDefault();
    gestisciIncollaGuestPass(ev.dataTransfer?.getData("text/html") ?? "", ev.dataTransfer?.getData("text/plain") ?? "");
  });
  // la zona serve solo a incollare: niente testo scritto a mano
  app.addEventListener("beforeinput", (ev) => {
    if (inZona(ev.target) && ev.inputType !== "insertFromPaste" && ev.inputType !== "insertFromDrop") ev.preventDefault();
  });
  app.addEventListener("change", (ev) => {
    const el = ev.target as HTMLInputElement | HTMLSelectElement;
    const gp = stato.gp;
    if (el.id === "gp-prenotazione") {
      gp.sceltaId = el.value || null;
      gp.proposta = null;
      gp.lingua = null;
      gp.aperto = null;
    } else if (el.id === "gp-lingua") {
      const v = el.value;
      if (v === "de" || v === "it" || v === "en") gp.lingua = v;
    } else if (el.id === "gp-email") {
      gp.email = el.value.trim();
    } else if (el.id === "gp-telefono") {
      gp.telefono = el.value.trim();
    } else return;
    renderGuestPass();
  });
  app.addEventListener("click", (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-azione^='gp-']");
    if (!el) return;
    const gp = stato.gp;
    const d = destinatarioGuestPass();
    switch (el.dataset.azione) {
      case "gp-apri":
        gp.aperto = el.dataset.canale === "whatsapp" ? "whatsapp" : "email";
        window.setTimeout(renderGuestPass, 50);
        break;
      case "gp-segna":
        void segnaGuestPassInviato();
        break;
      case "gp-copia-testo":
        if (d) void copia(testoGuestPass(d.lingua, gp.pass, d.prenotazioni, d.checkinUrl), el);
        break;
      case "gp-copia-link":
        if (d) void copia(linkGuestPass(d.lingua, gp.pass, d.prenotazioni, d.checkinUrl), el);
        break;
      case "gp-togli": {
        const i = Number(el.dataset.indice);
        if (Number.isInteger(i)) gp.pass.splice(i, 1);
        if (gp.pass.length === 0) stato.gp = gpVuoto();
        renderGuestPass();
        break;
      }
      case "gp-svuota":
        stato.gp = gpVuoto();
        renderGuestPass();
        break;
      case "gp-prepara":
        if (el.dataset.email) preparaDaEmail(el.dataset.email);
        break;
      case "gp-nascondi": {
        const id = el.dataset.email;
        if (!id) break;
        segnaEmailGestita(id, true);
        renderGuestPass();
        mostraToast("Guest Pass nascosto.", async () => {
          segnaEmailGestita(id, false);
          renderGuestPass();
        });
        break;
      }
      default:
        break;
    }
  });
}

// ───────────────────────── Dialogo email a mano ─────────────────────────

function dialogoEl(): HTMLDialogElement {
  return document.getElementById("dialogo-email") as HTMLDialogElement;
}

/** Indirizzo che la receptionist ha confermato nonostante il suggerimento di correzione. */
let emailConfermata: string | null = null;

function mostraErroreDialogo(testo: string | null): void {
  const el = $("#dlg-errore");
  el.textContent = testo ?? "";
  el.hidden = !testo;
}

function mostraSuggerimento(digitata: string, suggerita: string): void {
  const el = $("#dlg-errore");
  el.innerHTML = `Controlla l'indirizzo: forse è <b>${esc(suggerita)}</b>? <button type="button" class="btn btn-piccolo" id="dlg-usa-suggerimento">Usa ${esc(suggerita)}</button><span class="aiuto-inline">Se <b>${esc(digitata)}</b> è giusto, premi di nuovo Salva.</span>`;
  el.hidden = false;
  document.getElementById("dlg-usa-suggerimento")?.addEventListener("click", () => {
    campo<HTMLInputElement>("dlg-email").value = suggerita;
    emailConfermata = null;
    mostraErroreDialogo(null);
    campo<HTMLInputElement>("dlg-email").focus();
  });
}

function apriDialogo(d: Dialogo): void {
  stato.dialogo = d;
  const esistente = d.idEsistente ? stato.manuali.get(d.idEsistente) ?? null : null;
  const p = d.prenotazione;

  $("#dlg-titolo").textContent =
    d.modo === "manuale" ? (esistente ? "Modifica contatto" : "Aggiungi un ospite che non è in Slope") : esistente ? "Cambia contatto" : "Aggiungi email o WhatsApp";

  const contesto = $("#dlg-contesto");
  if (p) {
    const tel = p.telefono ? ` Telefono in Slope: ${p.telefono}.` : "";
    const inSlope = (p.email ? `In Slope: ${p.email}${p.relayOta ? ` (${p.relayOta})` : ""}.` : "In Slope non c'è un'email.") + tel;
    contesto.textContent = `${p.nome} · arrivo ${etichettaGiorno(p.arrivo)} · ${inSlope}`;
  } else {
    contesto.textContent = "L'ospite compare nella lista dai giorni di anticipo impostati e riceve il messaggio nella lingua scelta. Basta l'email oppure il numero WhatsApp.";
  }

  $("#dlg-riga-nome").hidden = d.modo !== "manuale";
  $("#dlg-riga-arrivo").hidden = d.modo !== "manuale";
  $("#dlg-riga-sostituisci").hidden = !(p && p.email);
  $("#dlg-rimuovi").hidden = !esistente;
  $("#dlg-email-scatola").textContent = p?.email ?? "";

  campo<HTMLInputElement>("dlg-email").value = esistente?.email ?? "";
  campo<HTMLInputElement>("dlg-telefono").value = esistente?.telefono ?? (p?.telefono && !numeroWhatsapp(p.telefono) ? p.telefono : "");
  campo<HTMLInputElement>("dlg-nome").value = esistente?.nome ?? "";
  const arrivoInput = campo<HTMLInputElement>("dlg-arrivo");
  arrivoInput.min = stato.finestra.da;
  arrivoInput.value = esistente?.arrivo ?? stato.finestra.a;
  campo<HTMLSelectElement>("dlg-lingua").value = esistente?.lingua ?? p?.lingua ?? "";
  campo<HTMLInputElement>("dlg-sostituisci").checked = esistente ? esistente.sostituisce : Boolean(p?.relayOta);
  emailConfermata = null;
  mostraErroreDialogo(null);

  const dlg = dialogoEl();
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", "");
  const primo = d.modo === "manuale" && !esistente ? "dlg-nome" : p && !p.email && p.telefono && !numeroWhatsapp(p.telefono) ? "dlg-telefono" : "dlg-email";
  window.setTimeout(() => campo<HTMLInputElement>(primo).focus(), 30);
}

function chiudiDialogo(): void {
  stato.dialogo = null;
  const dlg = dialogoEl();
  if (typeof dlg.close === "function") dlg.close();
  else dlg.removeAttribute("open");
}

/** Cerca l'indirizzo tra i destinatari visibili, escluso quello che si sta modificando. */
function giaPresente(email: string, escludiId: string | null): Destinatario | null {
  const e = email.toLowerCase();
  return destinatari().find((x) => x.id !== escludiId && x.emails.includes(e)) ?? manualiInAttesaComeDest(e, escludiId);
}

function manualiInAttesaComeDest(email: string, escludiId: string | null): Destinatario | null {
  const m = manualiInAttesa().find((x) => x.id !== escludiId && (x.email ?? "").toLowerCase() === email);
  if (!m) return null;
  return { id: m.id, tipo: "manuale", prenotazione: null, manuale: m, nome: m.nome ?? email, dataArrivo: m.arrivo, giorniAllArrivo: 0, lingua: m.lingua, emails: [email], emailScatola: null, scatolaSostituita: false, relayOta: null, telefono: m.telefono, nomeSaluto: "", checkinUrl: null, checkinFatto: false, membri: [{ id: m.id, camera: null, checkinUrl: null, checkinFatto: false }] };
}

async function confermaDialogo(): Promise<void> {
  const d = stato.dialogo;
  if (!d) return;
  const emailGrezza = campo<HTMLInputElement>("dlg-email").value.trim();
  const telGrezzo = campo<HTMLInputElement>("dlg-telefono").value.trim();
  const email = emailGrezza ? pulisciEmail(emailGrezza) : null;
  const linguaGrezza = campo<HTMLSelectElement>("dlg-lingua").value;
  if (emailGrezza && !email) return mostraErroreDialogo("Scrivi un indirizzo email valido, per esempio nome@esempio.it.");
  if (telGrezzo && !numeroWhatsapp(telGrezzo)) return mostraErroreDialogo("Numero non valido: scrivi il cellulare con il prefisso internazionale, per esempio +49 170 1234567.");
  const telefono = telGrezzo ? telGrezzo : null;
  if (!email && !telefono) return mostraErroreDialogo("Scrivi l'email oppure il numero WhatsApp.");
  if (linguaGrezza !== "de" && linguaGrezza !== "it" && linguaGrezza !== "en") return mostraErroreDialogo("Scegli la lingua del messaggio.");
  const lingua: Lingua = linguaGrezza;

  const suggerita = email ? suggerisciEmail(email) : null;
  if (email && suggerita && emailConfermata !== email.toLowerCase()) {
    emailConfermata = email.toLowerCase();
    mostraSuggerimento(email, suggerita);
    return;
  }

  const idCorrente = d.prenotazione ? d.prenotazione.reservationId : d.idEsistente;
  const doppio = email ? giaPresente(email, idCorrente) : null;
  if (doppio) return mostraErroreDialogo(`Questo indirizzo è già nella lista (${doppio.nome}, arrivo ${etichettaGiorno(doppio.dataArrivo)}).`);

  let voce: EmailManuale;
  if (d.modo === "prenotazione" && d.prenotazione) {
    const p = d.prenotazione;
    if (email && p.email && p.email.toLowerCase() === email.toLowerCase()) return mostraErroreDialogo("È già l'indirizzo presente in Slope.");
    voce = {
      id: p.reservationId,
      tipo: "prenotazione",
      reservationId: p.reservationId,
      email,
      telefono,
      lingua,
      arrivo: p.arrivo,
      nome: null,
      sostituisce: Boolean(p.email && email) && campo<HTMLInputElement>("dlg-sostituisci").checked,
      creatoIl: stato.manuali.get(p.reservationId)?.creatoIl || new Date().toISOString(),
    };
  } else {
    const nome = campo<HTMLInputElement>("dlg-nome").value.trim();
    const arrivo = campo<HTMLInputElement>("dlg-arrivo").value;
    if (!nome) return mostraErroreDialogo("Scrivi il nome dell'ospite: serve alla reception per riconoscerlo nella lista.");
    if (!dataValida(arrivo)) return mostraErroreDialogo("Scegli la data di arrivo.");
    if (arrivo < stato.finestra.da) return mostraErroreDialogo(`La data di arrivo deve essere da ${etichettaGiorno(stato.finestra.da)} in poi.`);
    const esistente = d.idEsistente ? stato.manuali.get(d.idEsistente) : undefined;
    voce = {
      id: esistente?.id ?? nuovoIdManuale(),
      tipo: "manuale",
      reservationId: null,
      email,
      telefono,
      lingua,
      arrivo,
      nome,
      sostituisce: false,
      creatoIl: esistente?.creatoIl || new Date().toISOString(),
    };
  }

  const bottone = document.getElementById("dlg-salva") as HTMLButtonElement;
  bottone.disabled = true;
  const ok = await salvaManuale(voce);
  bottone.disabled = false;
  if (ok) chiudiDialogo();
}

// ───────────────────────── Modulo impostazioni ─────────────────────────

function riempiModulo(): void {
  const imp = stato.impostazioni;
  campo<HTMLSelectElement>("imp-programma").value = imp.programma;
  campo<HTMLInputElement>("imp-giorni").value = String(imp.giorniAnticipo);
  for (const l of ORDINE_LINGUE) {
    campo<HTMLInputElement>(`imp-${l}-oggetto`).value = imp.testi[l].oggetto;
    campo<HTMLTextAreaElement>(`imp-${l}-corpo`).value = imp.testi[l].corpo;
    campo<HTMLTextAreaElement>(`imp-${l}-whatsapp`).value = imp.testi[l].whatsapp;
  }
}

function leggiModulo(): Impostazioni {
  const testi = {} as Record<Lingua, TestoLingua>;
  for (const l of ORDINE_LINGUE) {
    testi[l] = {
      oggetto: campo<HTMLInputElement>(`imp-${l}-oggetto`).value.trim() || TESTI_PREDEFINITI[l].oggetto,
      corpo: campo<HTMLTextAreaElement>(`imp-${l}-corpo`).value.trim() || TESTI_PREDEFINITI[l].corpo,
      whatsapp: campo<HTMLTextAreaElement>(`imp-${l}-whatsapp`).value.trim() || TESTI_PREDEFINITI[l].whatsapp,
    };
  }
  return normalizzaImpostazioni({
    versioneTesti: VERSIONE_TESTI,
    programma: campo<HTMLSelectElement>("imp-programma").value === "gmail" ? "gmail" : "mailto",
    giorniAnticipo: Number(campo<HTMLInputElement>("imp-giorni").value),
    testi,
  });
}

// ───────────────────────── Eventi ─────────────────────────

function apriModificaPer(id: string): void {
  const p = stato.arrivi.find((a) => a.reservationId === id);
  if (p) {
    apriDialogo({ modo: "prenotazione", idEsistente: stato.manuali.has(id) ? id : null, prenotazione: p });
    return;
  }
  if (stato.manuali.get(id)?.tipo === "manuale") apriDialogo({ modo: "manuale", idEsistente: id, prenotazione: null });
}

function collegaEventi(): void {
  $("#aggiorna").addEventListener("click", () => void caricaArrivi());
  $("#aggiungi-email").addEventListener("click", () => apriDialogo({ modo: "manuale", idEsistente: null, prenotazione: null }));

  $("#app").addEventListener("click", (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-azione]");
    if (!el) return;
    const azione = el.dataset.azione;
    const id = el.dataset.id;

    switch (azione) {
      case "apri": {
        if (id) stato.aperte.add(id);
        window.setTimeout(render, 50);
        break;
      }
      case "segna-aperte": {
        const lista = daAvvisare().filter((x) => stato.aperte.has(x.id));
        const email = lista.filter((x) => x.emails.length > 0);
        const wa = lista.filter((x) => x.emails.length === 0);
        if (email.length) void segnaInviati(email, "email");
        if (wa.length) void segnaInviati(wa, "whatsapp");
        break;
      }
      case "copia-wa": {
        const x = trovaDestinatario(id);
        if (x) void copia(whatsappPer(x, stato.impostazioni), el);
        break;
      }
      case "segna-uno": {
        const x = trovaDestinatario(id);
        if (x) void segnaInviati([x], el.dataset.canale === "email" ? "email" : "whatsapp");
        break;
      }
      case "modifica-email": {
        if (el.dataset.id) apriModificaPer(el.dataset.id);
        break;
      }
      case "annulla": {
        if (el.dataset.id) void annullaInvii([el.dataset.id]);
        break;
      }
      case "riprova": {
        void caricaArrivi();
        break;
      }
      case "copia-testo": {
        const x = trovaDestinatario(id);
        if (x) void copia(emailPer(x, stato.impostazioni).corpo, el);
        break;
      }
      default:
        break;
    }
  });

  $("#app").addEventListener("submit", (ev) => {
    const form = ev.target as HTMLFormElement;
    if (form.id === "form-sblocco") {
      ev.preventDefault();
      const pw = (document.getElementById("sblocco-pw") as HTMLInputElement).value;
      if (pw) void caricaArrivi(pw);
      return;
    }
  });

  // Dialogo email a mano
  (document.getElementById("form-dialogo") as HTMLFormElement).addEventListener("submit", (ev) => {
    ev.preventDefault();
    void confermaDialogo();
  });
  $("#dlg-annulla").addEventListener("click", chiudiDialogo);
  $("#dlg-rimuovi").addEventListener("click", () => {
    const id = stato.dialogo?.idEsistente;
    chiudiDialogo();
    if (id) void rimuoviManuale(id);
  });
  dialogoEl().addEventListener("close", () => (stato.dialogo = null));

  // Impostazioni
  const modulo = document.getElementById("form-impostazioni") as HTMLFormElement;
  modulo.addEventListener("input", () => (impostazioniModificate = true));
  modulo.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const nuove = leggiModulo();
    void salvaImpostazioni(nuove).then((ok) => ok && mostraToast("Impostazioni salvate."));
  });
  $("#blocca").addEventListener("click", () => {
    salvaPassword(null);
    password = null;
    stato.arrivi = [];
    stato.tuttiArrivi = [];
    stato.gp = gpVuoto();
    stato.casella = casellaVuota();
    stato.erroreSblocco = null;
    stato.caricamento = "bloccata";
    (document.getElementById("impostazioni") as HTMLDetailsElement).open = false;
    render();
    mostraToast("Pagina bloccata su questo computer.");
  });
  // Un'altra scheda aperta sullo stesso computer ha segnato un invio o cambiato un'email: si allinea.
  window.addEventListener("storage", (e) => {
    if (e.key === K_INVII) caricaRegistro();
    else if (e.key === K_MANUALI) caricaManuali();
    else if (e.key === K_GUESTPASS) caricaInviiGuestPass();
    else if (e.key === K_GUESTPASS_EMAIL) caricaEmailGestite();
    else if (e.key === K_IMPOSTAZIONI) {
      caricaImpostazioni();
      if (!impostazioniModificate) riempiModulo();
    } else return;
    render();
  });
  $("#ripristina-testi").addEventListener("click", () => {
    for (const l of ORDINE_LINGUE) {
      campo<HTMLInputElement>(`imp-${l}-oggetto`).value = TESTI_PREDEFINITI[l].oggetto;
      campo<HTMLTextAreaElement>(`imp-${l}-corpo`).value = TESTI_PREDEFINITI[l].corpo;
      campo<HTMLTextAreaElement>(`imp-${l}-whatsapp`).value = TESTI_PREDEFINITI[l].whatsapp;
    }
    impostazioniModificate = true;
    mostraToast("Testi predefiniti ripristinati nel modulo: premi Salva impostazioni per confermare.");
  });
}

// ───────────────────────── Avvio ─────────────────────────

async function avvia(): Promise<void> {
  aggiornaFinestra();
  caricaImpostazioni();
  caricaRegistro();
  caricaManuali();
  caricaInviiGuestPass();
  caricaEmailGestite();
  collegaEventi();
  collegaGuestPass();
  riempiModulo();
  render();
  await caricaArrivi();
  // Ogni 10 minuti, e al ritorno sulla scheda, si rilegge arrivi.json (l'attività lo aggiorna ogni ora alle :40).
  let ultimo = Date.now();
  let ultimoGp = Date.now();
  const aggiorna = (): void => {
    if (document.visibilityState !== "visible" || stato.caricamento === "in-corso" || stato.caricamento === "bloccata") return;
    if (Date.now() - ultimo >= AGGIORNA_OGNI_MS) {
      ultimo = ultimoGp = Date.now();
      void caricaArrivi();
    } else if (stato.caricamento === "ok" && Date.now() - ultimoGp >= AGGIORNA_GP_OGNI_MS) {
      // i Guest Pass si controllano più spesso degli arrivi
      ultimoGp = Date.now();
      void aggiornaCasella();
    }
  };
  window.setInterval(aggiorna, 60_000);
  document.addEventListener("visibilitychange", aggiorna);
}

if (typeof document !== "undefined") void avvia();

export { raggruppa, suggerisciEmail, maiuscoleNome, linkCheckin, versoArrivo };

