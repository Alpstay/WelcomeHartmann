/**
 * Legge la casella Gmail dedicata ai Guest Pass e pubblica guestpass.json (cifrato con la password reception).
 *   node tools/guestpass-feed.mjs guestpass.json
 * Variabili (segreti del repository): GUESTPASS_GMAIL, GUESTPASS_APP_PASSWORD (password per le app di Google),
 * ARRIVI_PASSWORD. Solo per le prove: GUESTPASS_IMAP_HOST, GUESTPASS_IMAP_PORT, GUESTPASS_IMAP_SECURE=0.
 *
 * Sicurezza: la casella si apre in sola lettura; si accettano solo email inviate da sgp01@feratel.tv; i link dei
 * pass sono credenziali e restano solo nel file cifrato. Il registro di GitHub Actions di un repository pubblico è
 * pubblico: il programma stampa solo conteggi, mai nomi, link o indirizzi.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { decryptJson, encryptJson, FEED_ITERATIONS } from "../feed";
import {
  firmaFeratel,
  guestpassAad,
  isGuestPassEnvelope,
  linguaEmail,
  passDaHtmlSenzaDom,
  passDaTesto,
  testoDaHtml,
  unisciPass,
} from "../avvisi/guestpass";
import type { EmailGuestPass, GuestPassEnvelope, GuestPassPayload } from "../avvisi/guestpass";

export const MITTENTE = "sgp01@feratel.tv";
/** Email più vecchie di così non servono più: il Guest Pass vale per il soggiorno. */
export const GIORNI_FINESTRA = 8;
const MAX_EMAIL = 200;

export interface MessaggioGrezzo {
  readonly messageId: string;
  readonly data: Date;
  /** indirizzo del mittente (From), in minuscolo */
  readonly mittente: string;
  readonly html: string;
  readonly testo: string;
  /** righe Authentication-Results, dall'alto (la prima è quella di Gmail) */
  readonly auth: readonly string[];
}

const impronta = (s: string): string => createHash("sha256").update(s).digest("hex").slice(0, 20);

/** Dalle email grezze alle voci del file: solo mittente feratel, solo email con almeno un pass valido. */
export function elabora(messaggi: readonly MessaggioGrezzo[], adesso = new Date()): EmailGuestPass[] {
  const limite = adesso.getTime() - GIORNI_FINESTRA * 864e5;
  const visti = new Set<string>();
  const out: EmailGuestPass[] = [];
  for (const m of [...messaggi].sort((a, b) => b.data.getTime() - a.data.getTime())) {
    if (m.mittente !== MITTENTE || m.data.getTime() < limite) continue;
    const id = impronta(m.messageId || `${m.data.toISOString()}|${m.testo.slice(0, 200)}`);
    if (visti.has(id)) continue;
    const pass = unisciPass(passDaHtmlSenzaDom(m.html), passDaTesto(m.testo));
    if (pass.length === 0) continue;
    visti.add(id);
    out.push({ id, ricevuta: m.data.toISOString(), lingua: linguaEmail(`${m.testo}\n${testoDaHtml(m.html)}`), firmata: firmaFeratel(m.auth), pass });
    if (out.length >= MAX_EMAIL) break;
  }
  return out;
}

