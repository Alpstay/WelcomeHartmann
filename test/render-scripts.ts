// Test di stampa per cinese, coreano e arabo: dati inventati (nessun ospite reale).
// Uso: npx esbuild test/render-scripts.ts --bundle --platform=node --outfile=out/rs.cjs && node out/rs.cjs out/scripts.pdf
import { readFileSync, writeFileSync } from "node:fs";
import { ASSETS } from "../src/assets.generated";
import { scriptFontOf } from "../src/bidi";
import { buildLetter } from "../src/letter";
import { SCRIPT_FONT_FILES, buildDocDefinition, pdfFonts, pdfVfs, scriptFontsFor } from "../src/pdf";
import type { Measure } from "../src/pdf";
import type { LetterInput } from "../src/types";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require("pdfmake");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fontkit = require("@foliojs-fork/fontkit");

const NOTE_AR = "عيد ميلاد سعيد! في الغرفة زجاجة ترحيب مقدمة من الفندق، وتذكرة التزلج جاهزة في الاستقبال من الساعة 8:00.";
const samples: LetterInput[] = [
  { reservationId: null, room: "107", guestName: "Kim Min-jun", lang: "ko", arrival: "2026-10-24", departure: "2026-10-27" },
  { reservationId: null, room: "121", guestName: null, lang: "ko", arrival: "2026-10-24", departure: "2026-10-26", pin: "4827" },
  { reservationId: null, room: "119", guestName: "Wang Wei", lang: "zh", arrival: "2026-10-24", departure: "2026-10-28", pin: "0519" },
  { reservationId: null, room: "122", guestName: "王伟", lang: "zh", arrival: "2026-10-24", departure: "2026-10-25", note: "生日快乐！房间里为您准备了一瓶欢迎酒。滑雪通行证已在前台备好，明早 8:00 起即可领取。" },
  { reservationId: null, room: "102", guestName: "Ahmed Al-Mansouri", lang: "ar", arrival: "2026-10-24", departure: "2026-10-29", pin: "3316" },
  { reservationId: null, room: "121", guestName: "محمد العتيبي", lang: "ar", arrival: "2026-10-24", departure: "2026-10-26", note: NOTE_AR },
  { reservationId: null, room: "105", guestName: "Sample Guest", lang: "en", arrival: "2026-10-24", departure: "2026-10-26" },
];

const letters = samples.map((s) => buildLetter(s));
const scripts = scriptFontsFor(letters);
const fontDir = process.env.FONT_DIR ?? `${__dirname}/../fonts`;
const vfs: Record<string, Buffer> = Object.fromEntries(Object.entries(pdfVfs(ASSETS)).map(([k, v]) => [k, Buffer.from(v, "base64")]));
for (const f of scripts) for (const file of Object.values(SCRIPT_FONT_FILES[f])) vfs[file] = readFileSync(`${fontDir}/${file}`);

const dict = pdfFonts(scripts);
const fonts: Record<string, Record<string, Buffer>> = {};
const kit: Record<string, { normal: { layout(t: string): { advanceWidth: number }; unitsPerEm: number }; bold: { layout(t: string): { advanceWidth: number }; unitsPerEm: number } }> = {};
for (const [fam, styles] of Object.entries(dict)) {
  fonts[fam] = {};
  for (const [style, file] of Object.entries(styles as Record<string, string>)) fonts[fam][style] = vfs[file];
  const s = styles as Record<string, string>;
  kit[fam] = { normal: fontkit.create(vfs[s.normal]), bold: fontkit.create(vfs[s.bold]) };
}
const measure: Measure = (text, font, bold, size) => {
  const f = kit[font][bold ? "bold" : "normal"];
  return (f.layout(text).advanceWidth / f.unitsPerEm) * size;
};

console.log("font:", [...scripts].join(", "), "| nome cinese:", scriptFontOf("王伟"));
const printer = new PdfPrinter(fonts);
const doc = printer.createPdfKitDocument(buildDocDefinition(letters, ASSETS, { measure }));
const chunks: Buffer[] = [];
doc.on("data", (c: Buffer) => chunks.push(c));
doc.on("end", () => {
  const out = process.argv[2] ?? "out/scripts.pdf";
  writeFileSync(out, Buffer.concat(chunks));
  console.log("PDF ok", out, Buffer.concat(chunks).length, "byte, lettere:", letters.length);
});
doc.end();
