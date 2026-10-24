/**
 * Check-in online & email · Chalet Hotel Hartmann — interfaccia della reception (comune a pagina vera e prova).
 * La fonte dei dati arriva da fuori: app.ts legge ../arrivi.json cifrato, prova.ts usa ospiti inventati.
 *
 * Tre viste: «Da fare oggi» (i promemoria arrivati: check-in da fare 5 giorni prima dell'arrivo, email mancante o
 * da correggere 3 giorni prima; sotto, i promemoria dei prossimi giorni) e «Tutte» (le prenotazioni per stato).
 *
 * Sul computer (localStorage): solo il registro «contattato» (id Slope, motivo, canale, data), cancellato 14 giorni
 * dopo l'arrivo. Email, telefoni e link di check-in restano in memoria, mai salvati.
 * Regola: gli ID ricevuti da Slope non vengono mai modificati.
 */
import type { AvvisoItem } from "../feed";
import type { FreshnessStatus } from "../types";
import type { Lingua, Programma } from "../avvisi/testi";
import { mostraNumero } from "../avvisi/testi";
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
  linkPosta,
  linkWhatsapp,
  messaggio,
  motivoPer,
  oggiRoma,
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
}

// ───────────────────────── Stato ─────────────────────────

type Filtro = StatoRiga | "tutti";
/** Canale del messaggio nella finestra «Scrivi all'ospite». «testo» = da copiare (chat dell'extranet, altro). */
type CanaleMsg = "email" | "whatsapp" | "testo";
interface Composer {
  /** reservation_id di Slope, invariato */
  readonly id: string;
  readonly motivo: Motivo;
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
  const oggi = daFareOggi(lista).filter((p) => !pendenti.has(p.riga.reservationId)).length + pendenti.size;
  const conta: Record<Vista, string> = { oggi: String(oggi), tutte: String(stato.righe.length) };
  const nomi: Record<Vista, string> = { oggi: "Da fare oggi", tutte: "Tutte le prenotazioni" };
  nav.innerHTML = VISTE.map(
    (v) =>
      `<button type="button" role="tab" class="scheda${stato.vista === v ? " attiva" : ""}${v === "oggi" && oggi > 0 ? " urgente" : ""}" aria-selected="${stato.vista === v}" data-azione="vista" data-vista="${v}">${esc(nomi[v])} <span class="scheda-conta">${conta[v]}</span></button>`,
  ).join("");
}

// ───────────────────────── Render: parti di una riga ─────────────────────────

function cellaEmail(r: RigaCheckin): string {
  const e = r.controlloEmail;
  if (e.tipo === "portale") {
    return `<span class="badge badge-no" title="Indirizzo di inoltro del portale: non vale come email dell'ospite">nessuna email</span> <span class="inoltro" title="Inoltro ${esc(e.portale ?? "")}: si può usare per scrivere, da info@alpstay.eu">inoltro ${esc(e.portale ?? "portale")}</span>`;
  }
  if (e.tipo === "mancante") return '<span class="badge badge-no">nessuna email</span>';
  const badge =
    e.tipo === "sospetta"
      ? `<span class="badge badge-portale" title="Il dominio sembra scritto male">forse ${esc(e.suggerita ?? "")}</span>`
      : '<span class="badge badge-ok">diretta</span>';
  return `<span class="email">${esc(r.email ?? "")}</span> ${badge}`;
}

function cellaTelefono(r: RigaCheckin): string {
  if (!r.telefono) return '<span class="vuoto-campo">nessun telefono</span>';
  const mostrato = r.whatsapp ? mostraNumero(r.whatsapp) : r.telefono;
  const tel = r.whatsapp ? `+${r.whatsapp}` : r.telefono.replace(/[^\d+]/g, "");
  return `<a class="tel" href="tel:${esc(tel)}">${esc(mostrato)}</a>${r.whatsapp ? "" : ' <span class="badge badge-portale" title="Numero segnaposto del portale o senza prefisso internazionale: WhatsApp non disponibile">da controllare</span>'}`;
}

