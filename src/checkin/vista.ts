/**
 * Check-in online & email · Chalet Hotel Hartmann — interfaccia della reception (comune a pagina vera e prova).
 * La fonte dei dati arriva da fuori: app.ts legge ../arrivi.json cifrato, prova.ts usa ospiti inventati.
 *
 * Due viste: «Calendario» (oggi per primo, con tutto il lavoro del giorno: check-in da fare 5 giorni prima
 * dell'arrivo, email mancante o da correggere 3 giorni prima, telefonate; poi i giorni seguenti) e «Tutte».
 *
 * Sul computer (localStorage): solo il registro «contattato» (id Slope, motivo, canale, data), cancellato 14 giorni
 * dopo l'arrivo. Email, telefoni e link di check-in restano in memoria, mai salvati.
 * Regola: gli ID ricevuti da Slope non vengono mai modificati.
 */
import type { AvvisoItem } from "../feed";
import type { FreshnessStatus } from "../types";
import type { Lingua, Programma } from "../avvisi/testi";
import { linkEmail, mostraNumero } from "../avvisi/testi";
import type { PassTrovato } from "../avvisi/guestpass";
import {
  CASELLA_GUESTPASS,
  K_GUESTPASS_EMAIL_GESTITE,
  K_GUESTPASS_INVIATI,
  abbinaGuestPass,
  messaggioGuestPass,
  registroEmailGestite,
  registroInviiGuestPass,
  statoGuestPass,
} from "./guestpass";
import type { AbbinamentoGuestPass, CasellaGuestPass, InvioGuestPass } from "./guestpass";
import {
  ANTICIPO_GIORNI,
  ETICHETTE_STATO,
  ORDINE_STATI,
  aggiungiGiorni,
  calendarioCompletoFino,
  cerca,
  contattoAttuale,
  conteggi,
  confrontaConSlope,
  daFareOggi,
  differenzaGiorni,
  emailDaInserire,
  linkSlope,
  messaggio,
  motivoPer,
  oggiRoma,
  perOrdine,
  promemoria,
  registroEmailNuove,
  registroValido,
  righeDa,
  serveEmail,
  validaEmailNuova,
} from "./regole";
import type { Canale, Contatto, EmailNuova, Motivo, Promemoria, RigaCheckin, StatoRiga } from "./regole";

// ───────────────────────── Fonte dei dati ─────────────────────────

export interface Dati {
  readonly righe: readonly AvvisoItem[];
  /** primo e ultimo giorno di arrivo coperti dal file */
  readonly da: string;
  readonly a: string;
  /** ultimo aggiornamento delle prenotazioni Hartmann in La Scatola (ISO) */
  readonly aggiornatoAlle: string | null;
  /** quando è stato scritto il file (ISO) */
  readonly generatoAlle: string;
  readonly freschezza: FreshnessStatus;
}

export type Lettura =
  | { readonly esito: "ok"; readonly dati: Dati }
  | { readonly esito: "password"; readonly errore: string | null }
  | { readonly esito: "errore"; readonly titolo: string; readonly dettaglio: string };

export interface Fonte {
  /** true nella pagina di prova: niente password, dati inventati */
  readonly prova: boolean;
  /** `password` = appena inserita dalla reception; null = usa quella salvata (se c'è) */
  leggi(password: string | null): Promise<Lettura>;
  /** toglie la password salvata su questo computer */
  dimentica(): void;
  /** solo nella prova: email annotate di esempio, se su questo browser non ce ne sono */
  readonly esempiEmailNuove?: readonly EmailNuova[];
  /** solo nella prova: contatti di esempio (per far vedere i solleciti «telefonare») */
  readonly esempiContatti?: readonly Contatto[];
  /** Guest Pass arrivati nella casella dedicata (guestpass.json), decifrati con la password reception */
  leggiGuestPass?(): Promise<CasellaGuestPass>;
}

// ───────────────────────── Stato ─────────────────────────

type Filtro = StatoRiga | "tutti";
/** Canale del messaggio nella finestra «Scrivi all'ospite». «testo» = da copiare (chat dell'extranet, altro). */
type CanaleMsg = "email" | "whatsapp" | "testo";
interface Composer {
  /** reservation_id di Slope, invariato */
  readonly id: string;
  readonly motivo: Motivo;
  /** invio del Guest Pass: pass dell'email della casella (i link restano solo in memoria) */
  readonly guestpass: { readonly emailId: string; readonly pass: readonly PassTrovato[]; readonly sicura: boolean } | null;
  canale: CanaleMsg;
  lingua: Lingua;
}
type Vista = "oggi" | "tutte";
const VISTE: readonly Vista[] = ["oggi", "tutte"];

interface Stato {
  caricamento: "attesa" | "in-corso" | "ok" | "errore" | "password";
  errore: { titolo: string; dettaglio: string } | null;
  erroreSblocco: string | null;
  dati: Dati | null;
  righe: RigaCheckin[];
  oggi: string;
  vista: Vista;
  filtro: Filtro;
  cerca: string;
  registro: Map<string, Contatto>;
  /** email mandate dagli ospiti e annotate dalla reception, da portare in Slope */
  emailNuove: Map<string, EmailNuova>;
  /** riga con il campo «email ricevuta» aperto */
  campoAperto: string | null;
  /** promemoria del calendario aperti con tutte le azioni */
  espansi: Set<string>;
  /** finestra «Scrivi all'ospite» aperta */
  composer: Composer | null;
  /** Guest Pass arrivati nella casella (in memoria) */
  casella: CasellaGuestPass;
  /** registri condivisi con la pagina avvisi/ */
  inviiGP: Map<string, InvioGuestPass>;
  gestiteGP: Map<string, string>;
  /** abbinamenti fatti a mano: impronta email → reservation_id */
  scelteGP: Map<string, string>;
  erroreCampo: { errore: string; suggerita: string | null } | null;
  archivioOk: boolean;
}

const K_REGISTRO = "checkinHartmann.contatti";
/** Email annotate (dati personali): restano solo su questo computer, fino a quando sono in Slope o 14 giorni dopo l'arrivo. */
const K_EMAIL_NUOVE = "checkinHartmann.emailNuove";
const K_FILTRO = "checkinHartmann.filtro";
const K_VISTA = "checkinHartmann.vista";
/** Impostazioni della pagina avvisi/: da lì si legge solo il programma email scelto (Outlook o Gmail). */
const K_IMPOSTAZIONI_AVVISI = "avvisiHartmann.impostazioni";
const AGGIORNA_OGNI_MS = 10 * 60_000;
const AGGIORNA_GP_OGNI_MS = 5 * 60_000;
const DATI_VECCHI_MS = 3 * 60 * 60_000;
const TZ = "Europe/Rome";

const stato: Stato = {
  caricamento: "attesa",
  errore: null,
  erroreSblocco: null,
  dati: null,
  righe: [],
  oggi: oggiRoma(),
  vista: "oggi",
  filtro: "tutti",
  cerca: "",
  registro: new Map(),
  emailNuove: new Map(),
  campoAperto: null,
  erroreCampo: null,
  espansi: new Set(),
  composer: null,
  casella: { attiva: false, email: [], problema: null },
  inviiGP: new Map(),
  gestiteGP: new Map(),
  scelteGP: new Map(),
  archivioOk: true,
};

let fonte: Fonte;

// ───────────────────────── Archivio locale ─────────────────────────

function leggiJson<T>(chiave: string, predefinito: T): T {
  try {
    const v = localStorage.getItem(chiave);
    return v ? (JSON.parse(v) as T) : predefinito;
  } catch {
    stato.archivioOk = false;
    return predefinito;
  }
}

function scriviJson(chiave: string, valore: unknown): void {
  try {
    localStorage.setItem(chiave, JSON.stringify(valore));
  } catch {
    stato.archivioOk = false;
  }
}

function sessione(chiave: string, valore?: string): string | null {
  try {
    if (valore !== undefined) sessionStorage.setItem(chiave, valore);
    return sessionStorage.getItem(chiave);
  } catch {
    return null;
  }
}

function caricaRegistro(): void {
  stato.registro = registroValido(leggiJson<unknown>(K_REGISTRO, []), stato.oggi);
}

function salvaRegistro(): void {
  scriviJson(K_REGISTRO, [...stato.registro.values()]);
}

function caricaEmailNuove(): void {
  stato.emailNuove = registroEmailNuove(leggiJson<unknown>(K_EMAIL_NUOVE, []), stato.oggi);
}

function salvaEmailNuove(): void {
  scriviJson(K_EMAIL_NUOVE, [...stato.emailNuove.values()]);
}

/** Controllo incrociato dopo ogni lettura: le email ormai in Slope si tolgono dal registro. */
function chiudiEmailInserite(): void {
  const fatte: string[] = [];
  for (const r of stato.righe) {
    const n = stato.emailNuove.get(r.reservationId);
    if (n && confrontaConSlope(r, n) === "inserita") {
      stato.emailNuove.delete(r.reservationId);
      fatte.push(r.camera ? `camera ${r.camera}` : r.nome);
    }
  }
  if (fatte.length) {
    salvaEmailNuove();
    window.setTimeout(() => toast(`Email ora in Slope: ${fatte.join(", ")}.`), 50);
  }
}

function programmaEmail(): Programma {
  const imp = leggiJson<{ programma?: unknown } | null>(K_IMPOSTAZIONI_AVVISI, null);
  return imp?.programma === "gmail" ? "gmail" : "mailto";
}

// ───────────────────────── Guest Pass ─────────────────────────

function caricaRegistriGP(): void {
  stato.inviiGP = registroInviiGuestPass(leggiJson<unknown>(K_GUESTPASS_INVIATI, []), stato.oggi);
  stato.gestiteGP = registroEmailGestite(leggiJson<unknown>(K_GUESTPASS_EMAIL_GESTITE, []));
}

async function aggiornaCasella(): Promise<void> {
  if (!fonte.leggiGuestPass || stato.caricamento !== "ok") return;
  stato.casella = await fonte.leggiGuestPass();
}

function abbinamentiGP(): AbbinamentoGuestPass[] {
  return abbinaGuestPass(stato.casella.email, stato.righe, stato.gestiteGP, stato.scelteGP);
}

