/**
 * Prova dei testi pre-arrivo (pagina artifact per la direzione): mostra email e WhatsApp esattamente come li riceve
 * l'ospite, con gli stessi testi e la stessa composizione della pagina avvisi/ (testi.ts), e permette di mandarli a sé.
 * Nessun dato di ospiti: il link di check-in è un esempio oppure quello di una prenotazione di prova incollato a mano.
 */
import { TESTI_PREDEFINITI, RE_CHECKIN_SLOPE, componi, senzaGrassetto, linkEmail, numeroWhatsapp, mostraNumero, linkArrivoPer } from "./testi";
import type { Lingua, Membro } from "./testi";

type Scenario = "una" | "camere" | "fatto" | "mano";

interface Stato {
  lingua: Lingua;
  scenario: Scenario;
  checkin: string;
  email: string;
  telefono: string;
}

const ESEMPIO_CHECKIN =
  "https://booking.slope.it/g/00000000-0000-4000-8000-0000000000aa/c6055fa5-edaa-4b8f-a518-541322f3ac1e/reservations/00000000-0000-4000-8000-000000000001/check-in";
const MAX_MAILTO = 2000;
const CHIAVE = "provaTestiAvvisi";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const SCENARI: Readonly<Record<Scenario, string>> = {
  una: "Una camera, check-in da fare",
  camere: "Due camere, stesso intestatario",
  fatto: "Check-in online già fatto",
  mano: "Ospite aggiunto a mano",
};

function leggi(): Stato {
  const base: Stato = { lingua: "de", scenario: "una", checkin: "", email: "", telefono: "" };
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE) ?? "null") as Partial<Stato> | null;
    if (!v) return base;
    return {
      lingua: v.lingua === "it" || v.lingua === "en" ? v.lingua : "de",
      scenario: v.scenario && v.scenario in SCENARI ? v.scenario : "una",
      checkin: typeof v.checkin === "string" ? v.checkin : "",
      email: typeof v.email === "string" ? v.email : "",
      telefono: typeof v.telefono === "string" ? v.telefono : "",
    };
  } catch {
    return base;
  }
}

function salva(s: Stato): void {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(s));
  } catch {
    /* archivio non disponibile: si lavora lo stesso */
  }
}

