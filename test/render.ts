// Test di stampa: genera un PDF di prova con dati inventati (nessun ospite reale).
import { writeFileSync } from "node:fs";
import { ASSETS } from "../src/assets.generated";
import { buildLetter, normalizeGuestName, normalizeLang } from "../src/letter";
import { PDF_FONTS, buildDocDefinition, pdfVfs } from "../src/pdf";
import type { LetterInput } from "../src/types";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require("pdfmake");

const samples: LetterInput[] = [
  { reservationId: null, room: "107", guestName: "Esempio Mustermann", lang: "de", arrival: "2026-10-13", departure: "2026-10-16" },
  { reservationId: null, room: "121", guestName: null, lang: "cs", arrival: "2026-10-13", departure: "2026-10-15" },
  { reservationId: null, room: "119", guestName: "Sample Guest", lang: "en", arrival: "2026-12-30", departure: "2027-01-02" },
  { reservationId: null, room: "122", guestName: "Esempio Rossi", lang: "it", arrival: "2026-10-13", departure: "2026-10-14" },
  { reservationId: null, room: "104", guestName: "Exemple Dupont", lang: "fr", arrival: "2026-10-13", departure: "2026-10-14" },
  { reservationId: null, room: "102", guestName: null, lang: "pl", arrival: "2026-10-13", departure: "2026-10-14" },
  { reservationId: null, room: "121", guestName: "Exemple Marie-Christine de La Fontaine-Beauregard", lang: "fr", arrival: "2026-10-13", departure: "2026-10-14" },
  { reservationId: null, room: "121", guestName: "Ejemplo Fernández", lang: "es", arrival: "2026-10-13", departure: "2026-10-14" },
  { reservationId: null, room: "122", guestName: "Eksempel Sørensen", lang: "da", arrival: "2026-10-13", departure: "2026-10-14" },
  { reservationId: null, room: "121", guestName: "Exempel Lindqvist", lang: "sv", arrival: "2026-10-13", departure: "2026-10-14" },
  { reservationId: null, room: "122", guestName: "Voorbeeld van den Berg", lang: "nl", arrival: "2026-10-13", departure: "2026-10-14" },
];


const LONG_NOTE = "Tanti auguri di buon compleanno! In camera trovate una bottiglia di prosecco offerta dalla casa. Lo skipass che avete prenotato è pronto alla reception: potete ritirarlo domattina dalle 8:00. Per la cena vi abbiamo riservato un tavolo alle 19:30.".slice(0, 240);
const withNotes: LetterInput[] = samples.map((s, i) => ({ ...s, note: LONG_NOTE, pin: i % 2 === 0 ? "4827" : null }));

console.log(normalizeGuestName("kang un suk", "kang un suk"), "|", normalizeGuestName("MERRY GRACE", "O'NEIL-SMITH"), "|", normalizeGuestName("Anna", "van der Berg"));
console.log(normalizeLang("de-AT"), normalizeLang("th"), normalizeLang(null));

const fonts: Record<string, Record<string, Buffer>> = {};
const vfs = pdfVfs(ASSETS);
for (const [fam, styles] of Object.entries(PDF_FONTS)) {
  fonts[fam] = {};
  for (const [style, file] of Object.entries(styles as Record<string, string>)) fonts[fam][style] = Buffer.from(vfs[file], "base64");
}
const printer = new PdfPrinter(fonts);
const doc = printer.createPdfKitDocument(buildDocDefinition([...samples.map((s, i) => ({ ...s, pin: i % 3 === 0 ? null : "0519" })), ...withNotes].map((s) => buildLetter(s)), ASSETS));
const chunks: Buffer[] = [];
doc.on("data", (c: Buffer) => chunks.push(c));
doc.on("end", () => { writeFileSync("out/prova.pdf", Buffer.concat(chunks)); console.log("PDF ok", Buffer.concat(chunks).length); });
doc.end();
