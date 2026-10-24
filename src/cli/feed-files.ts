// Lettura dei file con le risposte di La Scatola per `node tools/feed.mjs build` (stesso schema dell'app colazioni):
// il programma legge solo i file che gli vengono indicati, senza cercare nei registri della sessione.
//
// Formati accettati per ogni file:
//   - il file in cui il sistema salva una risposta grande, così com'è: {data, freshness, page} oppure
//     [{type:"text", text:"{...}"}];
//   - un file scritto nello scratchpad: {"vista": "<nome vista>", "total": <page.total>, "freshness": {...}, "rows": [...]}.
// La vista si riconosce dai campi delle righe se "vista" manca.

import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Freshness } from "../types";

/** «riferimenti» (numero del portale) e «ordini» (numero Slope) sono facoltativi: servono all'oggetto delle email. */
export type Kind = "arrivi" | "ospiti" | "intestatari" | "riferimenti" | "ordini";

export interface Bundle {
  readonly file: string;
  readonly kind: Kind;
  readonly rows: readonly Record<string, unknown>[];
  readonly freshness: Freshness | null;
  /** page.total della lettura (null se non indicato). */
  readonly total: number | null;
  /** La risposta salvata dice che ci sono altre pagine (next_cursor). */
  readonly more: boolean;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VIEW_KIND: Record<string, Kind> = {
  curated_operational_stays: "arrivi",
  list_arrivals: "arrivi",
  curated_guest_stays: "ospiti",
  curated_reservation_contacts: "intestatari",
  curated_reservations: "riferimenti",
  curated_order_balances: "ordini",
};

function kindOf(vista: unknown, rows: readonly Record<string, unknown>[]): Kind | null {
  if (typeof vista === "string" && VIEW_KIND[vista]) return VIEW_KIND[vista];
  const r = rows[0];
  if (!r) return null;
  if ("booker_type" in r) return "intestatari";
  if ("guest_type" in r || "is_primary_guest" in r || "stay_start" in r) return "ospiti";
  if ("order_number" in r) return "ordini";
  if ("agency_code" in r) return "riferimenti";
  if ("room_name" in r || "adults" in r || "lodging_type_id" in r) return "arrivi";
  return null;
}

function parse(text: string, depth = 0): unknown {
  const v: unknown = JSON.parse(text);
  if (Array.isArray(v) && depth < 2 && v.every((b) => isRec(b) && typeof b.text === "string")) {
    return parse(v.map((b) => (b as { text: string }).text).join(""), depth + 1);
  }
  if (typeof v === "string" && depth < 2) return parse(v, depth + 1);
  return v;
}

/** Errore con un messaggio che non riporta mai il contenuto dei file (ci sono dati personali). */
export class FileError extends Error {}

export function readBundle(path: string): Bundle {
  const name = basename(path);
  if (!existsSync(path)) throw new FileError(`file non trovato: ${name}`);
  let v: unknown;
  try {
    v = parse(readFileSync(path, "utf8").trim());
  } catch {
    throw new FileError(`${name} non è un JSON leggibile`);
  }
  if (!isRec(v)) throw new FileError(`${name}: contenuto non riconosciuto`);

  let rows: Record<string, unknown>[];
  let total: number | null = null;
  let more = false;
  if (Array.isArray(v.data)) {
    rows = v.data as Record<string, unknown>[];
    const page = isRec(v.page) ? v.page : {};
    total = typeof page.total === "number" ? page.total : null;
    more = page.truncated === true || (typeof page.next_cursor === "string" && page.next_cursor !== "");
  } else if (Array.isArray(v.rows)) {
    rows = v.rows as Record<string, unknown>[];
    total = typeof v.total === "number" ? v.total : null;
  } else {
    throw new FileError(`${name}: mancano le righe ("data" o "rows")`);
  }

  const kind = kindOf(v.vista ?? v.view, rows);
  if (!kind) {
    if (rows.length === 0) throw new FileError(`${name}: vuoto e senza "vista": indica quale vista è`);
    throw new FileError(`${name}: vista non riconosciuta (aggiungi "vista")`);
  }
  // Le righe degli ordini non hanno reservation_id: si controllano con order_id.
  const chiave = kind === "ordini" ? "order_id" : "reservation_id";
  rows.forEach((r, i) => {
    if (!isRec(r) || typeof r[chiave] !== "string" || !UUID.test(r[chiave] as string))
      throw new FileError(`${name}: ${chiave} mancante o non valido alla riga ${i + 1}`);
  });
  const freshness = isRec(v.freshness) && isRec(v.freshness.overall) ? (v.freshness as unknown as Freshness) : null;
  return { file: name, kind, rows, freshness, total, more };
}

/**
 * Controllo delle pagine: le pagine della stessa lettura hanno lo stesso page.total, quindi per ogni vista e
 * totale le righe dei file devono arrivare al totale (una lettura a pagine si passa con un file per pagina).
 */
export function checkPages(bundles: readonly Bundle[]): void {
  const groups = new Map<string, Bundle[]>();
  for (const b of bundles) {
    if (b.total === null) continue;
    const key = `${b.kind}|${b.total}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  for (const [key, list] of groups) {
    const total = Number(key.split("|")[1]);
    const rows = list.reduce((n, b) => n + b.rows.length, 0);
    if (rows < total) {
      const files = list.map((b) => b.file).join(", ");
      throw new FileError(`${files}: ${rows} righe su ${total}: mancano pagine (segui next_cursor e passa anche i file delle pagine successive)`);
    }
  }
}

/** Ammette anche percorsi separati da virgole, come nella procedura colazioni. */
export const splitPaths = (args: readonly string[]): string[] =>
  args.flatMap((a) => a.split(",")).map((s) => s.trim()).filter(Boolean);