/** Registra l'invio (stesso registro della pagina avvisi/) e segna gestita l'email della casella. */
function segnaGuestPassInviato(r: RigaCheckin, gp: NonNullable<Composer["guestpass"]>, canale: "email" | "whatsapp"): void {
  caricaRegistriGP(); // un'altra scheda (avvisi/) potrebbe averli cambiati
  stato.inviiGP.set(r.reservationId, { id: r.reservationId, arrival: r.arrivo, canale, pass: gp.pass.length, inviatoIl: new Date().toISOString(), emailId: gp.emailId });
  scriviJson(K_GUESTPASS_INVIATI, [...stato.inviiGP.values()]);
  stato.gestiteGP.set(gp.emailId, new Date().toISOString());
  scriviJson(K_GUESTPASS_EMAIL_GESTITE, [...stato.gestiteGP.entries()]);
  render();
  toast(`${r.camera ? `Camera ${r.camera}` : r.nome}: Guest Pass segnato come inviato.`, () => {
    stato.inviiGP.delete(r.reservationId);
    stato.gestiteGP.delete(gp.emailId);
    scriviJson(K_GUESTPASS_INVIATI, [...stato.inviiGP.values()]);
    scriviJson(K_GUESTPASS_EMAIL_GESTITE, [...stato.gestiteGP.entries()]);
    render();
  });
}

// ───────────────────────── Caricamento ─────────────────────────

async function carica(passwordNuova: string | null = null): Promise<void> {
  stato.oggi = oggiRoma();
  stato.caricamento = "in-corso";
  stato.errore = null;
  render();
  const l = await fonte.leggi(passwordNuova);
  if (l.esito === "ok") {
    stato.dati = l.dati;
    stato.righe = righeDa(l.dati.righe, stato.oggi);
    chiudiEmailInserite();
    stato.erroreSblocco = null;
    stato.caricamento = "ok";
    caricaRegistriGP();
    await aggiornaCasella();
  } else if (l.esito === "password") {
    stato.erroreSblocco = l.errore;
    stato.caricamento = "password";
  } else {
    stato.errore = { titolo: l.titolo, dettaglio: l.dettaglio };
    stato.caricamento = "errore";
  }
  render();
}

// ───────────────────────── Formati ─────────────────────────

const fmtGiorno = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fmtGiornoLungo = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const fmtOra = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const fmtGiornoOra = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ });

const giorno = (iso: string): string => fmtGiorno.format(new Date(`${iso}T12:00:00Z`));
const giornoLungo = (iso: string): string => fmtGiornoLungo.format(new Date(`${iso}T12:00:00Z`));

function quandoArriva(n: number): string {
  if (n <= 0) return "oggi";
  if (n === 1) return "domani";
  return `tra ${n} giorni`;
}

function etichettaGiornoCalendario(iso: string): string {
  const n = differenzaGiorni(stato.oggi, iso);
  const g = giornoLungo(iso);
  return n === 0 ? `Oggi · ${g}` : n === 1 ? `Domani · ${g}` : g.charAt(0).toUpperCase() + g.slice(1);
}

function quandoIso(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const g = oggiRoma(d);
  if (g === stato.oggi) return `alle ${fmtOra.format(d)}`;
  if (g === aggiungiGiorni(stato.oggi, -1)) return `ieri alle ${fmtOra.format(d)}`;
  return `il ${fmtGiornoOra.format(d)}`;
}

const NOMI_CANALE: Readonly<Record<Canale, string>> = { whatsapp: "WhatsApp", email: "email", testo: "testo copiato", telefono: "telefono", altro: "a voce o altro" };

/** «Mandare il link di check-in» / «Chiedere l'email», con i giorni di anticipo. */
function cosaFare(r: RigaCheckin): string {
  const m = motivoPer(r);
  const giorni = ANTICIPO_GIORNI[r.stato];
  const prima = giorni ? ` (${giorni} giorni prima dell'arrivo)` : "";
  if (m === "checkin") return `Mandare il link di check-in online${prima}`;
  if (r.stato === "email-da-correggere") return `Verificare e correggere l'email${prima}`;
  return `Chiedere l'email dell'ospite${prima}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function $(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`Elemento mancante: ${sel}`);
  return el;
}

// ───────────────────────── Toast e copia ─────────────────────────

let timerToast: number | undefined;
function toast(testo: string, annulla?: () => void): void {
  const t = $("#toast");
  // con la finestra «Scrivi all'ospite» aperta il messaggio va dentro la finestra, altrimenti resterebbe sotto
  const d = document.getElementById("composer") as HTMLDialogElement | null;
  const host = d?.open ? d : document.body;
  if (t.parentElement !== host) host.appendChild(t);
  t.innerHTML = `<span>${esc(testo)}</span>${annulla ? '<button type="button" class="link" id="toast-annulla">Annulla</button>' : ""}`;
  t.hidden = false;
  document.getElementById("toast-annulla")?.addEventListener("click", () => {
    t.hidden = true;
    annulla?.();
  });
  window.clearTimeout(timerToast);
  timerToast = window.setTimeout(() => (t.hidden = true), annulla ? 10_000 : 4_000);
}

async function copia(testo: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(testo);
    return true;
  } catch {
    return copiaSubito(testo);
  }
}

/** Copia senza attese: serve quando subito dopo si apre un'altra scheda (la pagina perde il fuoco). */
function copiaSubito(testo: string): boolean {
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
  return ok;
}

// ───────────────────────── Registro contatti ─────────────────────────

function segnaContatto(r: RigaCheckin, motivo: Motivo, canale: Canale): void {
  const prima = stato.registro.get(r.reservationId) ?? null;
  stato.registro.set(r.reservationId, { id: r.reservationId, motivo, canale, quando: new Date().toISOString(), arrivo: r.arrivo });
  salvaRegistro();
  render();
  toast(`${r.camera ? `Camera ${r.camera}` : r.nome}: segnato come contattato (${NOMI_CANALE[canale]}).`, () => {
    if (prima) stato.registro.set(r.reservationId, prima);
    else stato.registro.delete(r.reservationId);
    salvaRegistro();
    render();
  });
}

function togliContatto(id: string): void {
  const prima = stato.registro.get(id);
  if (!prima) return;
  stato.registro.delete(id);
  salvaRegistro();
  render();
  toast("Contatto tolto dal registro.", () => {
    stato.registro.set(id, prima);
    salvaRegistro();
    render();
  });
}

// ───────────────────────── Render: testata e avvisi ─────────────────────────

function renderTesta(): void {
  const d = stato.dati;
  $("#finestra").textContent = d ? `Arrivi da ${giorno(stato.oggi > d.da ? stato.oggi : d.da)} a ${giorno(d.a)}` : "Arrivi dei prossimi giorni";
  const f = $("#freschezza");
  if (stato.caricamento === "in-corso") f.textContent = "lettura dei dati…";
  else if (d && stato.caricamento === "ok") {
    f.textContent = fonte.prova ? "dati di prova, inventati" : `Prenotazioni Slope aggiornate ${quandoIso(d.aggiornatoAlle ?? d.generatoAlle)}`;
  } else f.textContent = "";
  (document.getElementById("aggiorna") as HTMLButtonElement).disabled = stato.caricamento === "in-corso" || stato.caricamento === "password";
}

/** Avvisi sui dati: testo del server La Scatola quando l'aggiornamento non riesce, dati fermi, browser senza archivio. */
function renderAvvisi(): void {
  const box = $("#avvisi");
  const out: string[] = [];
  const d = stato.dati;
  if (d && stato.caricamento === "ok") {
    if (d.freschezza === "failing") {
      out.push(`<div class="avviso"><strong>L'ultimo aggiornamento non è riuscito; sono mostrati gli ultimi dati disponibili.</strong> <span>Prenotazioni lette da Slope ${esc(quandoIso(d.aggiornatoAlle))}: check-in ed email fatti dopo non sono ancora qui.</span></div>`);
    } else if (d.freschezza === "stale") {
      out.push(`<div class="avviso"><strong>I dati potrebbero non essere aggiornati.</strong> <span>Prenotazioni lette da Slope ${esc(quandoIso(d.aggiornatoAlle))}.</span></div>`);
    }
    const scritto = Date.parse(d.generatoAlle);
    const ora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date()));
    if (!fonte.prova && Number.isFinite(scritto) && Date.now() - scritto > DATI_VECCHI_MS && ora >= 9 && ora <= 19) {
      out.push(`<div class="avviso"><strong>File fermo ${esc(quandoIso(d.generatoAlle))}.</strong> <span>L'aggiornamento orario non è passato: le ultime modifiche in Slope potrebbero mancare.</span></div>`);
    }
  }
  const pendenti = pronta() ? emailDaInserire(stato.righe, stato.emailNuove).length : 0;
  if (pendenti) {
    out.unshift(
      `<div class="avviso avviso-slope lampeggia-bordo"><strong>${pendenti === 1 ? "1 email da inserire in Slope" : `${pendenti} email da inserire in Slope`}</strong> <span>Annotate qui ma non ancora nella scheda cliente.</span>${
        stato.vista !== "oggi" ? ' <button type="button" class="link" data-azione="vista" data-vista="oggi">Vedi</button>' : ""
      }</div>`,
    );
  }
  if (stato.casella.problema) out.push(`<div class="avviso"><strong>Guest Pass:</strong> <span>${esc(stato.casella.problema)}</span></div>`);
  if (!stato.archivioOk) {
    out.push(`<div class="avviso"><strong>Questo browser non salva i dati.</strong> <span>Il registro «contattato» e le email annotate si perdono chiudendo la pagina: non usare la navigazione privata.</span></div>`);
  }
  box.innerHTML = out.join("");
}

function pronta(): boolean {
  return stato.caricamento === "ok" || (stato.caricamento === "in-corso" && stato.dati !== null);
}

function renderSchede(): void {
  const nav = $("#schede");
  if (!pronta()) {
    nav.hidden = true;
    return;
  }
  nav.hidden = false;
  const lista = promemoria(stato.righe, stato.registro, stato.oggi);
  const pendenti = new Set(emailDaInserire(stato.righe, stato.emailNuove).map((x) => x.riga.reservationId));
  const oggi = daFareOggi(lista).filter((p) => !pendenti.has(p.riga.reservationId)).length + pendenti.size + lavoroGuestPass().totale;
  const conta: Record<Vista, string> = { oggi: String(oggi), tutte: String(stato.righe.length) };
  const nomi: Record<Vista, string> = { oggi: "Calendario", tutte: "Tutte le prenotazioni" };
  nav.innerHTML = VISTE.map(
    (v) =>
      `<button type="button" role="tab" class="scheda${stato.vista === v ? " attiva" : ""}${v === "oggi" && oggi > 0 ? " urgente" : ""}" aria-selected="${stato.vista === v}" data-azione="vista" data-vista="${v}">${esc(nomi[v])} <span class="scheda-conta">${conta[v]}</span></button>`,
  ).join("");
}

