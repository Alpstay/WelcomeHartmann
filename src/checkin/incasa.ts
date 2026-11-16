/**
 * «Ospiti in casa» nella pagina checkin/ — regole pure (nessun DOM).
 *
 * Durante il soggiorno l'ospite chiede informazioni: la reception gli rimanda la sua pagina personale (Directory
 * 5DAYTO-ARRIVAL) con check-in online, Guest Pass e informazioni per il soggiorno. Qui si elencano gli ospiti in casa
 * (arrivati prima di oggi e non ancora partiti, più chi arriva oggi), si ritrovano i loro Guest Pass e si compone il
 * link e il messaggio da copiare o mandare su WhatsApp / per email. ID di Slope invariati: finiscono identici nel link.
 */
import type { AvvisoItem } from "../feed";
import { linkGuestPass, prenotazioneProposta } from "../avvisi/guestpass";
import type { EmailGuestPass, PassTrovato } from "../avvisi/guestpass";
import { LINK_ARRIVO } from "../avvisi/testi";
import type { Lingua } from "../avvisi/testi";
import type { InvioGuestPass } from "./guestpass";
import { ETICHETTA_GUESTPASS } from "./guestpass";
import { oggettoCompleto, versoRiga } from "./regole";
import type { Messaggio, RigaCheckin } from "./regole";

/** Ospiti in casa oggi: dal blocco `inCasa` del file (arrivati prima di oggi) più gli arrivi di oggi. Uno per prenotazione. */
export function righeInCasa(inCasa: readonly AvvisoItem[] | null | undefined, arrivi: readonly RigaCheckin[], oggi: string): RigaCheckin[] {
  const viste = new Set<string>();
  const out: RigaCheckin[] = [];
  const presenti = [
    ...(inCasa ?? []).filter((x) => typeof x.reservationId === "string" && x.arrival < oggi && x.departure >= oggi).map((x) => versoRiga(x, oggi)),
    ...arrivi.filter((r) => r.arrivo === oggi),
  ];
  for (const r of presenti) {
    if (viste.has(r.reservationId)) continue;
    viste.add(r.reservationId);
    out.push(r);
  }
  return out.sort(
    (a, b) => (a.camera ?? "~").localeCompare(b.camera ?? "~", "it", { numeric: true }) || a.nome.localeCompare(b.nome),
  );
}

/** Da dove vengono i Guest Pass messi nel link. */
export type FontePass = "inviato" | "casella";

export interface PassInCasa {
  readonly pass: readonly PassTrovato[];
  readonly fonte: FontePass;
  /** impronta dell'email della casella da cui vengono i pass */
  readonly emailId: string;
}

/**
 * Guest Pass degli ospiti in casa, ritrovati nella casella (guestpass.json):
 * 1) quelli già inviati: l'email della casella registrata al momento dell'invio;
 * 2) altrimenti un'email il cui nome corrisponde con certezza (nome e cognome, o scelta a mano) a un ospite in casa.
 * Le email più vecchie della finestra della casella non ci sono più: in quel caso nessun pass (il link apre
 * comunque check-in e informazioni, e sul telefono dell'ospite i pass già salvati restano).
 */
export function passInCasa(
  righe: readonly RigaCheckin[],
  casella: readonly EmailGuestPass[],
  invii: ReadonlyMap<string, InvioGuestPass>,
  scelte: ReadonlyMap<string, string> = new Map(),
): Map<string, PassInCasa> {
  const out = new Map<string, PassInCasa>();
  const perId = new Map(casella.map((e) => [e.id, e]));
  const usate = new Set<string>();
  for (const r of righe) {
    const emailId = invii.get(r.reservationId)?.emailId;
    const e = emailId ? perId.get(emailId) : undefined;
    if (e && e.pass.length) {
      out.set(r.reservationId, { pass: e.pass, fonte: "inviato", emailId: e.id });
      usate.add(e.id);
    }
  }
  const ids = new Set(righe.map((r) => r.reservationId));
  const candidati = righe.map((r) => ({ id: r.reservationId, nome: `${r.nome} ${r.nomeSaluto}` }));
  for (const e of casella) {
    if (usate.has(e.id) || !e.pass.length) continue;
    const scelta = scelte.get(e.id);
    const p = scelta && ids.has(scelta) ? { id: scelta, sicura: true } : prenotazioneProposta(e.pass.map((x) => x.nome).filter(Boolean), candidati);
    if (!p || !p.sicura || out.has(p.id)) continue;
    out.set(p.id, { pass: e.pass, fonte: "casella", emailId: e.id });
  }
  return out;
}

