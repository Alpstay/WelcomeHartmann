// Cifra il link del gruppo WhatsApp per la pagina avvisi/ (il repository è pubblico):
//   node tools/avvisi-gruppo.mjs "<PASSWORD RECEPTION>" "https://chat.whatsapp.com/…"
// Scrive src/avvisi/gruppo.enc.json; poi `node build.mjs` lo incorpora nella pagina.
import { writeFileSync } from "node:fs";
import { FEED_ITERATIONS, decryptJson, encryptJson } from "../feed";
import { GRUPPO_AAD, GRUPPO_FILE } from "./gruppo";

const [password, link] = process.argv.slice(2);
if (!password || !link || !/^https:\/\/(chat\.whatsapp\.com\/|(www\.)?whatsapp\.com\/channel\/|wa\.me\/)\S+$/i.test(link)) {
  process.stdout.write('ERRORE uso: node tools/avvisi-gruppo.mjs "<PASSWORD RECEPTION>" "https://chat.whatsapp.com/…"\n');
  process.exit(2);
}
const enc = await encryptJson({ link: link.trim() }, password, GRUPPO_AAD, FEED_ITERATIONS);
const back = await decryptJson<{ link: string }>(enc, password, GRUPPO_AAD);
if (back.link !== link.trim()) throw new Error("verifica non riuscita");
writeFileSync(GRUPPO_FILE, `${JSON.stringify(enc, null, 1)}\n`);
process.stdout.write(`PRONTO ${GRUPPO_FILE} scritto: ora node build.mjs\n`);
