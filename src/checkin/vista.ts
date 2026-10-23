/**
 * Check-in online & email · Chalet Hotel Hartmann — interfaccia della reception (comune a pagina vera e prova).
 * La fonte dei dati arriva da fuori: app.ts legge ../arrivi.json cifrato, prova.ts usa ospiti inventati.
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
  ETICHETTE_STATO,
  ORDINE_STATI,
  aggiungiGiorni,
  cerca,
  contattoAttuale,
  conteggi,
  linkPosta,
  linkWhatsapp,
  messaggio,
  motivoPer,
  oggiRoma,
  registroValido,
  righeDa,
} from "./regole";
import type { Canale, Contatto, Motivo, RigaCheckin, StatoRiga } from "./regole";

// ───────────────────────── Fonte dei dati ─────────────────────────

export interface Dati {
  readonly righe: readonly AvvisoItem[];
  /** primo e ultimo giorno coperti dal file */
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
}

// ───────────────────────── Stato ─────────────────────────

type Filtro = StatoRiga | "tutti";

interface Stato {
  caricamento: "attesa" | "in-corso" | "ok" | "errore" | "password";
  errore: { titolo: string; dettaglio: string } | null;
  erroreSblocco: string | null;
  dati: Dati | null;
  righe: RigaCheckin[];
  oggi: string;
  filtro: Filtro;
  cerca: string;
  registro: Map<string, Contatto>;
  archivioOk: boolean;
}

const K_REGISTRO = "checkinHartmann.contatti";
const K_FILTRO = "checkinHartmann.filtro";
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
  filtro: "tutti",
  cerca: "",
  registro: new Map(),
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

function caricaRegistro(): void {
  stato.registro = registroValido(leggiJson<unknown>(K_REGISTRO, []), stato.oggi);
}

function salvaRegistro(): void {
  scriviJson(K_REGISTRO, [...stato.registro.values()]);
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
const fmtOra = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const fmtGiornoOra = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ });

const giorno = (iso: string): string => fmtGiorno.format(new Date(`${iso}T12:00:00Z`));

function quandoArriva(n: number): string {
  if (n <= 0) return "oggi";
  if (n === 1) return "domani";
  return `tra ${n} giorni`;
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

const NOMI_CANALE: Readonly<Record<Canale, string>> = { whatsapp: "WhatsApp", email: "email", testo: "testo copiato", altro: "a voce o altro" };

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

// ───────────────────────── Render ─────────────────────────

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
  if (!stato.archivioOk) {
    out.push(`<div class="avviso"><strong>Questo browser non salva i dati.</strong> <span>Il registro «contattato» si perde chiudendo la pagina: non usare la navigazione privata.</span></div>`);
  }
  box.innerHTML = out.join("");
}

function renderStati(): void {
  const box = $("#stati");
  const strumenti = $("#strumenti");
  if (stato.caricamento !== "ok" && !(stato.caricamento === "in-corso" && stato.dati)) {
    box.innerHTML = "";
    strumenti.hidden = true;
    return;
  }
  strumenti.hidden = false;
  const c = conteggi(stato.righe);
  const daFare = stato.righe.filter((r) => r.stato !== "tutto-ok");
  const contattati = daFare.filter((r) => contattoAttuale(r, stato.registro)).length;
  const tessere = ORDINE_STATI.map((s) => {
    const attivo = stato.filtro === s;
    return `<button type="button" class="tessera tessera-${s}${attivo ? " attiva" : ""}" data-azione="filtro" data-stato="${s}" aria-pressed="${attivo}">
      <span class="tessera-numero">${c[s]}</span>
      <span class="tessera-titolo">${esc(ETICHETTE_STATO[s].breve)}</span>
    </button>`;
  }).join("");
  const totale = stato.righe.length;
  box.innerHTML = `
    <div class="tessere">${tessere}</div>
    <p class="sintesi">
      <span><b>${totale}</b> ${totale === 1 ? "prenotazione" : "prenotazioni"} in arrivo · <b>${daFare.length}</b> da sistemare${contattati ? ` (${contattati} già contattate)` : ""}</span>
      ${stato.filtro !== "tutti" ? '<button type="button" class="link" data-azione="filtro" data-stato="tutti">Mostra tutti</button>' : ""}
    </p>`;
}