const stato: Stato = leggi();

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} mancante`);
  return el as T;
};

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** Link di check-in in uso: quello incollato se è di Slope, altrimenti l'esempio. */
function checkinInUso(): { url: string; esempio: boolean } {
  const t = stato.checkin.trim();
  return RE_CHECKIN_SLOPE.test(t) ? { url: t, esempio: false } : { url: ESEMPIO_CHECKIN, esempio: true };
}

/** Seconda camera di prova: stesso link con un altro reservation_id inventato (solo per vedere la riga). */
function secondaCamera(url: string): string {
  return url.replace(/reservations\/[0-9a-f-]{36}\/check-in$/i, "reservations/00000000-0000-4000-8000-000000000002/check-in");
}

function membri(): Membro[] {
  const { url } = checkinInUso();
  switch (stato.scenario) {
    case "camere":
      return [
        { id: "prova-1", camera: "105", checkinUrl: url, checkinFatto: false },
        { id: "prova-2", camera: "107", checkinUrl: secondaCamera(url), checkinFatto: false },
      ];
    case "fatto":
      return [{ id: "prova-1", camera: "105", checkinUrl: url, checkinFatto: true }];
    case "mano":
      return [{ id: "prova-1", camera: null, checkinUrl: null, checkinFatto: false }];
    default:
      return [{ id: "prova-1", camera: "105", checkinUrl: url, checkinFatto: false }];
  }
}

/** Testo semplice con i link cliccabili (anteprima email). */
function conLink(testo: string): string {
  return esc(testo).replace(/https:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}

/** Come lo mostra WhatsApp: «* voce» diventa un elenco puntato, *testo* grassetto. */
function comeWhatsapp(testo: string): string {
  return testo
    .split("\n")
    .map((riga) => {
      const voce = riga.startsWith("* ");
      const corpo = conLink(voce ? riga.slice(2) : riga).replace(/\*(\S(?:[^*\n]*?\S)?)\*/g, "<strong>$1</strong>");
      return voce ? `<span class="voce"><span aria-hidden="true">•</span><span>${corpo}</span></span>` : corpo;
    })
    .join("\n");
}

async function copia(testo: string, bottone: HTMLButtonElement): Promise<void> {
  const prima = bottone.textContent;
  try {
    await navigator.clipboard.writeText(testo);
    bottone.textContent = "Copiato";
  } catch {
    const area = document.createElement("textarea");
    area.value = testo;
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    bottone.textContent = ok ? "Copiato" : "Copia non riuscita";
  }
  window.setTimeout(() => (bottone.textContent = prima), 1600);
}

let ultimoTestoEmail = "";
let ultimoTestoWa = "";

function render(): void {
  salva(stato);
  const testo = TESTI_PREDEFINITI[stato.lingua];
  const m = membri();
  const { esempio } = checkinInUso();

  // lingua e scenario
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-lingua]")) b.setAttribute("aria-pressed", String(b.dataset.lingua === stato.lingua));
  for (const r of document.querySelectorAll<HTMLInputElement>("input[name=scenario]")) r.checked = r.value === stato.scenario;
  $("nota-checkin").textContent = esempio
    ? "Si usa un link di esempio: la pagina d'arrivo si apre, ma il check-in non porta a una prenotazione vera. Incolla il link di una prenotazione di prova per provare tutto il percorso."
    : "Link di Slope valido: il link personale aprirà il check-in di questa prenotazione.";

  // email
  const oggetto = senzaGrassetto(testo.oggetto);
  const corpo = senzaGrassetto(componi(testo.corpo, stato.lingua, "", m));
  ultimoTestoEmail = corpo;
  const email = stato.email.trim();
  const emailOk = EMAIL.test(email);
  const mailto = linkEmail("mailto", [emailOk ? email : "ospite@esempio.it"], oggetto, corpo);
  $("email-a").textContent = emailOk ? email : "ospite@esempio.it (esempio)";
  $("email-oggetto").textContent = oggetto;
  $("email-corpo").innerHTML = conLink(corpo);
  const apriEmail = $<HTMLAnchorElement>("apri-email");
  apriEmail.href = mailto;
  apriEmail.toggleAttribute("aria-disabled", !emailOk);
  apriEmail.classList.toggle("spento", !emailOk);
  const lung = mailto.length;
  const stato_lung = $("lunghezza");
  stato_lung.textContent = `Link email: ${lung.toLocaleString("it-IT")} caratteri su ${MAX_MAILTO.toLocaleString("it-IT")}`;
  stato_lung.classList.toggle("troppo", lung > MAX_MAILTO);

  // WhatsApp
  const wa = componi(testo.whatsapp, stato.lingua, "", m);
  ultimoTestoWa = wa;
  $("wa-bolla").innerHTML = comeWhatsapp(wa);
  const numero = stato.telefono.trim() ? numeroWhatsapp(stato.telefono) : null;
  $("wa-numero").textContent = numero ? mostraNumero(numero) : stato.telefono.trim() ? "numero non valido" : "nessun numero";
  $("wa-numero").classList.toggle("errore", Boolean(stato.telefono.trim()) && !numero);
  const apriWa = $<HTMLAnchorElement>("apri-wa");
  apriWa.href = numero ? `https://wa.me/${numero}?text=${encodeURIComponent(wa)}` : "#";
  apriWa.toggleAttribute("aria-disabled", !numero);
  apriWa.classList.toggle("spento", !numero);

  // pagina d'arrivo
  const primo = m[0];
  $<HTMLAnchorElement>("apri-arrivo").href = linkArrivoPer(stato.lingua, primo && !primo.checkinFatto ? primo.checkinUrl : null);
}

function avvia(): void {
  $<HTMLInputElement>("in-checkin").value = stato.checkin;
  $<HTMLInputElement>("in-email").value = stato.email;
  $<HTMLInputElement>("in-telefono").value = stato.telefono;
  $("scenari").innerHTML = (Object.keys(SCENARI) as Scenario[])
    .map((k) => `<label class="chip"><input type="radio" name="scenario" value="${k}"><span>${esc(SCENARI[k])}</span></label>`)
    .join("");

  document.addEventListener("click", (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-lingua], #copia-email, #copia-wa, .spento");
    if (!el) return;
    if (el.classList.contains("spento")) {
      ev.preventDefault();
      return;
    }
    if (el.dataset.lingua) {
      stato.lingua = el.dataset.lingua as Lingua;
      render();
    } else if (el.id === "copia-email") void copia(ultimoTestoEmail, el as HTMLButtonElement);
    else if (el.id === "copia-wa") void copia(ultimoTestoWa, el as HTMLButtonElement);
  });
  $("scenari").addEventListener("change", (ev) => {
    stato.scenario = (ev.target as HTMLInputElement).value as Scenario;
    render();
  });
  $("in-checkin").addEventListener("input", (ev) => {
    stato.checkin = (ev.target as HTMLInputElement).value;
    render();
  });
  $("in-email").addEventListener("input", (ev) => {
    stato.email = (ev.target as HTMLInputElement).value;
    render();
  });
  $("in-telefono").addEventListener("input", (ev) => {
    stato.telefono = (ev.target as HTMLInputElement).value;
    render();
  });
  render();
}

avvia();