// ───────────────────────── Render: parti di una riga ─────────────────────────

// Ogni riga si legge in tre colpi d'occhio: CAMERA grande · tre segnali (check-in, email, Guest Pass) con ✓ verde,
// ✗ rosso, ! ambra · un solo pulsante verde per l'azione da fare (le altre azioni sotto, come link).

type TonoChip = "ok" | "no" | "attenzione" | "pronto";
const ICONA_CHIP: Readonly<Record<TonoChip, string>> = { ok: "✓", no: "✗", attenzione: "!", pronto: "→" };

function chip(tono: TonoChip, testo: string, titolo = ""): string {
  return `<span class="chip chip-${tono}"${titolo ? ` title="${esc(titolo)}"` : ""}><span class="chip-icona" aria-hidden="true">${ICONA_CHIP[tono]}</span>${esc(testo)}</span>`;
}

/** I tre segnali della prenotazione: check-in online, email in Slope, Guest Pass. */
function segnali(r: RigaCheckin): string {
  const e = r.controlloEmail;
  const checkin = r.checkinFatto
    ? chip("ok", "Check-in fatto")
    : chip("no", r.checkinUrl ? "Check-in da fare" : "Check-in da fare · senza link", r.checkinUrl ? "" : "Slope non ha fornito il link personale di check-in");
  const email =
    e.tipo === "diretta"
      ? chip("ok", "Email diretta")
      : e.tipo === "sospetta"
        ? chip("attenzione", "Email da controllare", `Il dominio sembra scritto male: forse ${e.suggerita ?? ""}`)
        : e.tipo === "portale"
          ? chip("no", "Email mancante", `In Slope c'è solo l'inoltro di ${e.portale ?? "un portale"}: non vale come email dell'ospite`)
          : chip("no", "Email mancante");
  const gp = statoGuestPass(r, stato.inviiGP, abbinamentiGP());
  const inviato = gp.stato === "inviato" ? stato.inviiGP.get(r.reservationId) : undefined;
  const pass =
    gp.stato === "inviato"
      ? chip("ok", "Guest Pass inviato", inviato ? `Inviato ${quandoIso(inviato.inviatoIl)}` : "")
      : gp.stato === "pronto"
        ? chip("pronto", gp.abbinamento && !gp.abbinamento.sicura ? "Guest Pass pronto · controlla il nome" : "Guest Pass pronto")
        : gp.stato === "da-generare"
          ? chip("attenzione", "Guest Pass da generare")
          : "";
  return `<div class="col-segnali">${checkin}${email}${pass}</div>`;
}

/** Email e telefono in una riga sola, in piccolo: servono quando si scrive o si chiama. */
function contatti(r: RigaCheckin): string {
  const e = r.controlloEmail;
  const lingua = r.linguaSlope && r.linguaSlope !== r.lingua ? `${r.linguaSlope.toUpperCase()}→${r.lingua.toUpperCase()}` : r.lingua.toUpperCase();
  const email =
    e.tipo === "diretta"
      ? `<span class="email">${esc(r.email ?? "")}</span>`
      : e.tipo === "sospetta"
        ? `<span class="email">${esc(r.email ?? "")}</span> <span class="suggerita">forse ${esc(e.suggerita ?? "")}</span>`
        : e.tipo === "portale"
          ? `<span class="vuoto-campo" title="Si può usare per scrivere, solo da info@alpstay.eu">inoltro ${esc(e.portale ?? "portale")}</span>`
          : '<span class="vuoto-campo">nessuna</span>';
  return `<div class="col-contatti">
    <span class="contatto"><span class="etichetta">Email</span>${email}</span>
    <span class="contatto"><span class="etichetta">Tel.</span>${cellaTelefono(r)}</span>
    <span class="contatto"><span class="etichetta">Lingua</span><span class="codice" title="Lingua dei messaggi (Slope → testo)">${esc(lingua)}</span></span>
  </div>`;
}

function cellaTelefono(r: RigaCheckin): string {
  if (!r.telefono) return '<span class="vuoto-campo">nessuno</span>';
  const mostrato = r.whatsapp ? mostraNumero(r.whatsapp) : r.telefono;
  const tel = r.whatsapp ? `+${r.whatsapp}` : r.telefono.replace(/[^\d+]/g, "");
  return `<a class="tel" href="tel:${esc(tel)}">${esc(mostrato)}</a>${r.whatsapp ? "" : ' <span class="suggerita" title="Numero segnaposto del portale o senza prefisso internazionale: WhatsApp non disponibile">da controllare</span>'}`;
}

function rif(r: RigaCheckin): string {
  if (!r.riferimento) return "";
  return `<span class="rif" title="Numero della prenotazione: va anche nell'oggetto delle email">${esc(r.riferimento.portale ?? "Slope n.")} ${esc(r.riferimento.numero)}</span>`;
}

/** Nome, date e numero di prenotazione. */
function ospite(r: RigaCheckin, conNotti = true): string {
  return `<div class="col-ospite">
    <span class="nome">${esc(r.nome)}</span>
    <span class="date"><span class="tra tra-${Math.min(r.giorniAllArrivo, 2)}">${esc(quandoArriva(r.giorniAllArrivo))}</span> ${esc(giorno(r.arrivo))} → ${esc(giorno(r.partenza))}${
      conNotti ? ` · ${r.notti === 1 ? "1 notte" : `${r.notti} notti`}` : ""
    }</span>
    ${rif(r)}
  </div>`;
}

/** «Apri in Slope»: la prenotazione (ordine) nel backoffice di Slope, in una nuova scheda. Vuoto se manca l'ordine. */
function apriInSlope(r: RigaCheckin, aspetto: "primario" | "normale" | "link" = "normale"): string {
  const url = linkSlope(r);
  if (!url) return "";
  const classe = aspetto === "link" ? "link link-piccolo" : `btn btn-piccolo${aspetto === "primario" ? " btn-primario" : ""}`;
  return `<a class="${classe}" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Apre la prenotazione nel backoffice di Slope (scheda cliente ed estensione «Slope X LTS Guest Pass»)">Apri in Slope</a>`;
}

/** Pagina delle lettere di benvenuto, nella stessa piattaforma (stessa password). */
const PAGINA_LETTERE = "https://alpstay.github.io/WelcomeHartmann/";

/**
 * La lettera di benvenuto di chi arriva oggi o domani: apre la pagina delle lettere su quel giorno, con la camera
 * già in anteprima (#lettera=<giorno>~<reservation_id>, ID di Slope identico).
 */
function linkLettera(r: RigaCheckin): string | null {
  if (r.giorniAllArrivo < 0 || r.giorniAllArrivo > 1) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.arrivo) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.reservationId)) return null;
  return `${PAGINA_LETTERE}#lettera=${r.arrivo}~${r.reservationId}`;
}

/** Azioni secondarie, in piccolo sotto il pulsante: link di check-in, annotare l'email, aprire Slope, lettera. */
function altreAzioni(r: RigaCheckin, conSlope = true): string {
  const id = esc(r.reservationId);
  const voci: string[] = [];
  if (!r.checkinFatto && r.checkinUrl) {
    voci.push(`<button type="button" class="link link-piccolo" data-azione="copia-link" data-id="${id}">Copia link check-in</button>`);
    voci.push(`<a class="link link-piccolo" href="${esc(r.checkinUrl)}" target="_blank" rel="noopener noreferrer" title="Apre il check-in online di Slope (anche sul tablet della reception, con l'ospite al banco)">Apri check-in</a>`);
  }
  if (serveEmail(r) && !stato.emailNuove.has(r.reservationId) && stato.campoAperto !== r.reservationId) {
    voci.push(`<button type="button" class="link link-piccolo" data-azione="apri-campo" data-id="${id}" title="L'ospite ha mandato la sua email: annotala qui per non perderla">Annota email ricevuta</button>`);
  }
  if (conSlope) voci.push(apriInSlope(r, "link"));
  const lettera = linkLettera(r);
  if (lettera) voci.push(`<a class="link link-piccolo" href="${esc(lettera)}" title="Apre la lettera di benvenuto di questa camera (anteprima, nota, PIN, PDF)">Lettera di benvenuto</a>`);
  const piene = voci.filter(Boolean);
  return piene.length ? `<div class="azioni-altre">${piene.join("")}</div>` : "";
}

/** Un solo pulsante principale (verde): apre la finestra con il messaggio già scritto e «Segna inviato». */
function azioni(r: RigaCheckin): string {
  const motivo = motivoPer(r);
  const gp = statoGuestPass(r, stato.inviiGP, abbinamentiGP());
  const id = esc(r.reservationId);
  const principali =
    gp.stato === "pronto"
      ? `<button type="button" class="btn btn-primario" data-azione="invia-gp" data-id="${id}">Invia il Guest Pass</button>`
      : gp.stato === "da-generare"
        ? `${apriInSlope(r, "primario")}<button type="button" class="btn" data-azione="copia-casella" title="Destinatario da scrivere in LTS, «Invia carta d'ospite»">Copia indirizzo per LTS</button>`
        : motivo
          ? `<button type="button" class="btn btn-primario" data-azione="scrivi" data-motivo="${motivo}" data-id="${id}">${motivo === "checkin" ? "Manda il link di check-in" : "Chiedi l'email"}</button>`
          : "";
  const altre = altreAzioni(r, gp.stato !== "da-generare");
  if (!principali && !altre) return "";
  return `<div class="azioni">${principali ? `<div class="azioni-principali">${principali}</div>` : ""}${altre}</div>`;
}

function rigaContatto(r: RigaCheckin): string {
  const c = contattoAttuale(r, stato.registro);
  if (!c) return "";
  return `<p class="contattato">✓ Contattato ${esc(quandoIso(c.quando))} · ${esc(NOMI_CANALE[c.canale])}. Quando risponde: «Annota email ricevuta». <button type="button" class="link link-piccolo" data-azione="togli-contatto" data-id="${esc(r.reservationId)}">Annulla</button></p>`;
}

