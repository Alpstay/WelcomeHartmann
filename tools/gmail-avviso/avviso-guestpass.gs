// Avviso «Guest Pass arrivato» · Gmail guestpass.hartmann@gmail.com → GitHub «Guest Pass dalla casella».
// Generato da avviso-guestpass.ts con build.mjs: si incolla così com'è in Apps Script (Codice.gs).
// Ogni 5 minuti: se c'è un'email nuova di sgp01@feratel.tv avvia subito il workflow. Token in Proprietà script: GITHUB_TOKEN.
const REPOSITORY = "Alpstay/WelcomeHartmann";
const WORKFLOW = "guestpass.yml";
const ETICHETTA = "guestpass-avvisato";
const RICERCA = `from:sgp01@feratel.tv newer_than:3d -label:${ETICHETTA}`;
function controllaGuestPass() {
  const email = GmailApp.search(RICERCA, 0, 50);
  if (email.length === 0) return;
  const token = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
  if (!token) throw new Error("Manca GITHUB_TOKEN in Impostazioni progetto → Proprietà script.");
  const risposta = UrlFetchApp.fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    payload: JSON.stringify({ ref: "main" }),
    muteHttpExceptions: true
  });
  if (risposta.getResponseCode() !== 204) {
    throw new Error(`GitHub ha risposto ${risposta.getResponseCode()}: ${risposta.getContentText().slice(0, 200)}`);
  }
  (GmailApp.getUserLabelByName(ETICHETTA) ?? GmailApp.createLabel(ETICHETTA)).addToThreads(email);
  console.log(`Workflow avviato per ${email.length} email.`);
}
function installa() {
  const esiste = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === "controllaGuestPass");
  if (!esiste) ScriptApp.newTrigger("controllaGuestPass").timeBased().everyMinutes(5).create();
  console.log(esiste ? "Attivatore già presente." : "Attivatore creato: ogni 5 minuti.");
}
