// Definizione PDF (pdfmake) delle lettere: una pagina A4 per camera.
// Funzione pura: la stessa definizione è usata nel browser e nel test di stampa in Node.

import type { Content, ContentCanvas, ContentText, TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";
import type { EmbeddedAssets } from "./assets.generated";
import { breakLines, isRtlText, resolve, scriptFontOf, tokenize, visualOrder } from "./bidi";
import type { Dir, Piece, ScriptFont, Token } from "./bidi";
import type { LetterBlock, LetterModel } from "./types";

/** Solo bianco e nero: la stampante della reception è monocromatica. */
export const PDF_COLORS = {
  ink: "#000000",
  muted: "#3A3A3A",
  line: "#000000",
} as const;

export const PDF_FONTS: TFontDictionary = {
  Lato: { normal: "Lato-Regular.ttf", bold: "Lato-Bold.ttf", italics: "Lato-Italic.ttf", bolditalics: "Lato-Bold.ttf" },
  Belleza: { normal: "Belleza.ttf", bold: "Belleza.ttf", italics: "Belleza.ttf", bolditalics: "Belleza.ttf" },
};

/**
 * Font per cinese, coreano e arabo: file in fonts/ (sottoinsiemi dei Noto, licenza OFL), scaricati solo quando una
 * lettera li usa. Senza corsivo: il corsivo usa il normale.
 */
export const SCRIPT_FONT_FILES: Readonly<Record<ScriptFont, { readonly normal: string; readonly bold: string }>> = {
  NotoSansSC: { normal: "NotoSansSC-Regular.ttf", bold: "NotoSansSC-Bold.ttf" },
  NotoSansKR: { normal: "NotoSansKR-Regular.ttf", bold: "NotoSansKR-Bold.ttf" },
  NotoNaskhArabic: { normal: "NotoNaskhArabic-Regular.ttf", bold: "NotoNaskhArabic-Bold.ttf" },
};

/** Dizionario dei font per pdfmake: quelli latini più i font di scrittura già caricati. */
export function pdfFonts(scripts: Iterable<ScriptFont> = []): TFontDictionary {
  const out: TFontDictionary = { ...PDF_FONTS };
  for (const f of scripts) {
    const { normal, bold } = SCRIPT_FONT_FILES[f];
    out[f] = { normal, bold, italics: normal, bolditalics: bold };
  }
  return out;
}

/** Larghezza di un testo in punti con il font del PDF: serve solo per andare a capo nell'arabo. */
export type Measure = (text: string, font: string, bold: boolean, size: number) => number;

export interface RenderEnv {
  readonly measure: Measure | null;
}

/** Stima di riserva se manca la misura vera (non dovrebbe succedere: la pagina la fornisce sempre). */
const roughMeasure: Measure = (text, _font, bold, size) => text.length * size * (bold ? 0.56 : 0.52);

/** Font di scrittura usati da un insieme di lettere: la pagina li scarica prima di creare il PDF. */
export function scriptFontsFor(letters: readonly LetterModel[]): Set<ScriptFont> {
  const out = new Set<ScriptFont>();
  const add = (t: string | null | undefined): void => {
    const f = t ? scriptFontOf(t) : null;
    if (f) out.add(f);
  };
  for (const m of letters) {
    add(m.guestName);
    add(m.roomLabel);
    add(m.noteLabel);
    add(m.note);
    add(m.qrCaption);
    for (const b of [m.primary, m.english]) {
      if (!b) continue;
      add(b.headline);
      add(b.salutation);
      add(b.wifiLabel);
      add(b.closing);
      for (const p of [...b.paragraphs, b.emergency]) add(p.map((x) => x.text).join(""));
    }
  }
  return out;
}

/**
 * Altezza di riga: i Noto hanno ascendenti e discendenti più ampi del Lato, quindi a parità di valore le righe
 * sarebbero più distanti. Il fattore riporta l'interlinea a quella del Lato (1,2 em).
 */
const LH_FACTOR: Readonly<Record<ScriptFont, number>> = { NotoSansSC: 1.2 / 1.448, NotoSansKR: 1.2 / 1.448, NotoNaskhArabic: 1.2 / 1.703 };
/** Il Naskh appare più piccolo del Lato allo stesso corpo. */
const ARABIC_SCALE = 1.12;

export function pdfVfs(a: EmbeddedAssets): Record<string, string> {
  return {
    "Lato-Regular.ttf": a.LatoRegular,
    "Lato-Bold.ttf": a.LatoBold,
    "Lato-Italic.ttf": a.LatoItalic,
    "Belleza.ttf": a.Belleza,
  };
}

const A4_WIDTH = 595.28;
const MARGIN_X = 64;
const CONTENT_WIDTH = A4_WIDTH - MARGIN_X * 2;
/** Testo della nota: riquadro meno filetto e margini interni. */
const NOTE_WIDTH = CONTENT_WIDTH - 11 - 10 - 1.6;

const rule = (color: string, width = 0.5): ContentCanvas => ({
  canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: width, lineColor: color }],
});