/**
 * Link alla pagina personale: con i Guest Pass (#ci=…&gp=…&gr=<reservation_id>), oppure solo con il check-in
 * (#ci=…&gp=&gr=…: sul telefono dell'ospite i pass già salvati della stessa prenotazione restano), oppure la pagina
 * d'arrivo nella sua lingua.
 */
export function linkPaginaPersonale(r: RigaCheckin, lingua: Lingua, pass: readonly PassTrovato[]): string {
  if (pass.length || r.checkinUrl) return linkGuestPass(lingua, pass, [r.reservationId], r.checkinUrl);
  return `${LINK_ARRIVO}?lang=${lingua}`;
}

interface TestoInCasa {
  readonly oggetto: string;
  readonly saluto: (nome: string) => string;
  readonly conPass: string;
  readonly senzaPass: string;
  readonly chiusura: string;
  readonly firma: string;
}

const TESTI: Readonly<Record<Lingua, TestoInCasa>> = {
  it: {
    oggetto: "La vostra pagina personale · Chalet Hotel Hartmann",
    saluto: (n) => (n ? `Gentile ${n},` : "Gentile ospite,"),
    conPass:
      "ecco la vostra pagina personale per il soggiorno: trovate il vostro Guest Pass per i mezzi pubblici e tutte le informazioni (Wi-Fi, bar, ristoranti, check-out).",
    senzaPass: "ecco la vostra pagina personale per il soggiorno: trovate tutte le informazioni (Wi-Fi, bar, ristoranti, check-out).",
    chiusura: "Buon soggiorno!",
    firma: "Reception Chalet Hotel Hartmann",
  },
  de: {
    oggetto: "Ihre persönliche Seite · Chalet Hotel Hartmann",
    saluto: (n) => (n ? `Guten Tag ${n},` : "Guten Tag,"),
    conPass:
      "hier ist Ihre persönliche Seite für Ihren Aufenthalt: mit Ihrem Guest Pass für die öffentlichen Verkehrsmittel und allen Informationen (WLAN, Bar, Restaurants, Check-out).",
    senzaPass: "hier ist Ihre persönliche Seite für Ihren Aufenthalt: mit allen Informationen (WLAN, Bar, Restaurants, Check-out).",
    chiusura: "Einen schönen Aufenthalt!",
    firma: "Rezeption Chalet Hotel Hartmann",
  },
  en: {
    oggetto: "Your personal page · Chalet Hotel Hartmann",
    saluto: (n) => (n ? `Hello ${n},` : "Hello,"),
    conPass:
      "here is your personal page for your stay: you'll find your Guest Pass for public transport and all the information (Wi-Fi, bar, restaurants, check-out).",
    senzaPass: "here is your personal page for your stay: you'll find all the information (Wi-Fi, bar, restaurants, check-out).",
    chiusura: "Enjoy your stay!",
    firma: "Reception Chalet Hotel Hartmann",
  },
};

const escHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Messaggio breve con il link alla pagina personale (testo, WhatsApp e HTML con il pulsante «Clicca qui»). */
export function messaggioInCasa(r: RigaCheckin, lingua: Lingua, pass: readonly PassTrovato[]): Messaggio & { readonly link: string } {
  const t = TESTI[lingua];
  const link = linkPaginaPersonale(r, lingua, pass);
  const etichetta = ETICHETTA_GUESTPASS[lingua];
  const corpo = pass.length ? t.conPass : t.senzaPass;
  const saluto = t.saluto(r.nomeSaluto);
  const testo = [saluto, "", corpo, "", `${etichetta}: ${link}`, "", t.chiusura, t.firma].join("\n");
  const whatsapp = [saluto, "", corpo, "", `*${etichetta}* ${link}`, "", t.chiusura, t.firma].join("\n");
  const p = (x: string): string => `<p style="margin:0 0 14px">${escHtml(x)}</p>`;
  const html = `<div style="font-family:Lato,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#161512">${p(saluto)}${p(corpo)}<p style="margin:0 0 18px"><a href="${escHtml(link)}" style="display:inline-block;padding:10px 26px;background:#fbf6ea;color:#6b521c;border:2px solid #94752f;font-weight:bold;letter-spacing:.08em;text-decoration:underline;border-radius:6px">${escHtml(etichetta)}</a></p><p style="margin:0 0 14px">${escHtml(t.chiusura)}<br>${escHtml(t.firma)}</p></div>`;
  return { oggetto: oggettoCompleto(t.oggetto, r), testo, whatsapp, html, link };
}
