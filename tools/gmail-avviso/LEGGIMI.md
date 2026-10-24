# Guest Pass in pochi minuti: avviso dalla Gmail a GitHub

**Il problema (verificato il 24/10/2026):** il workflow «Guest Pass dalla casella» è pianificato ogni 15 minuti, ma
GitHub esegue i workflow pianificati quando ha posto. Il 23–24/10 è partito ogni 4–5 ore: un Guest Pass generato in
LTS poteva comparire nella pagina reception anche mezza giornata dopo.

**La soluzione:** un piccolo script nella Gmail `guestpass.hartmann@gmail.com` (Google Apps Script). Ogni 5 minuti,
dentro Google, guarda se è arrivata un'email nuova di `sgp01@feratel.tv` e in quel caso avvia subito il workflow
(l'avvio a comando GitHub non lo rimanda). Risultato: il pass compare nella pagina entro 5–10 minuti. Il workflow
pianificato resta come riserva.

Lo script non legge il contenuto delle email e non manda nomi o link a nessuno: chiama solo «avvia il workflow» di
GitHub e mette l'etichetta `guestpass-avvisato` alle email già segnalate.

## 1. Token GitHub (5 minuti, una volta)

1. GitHub → foto in alto a destra → **Settings** → **Developer settings** → **Personal access tokens** →
   **Fine-grained tokens** → **Generate new token**.
2. **Token name:** `Avviso Guest Pass Gmail`. **Expiration:** 1 anno (segnati la data: allo scadere si rifà).
3. **Resource owner:** `Alpstay`. **Repository access:** *Only select repositories* → `Alpstay/WelcomeHartmann`.
4. **Permissions → Repository permissions → Actions:** *Read and write*. Nient'altro.
5. **Generate token** e copia il token (`github_pat_…`): GitHub lo mostra una volta sola.
   Se l'organizzazione Alpstay chiede l'approvazione dei token, approvala da Alpstay → Settings → Personal access tokens.

## 2. Script nella Gmail dedicata

1. Entra in Google con **guestpass.hartmann@gmail.com** e apri https://script.google.com → **Nuovo progetto**.
   Rinominalo «Avviso Guest Pass».
2. Cancella il contenuto di `Codice.gs` e incolla **tutto** il file `avviso-guestpass.gs` di questa cartella. Salva.
3. **Impostazioni progetto** (rotellina a sinistra) → **Proprietà script** → **Aggiungi proprietà script**:
   nome `GITHUB_TOKEN`, valore il token del passo 1. Salva.
4. Torna all'editor, scegli la funzione **installa** nel menu in alto e premi **Esegui**. Google chiede le
   autorizzazioni (Gmail, servizi esterni, attivatori): accetta con lo stesso account. Nel registro deve comparire
   «Attivatore creato: ogni 5 minuti.»
5. Prova: scegli **controllaGuestPass** e premi **Esegui**. Se nella casella ci sono email di feratel degli ultimi
   3 giorni non ancora segnalate, su GitHub → Actions parte «Guest Pass dalla casella» (evento *workflow_dispatch*).

## Se qualcosa non va

- **Errore 401 o 403:** token scaduto o senza il permesso *Actions: Read and write* su WelcomeHartmann → rifallo
  (passo 1) e aggiorna la proprietà `GITHUB_TOKEN`.
- **Errore «Manca GITHUB_TOKEN»:** la proprietà dello script non c'è o ha un altro nome.
- Google manda per email un riepilogo degli errori dello script: è il segnale che il token va rifatto.
- Per fermare tutto: Apps Script → **Attivatori** (sveglia a sinistra) → elimina l'attivatore.

Il codice sorgente è `avviso-guestpass.ts` (TypeScript); `avviso-guestpass.gs` si rigenera con `node build.mjs`.
