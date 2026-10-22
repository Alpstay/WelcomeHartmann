# Guest Pass dalla casella (Gmail dedicata)

La reception, in «Invia carta d'ospite» (portale Guest Pass / LTS), scrive come destinatario la casella
dedicata **guestpass.hartmann@gmail.com** al posto dell'ospite. Ogni 15 minuti GitHub Actions legge le email
di `sgp01@feratel.tv`, ne ricava nomi e link dei pass e pubblica `guestpass.json` cifrato con la password
reception. Nella pagina `avvisi/` il riquadro Guest Pass mostra «Guest Pass arrivati» con la prenotazione già
trovata dal nome: «Prepara» → controllo → «Apri email» / «Apri WhatsApp» → «Segna inviato».
Workflow: `.github/workflows/guestpass.yml` («Guest Pass dalla casella»), dalle 6 alle 20 circa e a mano con
**Run workflow**.

## Collegamento (una volta)

1. Nella Gmail dedicata: attivare la **Verifica in due passaggi**, poi creare una **password per le app**
   (myaccount.google.com/apppasswords, nome «GitHub Guest Pass»). L'IMAP di Gmail è sempre attivo.
2. Sempre nella Gmail dedicata, un filtro: *Da* `sgp01@feratel.tv` → **Non inviare mai in Spam**
   (le email finite in Spam non vengono lette).
3. Segreti del repository (Settings → Secrets and variables → Actions):
   `GUESTPASS_GMAIL` (l'indirizzo), `GUESTPASS_APP_PASSWORD` (le 16 lettere), `ARRIVI_PASSWORD`
   (la password reception della pagina, se non c'è già).
4. Actions → «Guest Pass dalla casella» → Run workflow. Esito atteso nel registro:
   «Guest Pass: N email, M pass pubblicati (cifrati).» oppure «nessuna novità».

Per cambiare la password per le app: crearne una nuova, aggiornare `GUESTPASS_APP_PASSWORD`, revocare la vecchia.

## Cosa fa ogni esecuzione

1. `node tools/guestpass-feed.mjs guestpass.json stato-guestpass.txt` (sorgente `src/cli/guestpass-feed.ts`):
   apre «Tutti i messaggi» in **sola lettura**, prende solo le email con mittente `sgp01@feratel.tv` degli
   ultimi 8 giorni, tiene solo i link `https://card-mobile-identification.feratel.com/v1/sgp01/mobile?m=…`
   (il link del PDF e gli altri si scartano), riconosce la lingua e controlla la firma di feratel.tv
   (intestazione Authentication-Results di Gmail, DKIM o DMARC). Le email senza firma valida compaiono con
   «mittente non verificato».
2. Riscrive `guestpass.json` solo se le email sono cambiate (niente commit inutili) e lo ricontrolla
   decifrandolo. In chiaro restano solo date e conteggio.
3. `tools/github-commit.sh`, poi richiesta di pubblicazione a GitHub Pages: i commit fatti con `GITHUB_TOKEN`
   non ripubblicano il sito da soli.

Se la casella non si apre scrive `stato-guestpass.txt` («errore · accesso alla casella rifiutato» o
«errore · casella non raggiungibile») e la pagina avvisi lo mostra. Tempo massimo 90 secondi.

## Sicurezza

- I link dei pass sono credenziali: stanno solo nel file cifrato e nella memoria della finestra della
  reception. Sul computer (localStorage) si salva solo l'impronta dell'email gestita e l'ID Slope della
  prenotazione, mai nomi o link.
- Il registro di GitHub Actions di un repository pubblico è pubblico: il programma stampa solo conteggi.
- Gli ID ricevuti da Slope non vengono mai modificati.
