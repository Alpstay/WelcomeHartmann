// Font per cinese, coreano e arabo nel browser: scaricati da fonts/ solo quando una lettera li usa, poi tenuti in
// memoria. Per l'arabo serve anche misurare le parole (per andare a capo da destra a sinistra): si misura su una
// canvas con gli stessi file di font del PDF.

import { ASSETS } from "./assets.generated";
import type { ScriptFont } from "./bidi";
import { SCRIPT_FONT_FILES } from "./pdf";
import type { Measure } from "./pdf";

const files = new Map<string, Promise<ArrayBuffer>>();

async function download(base: string, file: string): Promise<ArrayBuffer> {
  const res = await fetch(`${base}${file}`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`font ${file}: HTTP ${res.status}`);
  return res.arrayBuffer();
}

function fontFile(base: string, file: string): Promise<ArrayBuffer> {
  let p = files.get(file);
  if (!p) {
    p = download(base, file);
    files.set(file, p);
    p.catch(() => files.delete(file));
  }
  return p;
}

const toB64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const fromB64 = (b64: string): ArrayBuffer => {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
};

export interface PreparedFonts {
  /** File da aggiungere al vfs di pdfmake (base64). */
  readonly vfs: Record<string, string>;
  /** Misura per l'arabo (null se nessuna lettera ha testo arabo). */
  readonly measure: Measure | null;
}

const faces = new Map<string, Promise<void>>();

/** Registra un font nel documento con un nome riservato alla misura (non cambia l'aspetto della pagina). */
function addFace(family: string, data: ArrayBuffer, weight: 400 | 700): Promise<void> {
  const key = `${family}|${weight}`;
  let p = faces.get(key);
  if (!p) {
    const face = new FontFace(`WH ${family}`, data, { weight: String(weight) });
    p = face.load().then((f) => {
      document.fonts.add(f);
    });
    faces.set(key, p);
  }
  return p;
}

let canvas: CanvasRenderingContext2D | null = null;

const measure: Measure = (text, font, bold, size) => {
  canvas ??= document.createElement("canvas").getContext("2d");
  if (!canvas) return text.length * size * 0.52;
  // Corpo grande per non perdere precisione con i caratteri piccoli, poi in scala.
  canvas.font = `${bold ? 700 : 400} 100px "WH ${font}"`;
  return (canvas.measureText(text).width * size) / 100;
};

/**
 * Scarica i font di scrittura richiesti e, se c'è arabo, prepara la misura. `base` è la cartella dei font
 * ("fonts/" sulla pagina GitHub, indirizzo completo dentro claude.ai).
 */
export async function prepareFonts(scripts: ReadonlySet<ScriptFont>, base: string): Promise<PreparedFonts> {
  const vfs: Record<string, string> = {};
  const loaded: { font: ScriptFont; normal: ArrayBuffer; bold: ArrayBuffer }[] = [];
  await Promise.all(
    [...scripts].map(async (font) => {
      const { normal, bold } = SCRIPT_FONT_FILES[font];
      const [n, b] = await Promise.all([fontFile(base, normal), fontFile(base, bold)]);
      vfs[normal] = toB64(n);
      vfs[bold] = toB64(b);
      loaded.push({ font, normal: n, bold: b });
    }),
  );
  if (!scripts.has("NotoNaskhArabic")) return { vfs, measure: null };
  await Promise.all([
    addFace("Lato", fromB64(ASSETS.LatoRegular), 400),
    addFace("Lato", fromB64(ASSETS.LatoBold), 700),
    addFace("Belleza", fromB64(ASSETS.Belleza), 400),
    addFace("Belleza", fromB64(ASSETS.Belleza), 700),
    ...loaded.flatMap((l) => [addFace(l.font, l.normal.slice(0), 400), addFace(l.font, l.bold.slice(0), 700)]),
  ]);
  return { vfs, measure };
}