/** Riga completa. Con `p` (promemoria) mostra anche cosa fare e se è in ritardo. */
function riga(r: RigaCheckin, p?: Promemoria, nelGruppo = false): string {
  const contattato = Boolean(contattoAttuale(r, stato.registro));
  const ritardo = p && p.quando === "in-ritardo" ? differenzaGiorni(p.giorno, stato.oggi) : 0;
  if (p?.sollecito && p.contatto) return rigaSollecito(r, p.contatto);
  // dentro i gruppi di oggi il titolo dice già cosa fare: restano solo ritardo e arrivo di oggi
  const avvisiRiga = `${ritardo > 0 ? `<span class="ritardo">in ritardo di ${ritardo === 1 ? "1 giorno" : `${ritardo} giorni`}</span>` : ""}${
    r.giorniAllArrivo === 0 ? '<span class="ritardo">arriva oggi: fallo al banco</span>' : ""
  }`;
  const compito = !p
    ? ""
    : nelGruppo
      ? avvisiRiga
        ? `<p class="compito compito-${r.stato}">${avvisiRiga}</p>`
        : ""
      : `<p class="compito compito-${r.stato}"><b>${esc(cosaFare(r))}</b>${avvisiRiga}</p>`;
  const nuova = stato.emailNuove.get(r.reservationId);
  const conAzioni = !(nuova && confrontaConSlope(r, nuova) !== "inserita");
  return `
    <li class="riga${contattato ? " contattata" : ""}">
      <div class="col-camera"><span class="camera" title="Camera">${esc(r.camera ?? "—")}</span></div>
      ${compito}
      ${ospite(r)}
      ${segnali(r)}
      ${contatti(r)}
      ${campoEmailNuova(r)}
      ${conAzioni ? azioni(r) : ""}
      ${nuova ? "" : rigaContatto(r)}
    </li>`;
}

/** Richiesta senza risposta: telefonare. Numero in evidenza; dopo la chiamata si annota l'email o si segna «telefonato». */
function rigaSollecito(r: RigaCheckin, c: Contatto): string {
  const id = esc(r.reservationId);
  const motivo = motivoPer(r) ?? "email";
  const cosa = motivo === "checkin" ? "il check-in online (con l'email)" : "l'email";
  const giaChiamato = c.canale === "telefono";
  const chiama = r.whatsapp
    ? `<a class="btn btn-primario btn-chiama" href="tel:+${esc(r.whatsapp)}">Chiama ${esc(mostraNumero(r.whatsapp))}</a>`
    : `<span class="nota-rossa">${r.telefono ? "Numero non valido" : "Nessun telefono in Slope"}: scrivi nella chat dell'extranet o chiedi al banco.</span>`;
  return `
    <li class="riga riga-sollecito">
      <div class="col-camera"><span class="camera" title="Camera">${esc(r.camera ?? "—")}</span></div>
      <p class="compito compito-telefonare">${giaChiamato ? '<span class="ritardo">già chiamato: richiama</span>' : ""}<span>Chiedere ${esc(cosa)} · nessuna risposta alla richiesta ${esc(quandoIso(c.quando))} (${esc(NOMI_CANALE[c.canale])})</span>${
        r.giorniAllArrivo === 0 ? '<span class="ritardo">arriva oggi: chiedila al banco</span>' : ""
      }</p>
      ${ospite(r, false)}
      ${segnali(r)}
      ${contatti(r)}
      ${campoEmailNuova(r)}
      <div class="azioni">
        <div class="azioni-principali">
          ${chiama}
          <button type="button" class="btn" data-azione="segna" data-canale="telefono" data-motivo="${motivo}" data-id="${id}">Segna telefonato</button>
        </div>
        <div class="azioni-altre">
          <button type="button" class="link link-piccolo" data-azione="scrivi" data-motivo="${motivo}" data-id="${id}">Scrivi di nuovo</button>
          ${serveEmail(r) && !stato.emailNuove.has(r.reservationId) && stato.campoAperto !== r.reservationId ? `<button type="button" class="link link-piccolo" data-azione="apri-campo" data-id="${id}">Annota email ricevuta</button>` : ""}
          ${apriInSlope(r, "link")}
        </div>
      </div>
    </li>`;
}

/**
 * Email mandata dall'ospite: o il riquadro rosso lampeggiante «da inserire in Slope», o il campo per annotarla
 * (aperto), o il pulsante per aprirlo. Solo dove in Slope manca un'email diretta valida.
 */
function campoEmailNuova(r: RigaCheckin): string {
  const id = esc(r.reservationId);
  const n = stato.emailNuove.get(r.reservationId);
  if (n && stato.campoAperto !== r.reservationId) {
    const esito = confrontaConSlope(r, n);
    if (esito === "inserita") return "";
    return `<div class="nuova-email${esito === "da-inserire" ? " lampeggia" : " nuova-email-diversa"}" role="status">
      <span class="nuova-email-titolo">${esito === "da-inserire" ? "Da inserire in Slope" : "Controlla in Slope"}</span>
      <b class="nuova-email-indirizzo">${esc(n.email)}</b>
      <span class="nuova-email-nota">${
        esito === "da-inserire"
          ? `Scrivila nella scheda cliente: lampeggia finché Slope non la mostra (controllo a ogni aggiornamento).`
          : `In Slope ora c'è ${esc(r.email ?? "")}: se è sbagliata, sostituiscila con questa.`
      }</span>
      <span class="nuova-email-azioni">
        ${
          linkSlope(r)
            ? `<button type="button" class="btn btn-piccolo btn-primario" data-azione="copia-e-slope" data-id="${id}" title="Copia l'email e apre la prenotazione in Slope: incollala nella scheda cliente">Copia email e apri Slope</button>
        <button type="button" class="btn btn-piccolo" data-azione="copia-email-nuova" data-id="${id}">Copia email</button>`
            : `<button type="button" class="btn btn-piccolo btn-primario" data-azione="copia-email-nuova" data-id="${id}">Copia email</button>`
        }
        <button type="button" class="link link-piccolo" data-azione="apri-campo" data-id="${id}">Modifica</button>
        <button type="button" class="link link-piccolo" data-azione="togli-email-nuova" data-id="${id}">Rimuovi</button>
      </span>
    </div>`;
  }
  if (!serveEmail(r) && stato.campoAperto !== r.reservationId) return "";
  if (stato.campoAperto === r.reservationId) {
    const err = stato.erroreCampo;
    return `<form class="campo-email" data-id="${id}" novalidate>
      <label for="email-nuova-${id}">Email mandata dall'ospite (camera ${esc(r.camera ?? "—")})</label>
      <div class="campo-email-riga">
        <input id="email-nuova-${id}" type="email" inputmode="email" autocomplete="off" spellcheck="false" placeholder="nome@esempio.com">
        <button type="submit" class="btn btn-piccolo btn-primario">Salva</button>
        <button type="button" class="link link-piccolo" data-azione="chiudi-campo">Annulla</button>
      </div>
      ${
        err
          ? `<p class="errore" role="alert">${esc(err.errore)}${
              err.suggerita
                ? ` <button type="button" class="link" data-azione="usa-suggerita" data-id="${id}" data-email="${esc(err.suggerita)}">Usa ${esc(err.suggerita)}</button> · <button type="button" class="link" data-azione="salva-comunque" data-id="${id}">Salva com'è</button>`
                : ""
            }</p>`
          : ""
      }
    </form>`;
  }
  // il comando per annotarla è tra le azioni della riga («Annota email ricevuta»)
  return "";
}

function salvaEmailNuova(r: RigaCheckin, valore: string, forza = false): void {
  const v = validaEmailNuova(valore, forza);
  if (!v.ok) {
    stato.erroreCampo = { errore: v.errore, suggerita: v.suggerita };
    renderLista();
    const input = document.getElementById(`email-nuova-${r.reservationId}`) as HTMLInputElement | null;
    if (input) {
      input.value = valore;
      input.focus();
    }
    return;
  }
  const prima = stato.emailNuove.get(r.reservationId) ?? null;
  stato.emailNuove.set(r.reservationId, { id: r.reservationId, email: v.email, quando: new Date().toISOString(), arrivo: r.arrivo });
  salvaEmailNuove();
  stato.campoAperto = null;
  stato.erroreCampo = null;
  render();
  toast(`${r.camera ? `Camera ${r.camera}` : r.nome}: email annotata. Ora inseriscila in Slope.`, () => {
    if (prima) stato.emailNuove.set(r.reservationId, prima);
    else stato.emailNuove.delete(r.reservationId);
    salvaEmailNuove();
    render();
  });
}

// ───────────────────────── Render: viste ─────────────────────────

/**
 * Calendario dei contatti: striscia della settimana in cima, poi OGGI per primo (con tutto il lavoro del giorno,
 * diviso per tipo) e sotto i giorni seguenti, ognuno con i suoi promemoria e il pulsante per anticipare.
 */
