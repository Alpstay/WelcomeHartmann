// Generato da src/avvisi/cifra-gruppo.ts con build.mjs: non modificare a mano.

// src/avvisi/cifra-gruppo.ts
import { writeFileSync } from "node:fs";

// src/feed.ts
var ITERATIONS = 25e4;
var FEED_ITERATIONS = 6e5;
var subtle = () => {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto non disponibile");
  return c.subtle;
};
function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
}
function fromB64(text) {
  const s = atob(text);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
async function keyFrom(password2, salt, iter, usage) {
  const base = await subtle().importKey("raw", new TextEncoder().encode(password2), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, [usage]);
}
async function encryptJson(value, password2, aad, iter = ITERATIONS) {
  const c = globalThis.crypto;
  const salt = c.getRandomValues(new Uint8Array(16));
  const iv = c.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password2, salt, iter, "encrypt");
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    key,
    new TextEncoder().encode(JSON.stringify(value))
  );
  return { alg: "AES-GCM/PBKDF2-SHA256", iter, salt: toB64(salt), iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}
async function decryptJson(enc2, password2, aad) {
  const key = await keyFrom(password2, fromB64(enc2.salt), enc2.iter, "decrypt");
  const pt = await subtle().decrypt(
    { name: "AES-GCM", iv: fromB64(enc2.iv), additionalData: new TextEncoder().encode(aad) },
    key,
    fromB64(enc2.ct)
  );
  return JSON.parse(new TextDecoder().decode(pt));
}

// src/avvisi/gruppo.ts
var GRUPPO_AAD = "AvvisiHartmann|gruppo";
var GRUPPO_FILE = "src/avvisi/gruppo.enc.json";

// src/avvisi/cifra-gruppo.ts
var [password, link] = process.argv.slice(2);
if (!password || !link || !/^https:\/\/(chat\.whatsapp\.com\/|(www\.)?whatsapp\.com\/channel\/|wa\.me\/)\S+$/i.test(link)) {
  process.stdout.write('ERRORE uso: node tools/avvisi-gruppo.mjs "<PASSWORD RECEPTION>" "https://chat.whatsapp.com/\u2026"\n');
  process.exit(2);
}
var enc = await encryptJson({ link: link.trim() }, password, GRUPPO_AAD, FEED_ITERATIONS);
var back = await decryptJson(enc, password, GRUPPO_AAD);
if (back.link !== link.trim()) throw new Error("verifica non riuscita");
writeFileSync(GRUPPO_FILE, `${JSON.stringify(enc, null, 1)}
`);
process.stdout.write(`PRONTO ${GRUPPO_FILE} scritto: ora node build.mjs
`);