function badgeEmail(r: RigaCheckin): string {
  const e = r.controlloEmail;
  if (e.tipo === "mancante") return '<span class="badge badge-no">nessuna email</span>';
  if (e.tipo === "portale") return `<span class="badge badge-portale" title="Indirizzo di inoltro del portale: non è l'email dell'ospite">${esc(e.portale ?? "portale")}</span>`;
  if (e.tipo === "sospetta") return `<span class="badge badge-portale" title="Il dominio sembra scritto male">forse ${esc(e.suggerita ?? "")}</span>`;
  return '<span class="badge badge-ok">diretta</span>';
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

function azioni(r: RigaCheckin): string {
  const motivo = motivoPer(r);
  if (!motivo) return "";
  const id = esc(r.reservationId);
  const wa = linkWhatsapp(r, motivo);
  const posta = linkPosta(r, motivo, programmaEmail());
  const etichetta = motivo === "checkin" ? "link check-in" : "chiedi email";
  // Con l'email diretta si scrive per email; altrimenti WhatsApp, se il numero è plausibile.
  const emailPrima = r.controlloEmail.tipo === "diretta";
  const bWa = wa
    ? `<a class="btn btn-piccolo${emailPrima ? "" : " btn-primario"}" href="${esc(wa)}" target="_blank" rel="noopener noreferrer" data-azione="apri" data-canale="whatsapp" data-motivo="${motivo}" data-id="${id}">WhatsApp · ${etichetta}</a>`
    : "";
  const bPosta = posta
    ? `<a class="btn btn-piccolo${emailPrima || !wa ? " btn-primario" : ""}" href="${esc(posta)}" target="_blank" rel="noopener" data-azione="apri" data-canale="email" data-motivo="${motivo}" data-id="${id}"${
        r.controlloEmail.tipo === "portale" ? ` title="Arriva all'ospite solo se spedisci da info@alpstay.eu (indirizzo registrato in ${esc(r.controlloEmail.portale ?? "extranet")})"` : ""
      }>Email · ${etichetta}</a>`
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
  return `<p class="contattato">✓ Contattato ${esc(quandoIso(c.quando))} · ${esc(NOMI_CANALE[c.canale])}. In attesa che l'ospite risponda e che l'email arrivi in Slope. <button type="button" class="link link-piccolo" data-azione="togli-contatto" data-id="${esc(r.reservationId)}">Annulla</button></p>`;
}

function riga(r: RigaCheckin): string {
  const contattato = Boolean(contattoAttuale(r, stato.registro));
  const lingua = r.linguaSlope && r.linguaSlope !== r.lingua ? `${r.linguaSlope.toUpperCase()}→${r.lingua.toUpperCase()}` : r.lingua.toUpperCase();
  return `
    <li class="riga${contattato ? " contattata" : ""}">
      <div class="col-camera"><span class="camera" title="Camera">${esc(r.camera ?? "—")}</span></div>
      <div class="col-ospite">
        <span class="nome">${esc(r.nome)}</span>
        <span class="date"><span class="tra tra-${Math.min(r.giorniAllArrivo, 2)}">${esc(quandoArriva(r.giorniAllArrivo))}</span> ${esc(giorno(r.arrivo))} → ${esc(giorno(r.partenza))} · ${r.notti === 1 ? "1 notte" : `${r.notti} notti`}</span>
      </div>
      <div class="col-contatti">
        <span class="campo-riga"><span class="etichetta">Email</span>${r.email ? `<span class="email">${esc(r.email)}</span>` : ""} ${badgeEmail(r)}</span>
        <span class="campo-riga"><span class="etichetta">Tel.</span>${cellaTelefono(r)} <span class="codice" title="Lingua dei messaggi (Slope → testo)">${esc(lingua)}</span></span>
      </div>
      <div class="col-checkin"><span class="etichetta">Check-in online</span>${cellaCheckin(r)}</div>
      ${azioni(r)}
      ${rigaContatto(r)}
    </li>`;
}

function renderLista(): void {
  const box = $("#lista");
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
  const trovate = cerca(stato.righe, stato.cerca);
  const visibili = stato.filtro === "tutti" ? trovate : trovate.filter((r) => r.stato === stato.filtro);
  if (!visibili.length) {
    box.innerHTML = `<div class="vuoto"><p class="vuoto-titolo">${stato.cerca ? "Nessun ospite corrisponde alla ricerca." : `Nessuna prenotazione in «${esc(ETICHETTE_STATO[stato.filtro as StatoRiga].breve)}».`}</p></div>`;
    return;
  }
  box.innerHTML = ORDINE_STATI.filter((s) => visibili.some((r) => r.stato === s))
    .map((s) => {
      const lista = visibili.filter((r) => r.stato === s);
      return `
        <section class="gruppo gruppo-${s}" aria-labelledby="g-${s}">
          <div class="gruppo-testa">
            <h2 id="g-${s}"><span class="pallino" aria-hidden="true"></span>${esc(ETICHETTE_STATO[s].titolo)} <span class="conta">${lista.length}</span></h2>
            <p class="nota">${esc(ETICHETTE_STATO[s].spiegazione)}</p>
          </div>
          <ul class="righe">${lista.map(riga).join("")}</ul>
        </section>`;
    })
    .join("");
}

function render(): void {
  renderTesta();
  renderAvvisi();
  renderStati();
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
      case "filtro": {
        const s = el.dataset.stato as Filtro | undefined;
        stato.filtro = s && s !== stato.filtro ? s : "tutti";
        try {
          sessionStorage.setItem(K_FILTRO, stato.filtro);
        } catch {
          /* niente */
        }
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
        // il link si apre da sé (target _blank); qui si registra solo il contatto, annullabile
        if (r) segnaContatto(r, motivo, el.dataset.canale === "email" ? "email" : "whatsapp");
        break;
      case "segna":
        if (r) segnaContatto(r, motivo, "altro");
        break;
      case "togli-contatto":
        if (el.dataset.id) togliContatto(el.dataset.id);
        break;
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
  try {
    const salvato = sessionStorage.getItem(K_FILTRO);
    if (salvato && (salvato === "tutti" || (ORDINE_STATI as readonly string[]).includes(salvato))) stato.filtro = salvato as Filtro;
  } catch {
    /* niente */
  }
  caricaRegistro();
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
    void carica();
  };
  window.setInterval(forse, 60_000);
  document.addEventListener("visibilitychange", forse);
}
