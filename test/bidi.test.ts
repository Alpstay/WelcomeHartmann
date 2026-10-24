// Controlli dell'ordine visivo dell'arabo (src/bidi.ts). Uso:
// npx esbuild test/bidi.test.ts --bundle --platform=node --outfile=out/bidi.cjs && node out/bidi.cjs
import { strict as assert } from "node:assert";
import { isRtlText, resolve, tokenize, visualOrder } from "../src/bidi";
import type { Piece } from "../src/bidi";

/** Riga in ordine visivo da sinistra a destra, con "|" tra gli elementi e "_" per gli spazi. */
function visual(pieces: Piece[]): string {
  const text = pieces.map((p) => p.text).join("");
  const para = isRtlText(text) ? "R" : "L";
  const v = visualOrder(resolve(tokenize(pieces), para), para);
  return v.map(({ token, spaceBefore }) => (spaceBefore ? "_" : "") + token.pieces.map((p) => p.text).join("")).join("|");
}

// Frase araba: la prima parola a destra, il numero e il nome latino restano leggibili da sinistra a destra.
assert.equal(visual([{ text: "يسعدنا أن نرحب بكم." }]), ".|بكم|_نرحب|_أن|_يسعدنا");
assert.equal(
  visual([{ text: "في حالات الطوارئ يرجى الاتصال بالرقم " }, { text: "+39 333 6828717", bold: true }, { text: "." }]),
  ".|+39 333 6828717|_بالرقم|_الاتصال|_يرجى|_الطوارئ|_حالات|_في",
);
assert.equal(visual([{ text: "أهلاً وسهلاً بكم في Chalet Hotel Hartmann" }]), "Chalet|_Hotel|_Hartmann|_في|_بكم|_وسهلاً|_أهلاً");
assert.equal(visual([{ text: "كلمة المرور: ", muted: true }, { text: "enjoyhartmann", bold: true }]), "enjoyhartmann|_:|المرور|_كلمة");
// Nome arabo in una frase inglese: la virgola resta in fondo.
assert.equal(visual([{ text: "Dear محمد العتيبي," }]), "Dear|_العتيبي|_محمد|,");
// Etichetta mista.
assert.equal(visual([{ text: "الغرفة · ROOM" }]), "ROOM|_·|_الغرفة");
console.log("bidi: tutti i controlli superati");
