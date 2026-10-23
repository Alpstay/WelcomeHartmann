# WelcomeHartmann

Lettera di benvenuto al check-in presso l'AlpStay Chalet Hotel Hartmann.

Pagina: https://alpstay.github.io/WelcomeHartmann/

- Si sceglie il giorno di arrivo, si controllano nome e lingua di ogni ospite e si crea un PDF con
  una pagina A4 per camera: testo nella lingua dell'ospite e, sotto, in inglese. Lingue: tedesco,
  italiano, inglese, francese, olandese, polacco, ceco, spagnolo, danese, svedese, cinese (semplificato),
  coreano e arabo. Per cinese, coreano e arabo la pagina scarica i font da `fonts/` solo quando servono;
  l'arabo nel PDF va da destra a sinistra (`src/bidi.ts`).
- WhatsApp di benvenuto dalla riga della camera: il telefono dell'intestatario arriva da Slope (blocco
  contatti cifrato di `arrivi.json`) e si può correggere a mano; i numeri segnaposto dei portali non
  vengono usati. «WhatsApp» apre la chat (api.whatsapp.com: wa.me da computer rovina le emoji) con il messaggio nella lingua dell'ospite: un testo unico che fonde
  la lettera (saluto con il nome, camera e piano, PIN se compilato, bar, link alle informazioni Hartmann) con
  il testo WhatsApp della reception del 24/10/2026 (orari, servizi, ristoranti, Guest Pass, autobus, taxi).
  Testi in `src/whatsapp-welcome.ts`.
- Gli arrivi arrivano da La Scatola tramite `arrivi.json`, aggiornato ogni ora (alle :40, dalle 7:40
  alle 17:40) da un'attività pianificata (procedura in `tools/AGGIORNA.md`). Nomi e lingue sono cifrati: la prima
  volta su ogni dispositivo la pagina chiede la password reception.
- In arrivo: aggiornamento direttamente da GitHub Actions dal connettore La Scatola (`/mcp`), senza
  Claude. Pronto nel repository, manca solo il `client_id` dell'amministratore della Scatola: vedi
  `tools/GITHUB.md`.
- Senza dati si possono sempre creare lettere a mano.
- «Riepilogo WhatsApp»: testo con gli arrivi selezionati (camera, nome, date, lingua, note e, a
  scelta, i PIN) da copiare o aprire in WhatsApp, dove si sceglie il gruppo a cui inviarlo.

- «Impostazioni» (in alto a destra): si modificano tutti i testi — dati dell'hotel (Wi-Fi, numero per le
  emergenze, orari della colazione, firma), lettera in ognuna delle 13 lingue (frasi con segnaposto come
  `{camera}`, `{telefono}`) e messaggio WhatsApp per lingua, con anteprima. Le modifiche si salvano nel
  browser di quel computer (solo le parti cambiate); «Esporta»/«Importa» le portano su un altro computer;
  «Ripristina» torna ai testi predefiniti (`src/texts.ts`, `src/hotel.ts`, `src/whatsapp-welcome.ts`).

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
  nome, lingua, PIN, nota e telefono: queste ultime si cancellano dopo la partenza dell'ospite, al
  massimo dopo 14 giorni.
- Il workflow GitHub usa azioni fissate a un commit preciso, perché ha accesso ai segreti.

## Avvisi arrivo (email e WhatsApp pre-arrivo)

Pagina: https://alpstay.github.io/WelcomeHartmann/avvisi/ — stessa password reception delle lettere.

- Ospiti confermati da domani a +5 giorni (configurabile fino a 6): un messaggio per ospite, nella sua
  lingua, con il link personale alla pagina d'arrivo (5DAYTO-ARRIVAL) che contiene check-in online,
  parcheggio e indicazioni. Email con «Apri email»; chi non ha l'email lo riceve su WhatsApp («Apri
  WhatsApp», grassetto mantenuto). Testi in `src/avvisi/testi.ts`.
- I contatti arrivano nel blocco `avvisi` di `arrivi.json`, cifrato con la stessa password; in chiaro
  solo `avvisi_count`.
- Registro degli invii, contatti aggiunti a mano e testi restano nel browser del computer della
  reception (cancellati 30 giorni dopo l'arrivo).

## Check-in online & email (piattaforma reception)

Pagina: https://alpstay.github.io/WelcomeHartmann/checkin/ — stessa password reception di lettere e avvisi.

- Scopo: avere nella scheda cliente di Slope l'email diretta dell'ospite. Chi prenota dai portali ha in Slope solo
  l'indirizzo di inoltro (…@guest.booking.com, …@m.expediapartnercentral.com); l'indirizzo vero entra con il check-in
  online.
- Una riga per prenotazione confermata (oggi → +6 giorni): nome, camera, arrivo, partenza, link di check-in online,
  email, telefono. Quattro stati: check-in online da fare · fatto con email da correggere (portale o dominio scritto
  male) · fatto con email mancante · tutto a posto. Check-in fatto = documento e privacy registrati in Slope.
- Azioni: WhatsApp o email nella lingua dell'ospite (DE, IT, EN per le altre) con il link di check-in, oppure, a
  check-in fatto, la sola richiesta dell'email; «Copia testo» per la chat dell'extranet; «Segna contattato».
- Dati: lo stesso blocco `avvisi` di `arrivi.json` (nessun cambio all'aggiornamento orario). Nel browser resta solo il
  registro «contattato» (id Slope, canale, ora), cancellato 14 giorni dopo l'arrivo.
- Sorgente in `src/checkin/` (regole pure in `regole.ts`), test in `test/checkin.test.ts`; `dist/checkin-prova.html`
  è l'anteprima con ospiti inventati.

## Hotel oggi (AlpStay App Hub)

Lo stesso repository pubblica anche `hotel-oggi.json`: arrivi, partenze, fermate, pickup e
occupazione in portafoglio di Acadia, Hartmann e Saslong per la pagina «Hotel oggi» del hub
(www.saslong.ai). File cifrato, aggiornato ogni ora da un'attività pianificata separata;
procedura in `tools/HOTEL-OGGI.md`, sorgente in `src/hotel-oggi/`.
