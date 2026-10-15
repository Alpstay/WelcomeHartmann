# Aggiornamento degli arrivi su GitHub (connettore La Scatola /mcp)

GitHub Actions legge La Scatola dal connettore `https://databox-ffvb3.ondigitalocean.app/mcp` e pubblica
`arrivi.json` cifrato, senza passare da Claude. Workflow: `.github/workflows/aggiorna-arrivi.yml`
("Aggiorna arrivi"), ogni ora alle :40 (orari GitHub in UTC) e a mano con **Run workflow**.

## Come si accede a La Scatola

- Il connettore usa l'accesso OAuth 2.1 di Supabase (`…supabase.co/auth/v1`, PKCE, refresh token).
  La registrazione automatica dei client non è disponibile: il client lo crea l'amministratore della
  Scatola, con il permesso sullo Chalet Hartmann.
- Dati richiesti all'amministratore: client pubblico (senza secret, PKCE S256), indirizzo di ritorno
  `https://alpstay.github.io/WelcomeHartmann/collega.html`, refresh token abilitato, permesso sull'Hartmann
  per `list_arrivals` e `query_curated_view` (`curated_guest_stays`, `curated_reservation_contacts`).
- Il `client_id` ricevuto va scritto in `scatola-client.json` (file pubblico, nessun segreto).
  Finché è vuoto il workflow gira ma non fa nulla.

## Collegamento (una volta)

1. Segreto del repository `ARRIVI_PASSWORD`: la password reception della pagina.
2. Aprire https://alpstay.github.io/WelcomeHartmann/collega.html, accedere a La Scatola e salvare i due
   valori mostrati come segreti `SCATOLA_REFRESH_TOKEN` e `SCATOLA_TOKEN_KEY`
   (Settings → Secrets and variables → Actions).
3. Actions → «Aggiorna arrivi» → Run workflow.

Per ricollegare (accesso scaduto o revocato) si ripete il punto 2: il programma riconosce il segreto nuovo.

## Cosa fa ogni esecuzione

1. `node tools/github-feed.mjs token …`: rinnova l'accesso con il refresh token e salva subito quello
   nuovo in `scatola-token.json`, cifrato con `SCATOLA_TOKEN_KEY` (il vecchio non vale più).
2. `node tools/github-feed.mjs arrivi …`: arrivi da oggi a oggi+6, nomi e lingue, poi `arrivi.json`
   cifrato con `ARRIVI_PASSWORD` e ricontrollato. Stessa composizione di `tools/feed.mjs` (`src/feed-build.ts`).
3. `tools/github-commit.sh`: commit e push solo di quei file; se il repository è cambiato riparte da
   `origin/main` (niente merge).

Se qualcosa non va scrive `stato-arrivi.txt` ("… non pubblicato · GitHub · motivo") e la pagina lo mostra.
I registri di GitHub Actions di un repository pubblico sono pubblici: il programma non stampa mai dati
degli ospiti né il contenuto delle risposte, e gli ID di Slope passano così come arrivano.

## Sorgenti

`src/cli/github-feed.ts`, `src/scatola-client.ts`, `src/collega.ts` + `src/collega.html`; `node build.mjs`
rigenera `tools/github-feed.mjs` e `collega.html`.
