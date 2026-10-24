// Scritture non latine nel PDF: scelta del font per scrittura e ordine visivo dell'arabo.
// pdfmake dispone le parole sempre da sinistra a destra: per l'arabo l'ordine delle parole (e la posizione dei
// numeri e dei nomi latini) si calcola qui, con una versione ridotta dell'algoritmo bidirezionale Unicode.
// Dentro ogni parola araba legature e verso le gestisce il font (fontkit), come nel resto del PDF.

/** Famiglie di font per scrittura (file in fonts/, caricati solo quando servono). */
export type ScriptFont = "NotoSansSC" | "NotoSansKR" | "NotoNaskhArabic";

export const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const HAN = /[　-〿㐀-䶿一-鿿豈-﫿＀-￯]/;

/** Font necessario per un testo, oppure null se basta il font latino. */
export function scriptFontOf(text: string): ScriptFont | null {
  if (ARABIC.test(text)) return "NotoNaskhArabic";
  if (HANGUL.test(text)) return "NotoSansKR";
  if (HAN.test(text)) return "NotoSansSC";
  return null;
}

/** Il testo va letto da destra a sinistra: la prima lettera "forte" è araba (regola P2 dell'algoritmo Unicode). */
export function isRtlText(text: string): boolean {
  const m = /[\p{L}]/u.exec(text);
  return m !== null && ARABIC.test(m[0]);
}

export interface Piece {
  readonly text: string;
  readonly bold?: boolean;
  /** Grigio (etichetta Wi-Fi). */
  readonly muted?: boolean;
}

export type Dir = "L" | "R";

export interface Token {
  readonly pieces: readonly Piece[];
  /** Direzione risolta: R = arabo (o punteggiatura in contesto arabo), L = latino e numeri. */
  dir: Dir;
  /** Nel testo originale segue uno spazio. */
  spaceAfter: boolean;
  /** Solo punteggiatura: prende la direzione dai vicini (vedi resolve). */
  readonly neutral: boolean;
}

const NBSP = " ";
/** Punteggiatura finale che, attaccata a un numero o a una parola latina, va staccata e segue il verso del paragrafo. */
const TRAILING = /^(.*?)([.,;:!?،؛؟…"'»)]+)$/su;

/**
 * Parole in ordine logico. Le parti in grassetto (camera, telefono, password) restano un pezzo unico, senza a capo
 * al loro interno.
 */
export function tokenize(pieces: readonly Piece[]): Token[] {
  const words: { pieces: Piece[]; spaceAfter: boolean }[] = [];
  let cur: Piece[] = [];
  const flush = (spaceAfter: boolean): void => {
    if (cur.length) words.push({ pieces: cur, spaceAfter });
    else if (spaceAfter && words.length) words[words.length - 1].spaceAfter = true;
    cur = [];
  };
  for (const p of pieces) {
    const text = p.bold ? p.text.replace(/ /g, NBSP) : p.text;
    const parts = text.split(/[ \t\n]+/);
    parts.forEach((part, i) => {
      if (i > 0) flush(true);
      if (part) cur.push({ ...p, text: part });
    });
  }
  flush(false);

  const out: Token[] = [];
  for (const w of words) {
    const text = w.pieces.map((p) => p.text).join("");
    if (!/[\p{L}\p{N}]/u.test(text)) {
      out.push({ pieces: w.pieces, dir: "L", spaceAfter: w.spaceAfter, neutral: true });
      continue;
    }
    const dir: Dir = ARABIC.test(text) ? "R" : "L";
    // La punteggiatura finale («107.», «Hartmann.», «العتيبي،») diventa un elemento a sé: prende il verso del
    // contesto, così la virgola dopo un nome arabo in una frase inglese resta in fondo a destra.
    const last = w.pieces[w.pieces.length - 1];
    const m = TRAILING.exec(last.text);
    if (m) {
      const head = m[1] ? [...w.pieces.slice(0, -1), { ...last, text: m[1] }] : w.pieces.slice(0, -1);
      out.push({ pieces: head, dir, spaceAfter: false, neutral: false });
      out.push({ pieces: [{ ...last, text: m[2] }], dir, spaceAfter: w.spaceAfter, neutral: true });
      continue;
    }
    out.push({ pieces: w.pieces, dir, spaceAfter: w.spaceAfter, neutral: false });
  }
  return out;
}

/** Risolve la direzione della punteggiatura isolata: quella dei vicini se uguale, altrimenti quella del paragrafo. */
export function resolve(tokens: Token[], para: Dir): Token[] {
  const strong = (i: number, step: 1 | -1): Dir => {
    for (let j = i + step; j >= 0 && j < tokens.length; j += step) {
      if (!tokens[j].neutral) return tokens[j].dir;
    }
    return para;
  };
  tokens.forEach((t, i) => {
    if (t.neutral) {
      const a = strong(i, -1);
      const b = strong(i, 1);
      t.dir = a === b ? a : para;
    }
  });
  return tokens;
}

/**
 * Ordine visivo (da sinistra a destra) di una riga già spezzata, con gli spazi al posto giusto.
 * Paragrafo RTL: si inverte la sequenza dei gruppi; i gruppi latini restano nel loro ordine.
 */
export function visualOrder(line: readonly Token[], para: Dir): { token: Token; spaceBefore: boolean }[] {
  const idx = line.map((_, i) => i);
  const runs: number[][] = [];
  for (const i of idx) {
    const last = runs[runs.length - 1];
    if (last && line[last[0]].dir === line[i].dir) last.push(i);
    else runs.push([i]);
  }
  const runOf = new Map<number, number>();
  runs.forEach((r, n) => r.forEach((i) => runOf.set(i, n)));
  const ordered = (para === "R" ? runs.slice().reverse() : runs).flatMap((r) => (line[r[0]].dir === "R" ? r.slice().reverse() : r));
  return ordered.map((i, k) => {
    if (k === 0) return { token: line[i], spaceBefore: false };
    const prev = ordered[k - 1];
    const [ra, rb] = [runOf.get(prev)!, runOf.get(i)!];
    // Stesso gruppo: elementi vicini anche nel testo, vale lo spazio che c'era tra loro. Gruppi diversi: vale lo
    // spazio tra l'ultima parola del gruppo che nel testo viene prima e la prima del successivo.
    const before = ra === rb ? Math.min(prev, i) : runs[Math.min(ra, rb)][runs[Math.min(ra, rb)].length - 1];
    return { token: line[i], spaceBefore: line[before].spaceAfter };
  });
}

/** A capo greedy in ordine logico, con larghezze misurate fuori (font reali). */
export function breakLines(tokens: readonly Token[], maxWidth: number, width: (t: Token) => number, space: number): Token[][] {
  const lines: Token[][] = [];
  let cur: Token[] = [];
  let w = 0;
  for (const t of tokens) {
    const tw = width(t);
    const gap = cur.length && cur[cur.length - 1].spaceAfter ? space : 0;
    if (cur.length && w + gap + tw > maxWidth && cur[cur.length - 1].spaceAfter) {
      lines.push(cur);
      cur = [t];
      w = tw;
    } else {
      cur.push(t);
      w += gap + tw;
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}
