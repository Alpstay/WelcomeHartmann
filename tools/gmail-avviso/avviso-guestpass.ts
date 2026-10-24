/**
 * Avviso immediato «Guest Pass arrivato» — Google Apps Script nella Gmail guestpass.hartmann@gmail.com.
 *
 * Perché: GitHub esegue i workflow pianificati quando ha posto, non ogni 15 minuti: il 23–24/10/2026 «Guest Pass dalla
 * casella» è partito ogni 4–5 ore. Questo script gira ogni 5 minuti dentro Google (puntuale): se nella casella c'è
 * un'email nuova di sgp01@feratel.tv, avvia subito il workflow (avvio manuale, che GitHub non rimanda). Il workflow
 * pianificato resta come riserva.
 *
 * Cosa NON fa: non legge il contenuto delle email, non manda link o nomi a nessuno. Chiama solo l'API di GitHub
 * «avvia il workflow» e mette l'etichetta «guestpass-avvisato» alle email già segnalate.
 *
 * Il token GitHub (fine-grained, solo Alpstay/WelcomeHartmann, permesso «Actions: Read and write») sta nelle
 * Proprietà dello script con il nome GITHUB_TOKEN, mai nel codice.
 *
 * Sorgente TypeScript; in Apps Script si incolla `avviso-guestpass.gs` (stesso codice senza tipi, generato da
 * `node build.mjs`). Istruzioni: LEGGIMI.md.
 */

// ——— Tipi minimi delle API di Apps Script usate qui (in Apps Script esistono già) ———
interface GmailThread {
  getId(): string;
}
interface GmailLabel {
  addToThreads(threads: GmailThread[]): GmailLabel;
}
interface HttpResponse {
  getResponseCode(): number;
  getContentText(): string;
}
declare const GmailApp: {
  search(query: string, start: number, max: number): GmailThread[];
  getUserLabelByName(name: string): GmailLabel | null;
  createLabel(name: string): GmailLabel;
};
declare const UrlFetchApp: {
  fetch(
    url: string,
    params: {
      method: "post";
      contentType: string;
      headers: Record<string, string>;
      payload: string;
      muteHttpExceptions: boolean;
    },
  ): HttpResponse;
};
declare const PropertiesService: { getScriptProperties(): { getProperty(key: string): string | null } };
declare const ScriptApp: {
  getProjectTriggers(): { getHandlerFunction(): string }[];
  newTrigger(fn: string): { timeBased(): { everyMinutes(n: number): { create(): unknown } } };
};
declare const console: { log(...x: unknown[]): void };

const REPOSITORY = "Alpstay/WelcomeHartmann";
const WORKFLOW = "guestpass.yml";
const ETICHETTA = "guestpass-avvisato";
/** Email del Guest Pass non ancora segnalate (Gmail esclude da solo spam e cestino). */
const RICERCA = `from:sgp01@feratel.tv newer_than:3d -label:${ETICHETTA}`;

/** Ogni 5 minuti (attivatore creato da `installa`). */
function controllaGuestPass(): void {
  const email = GmailApp.search(RICERCA, 0, 50);
  if (email.length === 0) return;
  const token = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
  if (!token) throw new Error("Manca GITHUB_TOKEN in Impostazioni progetto → Proprietà script.");
  const risposta = UrlFetchApp.fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    payload: JSON.stringify({ ref: "main" }),
    muteHttpExceptions: true,
  });
  // 204 = workflow avviato. Altrimenti niente etichetta: al giro dopo si riprova.
  if (risposta.getResponseCode() !== 204) {
    throw new Error(`GitHub ha risposto ${risposta.getResponseCode()}: ${risposta.getContentText().slice(0, 200)}`);
  }
  (GmailApp.getUserLabelByName(ETICHETTA) ?? GmailApp.createLabel(ETICHETTA)).addToThreads(email);
  console.log(`Workflow avviato per ${email.length} email.`);
}

/** Da eseguire UNA volta dall'editor: crea l'attivatore ogni 5 minuti (non lo duplica se c'è già). */
function installa(): void {
  const esiste = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === "controllaGuestPass");
  if (!esiste) ScriptApp.newTrigger("controllaGuestPass").timeBased().everyMinutes(5).create();
  console.log(esiste ? "Attivatore già presente." : "Attivatore creato: ogni 5 minuti.");
}
