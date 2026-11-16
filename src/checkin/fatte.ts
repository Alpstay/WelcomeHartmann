/**
 * Azioni già fatte su una prenotazione (copiato il link, aperto Slope, mandato su WhatsApp…), per mettere la
 * spunta ✓ accanto al link dell'azione. Registro solo nel browser della reception, come «contattato».
 * ID di Slope invariati: si usano solo come chiave.
 */
import { aggiungiGiorni } from "./regole";

/** Azioni con la spunta. */
export type AzioneTracciata =
  | "copia-link"
  | "apri-checkin"
  | "apri-slope"
  | "lettera"
  | "incasa-copia"
  | "incasa-whatsapp"
  | "incasa-email";

export const AZIONI_TRACCIATE: readonly AzioneTracciata[] = [
  "copia-link",
  "apri-checkin",
  "apri-slope",
  "lettera",
  "incasa-copia",
  "incasa-whatsapp",
  "incasa-email",
];

export interface AzioneFatta {
  /** reservation_id di Slope, invariato */
  readonly id: string;
  readonly azione: AzioneTracciata;
  /** ISO, quando è stata fatta */
  readonly quando: string;
  /** giorno di partenza dell'ospite (AAAA-MM-GG): la voce si tiene fino a 14 giorni dopo */
  readonly fino: string;
}

/** Giorni dopo la partenza in cui la spunta resta nel browser. */
export const GIORNI_CONSERVAZIONE_FATTE = 14;

export const chiaveFatta = (id: string, azione: AzioneTracciata): string => `${id}|${azione}`;

export const eAzioneTracciata = (v: unknown): v is AzioneTracciata =>
  typeof v === "string" && (AZIONI_TRACCIATE as readonly string[]).includes(v);

/** Legge il registro salvato: scarta le voci non valide e quelle di ospiti partiti da più di 14 giorni. */
export function registroFatte(voci: unknown, oggi: string): Map<string, AzioneFatta> {
  const dal = aggiungiGiorni(oggi, -GIORNI_CONSERVAZIONE_FATTE);
  const mappa = new Map<string, AzioneFatta>();
  for (const v of Array.isArray(voci) ? (voci as Partial<AzioneFatta>[]) : []) {
    if (!v || typeof v.id !== "string" || !eAzioneTracciata(v.azione)) continue;
    const fino = String(v.fino ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fino) || fino < dal) continue;
    const quando = String(v.quando ?? "");
    if (Number.isNaN(Date.parse(quando))) continue;
    mappa.set(chiaveFatta(v.id, v.azione), { id: v.id, azione: v.azione, quando, fino });
  }
  return mappa;
}

/** Aggiunge (o aggiorna all'ultima volta) un'azione fatta. Restituisce una mappa nuova. */
export function segnaFatta(
  registro: ReadonlyMap<string, AzioneFatta>,
  id: string,
  azione: AzioneTracciata,
  fino: string,
  adesso: Date = new Date(),
): Map<string, AzioneFatta> {
  const nuovo = new Map(registro);
  nuovo.set(chiaveFatta(id, azione), { id, azione, quando: adesso.toISOString(), fino });
  return nuovo;
}
