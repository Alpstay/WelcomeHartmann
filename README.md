# WelcomeHartmann

Lettera di benvenuto al check-in presso l'AlpStay Chalet Hotel Hartmann.

Pagina: https://alpstay.github.io/WelcomeHartmann/

- Si sceglie il giorno di arrivo, si controllano nome e lingua di ogni ospite e si crea un PDF con
  una pagina A4 per camera: testo nella lingua dell'ospite e, sotto, in inglese.
- Gli arrivi arrivano da La Scatola tramite `arrivi.json`, aggiornato ogni ora dalle 8 alle 18 da
  un'attività pianificata (procedura in `tools/AGGIORNA.md`). Nomi e lingue sono cifrati: la prima
  volta su ogni dispositivo la pagina chiede la password reception.
- Senza dati si possono sempre creare lettere a mano.

Sorgente TypeScript in `src/`; build con `npm install && node build.mjs`.
