# Aggiornamento automatico di «Hotel oggi» (La Scatola → AlpStay App Hub)

Procedura per l'attività pianificata che ogni ora rigenera `hotel-oggi.json`: il file che la pagina
**Hotel oggi** dell'AlpStay App Hub (https://www.saslong.ai/) legge da
https://alpstay.github.io/WelcomeHartmann/hotel-oggi.json .
La **password** che cifra il file NON è in questo repository (è pubblico): viene data nel testo
dell'attività pianificata; nel hub la inserisce una volta un amministratore.

Il programma vive in questo repository perché ne riusa la cifratura e la lettura del registro di
sessione; non tocca né `arrivi.json` né la pagina WelcomeHartmann.

## Contenuto (cifrato)

Per Acadia, Hartmann e Saslong, solo dati senza nomi:
- arrivi e partenze del giorno (camera, persone, notti, canale, stato e ora di check-in / check-out);
- fermate (soggiorni iniziati prima di oggi che finiscono dopo oggi);
- pickup delle ultime 24 ore e degli ultimi 7 giorni: prenotazioni create, ancora valide, cancellate,
  importo camera delle valide;
- prenotazioni create negli stessi 7 giorni dell'anno scorso (364 giorni fa) per il barometro;
- occupazione già in portafoglio, giorno per giorno, per i prossimi 90 giorni.

In chiaro restano solo il giorno, l'ora di scrittura e lo stato di aggiornamento di La Scatola.

## Regole

- Gli ID ricevuti da Slope / La Scatola non si modificano mai. Per questo **le risposte non si
  ricopiano a mano**: non salvarle in un file, non riassumerle. Le legge il programma (anche quando il
  sistema le salva in un file perché grandi).
- Gli argomenti stampati dal programma si copiano **identici** nella chiamata (date, filtri,
  group_by, aggregates, limit, cursor). Una chiamata per volta, poi di nuovo `next`.
- `start` e `next` vanno lanciati in **due comandi separati** (il programma cerca nel registro il
  segno stampato da `start`).
- Si pubblica solo `hotel-oggi.json`. Nessun dato di prenotazioni nei comandi, nel messaggio di
  commit o nel riepilogo. Non modificare `index.html`, `arrivi.json`, `src/` né `tools/`.
- Se il programma risponde `ERRORE`: non pubblicare. Il hub continua con l'ultimo file riuscito e
  mostra da solo quanto sono vecchi i dati.

## Passi

1. Dalla cartella del repository: `node tools/hotel-oggi.mjs start "<PASSWORD>"`
2. `node tools/hotel-oggi.mjs next` e fai quello che dice:
   - `CHIAMA mcp__La_Scatola__… {argomenti}`: esegui quella chiamata con quegli argomenti, poi di nuovo `next`.
     Se lo strumento dà errore, riesegui `next`: ripropone la stessa chiamata (dopo 3 errori si ferma).
   - `PRONTO`: `hotel-oggi.json` è scritto e verificato. Vai al passo 3.
   - `ERRORE`: fermati, non pubblicare, riporta il messaggio.
   Di solito servono 10–11 chiamate: arrivi, partenze, ospiti in casa, 5 conteggi di prenotazioni
   e 2–3 pagine di disponibilità.
3. Controllo: `node tools/hotel-oggi.mjs verify "<PASSWORD>"` deve rispondere `verifica OK`.
4. Pubblica: `git add hotel-oggi.json`, commit `Hotel oggi <AAAA-MM-GG HH:MM>`, `git push origin HEAD:main`.
   Se il push è rifiutato perché il repository è cambiato: copia `hotel-oggi.json` fuori dal
   repository, `git fetch origin main`, `git reset --hard origin/main`, rimetti il file, di nuovo add,
   commit e push. Una volta sola. Con errore 403 non insistere: scrivilo nel riepilogo.
5. Riepilogo breve in italiano con le righe `RIEPILOGO` (solo conteggi, nessun importo né dato personale).

## Modifiche al codice

Sorgente in `src/hotel-oggi/` (`model.ts` calcoli, `transcript.ts` lettura del registro, `cli.ts`
comandi). `npm install && node build.mjs` rigenera `tools/hotel-oggi.mjs`. Test con dati inventati:
`npx esbuild test/hotel-oggi.test.ts --bundle --platform=node --format=esm --outfile=out/ho-test.mjs && node out/ho-test.mjs`.