/** Legge le email di sgp01@feratel.tv degli ultimi giorni, in sola lettura (anche quelle archiviate). */
export async function leggiCasella(utente: string, password: string, adesso = new Date()): Promise<MessaggioGrezzo[]> {
  const client = new ImapFlow({
    host: process.env.GUESTPASS_IMAP_HOST || "imap.gmail.com",
    port: Number(process.env.GUESTPASS_IMAP_PORT || 993),
    secure: process.env.GUESTPASS_IMAP_SECURE !== "0",
    auth: { user: utente, pass: password },
    logger: false,
  });
  try {
    await client.connect();
  } catch (e) {
    client.close(); // altrimenti la connessione rifiutata tiene vivo il programma
    throw e;
  }
  const out: MessaggioGrezzo[] = [];
  try {
    const caselle = await client.list();
    const tutte = caselle.find((c) => c.specialUse === "\\All");
    await client.mailboxOpen(tutte ? tutte.path : "INBOX", { readOnly: true });
    const dal = new Date(adesso.getTime() - GIORNI_FINESTRA * 864e5);
    const uids = (await client.search({ from: MITTENTE, since: dal }, { uid: true })) || [];
    if (uids.length > 0) {
      for await (const msg of client.fetch(uids.slice(-MAX_EMAIL), { source: true }, { uid: true })) {
        if (!msg.source) continue;
        const p = await simpleParser(msg.source);
        out.push({
          messageId: p.messageId ?? "",
          data: p.date ?? adesso,
          mittente: (p.from?.value[0]?.address ?? "").toLowerCase(),
          html: typeof p.html === "string" ? p.html : "",
          testo: p.text ?? "",
          auth: p.headerLines.filter((h) => h.key === "authentication-results").map((h) => h.line),
        });
      }
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  return out;
}

const giornoRoma = (d: Date): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(d);
const chiave = (items: readonly EmailGuestPass[]): string => JSON.stringify(items.map((i) => [i.id, i.lingua, i.firmata, i.pass]));

async function main(): Promise<void> {
  const file = process.argv[2] || "guestpass.json";
  const statoFile = process.argv[3] || "stato-guestpass.txt";
  const utente = process.env.GUESTPASS_GMAIL?.trim();
  const app = process.env.GUESTPASS_APP_PASSWORD?.replace(/\s+/g, "");
  const pw = process.env.ARRIVI_PASSWORD;
  const stato = (testo: string): void => {
    const prima = existsSync(statoFile) ? readFileSync(statoFile, "utf8").trim() : "";
    if (prima !== testo) writeFileSync(statoFile, testo + "\n");
  };
  if (!utente || !app || !pw) {
    console.log("Segreti mancanti (GUESTPASS_GMAIL, GUESTPASS_APP_PASSWORD, ARRIVI_PASSWORD): niente da fare.");
    return;
  }
  const adesso = new Date();
  let messaggi: MessaggioGrezzo[];
  try {
    messaggi = await leggiCasella(utente, app, adesso);
  } catch (e) {
    // solo il tipo di errore, mai dati
    const tipo = (e as { authenticationFailed?: boolean }).authenticationFailed ? "accesso alla casella rifiutato" : "casella non raggiungibile";
    stato(`errore · ${tipo}`);
    console.log(`Guest Pass: ${tipo}.`);
    process.exitCode = 1;
    return;
  }
  const items = elabora(messaggi, adesso);

  // Si riscrive il file solo se le email sono cambiate: la cifratura cambia a ogni giro e farebbe un commit inutile.
  if (existsSync(file)) {
    try {
      const env: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (isGuestPassEnvelope(env)) {
        const vecchio = await decryptJson<GuestPassPayload>(env.enc, pw, guestpassAad(env.from));
        if (chiave(vecchio.items) === chiave(items)) {
          stato("ok");
          console.log(`Guest Pass: nessuna novità (${items.length} email).`);
          return;
        }
      }
    } catch {
      /* file illeggibile o password cambiata: si riscrive */
    }
  }
  const from = giornoRoma(adesso);
  const payload: GuestPassPayload = { items };
  const env: GuestPassEnvelope = {
    format: 1,
    app: "WelcomeHartmann",
    kind: "guestpass",
    generated_at: adesso.toISOString(),
    from,
    count: items.length,
    enc: await encryptJson(payload, pw, guestpassAad(from), FEED_ITERATIONS),
  };
  // controllo: il file si deve poter riaprire con la stessa password
  const prova = await decryptJson<GuestPassPayload>(env.enc, pw, guestpassAad(from));
  if (chiave(prova.items) !== chiave(items)) throw new Error("verifica della cifratura non riuscita");
  writeFileSync(file, JSON.stringify(env) + "\n");
  stato("ok");
  const nPass = items.reduce((n, i) => n + i.pass.length, 0);
  console.log(`Guest Pass: ${items.length} email, ${nPass} pass pubblicati (cifrati).`);
}

if (process.argv[1] && /guestpass-feed\.(m?js|ts)$/.test(process.argv[1])) {
  // tempo massimo: una casella che non risponde non deve tenere occupato il workflow
  const limite = setTimeout(() => {
    console.log("Guest Pass: la casella non risponde (tempo scaduto).");
    process.exit(1);
  }, 90_000);
  main()
    .catch(() => {
      console.log("Guest Pass: errore imprevisto.");
      process.exitCode = 1;
    })
    .finally(() => clearTimeout(limite));
}
