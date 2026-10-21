/**
 * Testi e composizione dei messaggi pre-arrivo dello Chalet Hotel Hartmann (email e WhatsApp).
 * Usati dalla pagina avvisi/ e dalla pagina di prova dei testi: un solo posto per testi, link e numeri.
 * Regola: gli ID ricevuti da Slope non vengono mai modificati (finiscono identici nei link).
 */

/** Il link personale: pagina d'arrivo nella lingua dell'ospite, con il suo check-in online dentro (#ci=<g>~<p>~<r>). */
export const SEGNAPOSTO_LINK_ARRIVO = "{LINK_ARRIVO}";
export const SEGNAPOSTO_NOME = "{NOME}";
export const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const RE_CHECKIN_SLOPE = new RegExp(`^https://booking\\.slope\\.it/g/(${UUID})/(${UUID})/reservations/(${UUID})/check-in$`, "i");
export const LINK_ARRIVO = "https://alpstay.github.io/5DAYTO-ARRIVAL/";

export type Lingua = "de" | "it" | "en";
export type Programma = "mailto" | "gmail";

/** Una prenotazione coperta da un messaggio: più camere dello stesso intestatario diventano un solo invio. */
export interface Membro {
  /** reservation_id Slope (o id dell'ospite a mano), chiave del registro */
  id: string;
  camera: string | null;
  checkinUrl: string | null;
  checkinFatto: boolean;
}

export interface TestoLingua {
  oggetto: string;
  /** email: *grassetto* tolto, perché le email aperte da un link sono solo testo */
  corpo: string;
  /** WhatsApp: *grassetto* mantenuto */
  whatsapp: string;
}

/** Cambia quando cambiano i testi predefiniti: i testi salvati prima su un computer vengono sostituiti. */
export const VERSIONE_TESTI = 3;

/**
 * Testi del 21/10/2026, alla lettera come forniti (inglese) e tradotti (italiano, tedesco), senza emoji.
 * Unica parte variabile: {LINK_ARRIVO}. *Parola* = grassetto su WhatsApp; nell'email gli asterischi spariscono.
 */
const CORPO: Readonly<Record<Lingua, string>> = {
  it: [
    "Che bello: tra pochi giorni sarete nostri ospiti allo Chalet Hotel Hartmann a Ortisei!",
    "Prima di mettervi in viaggio, basta un clic sul vostro *link personale* qui sotto. Trovate tutto in un unico posto: il *check-in online*, il parcheggio e le indicazioni stradali:",
    SEGNAPOSTO_LINK_ARRIVO,
    "Farlo subito ci permette di inviarvi immediatamente:",
    "",
    "* *Il vostro Guest Pass digitale* per i mezzi pubblici.",
    "* *Le istruzioni per il self check-in* (se arrivate dopo le 18:00).",
    "",
    "Buon viaggio, a presto in Val Gardena!",
    "Ezio Prinoth",
    "Il team dello Chalet Hotel Hartmann",
  ].join("\n"),
  de: [
    "Wie schön: In wenigen Tagen sind Sie unsere Gäste im Chalet Hotel Hartmann in St. Ulrich!",
    "Bevor Sie losfahren, klicken Sie einfach auf Ihren *persönlichen Link* unten. Dort finden Sie alles an einem Ort: Ihren *Online-Check-in*, Parkmöglichkeiten und die Anfahrt:",
    SEGNAPOSTO_LINK_ARRIVO,
    "Wenn Sie das jetzt erledigen, können wir Ihnen sofort zusenden:",
    "",
    "* *Ihren digitalen Guest Pass* für die öffentlichen Verkehrsmittel.",
    "* *Ihre Anleitung für den Self-Check-in* (falls Sie nach 18:00 Uhr ankommen).",
    "",
    "Gute Reise und bis bald in Gröden!",
    "Ezio Prinoth",
    "Ihr Team vom Chalet Hotel Hartmann",
  ].join("\n"),
  en: [
    "How lovely: in a few days you will be our guests at Chalet Hotel Hartmann in Ortisei!",
    "Before you hit the road, just click your *personal link* below. It has everything you need in one place: your *online check-in*, parking, and directions:",
    SEGNAPOSTO_LINK_ARRIVO,
    "Doing this now allows us to send you right away:",
    "",
    "* *Your digital Guest Pass* for public transport.",
    "* *Your self check-in instructions* (if you arrive after 6:00 pm).",
    "",
    "Have a safe trip, see you soon in Val Gardena!",
    "Ezio Prinoth",
    "The Chalet Hotel Hartmann team",
  ].join("\n"),
};

export const TESTI_PREDEFINITI: Record<Lingua, TestoLingua> = {
  it: { oggetto: "Importante: check-in online prima del vostro arrivo · Chalet Hotel Hartmann", corpo: CORPO.it, whatsapp: CORPO.it },
  de: { oggetto: "Wichtig: Online-Check-in vor Ihrer Anreise · Chalet Hotel Hartmann", corpo: CORPO.de, whatsapp: CORPO.de },
  en: { oggetto: "Important: online check-in before your arrival · Chalet Hotel Hartmann", corpo: CORPO.en, whatsapp: CORPO.en },
};

/** Se un testo usa {NOME} e il nome manca, il saluto resta corretto: «Gentile ospite», «Guten Tag», «Dear guest». */
export const NOME_MANCANTE: Record<Lingua, string> = { it: "ospite", de: "", en: "guest" };