function cellaCheckin(r: RigaCheckin): string {
  if (r.checkinFatto) return '<span class="esito esito-ok">✓ fatto</span>';
  if (!r.checkinUrl) return '<span class="esito esito-no">da fare</span> <span class="badge badge-no" title="Slope non ha fornito il link personale">senza link</span>';
  return `<span class="esito esito-no">da fare</span>
    <span class="link-checkin">
      <button type="button" class="btn btn-piccolo" data-azione="copia-link" data-id="${esc(r.reservationId)}">Copia link</button>
      <a class="btn btn-piccolo" href="${esc(r.checkinUrl)}" target="_blank" rel="noopener noreferrer" title="Apre il check-in online di Slope (anche sul tablet della reception, con l'ospite al banco)">Apri</a>
    </span>`;
}

function rif(r: RigaCheckin): string {
  if (!r.riferimento) return "";
  return `<span class="rif" title="Numero della prenotazione: va anche nell'oggetto delle email">${esc(r.riferimento.portale ?? "Slope n.")} ${esc(r.riferimento.numero)}</span>`;
}

/** Un solo pulsante: apre la finestra con il messaggio già scritto, i canali disponibili e «Segna inviato». */
function azioni(r: RigaCheckin): string {
  const motivo = motivoPer(r);
  if (!motivo) return "";
  return `<div class="azioni">
    <button type="button" class="btn btn-piccolo btn-primario" data-azione="scrivi" data-motivo="${motivo}" data-id="${esc(r.reservationId)}">${
      motivo === "checkin" ? "Manda il link di check-in" : "Chiedi l'email"
    }</button>
  </div>`;
}

function rigaContatto(r: RigaCheckin): string {
  const c = contattoAttuale(r, stato.registro);
  if (!c) return "";
  return `<p class="contattato">✓ Contattato ${esc(quandoIso(c.quando))} · ${esc(NOMI_CANALE[c.canale])}. Quando l'ospite risponde, annota qui sotto la sua email. <button type="button" class="link link-piccolo" data-azione="togli-contatto" data-id="${esc(r.reservationId)}">Annulla</button></p>`;
}

/** Riga completa. Con `p` (promemoria) mostra anche cosa fare e se è in ritardo. */
function riga(r: RigaCheckin, p?: Promemoria, nelGruppo = false): string {
  const contattato = Boolean(contattoAttuale(r, stato.registro));
  const lingua = r.linguaSlope && r.linguaSlope !== r.lingua ? `${r.linguaSlope.toUpperCase()}→${r.lingua.toUpperCase()}` : r.lingua.toUpperCase();
  const ritardo = p && p.quando === "in-ritardo" ? differenzaGiorni(p.giorno, stato.oggi) : 0;
  if (p?.sollecito && p.contatto) return rigaSollecito(r, p.contatto);
  // dentro i gruppi di «Da fare oggi» il titolo dice già cosa fare: restano solo ritardo e arrivo di oggi
  const avvisiRiga = `${ritardo > 0 ? ` <span class="ritardo">in ritardo di ${ritardo === 1 ? "1 giorno" : `${ritardo} giorni`}</span>` : ""}${
    r.giorniAllArrivo === 0 ? ' <span class="ritardo">arriva oggi: fallo al banco</span>' : ""
  }`;
  const compito = !p
    ? ""
    : nelGruppo
      ? avvisiRiga
        ? `<p class="compito compito-${r.stato}">${avvisiRiga}</p>`
        : ""
      : `<p class="compito compito-${r.stato}"><span class="pallino" aria-hidden="true"></span><b>${esc(cosaFare(r))}</b>${avvisiRiga}</p>`;
  return `
    <li class="riga${contattato ? " contattata" : ""}">
      <div class="col-camera"><span class="camera" title="Camera">${esc(r.camera ?? "—")}</span></div>
      ${compito}
      <div class="col-ospite">
        <span class="nome">${esc(r.nome)}</span>
        <span class="date"><span class="tra tra-${Math.min(r.giorniAllArrivo, 2)}">${esc(quandoArriva(r.giorniAllArrivo))}</span> ${esc(giorno(r.arrivo))} → ${esc(giorno(r.partenza))} · ${r.notti === 1 ? "1 notte" : `${r.notti} notti`}</span>
        ${rif(r)}
      </div>
      <div class="col-contatti">
        <span class="campo-riga"><span class="etichetta">Email</span>${cellaEmail(r)}</span>
        <span class="campo-riga"><span class="etichetta">Tel.</span>${cellaTelefono(r)} <span class="codice" title="Lingua dei messaggi (Slope → testo)">${esc(lingua)}</span></span>
      </div>
      <div class="col-checkin"><span class="etichetta">Check-in online</span>${cellaCheckin(r)}</div>
      ${campoEmailNuova(r)}
      ${stato.emailNuove.has(r.reservationId) && confrontaConSlope(r, stato.emailNuove.get(r.reservationId)!) !== "inserita" ? "" : azioni(r)}
      ${stato.emailNuove.has(r.reservationId) ? "" : rigaContatto(r)}
    </li>`;
}

