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

## Hotel oggi (AlpStay App Hub)

Lo stesso repository pubblica anche `hotel-oggi.json`: arrivi, partenze, fermate, pickup e
occupazione in portafoglio di Acadia, Hartmann e Saslong per la pagina «Hotel oggi» del hub
(www.saslong.ai). File cifrato, aggiornato ogni ora da un'attività pianificata separata;
procedura in `tools/HOTEL-OGGI.md`, sorgente in `src/hotel-oggi/`.
