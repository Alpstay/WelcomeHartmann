// Composizione della lettera: funzioni pure, usate sia per l'anteprima sia per il PDF.

import { HOTEL, floorOf } from "./hotel";
import { TEXTS, plain } from "./texts";
import type { HotelSettings, LangCode, LetterBlock, LetterInput, LetterModel } from "./types";

const SUPPORTED = new Set<LangCode>(Object.keys(TEXTS) as LangCode[]);

export interface NormalizedLang {
  readonly lang: LangCode;
  readonly supported: boolean;
  readonly raw: string | null;
}

/** "de-AT", "DE", "de_CH" → "de". Lingue non previste → inglese. */
export function normalizeLang(code: string | null | undefined): NormalizedLang {
  const raw = code?.trim() || null;
  if (!raw) return { lang: "en", supported: false, raw: null };
  const base = raw.toLowerCase().split(/[-_]/)[0] as LangCode;
  return SUPPORTED.has(base) ? { lang: base, supported: true, raw } : { lang: "en", supported: false, raw };
}

const titleCaseWord = (w: string): string =>
  w
    .split(/([-'’])/)
    .map((part) => (part.length > 0 && !/[-'’]/.test(part) ? part[0].toLocaleUpperCase() + part.slice(1).toLocaleLowerCase() : part))
    .join("");

/** Sistema i nomi arrivati tutti maiuscoli/minuscoli o duplicati (es. "kang un suk kang un suk"). */
export function normalizeGuestName(first: string | null, last: string | null): string {
  const f = (first ?? "").replace(/\s+/g, " ").trim();
  const l = (last ?? "").replace(/\s+/g, " ").trim();
  let full = f && l && f.toLocaleLowerCase() === l.toLocaleLowerCase() ? f : [f, l].filter(Boolean).join(" ");
  if (!full) return "";
  const letters = full.replace(/[^\p{L}]/gu, "");
  const allUpper = letters === letters.toLocaleUpperCase();
  const allLower = letters === letters.toLocaleLowerCase();
  if (allUpper || allLower) full = full.split(" ").map(titleCaseWord).join(" ");
  return full;
}

const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

/** "13.10. – 15.10.2026" */
export function stayLabel(arrival: string | null, departure: string | null): string | null {
  if (!arrival || !departure) return null;
  const a = fmtDate(arrival);
  const d = fmtDate(departure);
  const sameYear = arrival.slice(0, 4) === departure.slice(0, 4);
  return `${sameYear ? a.slice(0, 6) : a} – ${d}`;
}

export function nightsBetween(arrival: string | null, departure: string | null): number | null {
  if (!arrival || !departure) return null;
  const ms = Date.parse(`${departure}T00:00:00Z`) - Date.parse(`${arrival}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}

function buildBlock(lang: LangCode, input: LetterInput, settings: HotelSettings): LetterBlock {
  const tx = TEXTS[lang];
  const room = input.room.trim();
  const name = input.guestName?.trim() || null;
  return {
    lang,
    headline: tx.headline,
    salutation: tx.salutation(name),
    paragraphs: [
      [...plain(`${tx.intro} `), ...tx.room(room, floorOf(room))],
      plain(`${tx.home} ${tx.bar}`),
      plain(`${tx.breakfast(settings.breakfastFrom, settings.breakfastTo)} ${tx.sauna}`),
    ],
    wifiLabel: tx.wifiLabel,
    wifiValue: settings.wifiPassword,
    emergency: tx.emergency(settings.emergencyPhone),
    closing: tx.closing,
  };
}

/** Lettera nella lingua dell'ospite con, sotto, lo stesso testo in inglese. */
export function buildLetter(input: LetterInput, settings: HotelSettings = HOTEL): LetterModel {
  const room = input.room.trim();
  const roomLabel = input.lang === "en" ? TEXTS.en.roomLabel : `${TEXTS[input.lang].roomLabel} · ${TEXTS.en.roomLabel}`;
  return {
    reservationId: input.reservationId,
    room,
    floor: floorOf(room),
    guestName: input.guestName?.trim() || null,
    stayLabel: stayLabel(input.arrival, input.departure),
    roomLabel,
    primary: buildBlock(input.lang, input, settings),
    english: input.lang === "en" ? null : buildBlock("en", input, settings),
    qrCaption: TEXTS[input.lang].qr,
    qrCaptionEnglish: input.lang === "en" ? null : TEXTS.en.qr,
    note: input.note?.trim() || null,
    noteLabel: input.lang === "en" ? TEXTS.en.noteLabel : `${TEXTS[input.lang].noteLabel} · ${TEXTS.en.noteLabel}`,
    hotelName: settings.hotelName,
    place: settings.place,
    signer: settings.signer,
    signerRole: settings.signerRole,
  };
}