/** Margini [sinistra, sopra, destra, sotto]. */
type Box = [number, number, number, number];

interface RichOpts {
  /** Larghezza disponibile (serve per andare a capo nell'arabo). */
  readonly width: number;
  /** Corpo e interlinea effettivi del punto in cui si trova il testo. */
  readonly size: number;
  readonly lineHeight: number;
  /** Font per il testo latino. */
  readonly latin?: "Lato" | "Belleza";
  /** Corpo e interlinea vanno scritti nel nodo (altrimenti li eredita, come prima). */
  readonly setSize?: boolean;
  readonly setLineHeight?: boolean;
  readonly bold?: boolean;
  readonly italics?: boolean;
  readonly color?: string;
  readonly alignment?: "left" | "right" | "center";
  readonly characterSpacing?: number;
  readonly margin?: Box;
}

const inlineOf = (p: Piece, o: RichOpts): ContentText => ({
  text: p.text,
  bold: o.bold === true || p.bold === true,
  ...(p.muted ? { color: PDF_COLORS.muted } : {}),
});

/**
 * Testo in qualsiasi scrittura. Latino: come sempre. Cinese/coreano: font Noto (il coreano va a capo solo tra le
 * parole). Arabo: righe composte qui, da destra a sinistra (vedi bidi.ts).
 */
function rich(pieces: readonly Piece[], o: RichOpts, env: RenderEnv): Content {
  const all = pieces.map((p) => p.text).join("");
  const sf = scriptFontOf(all);
  const common = {
    ...(o.margin ? { margin: o.margin } : {}),
    ...(o.color ? { color: o.color } : {}),
    ...(o.alignment ? { alignment: o.alignment } : {}),
    ...(o.italics ? { italics: true } : {}),
    ...(o.characterSpacing !== undefined ? { characterSpacing: o.characterSpacing } : {}),
    ...(o.setSize ? { fontSize: o.size } : {}),
    ...(o.setLineHeight ? { lineHeight: o.lineHeight } : {}),
  };
  if (sf === "NotoNaskhArabic") return rtlText(pieces, o, env);
  if (!sf) return { text: pieces.map((p) => inlineOf(p, o)), ...(o.latin && o.latin !== "Lato" ? { font: o.latin } : {}), ...common };
  const items: ContentText[] =
    sf === "NotoSansKR"
      ? // Coreano: a capo solo tra le parole, come si usa (niente sillabe spezzate).
        pieces.flatMap((p) =>
          p.text
            .split(/(?<= )/)
            .filter(Boolean)
            .map((w) => ({ ...inlineOf({ ...p, text: w }, o), noWrap: true })),
        )
      : pieces.map((p) => inlineOf(p, o));
  return { text: items, font: sf, ...common, lineHeight: o.lineHeight * LH_FACTOR[sf], ...(o.bold ? { bold: true } : {}) };
}