function vistaCalendario(): string {
  const lista = promemoria(stato.righe, stato.registro, stato.oggi);
  const daInserire = emailDaInserire(stato.righe, stato.emailNuove);
  const pendenti = new Set(daInserire.map((x) => x.riga.reservationId));
  // prima le telefonate e i ritardi, poi chi arriva prima
  const peso = (p: Promemoria): number => (p.sollecito ? 0 : p.quando === "in-ritardo" ? 1 : 2);
  const daFare = daFareOggi(lista)
    .filter((p) => !pendenti.has(p.riga.reservationId))
    .sort((a, b) => peso(a) - peso(b) || a.riga.arrivo.localeCompare(b.riga.arrivo));
  const fatti = lista.filter((p) => p.contatto && !p.sollecito && !pendenti.has(p.riga.reservationId) && p.giorno <= stato.oggi);
  const futuri = lista.filter((p) => p.quando === "prossimamente" && !pendenti.has(p.riga.reservationId));
  const ultimoArrivo = stato.dati?.a ?? stato.oggi;
  const completo = calendarioCompletoFino(ultimoArrivo);
  const giorni = Array.from({ length: 7 }, (_, i) => aggiungiGiorni(stato.oggi, i));
  const gp = lavoroGuestPass();
  const contaOggi = daFare.length + daInserire.length + gp.totale;

  // striscia della settimana: un clic porta al giorno
  const fmtSett = new Intl.DateTimeFormat("it-IT", { weekday: "short", timeZone: "UTC" });
  const striscia = giorni
    .map((g, i) => {
      const n = i === 0 ? contaOggi : futuri.filter((p) => p.giorno === g).length;
      const d = new Date(`${g}T12:00:00Z`);
      return `<button type="button" class="giorno-chip${i === 0 ? " giorno-chip-oggi" : ""}${n ? " giorno-chip-pieno" : ""}${g > completo ? " giorno-chip-parziale" : ""}" data-azione="vai-giorno" data-giorno="${g}" aria-label="${esc(giornoLungo(g))}: ${n} promemoria">
        <span class="chip-sett">${i === 0 ? "Oggi" : esc(fmtSett.format(d))}</span>
        <span class="chip-num">${d.getUTCDate()}</span>
        <span class="chip-conta">${n || "–"}</span>
      </button>`;
    })
    .join("");

  const sezioneSlope = daInserire.length
    ? `<section class="gruppo gruppo-slope" aria-labelledby="g-slope">
        <div class="gruppo-testa"><h3 id="g-slope"><span class="pallino" aria-hidden="true"></span>Email da inserire in Slope <span class="conta">${daInserire.length}</span></h3>
        <p class="nota">Scrivila nella scheda cliente in Slope: esce da qui quando Slope la mostra.</p></div>
        <ul class="righe">${daInserire.map((x) => riga(x.riga)).join("")}</ul>
      </section>`
    : "";
  const lavoroOggi = daFare.length || gp.totale
    ? gruppoGuestPassPronti(gp.pronti) + gruppiOggi(daFare) + gruppoGuestPassDaGenerare(gp.daGenerare) + gruppoGuestPassDaAbbinare(gp.daAbbinare)
    : daInserire.length
      ? ""
      : `<div class="vuoto vuoto-ok"><p class="vuoto-titolo">Nessun ospite da contattare oggi.</p><p>${
          futuri[0] ? `Prossimo promemoria: ${esc(giornoLungo(futuri[0].giorno))}, camera ${esc(futuri[0].riga.camera ?? "—")}.` : "Nessun promemoria nei prossimi giorni."
        }</p></div>`;
  const giaFatti = fatti.length
    ? `<details class="gruppo gruppo-fatti" data-chiave="fatti">
        <summary><h3>Già contattati, in attesa dell'email in Slope <span class="conta">${fatti.length}</span></h3></summary>
        <ul class="righe">${fatti.map((p) => riga(p.riga, p)).join("")}</ul>
      </details>`
    : "";
  const tessereOggi = cruscotto([
    { gruppo: "g-slope", n: daInserire.length, titolo: "Email da inserire in Slope", tono: "urgente" },
    { gruppo: "g-gp", n: gp.pronti.length, titolo: "Guest Pass da inviare", tono: "pass" },
    { gruppo: "g-telefonare", n: daFare.filter((p) => p.sollecito).length, titolo: "Telefonare", tono: "urgente" },
    { gruppo: "g-link", n: daFare.filter((p) => !p.sollecito && motivoPer(p.riga) === "checkin").length, titolo: "Link di check-in", tono: "lavoro" },
    { gruppo: "g-email", n: daFare.filter((p) => !p.sollecito && motivoPer(p.riga) === "email").length, titolo: "Chiedere l'email", tono: "lavoro" },
    { gruppo: "g-gp-lts", n: perOrdine(gp.daGenerare).length, titolo: "Guest Pass da generare", tono: "attenzione" },
    ...(gp.daAbbinare.length ? [{ gruppo: "g-gp-abbina", n: gp.daAbbinare.length, titolo: "Guest Pass da abbinare", tono: "attenzione" as const }] : []),
  ]);
  const oggi = `<section class="giorno giorno-oggi" id="giorno-${stato.oggi}" aria-labelledby="t-oggi">
      <h2 id="t-oggi" class="titolo-giorno">${esc(etichettaGiornoCalendario(stato.oggi))} <span class="conta">${contaOggi}</span></h2>
      ${tessereOggi}
      ${sezioneSlope}${lavoroOggi}${giaFatti}
    </section>`;

  const voce = (p: Promemoria): string => {
    const r = p.riga;
    const aperta = stato.espansi.has(r.reservationId);
    return `<li class="voce voce-${r.stato}">
      <div class="voce-riga">
        <span class="camera camera-piccola">${esc(r.camera ?? "—")}</span>
        <span class="voce-testo"><b>${esc(r.nome)}</b><span>${esc(cosaFare(r).replace(/ \(.*\)$/, ""))} · arrivo ${esc(giorno(r.arrivo))}</span></span>
        <span class="voce-azioni">
          ${azionePrimaria(r, p, false)}
          <button type="button" class="link link-piccolo" data-azione="espandi" data-id="${esc(r.reservationId)}" aria-expanded="${aperta}">${aperta ? "Chiudi" : "Tutte le azioni"}</button>
        </span>
      </div>
      ${aperta ? `<ul class="righe voce-dettaglio">${riga(r, p)}</ul>` : ""}
    </li>`;
  };
  const seguenti = giorni
    .slice(1)
    .map((g) => {
      const voci = futuri.filter((p) => p.giorno === g);
      const parziale = g > completo;
      return `<section class="giorno${parziale ? " giorno-parziale" : ""}${voci.length ? "" : " giorno-vuoto"}" id="giorno-${g}" aria-label="${esc(giornoLungo(g))}">
        <h3>${esc(etichettaGiornoCalendario(g))} <span class="conta">${voci.length || (parziale ? "per ora nessuno" : "nessuno")}</span></h3>
        ${voci.length ? `<ul class="voci">${voci.map(voce).join("")}</ul>` : ""}
      </section>`;
    })
    .join("");

  return `
    <h2 class="sr">Calendario dei contatti</h2>
    <div class="settimana" role="group" aria-label="Settimana">${striscia}</div>
    <div class="agenda">${oggi}${seguenti}</div>`;
}

type TonoTessera = "urgente" | "lavoro" | "pass" | "attenzione";

/**
 * Il lavoro di oggi a colpo d'occhio: un numero grande per tipo, nello stesso ordine dei gruppi qui sotto.
 * Le tessere a zero restano al loro posto, spente: la reception le ritrova sempre nello stesso punto.
 */
function cruscotto(voci: readonly { gruppo: string; n: number; titolo: string; tono: TonoTessera }[]): string {
  return `<div class="cruscotto" role="group" aria-label="Lavoro di oggi">${voci
    .map((v) =>
      v.n
        ? `<button type="button" class="tile tile-${v.tono}" data-azione="vai-gruppo" data-gruppo="${v.gruppo}"><span class="tile-n">${v.n}</span><span class="tile-t">${esc(v.titolo)}</span></button>`
        : `<div class="tile tile-zero" aria-label="${esc(v.titolo)}: niente"><span class="tile-n">0</span><span class="tile-t">${esc(v.titolo)}</span></div>`,
    )
    .join("")}</div>`;
}

/** Lavoro di oggi sui Guest Pass: da inviare (arrivati e abbinati), da generare in LTS, da abbinare a mano. */
function lavoroGuestPass(): { pronti: RigaCheckin[]; daGenerare: RigaCheckin[]; daAbbinare: AbbinamentoGuestPass[]; totale: number } {
  const ab = abbinamentiGP();
  const pronti: RigaCheckin[] = [];
  const daGenerare: RigaCheckin[] = [];
  for (const r of stato.righe) {
    const g = statoGuestPass(r, stato.inviiGP, ab).stato;
    if (g === "pronto") pronti.push(r);
    else if (g === "da-generare") daGenerare.push(r);
  }
  const daAbbinare = ab.filter((a) => a.id === null);
  return { pronti, daGenerare, daAbbinare, totale: pronti.length + perOrdine(daGenerare).length + daAbbinare.length };
}

function gruppoGuestPassPronti(righe: readonly RigaCheckin[]): string {
  if (!righe.length) return "";
  return `<section class="gruppo gruppo-oggi gruppo-gp" aria-labelledby="g-gp">
    <div class="gruppo-testa"><h3 id="g-gp"><span class="pallino" aria-hidden="true"></span>Inviare il Guest Pass <span class="conta">${righe.length}</span></h3>
    <p class="nota">Pass arrivati e abbinati alla prenotazione: mandali all'ospite.</p></div>
    <ul class="righe">${righe.map((r) => riga(r)).join("")}</ul>
  </section>`;
}

/**
 * Guest Pass da generare: una voce per ordine Slope (le camere dello stesso ordine si sincronizzano da una sola pagina).
 * «Apri in Slope» porta direttamente alla prenotazione: da lì l'estensione «Slope X LTS Guest Pass».
 */
function gruppoGuestPassDaGenerare(righe: readonly RigaCheckin[]): string {
  if (!righe.length) return "";
  const ordini = perOrdine(righe);
  return `<section class="gruppo gruppo-oggi gruppo-gp-lts" aria-labelledby="g-gp-lts">
    <div class="gruppo-testa"><h3 id="g-gp-lts"><span class="pallino" aria-hidden="true"></span>Generare il Guest Pass in LTS <span class="conta">${ordini.length}</span></h3>
    <p class="nota"><b>1</b> «Apri in Slope» · <b>2</b> estensione «Slope X LTS Guest Pass» · <b>3</b> in LTS «Invia carta d'ospite» a <b>${esc(CASELLA_GUESTPASS)}</b> («Copia indirizzo»). Poi il pass compare in «Inviare il Guest Pass».</p></div>
    <ul class="voci voci-gp">${ordini
      .map((camere) => {
        const r = camere[0];
        const nomi = [...new Set(camere.map((x) => x.nome))];
        return `<li class="voce voce-tutto-ok"><div class="voce-riga">
          <span class="camera camera-piccola${camere.length > 1 ? " camera-multi" : ""}"${camere.length > 1 ? ' title="Camere dello stesso ordine"' : ""}>${esc(camere.map((x) => x.camera ?? "—").join("\u00a0· "))}</span>
          <span class="voce-testo"><b>${esc(nomi.join(", "))}</b><span>arrivo ${esc(giorno(r.arrivo))}${r.riferimento ? ` · ${esc(r.riferimento.portale ?? "Slope n.")} ${esc(r.riferimento.numero)}` : ""}${
            camere.length > 1 ? ` · ${camere.length} camere, un solo ordine` : ""
          }</span></span>
          <span class="voce-azioni">${apriInSlope(r, "primario")}<button type="button" class="btn btn-piccolo" data-azione="copia-casella">Copia indirizzo</button></span>
        </div></li>`;
      })
      .join("")}</ul>
  </section>`;
}

