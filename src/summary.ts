// Riepilogo degli arrivi da inviare su WhatsApp (gruppo scelto dalla reception al momento dell'invio).
// Funzione pura: testo con la formattazione di WhatsApp (*grassetto*, _corsivo_).

import { FLOOR_LABEL_IT, floorOf } from "./hotel";
import { isPin, nightsBetween } from "./letter";
import { TEXTS } from "./texts";
import type { ArrivalItem } from "./types";

export interface SummaryOptions {
  /** PIN delle porte nel messaggio: solo se la reception lo sceglie, perché restano nella chat. */
  readonly pins: boolean;
  readonly notes: boolean;
}

export interface SummaryInput {
  /** Giorno di arrivo, AAAA-MM-GG. */
  readonly date: string;
  readonly items: readonly ArrivalItem[];
  /** Ora dei dati di La Scatola (HH:MM), se nota. */
  readonly dataTime: string | null;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const shortDate = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

function dayTitle(iso: string): string {
  const s = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );
  return s.charAt(0).toLocaleUpperCase("it") + s.slice(1);
}

/** Toglie i segni che WhatsApp userebbe come formattazione dentro nomi e note. */
const clean = (s: string): string => s.replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim();

const people = (adults: number, children: number): string =>
  [plural(adults, "adulto", "adulti"), ...(children > 0 ? [plural(children, "bambino", "bambini")] : [])].join(", ");

function block(item: ArrivalItem, opts: SummaryOptions): string[] {
  const floor = item.room ? floorOf(item.room) : null;
  const lines: string[] = [];
  lines.push(item.room ? `*${item.room}*${floor ? ` · ${FLOOR_LABEL_IT[floor]}` : ""}` : "*Camera da assegnare*");
  lines.push(clean(item.name) || "_nome non indicato_");
  if (item.manual) {
    lines.push("Lettera manuale");
  } else {
    const parts: string[] = [];
    if (item.arrival && item.departure) {
      const n = nightsBetween(item.arrival, item.departure);
      parts.push(`${shortDate(item.arrival)} → ${shortDate(item.departure)}`);
      if (n !== null && n > 0) parts.push(plural(n, "notte", "notti"));
    }
    parts.push(people(item.adults, item.children));
    lines.push(parts.join(" · "));
  }
  lines.push(`Lettera: ${TEXTS[item.lang].nameIt.toLocaleLowerCase("it")}${item.lang === "en" ? "" : " + inglese"}`);
  if (opts.pins) lines.push(isPin(item.pin) ? `PIN ${item.pin.trim()}` : item.pin ? "PIN incompleto" : "PIN da assegnare");
  const note = clean(item.note);
  if (opts.notes && note) lines.push(`Nota: ${note}`);
  const flags = [item.isOption ? "Opzione" : "", item.inHouse ? "Già arrivati" : ""].filter(Boolean);
  if (flags.length) lines.push(`_${flags.join(" · ")}_`);
  return lines;
}

export function buildSummary(input: SummaryInput, opts: SummaryOptions): string {
  const items = [...input.items].sort((a, b) => (a.room ?? "zzz").localeCompare(b.room ?? "zzz", "it", { numeric: true }));
  const booked = items.filter((i) => !i.manual);
  const adults = booked.reduce((s, i) => s + i.adults, 0);
  const children = booked.reduce((s, i) => s + i.children, 0);
  const head = [plural(items.length, "arrivo", "arrivi")];
  if (booked.length > 0) head.push(people(adults, children));

  const out: string[] = ["*Arrivi Chalet Hotel Hartmann*", `${dayTitle(input.date)} · ${head.join(" · ")}`];
  for (const item of items) out.push("", ...block(item, opts));
  if (input.dataTime) out.push("", `_Dati La Scatola delle ${input.dataTime}_`);
  return out.join("\n");
}

/** Link che apre WhatsApp con il testo pronto: il gruppo si sceglie in WhatsApp. */
export const whatsappUrl = (text: string): string => `https://wa.me/?text=${encodeURIComponent(text)}`;
