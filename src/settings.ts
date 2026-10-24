// Impostazioni dei testi (menu Impostazioni): modifiche a dati dell'hotel, lettera e messaggio WhatsApp.
// Si salvano nel browser di questo computer (solo le parti cambiate rispetto ai testi predefiniti) e si
// possono esportare/importare come file per portarle su un altro computer della reception.

import { HOTEL_DEFAULTS, HOTEL_EDITABLE, applyHotel } from "./hotel";
import type { HotelEditable } from "./hotel";
import { LETTER_DEFAULTS, applyLetterTemplates } from "./texts";
import type { LangCode, LetterTemplate } from "./types";
import { applyWhatsappTemplates, defaultWhatsappTemplate } from "./whatsapp-welcome";

export type LetterKey = keyof LetterTemplate;

export interface TextSettings {
  readonly hotel: Partial<Record<HotelEditable, string>>;
  readonly letter: Partial<Record<LangCode, Partial<Record<LetterKey, string>>>>;
  readonly whatsapp: Partial<Record<LangCode, string>>;
}

const KEY = "welcomeHartmann.impostazioni";
const LANGS = Object.keys(LETTER_DEFAULTS) as LangCode[];
const LETTER_KEYS = Object.keys(LETTER_DEFAULTS.en) as LetterKey[];

export const emptySettings = (): TextSettings => ({ hotel: {}, letter: {}, whatsapp: {} });

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.length <= max ? v : null);

/** Legge un oggetto di impostazioni (anche da un file importato): tiene solo chiavi note e testi. */
export function parseSettings(v: unknown): TextSettings | null {
  if (!isRec(v)) return null;
  const out = emptySettings() as { hotel: Record<string, string>; letter: Record<string, Record<string, string>>; whatsapp: Record<string, string> };
  if (isRec(v.hotel)) for (const k of HOTEL_EDITABLE) {
    const s = str(v.hotel[k], 200);
    if (s !== null) out.hotel[k] = s;
  }
  if (isRec(v.letter)) for (const l of LANGS) {
    const src = v.letter[l];
    if (!isRec(src)) continue;
    for (const k of LETTER_KEYS) {
      const s = str(src[k], 1000);
      if (s !== null) (out.letter[l] ??= {})[k] = s;
    }
  }
  if (isRec(v.whatsapp)) for (const l of LANGS) {
    const s = str(v.whatsapp[l], 8000);
    if (s !== null) out.whatsapp[l] = s;
  }
  return out;
}

/** Toglie le voci uguali ai testi predefiniti: resta solo ciò che è stato cambiato davvero. */
export function compact(s: TextSettings): TextSettings {
  const hotel = Object.fromEntries(Object.entries(s.hotel).filter(([k, v]) => v !== HOTEL_DEFAULTS[k as HotelEditable]));
  const letter = Object.fromEntries(
    Object.entries(s.letter)
      .map(([l, f]) => [l, Object.fromEntries(Object.entries(f ?? {}).filter(([k, v]) => v !== LETTER_DEFAULTS[l as LangCode][k as LetterKey]))])
      .filter(([, f]) => Object.keys(f as object).length > 0),
  );
  const whatsapp = Object.fromEntries(Object.entries(s.whatsapp).filter(([l, v]) => v !== defaultWhatsappTemplate(l as LangCode)));
  return { hotel, letter, whatsapp } as TextSettings;
}

export function loadSettings(): TextSettings {
  try {
    return parseSettings(JSON.parse(localStorage.getItem(KEY) ?? "null")) ?? emptySettings();
  } catch {
    return emptySettings();
  }
}

/** Salva (solo le differenze). Restituisce false se il browser non permette di salvare. */
export function saveSettings(s: TextSettings): boolean {
  try {
    const c = compact(s);
    const empty = !Object.keys(c.hotel).length && !Object.keys(c.letter).length && !Object.keys(c.whatsapp).length;
    if (empty) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(c));
    return true;
  } catch {
    return false;
  }
}

/** Mette in uso le impostazioni: lettera, dati dell'hotel e WhatsApp. */
export function applySettings(s: TextSettings): void {
  applyHotel(s.hotel);
  applyLetterTemplates(s.letter);
  applyWhatsappTemplates(s.whatsapp);
}

/** Numero di testi cambiati, per il riepilogo. */
export function changedCount(s: TextSettings): number {
  const c = compact(s);
  return Object.keys(c.hotel).length + Object.values(c.letter).reduce((n, f) => n + Object.keys(f ?? {}).length, 0) + Object.keys(c.whatsapp).length;
}

/** File da esportare. */
export function exportSettings(s: TextSettings): string {
  return JSON.stringify({ app: "WelcomeHartmann", tipo: "impostazioni-testi", versione: 1, salvato: new Date().toISOString(), ...compact(s) }, null, 2);
}