/** Prefissi in cui lo 0 iniziale del numero nazionale non va nel numero internazionale (+49 0170… → +49 170…). */
export const PREFISSI_SENZA_ZERO: ReadonlySet<string> = new Set([
  "20", "27", "30", "31", "32", "33", "34", "36", "40", "41", "43", "44", "45", "46", "47", "48", "49", "61", "64", "90", "91",
]);

/**
 * Numero per WhatsApp (solo cifre, con prefisso internazionale) oppure null se non si può ricavare con sicurezza.
 * Accetta «+», «00», spazi, trattini e parentesi; un cellulare italiano senza prefisso (3xx…) diventa +39.
 */
export function numeroWhatsapp(telefono: string): string | null {
  const t = telefono.trim().replace(/[\s().\/-]/g, "");
  let cifre: string;
  if (t.startsWith("+")) cifre = t.slice(1);
  else if (t.startsWith("00")) cifre = t.slice(2);
  else if (/^3\d{8,9}$/.test(t)) cifre = `39${t}`;
  else return null;
  if (!/^\d+$/.test(cifre)) return null;
  const pref = cifre.slice(0, 2);
  if (PREFISSI_SENZA_ZERO.has(pref) && cifre[2] === "0") cifre = pref + cifre.slice(3);
  if (cifre.length < 8 || cifre.length > 15) return null;
  return numeroPlausibile(cifre) ? cifre : null;
}

/**
 * Scarta i numeri segnaposto dei portali (Expedia scrive «+1111111111» o il proprio servizio clienti
 * «+118662597766»): meglio «Correggi numero» che un WhatsApp a uno sconosciuto.
 */
export function numeroPlausibile(cifre: string): boolean {
  if (/^(\d)\1+$/.test(cifre.slice(1)) || /(\d)\1{6,}/.test(cifre)) return false;
  // Nord America (+1): 10 cifre dopo l'1, prefisso di zona che non inizia con 0 o 1
  if (cifre.startsWith("1")) return cifre.length === 11 && /^[2-9]/.test(cifre.slice(1));
  // Italia (+39): cellulari 3…, fissi 0…
  if (cifre.startsWith("39")) return /^39[03]/.test(cifre);
  return true;
}

/** «+49 1701234567» per mostrarlo alla reception: si vede subito quale numero apre WhatsApp. */
export function mostraNumero(cifre: string): string {
  const pref = cifre.startsWith("39") || PREFISSI_SENZA_ZERO.has(cifre.slice(0, 2)) ? 2 : cifre.length > 11 ? 3 : 2;
  return `+${cifre.slice(0, pref)} ${cifre.slice(pref)}`;
}

/**
 * *grassetto* di WhatsApp: nell'email (solo testo) gli asterischi spariscono. Un asterisco seguito da spazio
 * (l'elenco «* voce») resta com'è.
 */
export function senzaGrassetto(testo: string): string {
  return testo.replace(/\*(\S(?:[^*\n]*?\S)?)\*/g, "$1");
}

/** Link alla pagina d'arrivo per un ospite: nella sua lingua e, se c'è, con il suo check-in già dentro. */
export function linkArrivoPer(lingua: Lingua, checkinUrl: string | null): string {
  const base = `${LINK_ARRIVO}?lang=${lingua}`;
  const m = checkinUrl ? RE_CHECKIN_SLOPE.exec(checkinUrl) : null;
  return m ? `${base}#ci=${m[1]}~${m[2]}~${m[3]}` : base;
}

export const CAMERA: Readonly<Record<Lingua, string>> = { de: "Zimmer", it: "Camera", en: "Room" };

/**
 * Link personale al posto di {LINK_ARRIVO}: per una camera il suo link (con il check-in dentro, se è da fare); con
 * più camere dello stesso intestatario una riga per camera da fare («Zimmer 105: https://…»), altrimenti la pagina
 * d'arrivo senza check-in.
 */
export function linkArrivoTesto(membri: readonly Membro[], lingua: Lingua): string {
  const daFare = membri.map((m, i) => ({ m, n: i + 1 })).filter(({ m }) => m.checkinUrl && !m.checkinFatto);
  if (membri.length === 1 || daFare.length === 0) return linkArrivoPer(lingua, daFare[0]?.m.checkinUrl ?? null);
  return daFare.map(({ m, n }) => `${CAMERA[lingua]} ${m.camera ?? n}: ${linkArrivoPer(lingua, m.checkinUrl)}`).join("\n");
}

/** Compone il testo per un ospite: il testo resta quello scritto, cambiano solo {LINK_ARRIVO} ed eventualmente {NOME}. */
export function componi(modello: string, lingua: Lingua, nome: string, membri: readonly Membro[]): string {
  return modello
    .split(SEGNAPOSTO_LINK_ARRIVO)
    .join(linkArrivoTesto(membri, lingua))
    .split(SEGNAPOSTO_NOME)
    .join(nome.trim() || NOME_MANCANTE[lingua])
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function linkEmail(programma: Programma, a: string[], oggetto: string, corpo: string): string {
  const enc = encodeURIComponent;
  if (programma === "gmail") {
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(a.join(","))}&su=${enc(oggetto)}&body=${enc(corpo)}`;
  }
  // Outlook (desktop) riconosce solo il punto e virgola come separatore tra indirizzi
  const destinatari = a.map((x) => enc(x).replace(/%40/g, "@")).join(";");
  return `mailto:${destinatari}?subject=${enc(oggetto)}&body=${enc(corpo.replace(/\r?\n/g, "\r\n"))}`;
}
