// Definizione PDF (pdfmake) delle lettere: una pagina A4 per camera.
// Funzione pura: la stessa definizione è usata nel browser e nel test di stampa in Node.

import type { Content, ContentCanvas, ContentText, TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";
import type { EmbeddedAssets } from "./assets.generated";
import type { LetterBlock, LetterModel, Paragraph } from "./types";

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

const rule = (color: string, width = 0.5): ContentCanvas => ({
  canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: width, lineColor: color }],
});

const para = (p: Paragraph, gap: number): ContentText => ({
  text: p.map((s) => ({ text: s.text, bold: s.bold === true })),
  margin: [0, 0, 0, gap],
});

/** compact: versione più stretta usata quando la lettera ha una nota, per restare su una pagina. */
function block(b: LetterBlock, compact: boolean): Content[] {
  const gap = compact ? 2.5 : 4;
  return [
    { text: b.headline, font: "Belleza", fontSize: compact ? 14.5 : 16, color: PDF_COLORS.ink, margin: [0, 0, 0, compact ? 5 : 8] },
    { text: b.salutation, margin: [0, 0, 0, gap] },
    ...b.paragraphs.map((p) => para(p, gap)),
    {
      text: [
        { text: `${b.wifiLabel}: `, color: PDF_COLORS.muted },
        { text: b.wifiValue, bold: true },
      ],
      margin: [0, 1, 0, gap],
    },
    para(b.emergency, gap),
    { text: b.closing, italics: true, margin: [0, 1, 0, 0] },
  ];
}

// Post-it con il PIN, in alto a sinistra accanto al logo. Disegnato a linee nere (stampante in bianco e nero):
// angolo piegato in basso a destra. Senza PIN restano 4 caselle da compilare a penna.
const POSTIT = { x: MARGIN_X, y: 28, w: 104, h: 90, fold: 15 } as const;

function postIt(m: LetterModel): Content[] {
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
      { text: `${m.roomLabel.split(" · ")[0].toUpperCase()} ${m.room}`, fontSize: 7.5, characterSpacing: 1, color: PDF_COLORS.muted, lineHeight: 1 },
    ],
  };
  return [shape, text];
}

function letterPage(m: LetterModel, logoDataUrl: string, qrDataUrl: string, isFirst: boolean): Content[] {
  const compact = m.note !== null;
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
  if (m.guestName) guestColumn.push({ text: m.guestName, font: "Belleza", fontSize: 14, color: PDF_COLORS.ink });
  if (m.stayLabel) guestColumn.push({ text: m.stayLabel, fontSize: 9, color: PDF_COLORS.muted, margin: [0, 3, 0, 0] });

  const personal: Content = {
    columns: [
      { width: "*", stack: guestColumn, margin: [0, 10, 0, 0] },
      {
        width: "auto",
        stack: [
          { text: m.roomLabel.toUpperCase(), fontSize: 7.5, characterSpacing: 1.5, color: PDF_COLORS.muted, alignment: "right" },
          { text: m.room, font: "Belleza", fontSize: 30, color: PDF_COLORS.ink, alignment: "right", lineHeight: 1 },
        ],
      },
    ],
    margin: [0, 0, 0, 6],
  };

  const body: Content[] = [...block(m.primary, compact)];
  if (m.english) {
    body.push(
      { ...rule(PDF_COLORS.line, 0.4), margin: [0, compact ? 9 : 13, 0, 0] },
      { text: "ENGLISH", font: "Belleza", fontSize: 8, characterSpacing: 2.5, color: PDF_COLORS.ink, margin: [0, compact ? 4 : 5, 0, compact ? 6 : 9] },
      ...block(m.english, compact),
    );
  }

  const signature: Content[] = [
    { text: m.signer, font: "Belleza", fontSize: 19, color: PDF_COLORS.ink, margin: [0, 10, 0, 0] },
    { text: m.signerRole, fontSize: 8.5, color: PDF_COLORS.muted, margin: [0, 2, 0, 0] },
  ];

  const qrText: Content[] = [{ text: m.qrCaption, fontSize: 9, lineHeight: 1.25 }];
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
                    { text: m.noteLabel.toUpperCase(), font: "Belleza", fontSize: 7.5, characterSpacing: 1.8, color: PDF_COLORS.ink, margin: [0, 0, 0, 3] },
                    { text: m.note, italics: true, fontSize: 10.5, lineHeight: 1.25 },
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
        ...postIt(m),
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
export function buildDocDefinition(letters: readonly LetterModel[], assets: EmbeddedAssets): TDocumentDefinitions {
  const logo = `data:image/png;base64,${assets.logoBwPng}`;
  const qr = `data:image/png;base64,${assets.qrPng}`;
  return {
    pageSize: "A4",
    pageMargins: [MARGIN_X, 34, MARGIN_X, 30],
    info: { title: "Lettere di benvenuto – Chalet Hotel Hartmann", author: "AlpStay", creator: "AlpStay" },
    defaultStyle: { font: "Lato", fontSize: 10.5, lineHeight: 1.32, color: PDF_COLORS.ink },
    content: letters.flatMap((m, i) => letterPage(m, logo, qr, i === 0)),
  };
}
