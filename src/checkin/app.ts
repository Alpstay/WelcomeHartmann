/**
 * Check-in online & email · Chalet Hotel Hartmann · pagina online
 * (GitHub Pages: https://alpstay.github.io/WelcomeHartmann/checkin/)
 *
 * Elenco della reception: chi ha fatto il check-in online, chi no, e chi l'ha fatto lasciando in Slope l'email del
 * portale o nessuna email. Scopo: avere nella scheda cliente di Slope l'indirizzo diretto dell'ospite.
 *
 * Dati: ../arrivi.json, blocco «avvisi» cifrato (lo stesso della pagina avvisi/), rigenerato ogni ora da La Scatola
 *       (tools/AGGIORNA.md). Si decifra con la password reception: stessa chiave di lettere e avvisi, quindi su un
 *       computer già usato non viene richiesta.
 * Regola: gli ID ricevuti da Slope non vengono mai modificati.
 */
import { avvisiAad, decryptJson, isFeedEnvelope } from "../feed";
import type { AvvisiPayload, FeedEnvelope } from "../feed";
import { emailGuestPassValide, guestpassAad, isGuestPassEnvelope } from "../avvisi/guestpass";
import type { CasellaGuestPass } from "./guestpass";
import { avvia } from "./vista";
import type { Fonte, Lettura } from "./vista";

const FEED_URL = "../arrivi.json";
/** Guest Pass letti dalla casella dedicata (workflow «Guest Pass dalla casella»), come nella pagina avvisi/. */
const GUESTPASS_URL = "../guestpass.json";
const STATO_GUESTPASS_URL = "../stato-guestpass.txt";
/** Stessa chiave della pagina delle lettere e degli avvisi. */
const PW_KEY = "welcomeHartmann.password";

function leggiPassword(): string | null {
  try {
    return localStorage.getItem(PW_KEY);
  } catch {
    return null;
  }
}

function salvaPassword(pw: string | null): void {
  try {
    if (pw) localStorage.setItem(PW_KEY, pw);
    else localStorage.removeItem(PW_KEY);
  } catch {
    /* archivio non disponibile: la password andrà reinserita */
  }
}

async function scaricaFeed(): Promise<FeedEnvelope> {
  const r = await fetch(`${FEED_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const v: unknown = await r.json();
  if (!isFeedEnvelope(v)) throw new Error("formato non riconosciuto");
  return v;
}

let password: string | null = null;

/** Testo di stato-guestpass.txt → avviso per la reception (stessi messaggi della pagina avvisi/). */
function problemaCasella(testo: string): string | null {
  if (!testo.startsWith("errore")) return null;
  return testo.includes("rifiutato")
    ? "la casella non si apre: la password per le app è stata cambiata o revocata. Va rifatta e aggiornata su GitHub (segreto GUESTPASS_APP_PASSWORD)."
    : "la casella non ha risposto all'ultimo controllo: riprovo da solo.";
}

/** Scarica guestpass.json e lo decifra con la password reception. Senza file la casella risulta non attiva. */
async function leggiGuestPass(): Promise<CasellaGuestPass> {
  const pw = password;
  let problema: string | null = null;
  try {
    const r = await fetch(`${STATO_GUESTPASS_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (r.ok) problema = problemaCasella((await r.text()).trim());
  } catch {
    /* stato non disponibile: non è un problema */
  }
  if (!pw) return { attiva: false, email: [], problema };
  let env: unknown;
  try {
    const r = await fetch(`${GUESTPASS_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return { attiva: problema !== null, email: [], problema };
    env = await r.json();
  } catch {
    return { attiva: problema !== null, email: [], problema };
  }
  if (!isGuestPassEnvelope(env)) return { attiva: true, email: [], problema: problema ?? "il file dei Guest Pass arrivati non è nel formato atteso." };
  try {
    const dati = await decryptJson<unknown>(env.enc, pw, guestpassAad(env.from));
    return { attiva: true, email: emailGuestPassValide(dati), problema };
  } catch {
    return { attiva: true, email: [], problema: "i Guest Pass arrivati non si aprono con la password reception (segreto ARRIVI_PASSWORD su GitHub)." };
  }
}

const fonte: Fonte = {
  prova: false,
  async leggi(pwNuova: string | null): Promise<Lettura> {
    let env: FeedEnvelope;
    try {
      env = await scaricaFeed();
    } catch {
      return { esito: "errore", titolo: "Non riesco a scaricare gli arrivi", dettaglio: "Controlla la connessione a internet e premi Riprova." };
    }
    if (!env.avvisi) {
      return {
        esito: "errore",
        titolo: "Email e link di check-in non ancora disponibili",
        dettaglio: "Arrivano con il prossimo aggiornamento orario degli arrivi da Slope. Riprova più tardi.",
      };
    }
    const pw = pwNuova ?? password ?? leggiPassword();
    if (!pw) return { esito: "password", errore: null };
    try {
      const dati = await decryptJson<AvvisiPayload>(env.avvisi, pw, avvisiAad(env.from));
      password = pw;
      if (pwNuova) salvaPassword(pw);
      return {
        esito: "ok",
        dati: {
          righe: dati.items,
          da: env.from,
          a: env.to,
          aggiornatoAlle: env.scatola_updated_at,
          generatoAlle: env.generated_at,
          freschezza: env.freshness,
        },
      };
    } catch {
      password = null;
      return { esito: "password", errore: pwNuova ? "Password errata. Riprova." : "La password salvata non apre i dati: inseriscila di nuovo." };
    }
  },
  dimentica(): void {
    password = null;
    salvaPassword(null);
  },
  leggiGuestPass,
};

if (typeof document !== "undefined") void avvia(fonte);