/** Righe con arabo: a capo in ordine logico, poi ogni riga in ordine visivo; font scelto parola per parola. */
function rtlText(pieces: readonly Piece[], o: RichOpts, env: RenderEnv): Content {
  const measure = env.measure ?? roughMeasure;
  const para: Dir = isRtlText(pieces.map((p) => p.text).join("")) ? "R" : "L";
  const latin = o.latin ?? "Lato";
  // Font secondo il contenuto: arabo nel Naskh, il resto (anche la punteggiatura latina in una frase araba) nel
  // font latino o in quello della sua scrittura.
  const fontOf = (t: Token): string => scriptFontOf(t.pieces.map((p) => p.text).join("")) ?? latin;
  const sizeOf = (t: Token): number => (fontOf(t) === "NotoNaskhArabic" ? o.size * ARABIC_SCALE : o.size);
  const tokens = resolve(tokenize(pieces), para);
  const widthOf = (t: Token): number =>
    t.pieces.reduce((w, p) => w + measure(p.text, fontOf(t), o.bold === true || p.bold === true, sizeOf(t)), 0);
  const space = measure(" ", latin, false, o.size);
  // Margine di sicurezza: pdfmake misura con fontkit, qui con il browser; meglio una riga un po' più corta che
  // una parola che scivola alla riga sotto nel verso sbagliato.
  const lines = breakLines(tokens, o.width * 0.95, widthOf, space);
  const lh = o.lineHeight * LH_FACTOR.NotoNaskhArabic;
  const nodes: ContentText[] = lines.map((line, i) => ({
    text: visualOrder(line, para).flatMap(({ token, spaceBefore }) => {
      const f = fontOf(token);
      const parts = (token.dir === "R" ? token.pieces.slice().reverse() : token.pieces).map(
        (p): ContentText => ({
          ...inlineOf(p, o),
          font: f,
          fontSize: sizeOf(token),
          ...(f !== latin ? { characterSpacing: 0 } : {}),
        }),
      );
      return spaceBefore ? [{ text: " ", font: latin, fontSize: o.size } as ContentText, ...parts] : parts;
    }),
    noWrap: true,
    lineHeight: lh,
    alignment: o.alignment ?? (para === "R" ? "right" : "left"),
    ...(o.color ? { color: o.color } : {}),
    ...(o.italics ? { italics: true } : {}),
    ...(o.characterSpacing !== undefined ? { characterSpacing: o.characterSpacing } : {}),
    ...(i === 0 && o.margin ? { margin: [o.margin[0], o.margin[1], o.margin[2], lines.length === 1 ? o.margin[3] : 0] as Box } : {}),
    ...(i > 0 && i === lines.length - 1 && o.margin ? { margin: [o.margin[0], 0, o.margin[2], o.margin[3]] as Box } : {}),
  }));
  return nodes.length === 1 ? nodes[0] : { stack: nodes };
}

const plainPieces = (text: string): Piece[] => [{ text }];

/** Corpo e interlinea del testo della lettera (compact: versione più stretta, quando c'è una nota). */
const bodySize = (compact: boolean): { size: number; lineHeight: number } => (compact ? { size: 9.7, lineHeight: 1.22 } : { size: 10.5, lineHeight: 1.32 });

/** compact: versione più stretta usata quando la lettera ha una nota, per restare su una pagina. */
function block(b: LetterBlock, compact: boolean, env: RenderEnv): Content[] {
  const gap = compact ? 2.5 : 4;
  const base = { width: CONTENT_WIDTH, ...bodySize(compact) };
  const head = scriptFontOf(b.headline);
  return [
    rich(
      plainPieces(b.headline),
      {
        ...base,
        size: compact ? 14.5 : 16,
        setSize: true,
        latin: "Belleza",
        bold: head !== null,
        color: PDF_COLORS.ink,
        margin: [0, 0, 0, compact ? 5 : 8],
      },
      env,
    ),
    rich(plainPieces(b.salutation), { ...base, margin: [0, 0, 0, gap] }, env),
    ...b.paragraphs.map((p) => rich(p, { ...base, margin: [0, 0, 0, gap] }, env)),
    rich(
      [
        { text: `${b.wifiLabel}: `, muted: true },
        { text: b.wifiValue, bold: true },
      ],
      { ...base, margin: [0, 1, 0, gap] },
      env,
    ),
    rich(b.emergency, { ...base, margin: [0, 0, 0, gap] }, env),
    rich(plainPieces(b.closing), { ...base, italics: true, margin: [0, 1, 0, 0] }, env),
  ];
}

