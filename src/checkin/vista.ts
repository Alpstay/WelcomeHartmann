/**
 * Check-in online & email · Chalet Hotel Hartmann — interfaccia della reception (comune a pagina vera e prova).
 * La fonte dei dati arriva da fuori: app.ts legge ../arrivi.json cifrato, prova.ts usa ospiti inventati.
 *
 * Tre viste: «Da fare oggi» (i promemoria arrivati: check-in da fare 5 giorni prima dell'arrivo, email mancante o
 * da correggere 3 giorni prima), «Calendario» (i promemoria dei prossimi giorni) e «Tutte» (le prenotazioni per stato).
 *
 * Sul computer (localStorage): solo il registro «contattato» (id Slope, motivo, canale, data), cancellato 14 giorni
 * dopo l'arrivo. Email, telefoni e link di check-in restano in memoria, mai salvati.
 * Regola: gli ID ricevuti da Slope non vengono mai modificati.
 */
import type { AvvisoItem } from "../feed";
import type { FreshnessStatus } from "../types";
import type { Programma } from "../avvisi/testi";
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
type Vista = "oggi" | "calendario" | "tutte";
const VISTE: readonly Vista[] = ["oggi", "calendario", "tutte"];

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

/** Gli appunti accettano l'HTML (Chrome, Edge, Safari): l'email si apre senza testo e si incolla quello con START. */
const appuntiHtml = (): boolean => typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function";

function copiaHtml(html: string, testo: string): Promise<boolean> {
  try {
    return navigator.clipboard
      .write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([testo], { type: "text/plain" }) })])
      .then(() => true)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
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
  const conta: Record<Vista, string> = {
    oggi: String(oggi),
    calendario: String(lista.filter((p) => p.quando === "prossimamente").length),
    tutte: String(stato.righe.length),
  };
  const nomi: Record<Vista, string> = { oggi: "Da fare oggi", calendario: "Calendario", tutte: "Tutte le prenotazioni" };
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

function azioni(r: RigaCheckin): string {
  const motivo = motivoPer(r);
  if (!motivo) return "";
  const id = esc(r.reservationId);
  const wa = linkWhatsapp(r, motivo);
  const posta = linkPosta(r, motivo, programmaEmail(), !appuntiHtml());
  const etichetta = motivo === "checkin" ? "link check-in" : "chiedi email";
  // Con l'email diretta si scrive per email; altrimenti WhatsApp, se il numero è plausibile.
  const emailPrima = r.controlloEmail.tipo === "diretta" || r.controlloEmail.tipo === "sospetta";
  const viaPortale = !r.email && r.inoltroPortale;
  const bWa = wa
    ? `<a class="btn btn-piccolo${emailPrima ? "" : " btn-primario"}" href="${esc(wa)}" target="_blank" rel="noopener noreferrer" data-azione="apri" data-canale="whatsapp" data-motivo="${motivo}" data-id="${id}">WhatsApp · ${etichetta}</a>`
    : "";
  const bPosta = posta
    ? `<a class="btn btn-piccolo${emailPrima || !wa ? " btn-primario" : ""}" href="${esc(posta)}" target="_blank" rel="noopener" data-azione="apri" data-canale="email" data-motivo="${motivo}" data-id="${id}"${
        viaPortale ? ` title="Arriva all'ospite solo se spedisci da info@alpstay.eu (indirizzo registrato in ${esc(r.controlloEmail.portale ?? "extranet")})"` : ""
      }>${viaPortale ? `Email via ${esc(r.controlloEmail.portale ?? "portale")}` : "Email"} · ${etichetta}</a>`
    : "";
  return `<div class="azioni">
    ${emailPrima ? bPosta + bWa : bWa + bPosta}
    <button type="button" class="link link-piccolo" data-azione="copia-testo" data-motivo="${motivo}" data-id="${id}" title="Testo nella lingua dell'ospite, da incollare per esempio nella chat dell'extranet">Copia testo</button>
    <button type="button" class="link link-piccolo" data-azione="segna" data-motivo="${motivo}" data-id="${id}">Segna contattato</button>
  </div>`;
}

