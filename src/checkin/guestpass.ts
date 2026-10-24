/**
 * Guest Pass nella pagina checkin/ — regole pure (nessun DOM).
 *
 * Dopo il check-in online con l'email diretta in Slope si manda all'ospite il suo Guest Pass. Il Guest Pass si genera
 * in LTS con destinatario la casella dedicata; il workflow «Guest Pass dalla casella» la legge (avviato dalla Gmail appena arriva un pass) e
 * pubblica guestpass.json (cifrato con la password reception). Qui si abbinano i pass alle prenotazioni dal nome e si
 * prepara il messaggio con il link personale alla pagina d'arrivo (stesso link e stessi testi della pagina avvisi/).
 *
 * I registri «Guest Pass inviato» e «email della casella già gestite» sono gli STESSI della pagina avvisi/ (stesse
 * chiavi nel browser, stesso sito): quello che si invia da una pagina risulta inviato anche nell'altra.
 * I link feratel sono personali (credenziali): restano in memoria, mai salvati. ID Slope invariati.
 */
import { SEGNAPOSTO_LINK_GUESTPASS, TESTI_GUESTPASS, linkGuestPass, prenotazioneProposta } from "../avvisi/guestpass";
import type { EmailGuestPass, PassTrovato } from "../avvisi/guestpass";
import type { Lingua } from "../avvisi/testi";
import { aggiungiGiorni, oggettoCompleto } from "./regole";
import type { Messaggio, RigaCheckin } from "./regole";

/** Chiavi condivise con la pagina avvisi/ (src/avvisi/app.ts). */
export const K_GUESTPASS_INVIATI = "avvisiHartmann.guestpass";
export const K_GUESTPASS_EMAIL_GESTITE = "avvisiHartmann.guestpassEmail";
/** Come la pagina avvisi/: invii tenuti 30 giorni dopo l'arrivo, email della casella 12 giorni. */
const GIORNI_INVII = 30;
const GIORNI_EMAIL = 12;

/** Casella dedicata in cui LTS manda i Guest Pass generati dalla reception. */
export const CASELLA_GUESTPASS = "guestpass.hartmann@gmail.com";

/** Guest Pass inviato a una prenotazione: stesso formato del registro della pagina avvisi/ (mai i link). */
export interface InvioGuestPass {
  /** reservation_id di Slope, invariato */
  readonly id: string;
  readonly arrival: string;
  readonly canale: "email" | "whatsapp";
  readonly pass: number;
  readonly inviatoIl: string;
  /** impronta dell'email della casella da cui venivano i pass (null se incollati a mano) */
  readonly emailId: string | null;
}

/** Stato della casella Guest Pass letto da guestpass.json. */
export interface CasellaGuestPass {
  /** false finché il workflow non ha pubblicato guestpass.json */
  readonly attiva: boolean;
  readonly email: readonly EmailGuestPass[];
  readonly problema: string | null;
}

/** Un'email della casella con la prenotazione a cui va (o null se da abbinare a mano). */
export interface AbbinamentoGuestPass {
  readonly email: EmailGuestPass;
  /** reservation_id di Slope, invariato; null = nessuna prenotazione riconosciuta dal nome */
  readonly id: string | null;
  /** true = nome e cognome uguali, oppure scelta a mano; false = una sola parola uguale: da controllare */
  readonly sicura: boolean;
}

export type StatoGuestPass = "inviato" | "pronto" | "da-generare" | null;

