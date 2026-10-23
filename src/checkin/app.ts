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
import { avvia } from "./vista";
import type { Fonte, Lettura } from "./vista";

const FEED_URL = "../arrivi.json";
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
};

if (typeof document !== "undefined") void avvia(fonte);
