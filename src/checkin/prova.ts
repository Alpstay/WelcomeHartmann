/**
 * Anteprima della pagina checkin/ con ospiti INVENTATI (nessuna prenotazione reale): serve a far vedere la pagina
 * senza password e senza dati di Slope. Indirizzi su domini riservati (example.com/.org/.net) o inesistenti, link di
 * check-in con ID a zero, telefoni di esempio.
 */
import type { AvvisoItem } from "../feed";
import { aggiungiGiorni, oggiRoma } from "./regole";
import { avvia } from "./vista";
import type { Fonte } from "./vista";

const oggi = oggiRoma();
const g = (n: number): string => aggiungiGiorni(oggi, n);
const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const link = (n: number): string =>
  `https://booking.slope.it/g/00000000-0000-4000-8000-0000000000aa/c6055fa5-edaa-4b8f-a518-541322f3ac1e/reservations/${id(n)}/check-in`;

type Riga = [n: number, arrivo: number, notti: number, camera: string, cognome: string, nome: string, lingua: string, email: string | null, telefono: string | null, fatto: boolean];

// Distribuzione simile a quella reale: molti indirizzi dei portali, check-in fatti spesso senza email.
const RIGHE: readonly Riga[] = [
  [1, 0, 3, "101", "MÜLLER", "ANNA", "de", "amuller.401957@guest.booking.com", "+49 151 23456789", false],
  [2, 0, 2, "108", "Rossi", "Luca", "it", "luca.rossi@example.com", "+39 347 1234567", true],
  [3, 1, 2, "102", "van Dijk", "Sanne", "nl", "4f9c2a7e1b@m.expediapartnercentral.com", "+1111111111", false],
  [4, 1, 3, "105", "Schmidt", "Thomas", "de", null, "+49 170 1234567", true],
  [5, 1, 4, "121", "Bianchi", "Giulia", "it", "gbianchi.882301@guest.booking.com", "+39 333 7654321", true],
  [6, 2, 2, "103", "Novak", "Petra", "cs", "petra.novak@gmail.con", "+420 601 234 567", true],
  [7, 2, 3, "119", "Kowalski", "Jan", "pl", "jkowalski.550912@guest.booking.com", null, false],
  [8, 3, 5, "107", "Huber", "Maria", "de", "maria.huber@example.org", "+43 664 1234567", false],
  [9, 4, 2, "122", "Smith", "Emily", "en", "8d2e61aa90@m.expediapartnercentral.com", "+44 7700 900123", false],
  [10, 5, 3, "101", "Ferrari", "Marco", "it", null, "+39 347 7654321", true],
  [11, 6, 2, "108", "Dubois", "Claire", "fr", "cdubois.330415@guest.booking.com", "+33 6 12 34 56 78", false],
  [12, 6, 4, "105", "Lindqvist", "Erik", "sv", "erik.lindqvist@example.net", "+46 70 123 45 67", true],
];

const items: AvvisoItem[] = RIGHE.map(([n, arrivo, notti, camera, cognome, nome, lingua, email, telefono, fatto]) => ({
  reservationId: id(n),
  arrival: g(arrivo),
  departure: g(arrivo + notti),
  name: `${cognome} ${nome}`,
  greetingName: `${nome} ${cognome}`,
  email,
  phone: telefono,
  lang: lingua,
  checkinUrl: link(n),
  checkinFatto: fatto,
  room: camera,
}));

const fonte: Fonte = {
  prova: true,
  async leggi() {
    return {
      esito: "ok",
      dati: {
        righe: items,
        da: oggi,
        a: g(6),
        aggiornatoAlle: new Date(Date.now() - 20 * 60_000).toISOString(),
        generatoAlle: new Date(Date.now() - 15 * 60_000).toISOString(),
        freschezza: "fresh",
      },
    };
  },
  dimentica() {
    /* niente da dimenticare: nessuna password */
  },
};

if (typeof document !== "undefined") {
  const avviso = document.createElement("div");
  avviso.className = "avviso avviso-prova";
  avviso.innerHTML =
    "<strong>Anteprima con ospiti inventati.</strong> <span>La pagina vera legge gli arrivi dello Chalet Hartmann da La Scatola, cifrati con la password reception.</span>";
  document.querySelector(".testata")?.after(avviso);
  void avvia(fonte);
}
