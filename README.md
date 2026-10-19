# WelcomeHartmann

Lettera di benvenuto al check-in presso l'AlpStay Chalet Hotel Hartmann.

Pagina: https://alpstay.github.io/WelcomeHartmann/

- Si sceglie il giorno di arrivo, si controllano nome e lingua di ogni ospite e si crea un PDF con
  una pagina A4 per camera: testo nella lingua dell'ospite e, sotto, in inglese.
- Gli arrivi arrivano da La Scatola tramite `arrivi.json`, aggiornato ogni ora (alle :40, dalle 7:40
  alle 17:40) da un'attività pianificata (procedura in `tools/AGGIORNA.md`). Nomi e lingue sono cifrati: la prima
  volta su ogni dispositivo la pagina chiede la password reception.
- In arrivo: aggiornamento direttamente da GitHub Actions dal connettore La Scatola (`/mcp`), senza
  Claude. Pronto nel repository, manca solo il `client_id` dell'amministratore della Scatola: vedi
  `tools/GITHUB.md`.
- Senza dati si possono sempre creare lettere a mano.
- «Riepilogo WhatsApp»: testo con gli arrivi selezionati (camera, nome, date, lingua, note e, a
  scelta, i PIN) da copiare o aprire in WhatsApp, dove si sceglie il gruppo a cui inviarlo.

Sorgente TypeScript in `src/`; build con `npm install && node build.mjs` (scrive anche `index.html`).

## Sicurezza

- Il repository è pubblico: degli ospiti si pubblicano solo date e conteggi in chiaro. Nomi, lingue e
  camere sono in `arrivi.json` cifrati con AES-256-GCM; la chiave deriva dalla password reception con
  PBKDF2-SHA256 a 600 000 iterazioni (i file più vecchi, a 250 000, restano leggibili). La password non
  è mai nel repository.
- `index.html` ha una Content-Security-Policy: gira solo lo script dell'app (impronta sha256 calcolata
  da `build.mjs`) e pdfmake con controllo di integrità (SRI); la pagina può scaricare dati solo dal
  proprio sito, quindi password e nomi non possono essere inviati ad altri indirizzi. Nessun referrer
  verso Google Fonts e jsDelivr. Per aggiornare pdfmake vanno cambiati insieme indirizzo e impronta in
  `src/page.html`.
- Nel browser della reception restano la password (per non chiederla a ogni ora) e le modifiche a
  nome, lingua, PIN e nota: queste ultime si cancellano dopo la partenza dell'ospite, al massimo dopo
  14 giorni.
- Il workflow GitHub usa azioni fissate a un commit preciso, perché ha accesso ai segreti.

## Hotel oggi (AlpStay App Hub)

Lo stesso repository pubblica anche `hotel-oggi.json`: arrivi, partenze, fermate, pickup e
occupazione in portafoglio di Acadia, Hartmann e Saslong per la pagina «Hotel oggi» del hub
(www.saslong.ai). File cifrato, aggiornato ogni ora da un'attività pianificata separata;
procedura in `tools/HOTEL-OGGI.md`, sorgente in `src/hotel-oggi/`.