function gruppoGuestPassDaAbbinare(lista: readonly AbbinamentoGuestPass[]): string {
  if (!lista.length) return "";
  const opzioni = stato.righe.map((r) => `<option value="${esc(r.reservationId)}">${esc(r.camera ?? "—")} · ${esc(r.nome)} · ${esc(giorno(r.arrivo))}</option>`).join("");
  return `<section class="gruppo gruppo-oggi gruppo-gp-abbina" aria-labelledby="g-gp-abbina">
    <div class="gruppo-testa"><h3 id="g-gp-abbina"><span class="pallino" aria-hidden="true"></span>Guest Pass da abbinare <span class="conta">${lista.length}</span></h3>
    <p class="nota">Il nome non corrisponde con certezza a una prenotazione: scegli a chi vanno.</p></div>
    <ul class="voci">${lista
      .map((a) => {
        const nomi = a.email.pass.map((p) => p.nome || "senza nome").join(", ");
        const idSel = `abbina-${a.email.id}`;
        return `<li class="voce voce-email-mancante"><div class="voce-riga voce-abbina">
          <span class="voce-testo"><b>${esc(nomi)}</b><span>${a.email.pass.length === 1 ? "1 pass" : `${a.email.pass.length} pass`} · arrivati ${esc(quandoIso(a.email.ricevuta))}${a.email.firmata ? "" : ' · <span class="ritardo">mittente non verificato</span>'}</span></span>
          <span class="voce-azioni">
            <label class="sr" for="${idSel}">Prenotazione</label>
            <select id="${idSel}"><option value="">Scegli la prenotazione…</option>${opzioni}</select>
            <button type="button" class="btn btn-piccolo btn-primario" data-azione="abbina-gp" data-email="${esc(a.email.id)}">Abbina</button>
            <button type="button" class="link link-piccolo" data-azione="nascondi-gp" data-email="${esc(a.email.id)}">Nascondi</button>
          </span>
        </div></li>`;
      })
      .join("")}</ul>
  </section>`;
}

/** Le cose di oggi divise per tipo di lavoro, nell'ordine in cui farle: telefonate, link di check-in, email. */
function gruppiOggi(daFare: readonly Promemoria[]): string {
  const gruppi: { chiave: string; titolo: string; nota: string; voci: Promemoria[] }[] = [
    {
      chiave: "telefonare",
      titolo: "Telefonare",
      nota: "Nessuna risposta alla richiesta: chiama, poi «Annota email ricevuta» o «Segna telefonato».",
      voci: daFare.filter((p) => p.sollecito),
    },
    {
      chiave: "link",
      titolo: "Mandare il link di check-in",
      nota: "5 giorni prima dell'arrivo: nel modulo l'ospite inserisce la sua email.",
      voci: daFare.filter((p) => !p.sollecito && motivoPer(p.riga) === "checkin"),
    },
    {
      chiave: "email",
      titolo: "Chiedere o correggere l'email",
      nota: "3 giorni prima dell'arrivo: check-in fatto, ma senza un'email valida.",
      voci: daFare.filter((p) => !p.sollecito && motivoPer(p.riga) === "email"),
    },
  ];
  return gruppi
    .filter((g) => g.voci.length)
    .map(
      (g) => `<section class="gruppo gruppo-oggi gruppo-${g.chiave}" aria-labelledby="g-${g.chiave}">
        <div class="gruppo-testa"><h3 id="g-${g.chiave}"><span class="pallino" aria-hidden="true"></span>${esc(g.titolo)} <span class="conta">${g.voci.length}</span></h3>
        <p class="nota">${esc(g.nota)}</p></div>
        <ul class="righe">${g.voci.map((p) => riga(p.riga, p, true)).join("")}</ul>
      </section>`,
    )
    .join("");
}

/** L'azione da fare subito per un promemoria, con un clic: chiamare, scrivere, copiare l'email per Slope o annotarla. */
function azionePrimaria(r: RigaCheckin, p: Promemoria, pendente: boolean): string {
  const id = esc(r.reservationId);
  if (pendente) {
    return linkSlope(r)
      ? `<button type="button" class="btn btn-piccolo btn-primario" data-azione="copia-e-slope" data-id="${id}">Copia email e apri Slope</button>`
      : `<button type="button" class="btn btn-piccolo btn-primario" data-azione="copia-email-nuova" data-id="${id}">Copia email per Slope</button>`;
  }
  const motivo = motivoPer(r);
  if (!motivo) return "";
  if (p.sollecito) {
    return r.whatsapp
      ? `<a class="btn btn-piccolo btn-primario" href="tel:+${esc(r.whatsapp)}">Chiama ${esc(mostraNumero(r.whatsapp))}</a>`
      : `<button type="button" class="btn btn-piccolo" data-azione="scrivi" data-motivo="${motivo}" data-id="${id}">Scrivi di nuovo</button>`;
  }
  // già contattato e in attesa: quando l'ospite risponde si annota l'email
  if (p.contatto) return `<button type="button" class="btn btn-piccolo" data-azione="apri-campo" data-id="${id}">Annota email</button>`;
  return `<button type="button" class="btn btn-piccolo btn-primario" data-azione="scrivi" data-motivo="${motivo}" data-id="${id}">${motivo === "checkin" ? "Manda il link" : "Chiedi l'email"}</button>`;
}

function vistaTutte(): string {
  const c = conteggi(stato.righe);
  const tessere = ORDINE_STATI.map((s) => {
    const attivo = stato.filtro === s;
    return `<button type="button" class="tessera tessera-${s}${attivo ? " attiva" : ""}" data-azione="filtro" data-stato="${s}" aria-pressed="${attivo}">
      <span class="tessera-numero">${c[s]}</span>
      <span class="tessera-titolo">${esc(ETICHETTE_STATO[s].breve)}</span>
    </button>`;
  }).join("");
  const trovate = cerca(stato.righe, stato.cerca);
  const visibili = stato.filtro === "tutti" ? trovate : trovate.filter((r) => r.stato === stato.filtro);
  const gruppi = visibili.length
    ? ORDINE_STATI.filter((s) => visibili.some((r) => r.stato === s))
        .map((s) => {
          const lista = visibili.filter((r) => r.stato === s);
          return `
        <section class="gruppo gruppo-${s}" aria-labelledby="g-${s}">
          <div class="gruppo-testa">
            <h3 id="g-${s}"><span class="pallino" aria-hidden="true"></span>${esc(ETICHETTE_STATO[s].titolo)} <span class="conta">${lista.length}</span></h3>
            <p class="nota">${esc(ETICHETTE_STATO[s].spiegazione)}</p>
          </div>
          <ul class="righe">${lista.map((r) => riga(r)).join("")}</ul>
        </section>`;
        })
        .join("")
    : `<div class="vuoto"><p class="vuoto-titolo">${stato.cerca ? "Nessun ospite corrisponde alla ricerca." : `Nessuna prenotazione in «${esc(ETICHETTE_STATO[stato.filtro as StatoRiga].breve)}».`}</p></div>`;
  return `<div class="tessere">${tessere}</div>
    ${stato.filtro !== "tutti" ? '<p class="sintesi"><button type="button" class="link" data-azione="filtro" data-stato="tutti">Mostra tutte</button></p>' : ""}
    ${gruppi}`;
}

function renderLista(): void {
  const box = $("#lista");
  const strumenti = $("#strumenti");
  strumenti.hidden = !(pronta() && stato.vista === "tutte" && stato.righe.length > 0);
  const aperti = new Set([...box.querySelectorAll<HTMLDetailsElement>("details[data-chiave][open]")].map((d) => d.dataset.chiave));
  if (stato.caricamento === "attesa" || (stato.caricamento === "in-corso" && !stato.dati)) {
    box.innerHTML = '<div class="vuoto"><p class="vuoto-titolo">Leggo gli arrivi dello Chalet Hartmann…</p></div>';
    return;
  }
  if (stato.caricamento === "password") {
    box.innerHTML = `
      <form class="sblocco" id="form-sblocco" autocomplete="on">
        <p class="titolo-linea"><span>Accesso reception</span></p>
        <label class="etichetta-campo" for="sblocco-pw">Password reception</label>
        <input id="sblocco-pw" type="password" autocomplete="current-password" required>
        ${stato.erroreSblocco ? `<p class="errore" role="alert">${esc(stato.erroreSblocco)}</p>` : ""}
        <button class="btn btn-primario btn-largo" type="submit"><svg class="icona" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>Apri</button>
        <p class="nota-centro">È la stessa delle lettere di benvenuto e degli avvisi arrivo. Su questo computer basta inserirla una volta.</p>
      </form>`;
    window.setTimeout(() => (document.getElementById("sblocco-pw") as HTMLInputElement | null)?.focus(), 30);
    return;
  }
  if (stato.caricamento === "errore" && stato.errore) {
    box.innerHTML = `<div class="vuoto vuoto-errore"><p class="vuoto-titolo">${esc(stato.errore.titolo)}</p><p>${esc(stato.errore.dettaglio)}</p><button type="button" class="btn btn-primario" data-azione="riprova">Riprova</button></div>`;
    return;
  }
  if (!stato.righe.length) {
    box.innerHTML = '<div class="vuoto vuoto-ok"><p class="vuoto-titolo">Nessun arrivo confermato nei prossimi giorni.</p><p>Le nuove prenotazioni compaiono con l\'aggiornamento orario da Slope.</p></div>';
    return;
  }
  // il campo «email mandata dall'ospite» non perde quello che si sta scrivendo quando la pagina si aggiorna
  const scritto = stato.campoAperto ? (document.getElementById(`email-nuova-${stato.campoAperto}`) as HTMLInputElement | null) : null;
  const valore = scritto?.value ?? null;
  const fuoco = scritto !== null && document.activeElement === scritto;
  box.innerHTML = stato.vista === "oggi" ? vistaCalendario() : vistaTutte();
  if (stato.campoAperto && valore !== null) {
    const nuovo = document.getElementById(`email-nuova-${stato.campoAperto}`) as HTMLInputElement | null;
    if (nuovo) {
      nuovo.value = valore;
      if (fuoco) nuovo.focus();
    }
  }
  for (const chiave of aperti) {
    const d = box.querySelector<HTMLDetailsElement>(`details[data-chiave="${chiave}"]`);
    if (d) d.open = true;
  }
}