function rigaContatto(r: RigaCheckin): string {
  const c = contattoAttuale(r, stato.registro);
  if (!c) return "";
  return `<p class="contattato">✓ Contattato ${esc(quandoIso(c.quando))} · ${esc(NOMI_CANALE[c.canale])}. Quando l'ospite risponde, annota qui sotto la sua email. <button type="button" class="link link-piccolo" data-azione="togli-contatto" data-id="${esc(r.reservationId)}">Annulla</button></p>`;
}

/** Riga completa. Con `p` (promemoria) mostra anche cosa fare e se è in ritardo. */
function riga(r: RigaCheckin, p?: Promemoria): string {
  const contattato = Boolean(contattoAttuale(r, stato.registro));
  const lingua = r.linguaSlope && r.linguaSlope !== r.lingua ? `${r.linguaSlope.toUpperCase()}→${r.lingua.toUpperCase()}` : r.lingua.toUpperCase();
  const ritardo = p && p.quando === "in-ritardo" ? differenzaGiorni(p.giorno, stato.oggi) : 0;
  if (p?.sollecito && p.contatto) return rigaSollecito(r, p.contatto);
  const compito = p
    ? `<p class="compito compito-${r.stato}"><span class="pallino" aria-hidden="true"></span><b>${esc(cosaFare(r))}</b>${
        ritardo > 0 ? ` <span class="ritardo">in ritardo di ${ritardo === 1 ? "1 giorno" : `${ritardo} giorni`}</span>` : ""
      }${r.giorniAllArrivo === 0 ? ' <span class="ritardo">arriva oggi: fallo al banco</span>' : ""}</p>`
    : "";
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
    ? `<a class="btn btn-piccolo btn-primario btn-chiama" href="tel:+${esc(r.whatsapp)}" data-azione="apri" data-canale="telefono" data-motivo="${motivo}" data-id="${id}">Chiama ${esc(mostraNumero(r.whatsapp))}</a>`
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
        ${r.whatsapp ? "" : `<button type="button" class="link link-piccolo" data-azione="copia-testo" data-motivo="${motivo}" data-id="${id}" title="Per la chat dell'extranet">Copia testo</button>`}
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
      <p class="nota">Check-in online da fare: si scrive <b>5 giorni prima</b> dell'arrivo. Check-in fatto ma email mancante o da correggere: <b>3 giorni prima</b>. Senza risposta si <b>telefona</b> (dopo 2 giorni per il check-in, dopo 1 giorno per l'email). Ogni ora la pagina rilegge Slope: chi ha inserito un'email valida esce da solo dalla lista.</p>
    </div>`;
  const vuoto = !daFare.length
    ? `<div class="vuoto vuoto-ok"><p class="vuoto-titolo">Nessun ospite da contattare oggi.</p><p>${
        prossimo ? `Prossimo promemoria: ${esc(giornoLungo(prossimo.giorno))}, camera ${esc(prossimo.riga.camera ?? "—")}.` : "Nessun promemoria nei prossimi giorni."
      }</p></div>`
    : `<section class="gruppo gruppo-oggi" aria-label="Da contattare oggi"><ul class="righe">${daFare.map((p) => riga(p.riga, p)).join("")}</ul></section>`;
  const giaFatti = fatti.length
    ? `<details class="gruppo gruppo-fatti" data-chiave="fatti">
        <summary><h3>Già contattati, in attesa dell'email in Slope <span class="conta">${fatti.length}</span></h3></summary>
        <ul class="righe">${fatti.map((p) => riga(p.riga, p)).join("")}</ul>
      </details>`
    : "";
  return testa + sezioneSlope + vuoto + giaFatti;
}

function vistaCalendario(): string {
  const d = stato.dati;
  const lista = promemoria(stato.righe, stato.registro, stato.oggi);
  const pendenti = new Set(emailDaInserire(stato.righe, stato.emailNuove).map((x) => x.riga.reservationId));
  const ultimoArrivo = d?.a ?? stato.oggi;
  const completo = calendarioCompletoFino(ultimoArrivo);
  const giorni = Array.from({ length: 7 }, (_, i) => aggiungiGiorni(stato.oggi, i));
  const voce = (p: Promemoria): string => {
    const r = p.riga;
    const ritardo = p.quando === "in-ritardo" ? differenzaGiorni(p.giorno, stato.oggi) : 0;
    return `<li class="voce voce-${p.sollecito ? "telefonare" : r.stato}${p.contatto && !p.sollecito ? " voce-fatta" : ""}">
      <span class="camera camera-piccola">${esc(r.camera ?? "—")}</span>
      <span class="voce-testo"><b>${esc(r.nome)}</b><span>${
        pendenti.has(r.reservationId)
          ? '<b class="telefonare">Inserire in Slope</b> l\'email annotata'
          : p.sollecito
            ? '<b class="telefonare">Telefonare</b>: nessuna risposta'
            : esc(cosaFare(r).replace(/ \(.*\)$/, ""))
      } · arrivo ${esc(giorno(r.arrivo))}${ritardo > 0 && !pendenti.has(r.reservationId) ? ` · <span class="ritardo">in ritardo</span>` : ""}</span></span>
      <span class="voce-esito${p.contatto && !p.sollecito ? "" : " voce-esito-aperta"}">${
        pendenti.has(r.reservationId) || p.sollecito ? "" : p.contatto ? `✓ ${esc(NOMI_CANALE[p.contatto.canale])}` : p.quando === "prossimamente" ? "" : "da fare"
      }</span>
    </li>`;
  };
  const colonne = giorni
    .map((g) => {
      const voci = lista.filter((p) => (g === stato.oggi ? p.quando !== "prossimamente" : p.giorno === g));
      const parziale = g > completo;
      return `<section class="giorno${g === stato.oggi ? " giorno-oggi" : ""}${parziale ? " giorno-parziale" : ""}" aria-label="${esc(giornoLungo(g))}">
        <h3>${esc(etichettaGiornoCalendario(g))} <span class="conta">${voci.length}</span></h3>
        ${voci.length ? `<ul class="voci">${voci.map(voce).join("")}</ul>` : `<p class="nota">${parziale ? "Nessun promemoria per ora." : "Nessun promemoria."}</p>`}
      </section>`;
    })
    .join("");
  return `<div class="vista-testa"><h2>Calendario dei contatti</h2><p class="nota">Il giorno in cui attivare la corrispondenza per ogni prenotazione da sistemare. Oggi comprende anche i promemoria in ritardo e le telefonate. I promemoria «link check-in» sono completi fino a ${esc(giorno(completo))}: per i giorni dopo arrivano con le prenotazioni oltre il ${esc(giorno(ultimoArrivo))}.</p></div><div class="calendario">${colonne}</div>`;
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
  box.innerHTML = stato.vista === "oggi" ? vistaOggi() : stato.vista === "calendario" ? vistaCalendario() : vistaTutte();
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

// ───────────────────────── Eventi ─────────────────────────

function trova(id: string | undefined): RigaCheckin | undefined {
  return id ? stato.righe.find((r) => r.reservationId === id) : undefined;
}

function collegaEventi(): void {
  document.getElementById("aggiorna")?.addEventListener("click", () => void carica());

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
      case "copia-testo":
        if (r) {
          void copia(messaggio(r, motivo).testo).then((ok) => {
            if (ok) segnaContatto(r, motivo, "testo");
            else toast("Copia non riuscita.");
          });
        }
        break;
      case "apri":
        // il link si apre da sé; qui si registra il contatto (annullabile) e, per l'email, si copia il testo con START
        if (r && el.dataset.canale === "email" && appuntiHtml()) {
          const m = messaggio(r, motivo);
          void copiaHtml(m.html, m.testo).then((ok) =>
            ok
              ? toast("Testo copiato con il pulsante START: nella nuova email clicca nel testo e premi Ctrl+V.")
              : toast("Copia non riuscita: usa «Copia testo» e incollalo nell'email."),
          );
          segnaContatto(r, motivo, "email");
          break;
        }
        if (r) segnaContatto(r, motivo, el.dataset.canale === "email" ? "email" : el.dataset.canale === "telefono" ? "telefono" : "whatsapp");
        break;
      case "segna":
        if (r) segnaContatto(r, motivo, el.dataset.canale === "telefono" ? "telefono" : "altro");
        break;
      case "togli-contatto":
        if (el.dataset.id) togliContatto(el.dataset.id);
        break;
      case "apri-campo":
        if (r) {
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