export function registroInviiGuestPass(voci: unknown, oggi: string): Map<string, InvioGuestPass> {
  const dal = aggiungiGiorni(oggi, -GIORNI_INVII);
  const mappa = new Map<string, InvioGuestPass>();
  for (const v of Array.isArray(voci) ? (voci as Partial<InvioGuestPass>[]) : []) {
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
  return mappa;
}

/** Registro delle email della casella già gestite: coppie [impronta, quando]. */
export function registroEmailGestite(voci: unknown, adesso = Date.now()): Map<string, string> {
  const dal = adesso - GIORNI_EMAIL * 864e5;
  const mappa = new Map<string, string>();
  for (const v of Array.isArray(voci) ? voci : []) {
    if (!Array.isArray(v) || typeof v[0] !== "string" || typeof v[1] !== "string") continue;
    const t = Date.parse(v[1]);
    if (!Number.isNaN(t) && t >= dal) mappa.set(v[0], v[1]);
  }
  return mappa;
}

/**
 * Abbina le email della casella ancora da gestire alle prenotazioni, dal nome dei pass (stessa regola della pagina
 * avvisi/). `scelte` = abbinamenti fatti a mano dalla reception (impronta email → reservation_id).
 */
export function abbinaGuestPass(
  casella: readonly EmailGuestPass[],
  righe: readonly RigaCheckin[],
  gestite: ReadonlyMap<string, string>,
  scelte: ReadonlyMap<string, string> = new Map(),
): AbbinamentoGuestPass[] {
  const candidati = righe.map((r) => ({ id: r.reservationId, nome: `${r.nome} ${r.nomeSaluto}` }));
  const ids = new Set(righe.map((r) => r.reservationId));
  return casella
    .filter((e) => !gestite.has(e.id))
    .map((e) => {
      const scelta = scelte.get(e.id);
      if (scelta && ids.has(scelta)) return { email: e, id: scelta, sicura: true };
      const p = prenotazioneProposta(e.pass.map((x) => x.nome).filter(Boolean), candidati);
      return { email: e, id: p?.id ?? null, sicura: p?.sicura ?? false };
    });
}

/**
 * Guest Pass della prenotazione: «inviato» (registro), «pronto» (pass arrivati e abbinati), «da-generare»
 * (check-in fatto con email diretta, nessun pass ancora) o null (prima viene il check-in o l'email).
 */
export function statoGuestPass(
  r: RigaCheckin,
  invii: ReadonlyMap<string, InvioGuestPass>,
  abbinamenti: readonly AbbinamentoGuestPass[],
): { stato: StatoGuestPass; abbinamento: AbbinamentoGuestPass | null } {
  if (invii.has(r.reservationId)) return { stato: "inviato", abbinamento: null };
  const a = abbinamenti.find((x) => x.id === r.reservationId) ?? null;
  if (a) return { stato: "pronto", abbinamento: a };
  if (r.stato === "tutto-ok") return { stato: "da-generare", abbinamento: null };
  return { stato: null, abbinamento: null };
}

const escHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Etichetta del pulsante del link al Guest Pass nell'email. */
export const ETICHETTA_GUESTPASS = "GUEST PASS";

/**
 * Messaggio del Guest Pass: stessi testi della pagina avvisi/ (TESTI_GUESTPASS), oggetto con numero di prenotazione
 * e nome. Il link porta alla pagina d'arrivo personale: check-in e pass della prenotazione (#ci=…&gp=…&gr=<reservation_id>).
 */
export function messaggioGuestPass(r: RigaCheckin, lingua: Lingua, pass: readonly PassTrovato[]): Messaggio {
  const t = TESTI_GUESTPASS[lingua];
  // pagina personale completa: Guest Pass e check-in della prenotazione nello stesso link
  const link = linkGuestPass(lingua, pass, [r.reservationId], r.checkinUrl);
  const righe = t.corpo.split("\n");
  const senzaAsterischi = (x: string): string => x.replace(/\*([^*\n]+)\*/g, "$1");
  const testo = righe.map((x) => (x === SEGNAPOSTO_LINK_GUESTPASS ? `${ETICHETTA_GUESTPASS}: ${link}` : senzaAsterischi(x))).join("\n");
  const whatsapp = righe.map((x) => (x === SEGNAPOSTO_LINK_GUESTPASS ? `*${ETICHETTA_GUESTPASS}* ${link}` : x)).join("\n");
  // paragrafi separati dalle righe vuote (le righe della firma restano una sotto l'altra); il link è un pulsante
  const blocchi: string[] = [];
  let corrente: string[] = [];
  const chiudi = (): void => {
    if (corrente.length) blocchi.push(`<p style="margin:0 0 14px">${corrente.map((x) => escHtml(x).replace(/\*([^*\n]+)\*/g, "<b>$1</b>")).join("<br>")}</p>`);
    corrente = [];
  };
  for (const x of righe) {
    if (x === SEGNAPOSTO_LINK_GUESTPASS) {
      chiudi();
      blocchi.push(
        `<p style="margin:0 0 18px"><a href="${escHtml(link)}" style="display:inline-block;padding:10px 26px;background:#94752f;color:#ffffff;font-weight:bold;letter-spacing:.08em;text-decoration:none;border-radius:6px">${ETICHETTA_GUESTPASS}</a></p>`,
      );
    } else if (x === "") chiudi();
    else corrente.push(x);
  }
  chiudi();
  const html = blocchi.join("");
  return {
    oggetto: oggettoCompleto(t.oggetto, r),
    testo,
    whatsapp,
    html: `<div style="font-family:Lato,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#161512">${html}</div>`,
  };
}