function render(): void {
  renderTesta();
  renderAvvisi();
  renderSchede();
  renderLista();
}

// ───────────────────────── Finestra «Scrivi all'ospite» ─────────────────────────

const NOMI_LINGUA: Readonly<Record<Lingua, string>> = { de: "Deutsch", it: "Italiano", en: "English" };
const NOMI_CANALE_MSG: Readonly<Record<CanaleMsg, string>> = { email: "Email", whatsapp: "WhatsApp", testo: "Extranet / altro" };

function canaliPer(r: RigaCheckin): CanaleMsg[] {
  const c: CanaleMsg[] = [];
  if (r.email || r.inoltroPortale || stato.emailNuove.has(r.reservationId)) c.push("email");
  if (r.whatsapp) c.push("whatsapp");
  c.push("testo");
  return c;
}

/** Email diretta → email; altrimenti WhatsApp; altrimenti l'inoltro del portale; altrimenti testo da copiare. */
function canaleIniziale(r: RigaCheckin): CanaleMsg {
  if (r.email || stato.emailNuove.has(r.reservationId)) return "email";
  if (r.whatsapp) return "whatsapp";
  if (r.inoltroPortale) return "email";
  return "testo";
}

function dialogo(): HTMLDialogElement {
  return document.getElementById("composer") as HTMLDialogElement;
}

/** Il messaggio a comparsa può stare dentro la finestra: va rimesso nella pagina prima di riscriverla o chiuderla. */
function rimettiToast(): void {
  const t = document.getElementById("toast");
  if (t && t.parentElement !== document.body) document.body.appendChild(t);
}

function apriComposer(r: RigaCheckin, motivo: Motivo, guestpass: Composer["guestpass"] = null): void {
  stato.composer = { id: r.reservationId, motivo, guestpass, canale: canaleIniziale(r), lingua: r.lingua };
  renderComposer();
  const d = dialogo();
  if (!d.open) {
    try {
      d.showModal();
    } catch {
      d.setAttribute("open", "");
    }
  }
}

function chiudiComposer(): void {
  stato.composer = null;
  rimettiToast();
  const d = dialogo();
  if (d.open) d.close();
  d.innerHTML = "";
}