// Post-it con il PIN, in alto a sinistra accanto al logo. Disegnato a linee nere (stampante in bianco e nero):
// angolo piegato in basso a destra. Senza PIN restano 4 caselle da compilare a penna.
const POSTIT = { x: MARGIN_X, y: 28, w: 104, h: 90, fold: 15 } as const;

function postIt(m: LetterModel, env: RenderEnv): Content[] {
  const { x, y, w, h, fold } = POSTIT;
  const shape: ContentCanvas = {
    absolutePosition: { x, y },
    canvas: [
      {
        type: "polyline",
        closePath: true,
        lineWidth: 1,
        lineColor: PDF_COLORS.line,
        points: [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h - fold },
          { x: w - fold, y: h },
          { x: 0, y: h },
        ],
      },
      {
        type: "polyline",
        closePath: true,
        lineWidth: 0.8,
        lineColor: PDF_COLORS.line,
        color: "#D0D0D0",
        points: [
          { x: w, y: h - fold },
          { x: w - fold, y: h - fold },
          { x: w - fold, y: h },
        ],
      },
    ],
  };
  const digits: Content = m.pin
    ? { text: m.pin, bold: true, fontSize: 30, characterSpacing: 5, lineHeight: 1, margin: [0, 4, 0, 6] }
    : {
        table: { widths: [15, 15, 15, 15], heights: [24], body: [["", "", "", ""]] },
        layout: {
          hLineWidth: () => 0.8,
          vLineWidth: () => 0.8,
          hLineColor: () => PDF_COLORS.line,
          vLineColor: () => PDF_COLORS.line,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
        margin: [0, 5, 0, 7],
      };
  const text: Content = {
    absolutePosition: { x: x + 11, y: y + 10 },
    stack: [
      { text: "PIN", bold: true, fontSize: 9, characterSpacing: 3, lineHeight: 1 },
      digits,
      rich(
        plainPieces(`${m.roomLabel.split(" · ")[0].toUpperCase()} ${m.room}`),
        { width: POSTIT.w - 22, size: 7.5, lineHeight: 1, setSize: true, setLineHeight: true, characterSpacing: 1, color: PDF_COLORS.muted, alignment: "left" },
        env,
      ),
    ],
  };
  return [shape, text];
}

