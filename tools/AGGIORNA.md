# Aggiornamento degli arrivi (La Scatola → WelcomeHartmann)

Procedura per l'attività pianificata che ogni ora (alle :40, dalle 7:40 alle 17:40) rigenera `arrivi.json`:
il file che la pagina https://alpstay.github.io/WelcomeHartmann/ legge per preparare le lettere di
benvenuto. Stesso schema dell'app colazioni (`Alpstay/ColazioniSAS`). La **password reception** che cifra
il file NON è in questo repository (è pubblico): viene data nel testo dell'attività pianificata.

## Regole

- Gli ID ricevuti da Slope / La Scatola non si modificano mai: si copiano identici. Il programma li
  ricontrolla (righe `ATTENZIONE`).
- Nomi e altri dati personali degli ospiti non si stampano, non si riassumono e non si scrivono in nessun
  file del repository. Vivono solo in file privati nello scratchpad e, cifrati, dentro `arrivi.json`.
- Si pubblica solo `arrivi.json`. Non modificare `index.html`, `hotel-oggi.json`, `src/` né `tools/`.
- Se La Scatola non risponde o il programma risponde `ERRORE`: **non pubblicare**. La pagina continua con
  l'ultimo file riuscito e avvisa da sola quando i dati sono vecchi.

## Dati

- Struttura: Alpstay – Chalet Hotel Hartmann, `property_id` `22222222-2222-4222-8222-222222222222`.
- `G` = oggi nel fuso Europe/Rome (AAAA-MM-GG); il file copre da `G` a `G+6`.

## Passi

1. **Arrivi** (senza dati personali): `list_arrivals` con `date` = ogni giorno da `G` a `G+6`,
   `property_id` dell'Hartmann, `limit 100`; segui `next_cursor` finché non è nullo.
   Scrivi nello scratchpad `arrivi.json` con TUTTE le righe dei 7 giorni, ID copiati identici:
   `{"vista": "list_arrivals", "freshness": <blocco freshness di una delle risposte, così com'è>,
   "rows": [{"reservation_id", "property_id", "room_name", "arrival", "departure", "adults", "children",
   "is_option", "booking_status", "stay_status"}, …]}`.
2. **Ospiti registrati** (vista con dati personali, da non mostrare): `query_curated_view` su
   `curated_guest_stays` con filtri `property_id eq <Hartmann>`, `stay_start gte G`, `stay_start lte G+6`,
   `limit 500`.
3. **Intestatari** (vista con dati personali, da non mostrare): `query_curated_view` su
   `curated_reservation_contacts` con filtri `property_id eq <Hartmann>`, `arrival gte G`, `arrival lte G+6`,
   `limit 500`.

   Per 2 e 3: se il sistema salva la risposta su file perché grande, usa quel file così com'è. Se la
   risposta arriva nel messaggio, salvala tu in un file dello scratchpad
   `{"vista": "<nome vista>", "total": <page.total>, "rows": [...]}` tenendo solo i campi
   `reservation_id, guest_type, is_primary_guest, first_name, last_name, language` (ospiti) oppure
   `reservation_id, property_id, arrival, booking_status, booker_type, first_name, last_name, language,
   company_language` (intestatari). Segui `next_cursor` con gli stessi filtri: un file per ogni pagina.
4. **Costruisci**, dalla cartella del repository:
   `node tools/feed.mjs build "<PASSWORD>" <arrivi.json> <file ospiti…> <file intestatari…>`
   (percorsi separati da spazi o da virgole). Una riga `ATTENZIONE` indica quasi sempre un
   `reservation_id` trascritto male in `arrivi.json` o in un file scritto a mano: correggilo e rilancia.
   `PRONTO` = `arrivi.json` del repository scritto e ricontrollato.
5. **Verifica**: `node tools/feed.mjs verify arrivi.json "<PASSWORD>"` deve rispondere `verifica OK`.
6. **Pubblica**: `git add arrivi.json`, commit `Arrivi Hartmann <AAAA-MM-GG HH:MM>`,
   `git push origin HEAD:main`. Se il push è rifiutato perché il repository è cambiato: copia `arrivi.json`
   fuori dal repository, `git fetch origin main`, `git reset --hard origin/main`, rimetti il file, di nuovo
   add, commit e push. Una volta sola. Con errore 403 non insistere: scrivilo nel riepilogo.
7. **Riepilogo** breve in italiano con le righe `RIEPILOGO` (non contengono dati personali).

## Lingua e nome sulla lettera

Li decide il programma: ospite registrato principale (HEAD/SINGLE o `is_primary_guest`); se la sua lingua è
`it` ma l'intestatario ne indica un'altra vale quella dell'intestatario (in Slope `it` è spesso il valore
predefinito); senza ospite registrato valgono nome e lingua dell'intestatario; altrimenti inglese.

## Modifiche al codice

La pagina e i programmi si generano da `src/` con `npm install` e `node build.mjs`
(`dist/Benvenuto Hartmann.html` → `index.html`, `tools/feed.mjs`, `tools/github-feed.mjs`, `collega.html`).
Testi della lettera in `src/texts.ts`; Wi-Fi, emergenze, colazione e camere in `src/hotel.ts`.
Aggiornamento alternativo da GitHub Actions: `tools/GITHUB.md`. I vecchi comandi `start`/`next`, che leggono
il registro della sessione, restano solo per compatibilità: non usarli nell'attività pianificata.