/** Richiesta senza risposta: telefonare. Numero in evidenza; dopo la chiamata si annota l'email o si segna «telefonato». */
function rigaSollecito(r: RigaCheckin, c: Contatto): string {
  const id = esc(r.reservationId);
  const motivo = motivoPer(r) ?? "email";
  const cosa = motivo === "checkin" ? "il check-in online (con l'email)" : "l'email";
  const giaChiamato = c.canale === "telefono";
  const chiama = r.whatsapp
    ? `<a class="btn btn-piccolo btn-primario btn-chiama" href="tel:+${esc(r.whatsapp)}">Chiama ${esc(mostraNumero(r.whatsapp))}</a>`
    : r.telefono
      ? '<span class="badge badge-no badge-lungo" title="Numero segnaposto del portale o senza prefisso internazionale">numero non valido: scrivi nella chat dell\'extranet o chiedi al banco</span>'
      : '<span class="badge badge-no badge-lungo">nessun telefono in Slope: scrivi nella chat dell\'extranet o chiedi al banco</span>';
  return `
    <li class="riga riga-sollecito">
      <div class="col-camera"><span class="camera" title="Camera">${esc(r.camera ?? "—")}</span></div>
      <p class="compito compito-telefonare"><span class="pallino" aria-hidden="true"></span><b>${giaChiamato ? "Telefonare di nuovo" : "Telefonare"}</b> <span>nessuna risposta: chiedere ${esc(cosa)} · richiesta ${esc(quandoIso(c.quando))} via ${esc(NOMI_CANALE[c.canale])}</span>${
        r.giorniAllArrivo === 0 ? ' <span class="ritardo">arriva oggi: chiedila al banco</span>' : ""
      }</p>
      <div class="col-ospite">
        <span class="nome">${esc(r.nome)}</span>
        <span class="date"><span class="tra tra-${Math.min(r.giorniAllArrivo, 2)}">${esc(quandoArriva(r.giorniAllArrivo))}</span> ${esc(giorno(r.arrivo))} → ${esc(giorno(r.partenza))}</span>
        ${rif(r)}
      </div>
      <div class="col-contatti">
        <span class="campo-riga"><span class="etichetta">Email</span>${cellaEmail(r)}</span>
        <span class="campo-riga"><span class="etichetta">Tel.</span>${cellaTelefono(r)}</span>
      </div>
      <div class="col-checkin"><span class="etichetta">Check-in online</span>${cellaCheckin(r)}</div>
      ${campoEmailNuova(r)}
      <div class="azioni">
        ${chiama}
        <button type="button" class="btn btn-piccolo" data-azione="segna" data-canale="telefono" data-motivo="${motivo}" data-id="${id}">Segna telefonato</button>
        <button type="button" class="btn btn-piccolo" data-azione="scrivi" data-motivo="${motivo}" data-id="${id}">Scrivi di nuovo</button>
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
        <button type="button" class="btn btn-piccolo btn-primario" data-azione="copia-email-nuova" data-id="${id}">Copia email</button>
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
  return `<button type="button" class="link link-piccolo aggiungi-email" data-azione="apri-campo" data-id="${id}">+ Annota l'email mandata dall'ospite</button>`;
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

function vistaOggi(): string {
  const lista = promemoria(stato.righe, stato.registro, stato.oggi);
  const daInserire = emailDaInserire(stato.righe, stato.emailNuove);
  const pendenti = new Set(daInserire.map((x) => x.riga.reservationId));
  // prima le telefonate e i ritardi, poi chi arriva prima
  const peso = (p: Promemoria): number => (p.sollecito ? 0 : p.quando === "in-ritardo" ? 1 : 2);
  const daFare = daFareOggi(lista)
    .filter((p) => !pendenti.has(p.riga.reservationId))
    .sort((a, b) => peso(a) - peso(b) || a.riga.arrivo.localeCompare(b.riga.arrivo));
  const fatti = lista.filter((p) => p.contatto && !p.sollecito && !pendenti.has(p.riga.reservationId) && p.giorno <= stato.oggi);
  const sezioneSlope = daInserire.length
    ? `<section class="gruppo gruppo-slope" aria-labelledby="g-slope">
        <div class="gruppo-testa"><h3 id="g-slope"><span class="pallino" aria-hidden="true"></span>Email da inserire in Slope <span class="conta">${daInserire.length}</span></h3>
        <p class="nota">L'ospite ha mandato la sua email: scrivila nella scheda cliente in Slope. Esce da qui quando l'aggiornamento orario la trova in Slope.</p></div>
        <ul class="righe">${daInserire.map((x) => riga(x.riga)).join("")}</ul>
      </section>`
    : "";
  const prossimo = lista.find((p) => p.quando === "prossimamente");
  const testa = `
    <div class="vista-testa">
      <h2>${esc(etichettaGiornoCalendario(stato.oggi))}</h2>
      <p class="nota">Check-in online da fare: si scrive <b>5 giorni prima</b> dell'arrivo. Check-in fatto ma email mancante o da correggere: <b>3 giorni prima</b>. Senza risposta si <b>telefona</b> (dopo 2 giorni per il check-in, dopo 1 giorno per l'email). Ogni ora la pagina rilegge Slope: chi ha inserito un'email valida esce da solo dalla lista. In fondo, i promemoria dei prossimi giorni.</p>
    </div>`;
  const vuoto = !daFare.length
    ? `<div class="vuoto vuoto-ok"><p class="vuoto-titolo">Nessun ospite da contattare oggi.</p><p>${
        prossimo ? `Prossimo promemoria: ${esc(giornoLungo(prossimo.giorno))}, camera ${esc(prossimo.riga.camera ?? "—")}.` : "Nessun promemoria nei prossimi giorni."
      }</p></div>`
    : gruppiOggi(daFare);
  const giaFatti = fatti.length
    ? `<details class="gruppo gruppo-fatti" data-chiave="fatti">
        <summary><h3>Già contattati, in attesa dell'email in Slope <span class="conta">${fatti.length}</span></h3></summary>
        <ul class="righe">${fatti.map((p) => riga(p.riga, p)).join("")}</ul>
      </details>`
    : "";
  return testa + sezioneSlope + vuoto + giaFatti + prossimiGiorni(lista, pendenti);
}

/** Le cose di oggi divise per tipo di lavoro, nell'ordine in cui farle: telefonate, link di check-in, email. */
function gruppiOggi(daFare: readonly Promemoria[]): string {
  const gruppi: { chiave: string; titolo: string; nota: string; voci: Promemoria[] }[] = [
    {
      chiave: "telefonare",
      titolo: "Telefonare",
      nota: "Richieste rimaste senza risposta. Dopo la chiamata annota l'email o segna «telefonato».",
      voci: daFare.filter((p) => p.sollecito),
    },
    {
      chiave: "link",
      titolo: "Mandare il link di check-in",
      nota: "5 giorni prima dell'arrivo. Nel modulo di Slope l'ospite inserisce la sua email.",
      voci: daFare.filter((p) => !p.sollecito && motivoPer(p.riga) === "checkin"),
    },
    {
      chiave: "email",
      titolo: "Chiedere o correggere l'email",
      nota: "3 giorni prima dell'arrivo, per chi ha fatto il check-in senza un'email valida.",
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
  if (pendente) return `<button type="button" class="btn btn-piccolo btn-primario" data-azione="copia-email-nuova" data-id="${id}">Copia email per Slope</button>`;
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

/**
 * Prossimi giorni, sotto le cose di oggi: solo i promemoria futuri, giorno per giorno, ognuno con il suo pulsante
 * (si può anticipare) e «Tutte le azioni» per la riga completa. I giorni senza promemoria non compaiono.
 */
function prossimiGiorni(lista: readonly Promemoria[], pendenti: ReadonlySet<string>): string {
  const ultimoArrivo = stato.dati?.a ?? stato.oggi;
  const completo = calendarioCompletoFino(ultimoArrivo);
  const futuri = lista.filter((p) => p.quando === "prossimamente" && !pendenti.has(p.riga.reservationId));
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
  const giorni = [...new Set(futuri.map((p) => p.giorno))].sort();
  const sezioni = giorni
    .map((g) => {
      const voci = futuri.filter((p) => p.giorno === g);
      return `<section class="giorno" aria-label="${esc(giornoLungo(g))}">
        <h4>${esc(etichettaGiornoCalendario(g))} <span class="conta">${voci.length}</span></h4>
        <ul class="voci">${voci.map(voce).join("")}</ul>
      </section>`;
    })
    .join("");
  return `<section class="prossimi" aria-labelledby="g-prossimi">
    <div class="gruppo-testa"><h3 id="g-prossimi">Prossimi giorni <span class="conta">${futuri.length}</span></h3>
    <p class="nota">${
      futuri.length ? "Si può anticipare con il pulsante della riga. " : "Nessun promemoria per ora. "
    }I promemoria «link di check-in» sono completi fino a ${esc(giorno(completo))}: per i giorni dopo arrivano con le prenotazioni oltre il ${esc(giorno(ultimoArrivo))}.</p></div>
    ${sezioni ? `<div class="agenda">${sezioni}</div>` : ""}
  </section>`;
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
      <form class="vuoto sblocco" id="form-sblocco" autocomplete="on">
        <p class="vuoto-titolo">Password reception</p>
        <p>È la stessa delle lettere di benvenuto e degli avvisi arrivo. Su questo computer basta inserirla una volta.</p>
        <div class="riga-sblocco">
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
  box.innerHTML = stato.vista === "oggi" ? vistaOggi() : vistaTutte();
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
  if (r.email || r.inoltroPortale) c.push("email");
  if (r.whatsapp) c.push("whatsapp");
  c.push("testo");
  return c;
}

/** Email diretta → email; altrimenti WhatsApp; altrimenti l'inoltro del portale; altrimenti testo da copiare. */
function canaleIniziale(r: RigaCheckin): CanaleMsg {
  if (r.email) return "email";
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

function apriComposer(r: RigaCheckin, motivo: Motivo): void {
  stato.composer = { id: r.reservationId, motivo, canale: canaleIniziale(r), lingua: r.lingua };
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
  const m = messaggio(rl, c.motivo);
  const canali = canaliPer(r);
  if (!canali.includes(c.canale)) c.canale = canali[0];
  const schede = canali
    .map(
      (k) =>
        `<button type="button" role="tab" class="scheda${k === c.canale ? " attiva" : ""}" aria-selected="${k === c.canale}" data-azione="canale" data-canale="${k}">${NOMI_CANALE_MSG[k]}</button>`,
    )
    .join("");
  const lingue = (["de", "it", "en"] as const).map((l) => `<option value="${l}"${l === c.lingua ? " selected" : ""}>${NOMI_LINGUA[l]}</option>`).join("");
  let corpo = "";
  if (c.canale === "email") {
    const a = r.email ?? r.inoltroPortale ?? "";
    const posta = linkPosta(rl, c.motivo, programmaEmail(), false) ?? "";
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
          <span class="aiuto">Si apre l'email con destinatario e oggetto già scritti: clicca nel corpo e premi <kbd>Ctrl</kbd>+<kbd>V</kbd>. Arriva questo testo, con il pulsante START.</span></li>
        <li><button type="button" class="btn btn-conferma" data-azione="segna-inviato">Segna inviata</button></li>
      </ol>
      <p class="aiuto">Se l'incolla non porta il testo: <button type="button" class="link" data-azione="copia-anteprima">copia di nuovo il testo</button>.</p>`;
  } else if (c.canale === "whatsapp") {
    const wa = linkWhatsapp(rl, c.motivo) ?? "";
    corpo = `
      <dl class="msg-campi"><div><dt>A</dt><dd>${esc(mostraNumero(r.whatsapp ?? ""))}</dd></div></dl>
      <p class="msg-etichetta">Messaggio WhatsApp</p>
      <div class="anteprima-testo">${esc(m.whatsapp).replace(/\*([^*\n]+)\*/g, "<b>$1</b>")}</div>
      <ol class="msg-passi">
        <li><a class="btn btn-primario" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">Apri WhatsApp con il messaggio</a>
          <span class="aiuto">Su WhatsApp il link non si può nascondere: compare dopo START, in grassetto.</span></li>
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
          <h2 id="composer-titolo">${c.motivo === "checkin" ? "Link di check-in" : "Richiesta dell'email"} · ${esc(r.nome)}</h2>
          <span class="nota">${r.riferimento ? `${esc(r.riferimento.portale ?? "Slope n.")} ${esc(r.riferimento.numero)} · ` : ""}arrivo ${esc(giorno(r.arrivo))}</span>
        </div>
        <button type="button" class="btn btn-piccolo" data-azione="chiudi-composer">Chiudi</button>
      </div>
      <div class="composer-barra">
        <div class="schede-msg" role="tablist" aria-label="Canale">${schede}</div>
        <label class="composer-lingua">Lingua <select id="composer-lingua">${lingue}</select></label>
      </div>
      ${corpo}
      <p class="composer-piede"><button type="button" class="link link-piccolo" data-azione="segna-voce">Fatto a voce o al banco: segna contattato</button></p>
    </div>`;
  if (toastDentro && t) d.appendChild(t);
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
        if (c && rc) void copia(messaggio({ ...rc, lingua: c.lingua }, c.motivo).testo).then((ok) => toast(ok ? "Testo copiato." : "Copia non riuscita."));
        break;
      }
      case "segna-inviato":
      case "segna-voce": {
        const c = stato.composer;
        const rc = c ? trova(c.id) : undefined;
        if (c && rc) {
          const canale: Canale = azione === "segna-voce" ? "altro" : c.canale;
          chiudiComposer();
          segnaContatto(rc, c.motivo, canale);
        }
        break;
      }
      case "segna":
        if (r) segnaContatto(r, motivo, el.dataset.canale === "telefono" ? "telefono" : "altro");
        break;
      case "togli-contatto":
        if (el.dataset.id) togliContatto(el.dataset.id);
        break;
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
  const forse = (): void => {
    if (document.visibilityState !== "visible" || stato.caricamento === "in-corso" || stato.caricamento === "password") return;
    if (Date.now() - ultimo < AGGIORNA_OGNI_MS) return;
    ultimo = Date.now();
    caricaRegistro();
    caricaEmailNuove();
    void carica();
  };
  window.setInterval(forse, 60_000);
  document.addEventListener("visibilitychange", forse);
}