function renderComposer(): void {
  const d = dialogo();
  const c = stato.composer;
  const r = c ? trova(c.id) : undefined;
  if (!c || !r) {
    if (c) chiudiComposer();
    return;
  }
  const rl: RigaCheckin = { ...r, lingua: c.lingua };
  const m = messaggioComposer(rl, c);
  const canali = canaliPer(r);
  if (!canali.includes(c.canale)) c.canale = canali[0];
  const schede = canali
    .map(
      (k) =>
        `<button type="button" role="tab" class="scheda${k === c.canale ? " attiva" : ""}" aria-selected="${k === c.canale}" data-azione="canale" data-canale="${k}">${NOMI_CANALE_MSG[k]}</button>`,
    )
    .join("");
  const lingue = (["de", "it", "en"] as const).map((l) => `<option value="${l}"${l === c.lingua ? " selected" : ""}>${NOMI_LINGUA[l]}</option>`).join("");
  // «e/o»: dopo l'email si può mandare lo stesso messaggio anche su WhatsApp (e viceversa), poi si segna una volta sola
  const anche = (k: "email" | "whatsapp"): string =>
    canali.includes(k)
      ? `<li><button type="button" class="btn" data-azione="canale" data-canale="${k}">${k === "whatsapp" ? "Manda anche su WhatsApp" : "Manda anche per email"}</button>
          <span class="aiuto">Facoltativo: stesso testo e stesso link personale.</span></li>`
      : "";
  let corpo = "";
  if (c.canale === "email") {
    const a = r.email ?? (c.guestpass ? stato.emailNuove.get(r.reservationId)?.email : undefined) ?? r.inoltroPortale ?? "";
    // senza corpo: il testo con il pulsante si incolla dagli appunti
    const posta = a ? linkEmail(programmaEmail(), [a], m.oggetto, "") : "";
    corpo = `
      <dl class="msg-campi">
        <div><dt>A</dt><dd>${esc(a)}${
          r.email ? "" : ` <span class="badge badge-portale badge-lungo">inoltro ${esc(r.controlloEmail.portale ?? "del portale")}: arriva solo se spedisci da info@alpstay.eu</span>`
        }</dd></div>
        <div><dt>Oggetto</dt><dd>${esc(m.oggetto)}</dd></div>
      </dl>
      <p class="msg-etichetta">Testo che riceve l'ospite</p>
      <div class="anteprima-email" id="anteprima-msg">${m.html}</div>
      <ol class="msg-passi">
        <li><a class="btn btn-primario" href="${esc(posta)}" target="_blank" rel="noopener" data-azione="copia-e-apri">Copia il testo e apri l'email</a>
          <span class="aiuto">Si apre l'email con destinatario e oggetto già scritti: clicca nel corpo e premi <kbd>Ctrl</kbd>+<kbd>V</kbd>. Arriva questo testo, con il pulsante ${c.guestpass ? "GUEST PASS" : "START"}.</span></li>
        ${anche("whatsapp")}
        <li><button type="button" class="btn btn-conferma" data-azione="segna-inviato">Segna inviata</button></li>
      </ol>
      <p class="aiuto">Se l'incolla non porta il testo: <button type="button" class="link" data-azione="copia-anteprima">copia di nuovo il testo</button>.</p>`;
  } else if (c.canale === "whatsapp") {
    const wa = r.whatsapp ? `https://wa.me/${r.whatsapp}?text=${encodeURIComponent(m.whatsapp)}` : "";
    corpo = `
      <dl class="msg-campi"><div><dt>A</dt><dd>${esc(mostraNumero(r.whatsapp ?? ""))}</dd></div></dl>
      <p class="msg-etichetta">Messaggio WhatsApp</p>
      <div class="anteprima-testo">${esc(m.whatsapp).replace(/\*([^*\n]+)\*/g, "<b>$1</b>")}</div>
      <ol class="msg-passi">
        <li><a class="btn btn-primario" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">Apri WhatsApp con il messaggio</a>
          <span class="aiuto">Su WhatsApp il link non si può nascondere: compare dopo ${c.guestpass ? "GUEST PASS" : "START"}, in grassetto.</span></li>
        ${anche("email")}
        <li><button type="button" class="btn btn-conferma" data-azione="segna-inviato">Segna inviato</button></li>
      </ol>`;
  } else {
    corpo = `
      <p class="msg-etichetta">Testo da copiare (chat dell'extranet di Booking.com o Expedia, SMS…)</p>
      <div class="anteprima-testo">${esc(m.testo)}</div>
      <ol class="msg-passi">
        <li><button type="button" class="btn btn-primario" data-azione="copia-testo-composer">Copia il testo</button></li>
        <li><button type="button" class="btn btn-conferma" data-azione="segna-inviato">Segna inviato</button></li>
      </ol>`;
  }
  const t = document.getElementById("toast");
  const toastDentro = t !== null && t.parentElement === d;
  rimettiToast();
  d.innerHTML = `
    <div class="composer">
      <div class="composer-testa">
        <span class="camera camera-piccola">${esc(r.camera ?? "—")}</span>
        <div class="composer-titolo">
          <h2 id="composer-titolo">${c.guestpass ? "Guest Pass" : c.motivo === "checkin" ? "Link di check-in" : "Richiesta dell'email"} · ${esc(r.nome)}</h2>
          <span class="nota">${r.riferimento ? `${esc(r.riferimento.portale ?? "Slope n.")} ${esc(r.riferimento.numero)} · ` : ""}arrivo ${esc(giorno(r.arrivo))}</span>
        </div>
        <button type="button" class="btn btn-piccolo" data-azione="chiudi-composer">Chiudi</button>
      </div>
      <div class="composer-barra">
        <div class="schede-msg" role="tablist" aria-label="Canale">${schede}</div>
        <label class="composer-lingua">Lingua <select id="composer-lingua">${lingue}</select></label>
      </div>
      ${
        c.guestpass
          ? `<p class="${c.guestpass.sicura ? "aiuto" : "avviso avviso-gp"}">${c.guestpass.sicura ? "" : "<strong>Controlla il nome.</strong> "}Pass nell'email della casella: <b>${esc(c.guestpass.pass.map((p) => p.nome || "senza nome").join(", "))}</b>.</p>`
          : ""
      }
      ${corpo}
      <p class="composer-piede"${c.guestpass ? " hidden" : ""}><button type="button" class="link link-piccolo" data-azione="segna-voce">Fatto a voce o al banco: segna contattato</button></p>
    </div>`;
  if (toastDentro && t) d.appendChild(t);
}

/** Messaggio della finestra: Guest Pass (testi della pagina avvisi/) oppure link di check-in / richiesta dell'email. */
function messaggioComposer(r: RigaCheckin, c: Composer) {
  return c.guestpass ? messaggioGuestPass(r, c.lingua, c.guestpass.pass) : messaggio(r, c.motivo);
}

/** Copia l'anteprima come testo formattato (con il link START): selezione + copia, che funziona anche senza permessi. */
function copiaAnteprima(): boolean {
  const el = document.getElementById("anteprima-msg");
  const sel = window.getSelection();
  if (!el || !sel) return false;
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  sel.removeAllRanges();
  return ok;
}

// ───────────────────────── Eventi ─────────────────────────

function trova(id: string | undefined): RigaCheckin | undefined {
  return id ? stato.righe.find((r) => r.reservationId === id) : undefined;
}

function collegaEventi(): void {
  document.getElementById("aggiorna")?.addEventListener("click", () => void carica());

  document.addEventListener("change", (ev) => {
    const el = ev.target as HTMLElement;
    if (el.id === "composer-lingua" && stato.composer) {
      const v = (el as HTMLSelectElement).value;
      if (v === "de" || v === "it" || v === "en") {
        stato.composer.lingua = v;
        renderComposer();
      }
    }
  });
  dialogo()?.addEventListener("close", () => {
    stato.composer = null;
  });

  const campoCerca = document.getElementById("cerca") as HTMLInputElement | null;
  campoCerca?.addEventListener("input", () => {
    stato.cerca = campoCerca.value;
    renderLista();
  });

  document.addEventListener("submit", (ev) => {
    const form = ev.target as HTMLElement;
    if (form.classList.contains("campo-email")) {
      ev.preventDefault();
      const r = trova(form.dataset.id);
      const input = form.querySelector<HTMLInputElement>("input");
      if (r && input) salvaEmailNuova(r, input.value);
      return;
    }
    if (form.id !== "form-sblocco") return;
    ev.preventDefault();
    const pw = (document.getElementById("sblocco-pw") as HTMLInputElement | null)?.value ?? "";
    if (pw) void carica(pw);
  });

  document.addEventListener("click", (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-azione]");
    if (!el) return;
    const azione = el.dataset.azione;
    const r = trova(el.dataset.id);
    const motivo = el.dataset.motivo === "email" ? "email" : "checkin";
    switch (azione) {
      case "riprova":
        void carica();
        break;
      case "vista": {
        const v = el.dataset.vista as Vista | undefined;
        if (v && VISTE.includes(v)) {
          stato.vista = v;
          sessione(K_VISTA, v);
          render();
        }
        break;
      }
      case "filtro": {
        const s = el.dataset.stato as Filtro | undefined;
        stato.filtro = s && s !== stato.filtro ? s : "tutti";
        stato.vista = "tutte";
        sessione(K_FILTRO, stato.filtro);
        sessione(K_VISTA, stato.vista);
        render();
        break;
      }
      case "copia-link":
        if (r?.checkinUrl) {
          void copia(r.checkinUrl).then((ok) => toast(ok ? `Link di check-in copiato${r.camera ? ` (camera ${r.camera})` : ""}.` : "Copia non riuscita: usa «Apri» e copia l'indirizzo."));
        }
        break;
      case "scrivi":
        if (r) apriComposer(r, motivo);
        break;
      case "canale": {
        const k = el.dataset.canale as CanaleMsg | undefined;
        if (stato.composer && k) {
          stato.composer.canale = k;
          renderComposer();
        }
        break;
      }
      case "chiudi-composer":
        chiudiComposer();
        break;
      case "copia-e-apri":
        // il link mailto si apre da sé: qui si copia, subito, il testo con il pulsante START
        toast(copiaAnteprima() ? "Testo copiato: nell'email clicca nel corpo e premi Ctrl+V." : "Copia non riuscita: seleziona il testo nella finestra e premi Ctrl+C.");
        break;
      case "copia-anteprima":
        toast(copiaAnteprima() ? "Testo copiato con il pulsante START." : "Copia non riuscita: seleziona il testo e premi Ctrl+C.");
        break;
      case "copia-testo-composer": {
        const c = stato.composer;
        const rc = c ? trova(c.id) : undefined;
        if (c && rc) void copia(messaggioComposer({ ...rc, lingua: c.lingua }, c).testo).then((ok) => toast(ok ? "Testo copiato." : "Copia non riuscita."));
        break;
      }
      case "segna-inviato":
      case "segna-voce": {
        const c = stato.composer;
        const rc = c ? trova(c.id) : undefined;
        if (c && rc) {
          chiudiComposer();
          if (c.guestpass) {
            segnaGuestPassInviato(rc, c.guestpass, c.canale === "whatsapp" ? "whatsapp" : "email");
            break;
          }
          const canale: Canale = azione === "segna-voce" ? "altro" : c.canale;
          segnaContatto(rc, c.motivo, canale);
        }
        break;
      }
      case "invia-gp": {
        const a = r ? abbinamentiGP().find((x) => x.id === r.reservationId) : undefined;
        if (r && a) apriComposer(r, motivoPer(r) ?? "email", { emailId: a.email.id, pass: a.email.pass, sicura: a.sicura });
        break;
      }
      case "copia-casella":
        void copia(CASELLA_GUESTPASS).then((ok) => toast(ok ? `${CASELLA_GUESTPASS} copiato: incollalo in LTS come destinatario.` : "Copia non riuscita."));
        break;
      case "abbina-gp": {
        const emailId = el.dataset.email ?? "";
        const sel = document.getElementById(`abbina-${emailId}`) as HTMLSelectElement | null;
        if (!sel?.value) {
          toast("Scegli prima la prenotazione.");
          break;
        }
        stato.scelteGP.set(emailId, sel.value);
        render();
        const rr = trova(sel.value);
        toast(`Guest Pass abbinato${rr?.camera ? ` alla camera ${rr.camera}` : ""}: ora è in «Inviare il Guest Pass».`);
        break;
      }
      case "nascondi-gp": {
        const emailId = el.dataset.email ?? "";
        if (!emailId) break;
        stato.gestiteGP.set(emailId, new Date().toISOString());
        scriviJson(K_GUESTPASS_EMAIL_GESTITE, [...stato.gestiteGP.entries()]);
        render();
        toast("Email del Guest Pass nascosta.", () => {
          stato.gestiteGP.delete(emailId);
          scriviJson(K_GUESTPASS_EMAIL_GESTITE, [...stato.gestiteGP.entries()]);
          render();
        });
        break;
      }
      case "segna":
        if (r) segnaContatto(r, motivo, el.dataset.canale === "telefono" ? "telefono" : "altro");
        break;
      case "togli-contatto":
        if (el.dataset.id) togliContatto(el.dataset.id);
        break;
      case "vai-gruppo": {
        const titolo = el.dataset.gruppo ? document.getElementById(el.dataset.gruppo) : null;
        const dest = titolo?.closest("section") ?? titolo;
        if (dest) dest.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
        break;
      }
      case "vai-giorno": {
        const g = el.dataset.giorno;
        const dest = g ? document.getElementById(`giorno-${g}`) : null;
        if (dest) dest.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
        break;
      }
      case "espandi":
        if (r) {
          if (stato.espansi.has(r.reservationId)) stato.espansi.delete(r.reservationId);
          else stato.espansi.add(r.reservationId);
          renderLista();
        }
        break;
      case "apri-campo":
        if (r) {
          stato.espansi.add(r.reservationId); // nel calendario il campo è nella riga completa
          stato.campoAperto = r.reservationId;
          stato.erroreCampo = null;
          renderLista();
          const input = document.getElementById(`email-nuova-${r.reservationId}`) as HTMLInputElement | null;
          if (input) {
            input.value = stato.emailNuove.get(r.reservationId)?.email ?? r.controlloEmail.suggerita ?? "";
            input.focus();
          }
        }
        break;
      case "chiudi-campo":
        stato.campoAperto = null;
        stato.erroreCampo = null;
        renderLista();
        break;
      case "usa-suggerita":
        if (r && el.dataset.email) salvaEmailNuova(r, el.dataset.email);
        break;
      case "salva-comunque":
        if (r) salvaEmailNuova(r, (document.getElementById(`email-nuova-${r.reservationId}`) as HTMLInputElement | null)?.value ?? "", true);
        break;
      case "copia-email-nuova": {
        const n = el.dataset.id ? stato.emailNuove.get(el.dataset.id) : undefined;
        if (n) void copia(n.email).then((ok) => toast(ok ? `${n.email} copiata: incollala nella scheda cliente in Slope.` : "Copia non riuscita: seleziona l'indirizzo e premi Ctrl+C."));
        break;
      }
      case "copia-e-slope": {
        // prima la copia (finché questa pagina ha il fuoco), poi la scheda di Slope nello stesso clic (o il browser la blocca)
        const id = el.dataset.id;
        const n = id ? stato.emailNuove.get(id) : undefined;
        const r = id ? stato.righe.find((x) => x.reservationId === id) : undefined;
        const url = r ? linkSlope(r) : null;
        const copiata = n ? copiaSubito(n.email) : false;
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        if (n) toast(copiata ? `${n.email} copiata: in Slope incollala nella scheda cliente (Ctrl+V).` : "Copia non riuscita: torna qui, premi «Copia email» e poi incollala in Slope.");
        break;
      }
      case "togli-email-nuova": {
        const id = el.dataset.id;
        const prima = id ? stato.emailNuove.get(id) : undefined;
        if (id && prima) {
          stato.emailNuove.delete(id);
          salvaEmailNuove();
          render();
          toast("Email annotata rimossa.", () => {
            stato.emailNuove.set(id, prima);
            salvaEmailNuove();
            render();
          });
        }
        break;
      }
      case "blocca":
        fonte.dimentica();
        stato.dati = null;
        stato.righe = [];
        void carica();
        break;
    }
  });
}

// ───────────────────────── Avvio ─────────────────────────

export async function avvia(f: Fonte): Promise<void> {
  fonte = f;
  const vista = sessione(K_VISTA);
  if (vista && (VISTE as readonly string[]).includes(vista)) stato.vista = vista as Vista;
  const filtro = sessione(K_FILTRO);
  if (filtro && (filtro === "tutti" || (ORDINE_STATI as readonly string[]).includes(filtro))) stato.filtro = filtro as Filtro;
  caricaRegistro();
  caricaEmailNuove();
  caricaRegistriGP();
  if (f.esempiContatti && stato.registro.size === 0) {
    for (const c of f.esempiContatti) stato.registro.set(c.id, c);
  }
  if (f.esempiEmailNuove && stato.emailNuove.size === 0) {
    for (const n of f.esempiEmailNuove) stato.emailNuove.set(n.id, n);
  }
  collegaEventi();
  render();
  await carica();
  // Ogni 10 minuti, e al ritorno sulla scheda, si rilegge il file (l'aggiornamento da Slope è orario).
  let ultimo = Date.now();
  let ultimoGP = Date.now();
  const forse = (): void => {
    if (document.visibilityState !== "visible" || stato.caricamento === "in-corso" || stato.caricamento === "password") return;
    if (Date.now() - ultimo < AGGIORNA_OGNI_MS) {
      // i Guest Pass della casella si controllano più spesso (il workflow parte appena arriva un pass, con l'avviso dalla Gmail)
      if (stato.caricamento === "ok" && Date.now() - ultimoGP >= AGGIORNA_GP_OGNI_MS) {
        ultimoGP = Date.now();
        caricaRegistriGP();
        void aggiornaCasella().then(render);
      }
      return;
    }
    ultimo = ultimoGP = Date.now();
    caricaRegistro();
    caricaEmailNuove();
    void carica();
  };
  window.setInterval(forse, 60_000);
  document.addEventListener("visibilitychange", forse);
}
