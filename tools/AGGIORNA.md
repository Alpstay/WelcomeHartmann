# Aggiornamento automatico degli arrivi (La Scatola → WelcomeHartmann)

Procedura per l'attività pianificata che ogni ora (alle :40, dalle 7:40 alle 17:40) rigenera `arrivi.json`: il file
che la pagina https://alpstay.github.io/WelcomeHartmann/ legge per preparare le lettere di benvenuto.
La **password reception** che cifra il file NON è in questo repository (è pubblico): viene data nel
testo dell'attività pianificata.

## Come funziona

La Scatola si interroga solo con il connettore. Il programma `tools/feed.mjs` decide quale chiamata
serve e ne stampa gli argomenti; tu la esegui e richiami il programma. Il programma legge le risposte
da solo dal registro della sessione, scrive `arrivi.json` cifrato e lo verifica.

Contenuto: arrivi dello Chalet Hartmann da oggi a oggi+6 (camera, date, persone, nome e lingua
dell'ospite). Nomi e lingue sono cifrati; in chiaro restano solo le date e il numero di arrivi per giorno.

## Regole

- Gli ID ricevuti da Slope / La Scatola non si modificano mai. Per questo **le risposte non si
  ricopiano a mano**: non salvarle in un file, non riassumerle. Le legge il programma.
- Gli argomenti stampati dal programma si copiano **identici** nella chiamata (date, property_id,
  filtri, limit, cursor). Una chiamata per volta, poi di nuovo `next`.
- `start` e `next` vanno lanciati in **due comandi separati** (il programma cerca nel registro il
  segno stampato da `start`).
- Si pubblica solo `arrivi.json`. Nessun dato di ospiti nei comandi, nel messaggio di commit o nel
  riepilogo. Non modificare `index.html`, `src/` né `tools/`.
- Se il programma risponde `ERRORE`: non pubblicare. La pagina continua con l'ultimo file riuscito
  e avvisa da sola se i dati hanno più di 3 ore.

## Passi

1. Dalla cartella del repository: `node tools/feed.mjs start "<PASSWORD>"`
2. `node tools/feed.mjs next` e fai quello che dice:
   - `CHIAMA mcp__La_Scatola__… {argomenti}`: esegui quella chiamata con quegli argomenti, poi di nuovo `next`.
     Se lo strumento dà errore, riesegui `next`: ripropone la stessa chiamata (dopo 3 errori si ferma).
   - `PRONTO`: `arrivi.json` è scritto e verificato. Vai al passo 3.
   - `ERRORE`: fermati, non pubblicare, riporta il messaggio.
   Di solito servono 9 chiamate: 7 giorni di arrivi + nomi + intestatari.
3. Controllo: `node tools/feed.mjs verify "<PASSWORD>"` deve rispondere `verifica OK`.
4. Pubblica: `git add arrivi.json`, commit `Arrivi Hartmann <AAAA-MM-GG HH:MM>`, `git push origin HEAD:main`.
   Se il push è rifiutato perché il repository è cambiato: copia `arrivi.json` fuori dal repository,
   `git fetch origin main`, `git reset --hard origin/main`, rimetti il file, di nuovo add, commit e push.
   Una volta sola. Con errore 403 non insistere: scrivilo nel riepilogo.
5. Riepilogo breve in italiano con le righe `RIEPILOGO` (non contengono dati personali).

## Quando l'aggiornamento automatico non passa

- Il controllo automatico dei permessi delle attività pianificate a volte blocca la procedura
  (motivo "Data Exfiltration": dati personali degli ospiti verso un repository pubblico, anche se cifrati).
- In quel caso l'attività scrive `stato-arrivi.txt` (una riga: ora, passo, messaggio, nessun dato
  personale) e lo pubblica: la pagina mostra l'avviso con l'ora del tentativo.
- Aggiornamento a mano: attività pianificata «WelcomeHartmann: aggiorna ora (con permesso)», senza
  orario e con approvazione manuale. Si avvia da Claude e si consentono le richieste che compaiono.

## Modifiche al codice

La pagina e il programma si generano da `src/` con `npm install` e `node build.mjs`
(`dist/Benvenuto Hartmann.html` → `index.html`, `tools/feed.mjs`). Testi della lettera in
`src/texts.ts`, Wi-Fi / emergenze / colazione / camere in `src/hotel.ts`.