function letterPage(m: LetterModel, logoDataUrl: string, qrDataUrl: string, isFirst: boolean, env: RenderEnv): Content[] {
  const compact = m.note !== null;
  const { lineHeight } = bodySize(compact);
  const header: Content[] = [
    { image: logoDataUrl, width: compact ? 74 : 86, alignment: "center", margin: [0, 0, 0, 4] },
    {
      text: m.hotelName.toUpperCase(),
      font: "Belleza",
      fontSize: 10.5,
      characterSpacing: 3,
      color: PDF_COLORS.ink,
      alignment: "center",
    },
    { text: m.place, fontSize: 8.5, color: PDF_COLORS.muted, alignment: "center", margin: [0, 2, 0, compact ? 6 : 10] },
  ];

  const guestColumn: Content[] = [];
  if (m.guestName)
    guestColumn.push(
      rich(plainPieces(m.guestName), { width: CONTENT_WIDTH - 90, size: 14, lineHeight, setSize: true, latin: "Belleza", color: PDF_COLORS.ink, alignment: "left" }, env),
    );
  if (m.stayLabel) guestColumn.push({ text: m.stayLabel, fontSize: 9, color: PDF_COLORS.muted, margin: [0, 3, 0, 0] });

  const personal: Content = {
    columns: [
      { width: "*", stack: guestColumn, margin: [0, 10, 0, 0] },
      {
        width: "auto",
        stack: [
          rich(
            plainPieces(m.roomLabel.toUpperCase()),
            { width: 160, size: 7.5, lineHeight, setSize: true, characterSpacing: 1.5, color: PDF_COLORS.muted, alignment: "right" },
            env,
          ),
          { text: m.room, font: "Belleza", fontSize: 30, color: PDF_COLORS.ink, alignment: "right", lineHeight: 1 },
        ],
      },
    ],
    margin: [0, 0, 0, 6],
  };

  const body: Content[] = [...block(m.primary, compact, env)];
  if (m.english) {
    body.push(
      { ...rule(PDF_COLORS.line, 0.4), margin: [0, compact ? 9 : 13, 0, 0] },
      { text: "ENGLISH", font: "Belleza", fontSize: 8, characterSpacing: 2.5, color: PDF_COLORS.ink, margin: [0, compact ? 4 : 5, 0, compact ? 6 : 9] },
      ...block(m.english, compact, env),
    );
  }

  const signature: Content[] = [
    { text: m.signer, font: "Belleza", fontSize: 19, color: PDF_COLORS.ink, margin: [0, 10, 0, 0] },
    { text: m.signerRole, fontSize: 8.5, color: PDF_COLORS.muted, margin: [0, 2, 0, 0] },
  ];

  const qrText: Content[] = [rich(plainPieces(m.qrCaption), { width: 236 - 68 - 8, size: 9, lineHeight: 1.25, setSize: true, setLineHeight: true }, env)];
  if (m.qrCaptionEnglish) {
    qrText.push({ text: m.qrCaptionEnglish, fontSize: 8.5, lineHeight: 1.25, color: PDF_COLORS.muted, margin: [0, 4, 0, 0] });
  }

  // Firma a sinistra, QR con didascalia a destra: restano insieme sulla stessa pagina.
  const footer: Content = {
    columns: [
      { width: "*", stack: signature },
      {
        width: 236,
        columns: [
          { width: "*", stack: qrText, margin: [0, 8, 8, 0] },
          { width: 68, image: qrDataUrl, fit: [68, 68] },
        ],
      },
    ],
    margin: [0, compact ? 6 : 10, 0, 0],
    unbreakable: true,
  };

  // Nota della reception: riquadro con filetto nero, stampata così com'è scritta.
  const note: Content[] = m.note
    ? [
        {
          table: {
            widths: ["*"],
            body: [
              [
                {
                  stack: [
                    rich(
                      plainPieces(m.noteLabel.toUpperCase()),
                      { width: NOTE_WIDTH, size: 7.5, lineHeight, setSize: true, latin: "Belleza", characterSpacing: 1.8, color: PDF_COLORS.ink, margin: [0, 0, 0, 3] },
                      env,
                    ),
                    rich(plainPieces(m.note), { width: NOTE_WIDTH, size: 10.5, lineHeight: 1.25, setSize: true, setLineHeight: true, italics: true }, env),
                  ],
                },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: (i: number) => (i === 0 ? 1.6 : 0),
            vLineColor: () => PDF_COLORS.line,
            paddingLeft: () => 11,
            paddingRight: () => 10,
            paddingTop: () => 7,
            paddingBottom: () => 8,
          },
          margin: [0, 9, 0, 0],
        },
      ]
    : [];

  // Con la nota il testo si stringe di poco, così la lettera resta su una sola pagina.
  return [
    {
      stack: [
        ...postIt(m, env),
        { stack: header },
        personal,
        { ...rule(PDF_COLORS.line), margin: [0, 0, 0, 12] },
        ...body,
        ...note,
        footer,
      ],
      ...(compact ? { fontSize: 9.7, lineHeight: 1.22 } : {}),
      ...(isFirst ? {} : { pageBreak: "before" as const }),
    },
  ];
}

/** Un PDF con una pagina A4 per ogni lettera, nell'ordine ricevuto. */
export function buildDocDefinition(letters: readonly LetterModel[], assets: EmbeddedAssets, env: RenderEnv = { measure: null }): TDocumentDefinitions {
  const logo = `data:image/png;base64,${assets.logoBwPng}`;
  const qr = `data:image/png;base64,${assets.qrPng}`;
  return {
    pageSize: "A4",
    pageMargins: [MARGIN_X, 34, MARGIN_X, 30],
    info: { title: "Lettere di benvenuto – Chalet Hotel Hartmann", author: "AlpStay", creator: "AlpStay" },
    defaultStyle: { font: "Lato", fontSize: 10.5, lineHeight: 1.32, color: PDF_COLORS.ink },
    content: letters.flatMap((m, i) => letterPage(m, logo, qr, i === 0, env)),
  };
}
