// Test delle regole della pagina checkin/ con dati inventati (nessuna prenotazione reale).
// Esecuzione: npx esbuild test/checkin.test.ts --bundle --platform=node --format=esm --outfile=out/checkin-test.mjs && node out/checkin-test.mjs
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBundle } from "../src/cli/feed-files";
import { abbinaGuestPass, messaggioGuestPass, registroEmailGestite, registroInviiGuestPass, statoGuestPass } from "../src/checkin/guestpass";
import { avvisiAad, decryptJson, encryptJson } from "../src/feed";
import type { AvvisiPayload, AvvisoItem } from "../src/feed";
import { avvisiItems, riferimentiPer } from "../src/feed-build";
import type { ArrivalRow, ContactFields } from "../src/types";
import {
  calendarioCompletoFino,
  confrontaConSlope,
  daFareOggi,
  emailDaInserire,
  giornoSollecito,
  promemoria,
  registroEmailNuove,
  validaEmailNuova,
  cerca,
  contattoAttuale,
  controllaEmail,
  conteggi,
  linkPosta,
  linkWhatsapp,
  messaggio,
  motivoPer,
  registroValido,
  righeDa,
  statoDa,
  versoRiga,
} from "../src/checkin/regole";

const OGGI = "2026-12-20";
const ID = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const LINK = (n: number): string =>
  `https://booking.slope.it/g/00000000-0000-4000-8000-0000000000aa/c6055fa5-edaa-4b8f-a518-541322f3ac1e/reservations/${ID(n)}/check-in`;

const item = (n: number, x: Partial<AvvisoItem> = {}): AvvisoItem => ({
  reservationId: ID(n),
  arrival: OGGI,
  departure: "2026-12-23",
  name: "Prova Ospite",
  greetingName: "Ospite Prova",
  email: null,
  phone: null,
  lang: "en",
  checkinUrl: LINK(n),
  checkinFatto: false,
  room: "101",
  ...x,
});

let n = 0;
const t = (nome: string, f: () => void | Promise<void>): Promise<void> =>
  Promise.resolve()
    .then(f)
    .then(() => {
      n++;
    })
    .catch((e: unknown) => {
      console.error(`✗ ${nome}`);
      throw e;
    });

await t("email: portali, diretta, errore di battitura, mancante", () => {
  assert.deepEqual(controllaEmail("abc.123@guest.booking.com"), { tipo: "portale", portale: "Booking.com", suggerita: null });
  assert.equal(controllaEmail("x1y2@m.expediapartnercentral.com").portale, "Expedia");
  assert.equal(controllaEmail("ABC@Guest.Booking.com").tipo, "portale");
  assert.equal(controllaEmail("mario@example.com").tipo, "diretta");
  assert.equal(controllaEmail("mario@gmail.com").tipo, "diretta");
  assert.deepEqual(controllaEmail("mario@gmail.con"), { tipo: "sospetta", portale: null, suggerita: "mario@gmail.com" });
  assert.equal(controllaEmail("mario@gmial.com").suggerita, "mario@gmail.com");
  assert.equal(controllaEmail(null).tipo, "mancante");
  assert.equal(controllaEmail("  ").tipo, "mancante");
  assert.equal(controllaEmail("non è un'email").tipo, "mancante");
  // un dominio che contiene «booking» ma non è l'inoltro di Booking resta diretto
  assert.equal(controllaEmail("info@mybooking.com.example.com").tipo, "diretta");
});

await t("stato: quattro casi", () => {
  const e = controllaEmail;
  assert.equal(statoDa(false, e("a@example.com")), "checkin-da-fare");
  assert.equal(statoDa(false, e(null)), "checkin-da-fare");
  assert.equal(statoDa(true, e(null)), "email-mancante");
  // l'inoltro del portale vale come email nulla
  assert.equal(statoDa(true, e("a@guest.booking.com")), "email-mancante");
  assert.equal(statoDa(true, e("a@m.expediapartnercentral.com")), "email-mancante");
  assert.equal(statoDa(true, e("a@gmail.con")), "email-da-correggere");
  assert.equal(statoDa(true, e("a@example.com")), "tutto-ok");
});

await t("riga: ID Slope invariato, WhatsApp, link solo di Slope, lingua", () => {
  const r = versoRiga(item(1, { phone: "+49 (0)170 1234567", lang: "fr", name: "DUPONT MARIE" }), OGGI);
  assert.equal(r.reservationId, ID(1));
  assert.equal(r.whatsapp, "491701234567");
  assert.equal(r.lingua, "en");
  assert.equal(r.linguaSlope, "fr");
  assert.equal(r.nome, "Dupont Marie");
  assert.equal(r.checkinUrl, LINK(1));
  assert.equal(r.giorniAllArrivo, 0);
  assert.equal(r.notti, 3);
  assert.equal(versoRiga(item(2, { checkinUrl: "https://example.com/phish" }), OGGI).checkinUrl, null);
  assert.equal(versoRiga(item(3, { phone: "+1111111111" }), OGGI).whatsapp, null); // segnaposto Expedia
  assert.equal(versoRiga(item(4, { lang: "DE" }), OGGI).lingua, "de");
  // checkinFatto assente (file vecchi) = non fatto
  const vecchio = { ...item(5) } as Partial<AvvisoItem>;
  delete vecchio.checkinFatto;
  assert.equal(versoRiga(vecchio as AvvisoItem, OGGI).stato, "checkin-da-fare");
});

await t("elenco: doppioni tolti, arrivi passati esclusi, ordine stato → arrivo → camera", () => {
  const righe = righeDa(
    [
      item(1, { checkinFatto: true, email: "a@example.com", room: "105" }),
      item(2, { arrival: "2026-12-21", room: "121" }),
      item(2, { arrival: "2026-12-21", room: "121" }),
      item(3, { room: "102" }),
      item(4, { arrival: "2026-12-19" }),
      item(5, { checkinFatto: true, email: null, room: "107" }),
      item(6, { checkinFatto: true, email: "z@guest.booking.com", room: "119" }),
    ],
    OGGI,
  );
  assert.deepEqual(
    righe.map((r) => r.reservationId),
    [ID(3), ID(2), ID(5), ID(6), ID(1)],
  );
  assert.deepEqual(conteggi(righe), { "checkin-da-fare": 2, "email-da-correggere": 0, "email-mancante": 2, "tutto-ok": 1 });
  const inoltro = righe.find((r) => r.reservationId === ID(6))!;
  assert.equal(inoltro.email, null);
  assert.equal(inoltro.inoltroPortale, "z@guest.booking.com");
  assert.deepEqual(
    cerca(righe, "119").map((r) => r.reservationId),
    [ID(6)],
  );
  assert.equal(cerca(righe, "OSPITE prova").length, 5);
});

await t("messaggi: link nel testo di check-in, lingua giusta, niente link per la sola email", () => {
  const de = versoRiga(item(1, { lang: "de", greetingName: "Anna Müller" }), OGGI);
  const m = messaggio(de, "checkin");
  assert.match(m.testo, /^Guten Tag Anna Müller,/);
  assert.ok(m.testo.includes(`START: ${LINK(1)}`));
  assert.ok(m.whatsapp.includes(`*START* ${LINK(1)}`));
  assert.ok(m.html.includes(`<a href="${LINK(1)}"`) && m.html.includes(">START</a>"));
  assert.ok(!m.html.replace(/href="[^"]*"/g, "").includes("slope.it"), "nell'HTML il link compare solo come pulsante START");
  assert.match(m.testo, /Guest Pass/);
  assert.match(m.oggetto, /Online-Check-in/);
  const it = versoRiga(item(2, { lang: "it", checkinFatto: true, greetingName: "" }), OGGI);
  const e = messaggio(it, "email");
  assert.match(e.testo, /^Gentile ospite,/);
  assert.match(e.testo, /grazie per aver completato il check-in online/);
  assert.ok(!e.testo.includes("slope.it"));
  assert.match(messaggio(versoRiga(item(3, { lang: "pt" }), OGGI), "checkin").testo, /^Hello Ospite Prova,/);
});

await t("azioni: motivo per stato, WhatsApp e mailto", () => {
  const daFare = versoRiga(item(1, { phone: "+39 347 1234567", email: "a@guest.booking.com" }), OGGI);
  assert.equal(motivoPer(daFare), "checkin");
  const wa = linkWhatsapp(daFare, "checkin");
  assert.ok(wa?.startsWith("https://wa.me/393471234567?text="));
  assert.ok(decodeURIComponent(wa!.split("text=")[1]).includes(LINK(1)));
  const mail = linkPosta(daFare, "checkin", "mailto");
  assert.ok(mail?.startsWith("mailto:a@guest.booking.com?subject="));
  assert.equal(motivoPer(versoRiga(item(2, { checkinUrl: null }), OGGI)), "email");
  assert.equal(motivoPer(versoRiga(item(3, { checkinFatto: true, email: null }), OGGI)), "email");
  assert.equal(motivoPer(versoRiga(item(4, { checkinFatto: true, email: "a@example.com" }), OGGI)), null);
  assert.equal(linkWhatsapp(versoRiga(item(5), OGGI), "checkin"), null);
  assert.equal(linkPosta(versoRiga(item(6), OGGI), "checkin", "mailto"), null);
});

await t("registro contatti: voci rotte e vecchie scartate, vale solo per il motivo attuale", () => {
  const reg = registroValido(
    [
      { id: ID(1), motivo: "checkin", canale: "whatsapp", quando: "2026-12-19T10:00:00Z", arrivo: OGGI },
      { id: ID(2), motivo: "email", canale: "email", quando: "2026-11-01T10:00:00Z", arrivo: "2026-11-02" }, // oltre 14 giorni
      { id: ID(3), motivo: "boh", canale: "email", quando: "x", arrivo: OGGI },
      null,
      "rotto",
    ],
    OGGI,
  );
  assert.deepEqual([...reg.keys()], [ID(1)]);
  assert.ok(contattoAttuale(versoRiga(item(1), OGGI), reg));
  // dopo il check-in manca solo l'email: il contatto per il link non conta più
  assert.equal(contattoAttuale(versoRiga(item(1, { checkinFatto: true }), OGGI), reg), null);
  assert.deepEqual([...registroValido("non è un elenco", OGGI).keys()], []);
});

await t("dal feed: avvisiItems (produzione) → cifratura → pagina, ID invariati", async () => {
  const rows = [1, 2, 3].map(
    (k): ArrivalRow => ({
      reservation_id: ID(k), order_id: ID(100 + k), property_id: "22222222-2222-4222-8222-222222222222",
      property_name: "Alpstay - Chalet Hotel Hartmann - Adults Only", arrival: OGGI, departure: "2026-12-22",
      lodging_id: null, room_name: String(100 + k), adults: 2, children: 0, is_option: false,
      booking_status: "CONFIRMED", stay_status: "TO_ARRIVE",
    }),
  );
  const contacts: ContactFields[] = [
    { reservation_id: ID(1), booker_type: "INDIVIDUAL", first_name: "A", last_name: "B", language: "de", company_language: null,
      primary_email: "ab.1@guest.booking.com", primary_phone_number: "+49 170 1234567", checkin_url: LINK(1),
      identity_document: null, is_privacy_policy_acknowledged: false },
    // check-in fatto: documento e privacy, email svuotata (come si vede oggi nei dati reali)
    { reservation_id: ID(2), booker_type: "INDIVIDUAL", first_name: "C", last_name: "D", language: "en", company_language: null,
      primary_email: null, primary_phone_number: null, checkin_url: LINK(2),
      identity_document: { type: "PASSPORT" }, is_privacy_policy_acknowledged: true },
    { reservation_id: ID(3), booker_type: "INDIVIDUAL", first_name: "E", last_name: "F", language: "it", company_language: null,
      primary_email: "e.f@example.com", primary_phone_number: null, checkin_url: LINK(3),
      identity_document: { type: "ID_CARD" }, is_privacy_policy_acknowledged: true },
  ];
  const payload: AvvisiPayload = { items: avvisiItems(rows, contacts) };
  const enc = await encryptJson(payload, "password-di-prova", avvisiAad(OGGI), 1_000);
  const back = await decryptJson<AvvisiPayload>(enc, "password-di-prova", avvisiAad(OGGI));
  const righe = righeDa(back.items, OGGI);
  assert.deepEqual(
    righe.map((r) => [r.reservationId, r.stato]),
    [
      [ID(1), "checkin-da-fare"],
      [ID(2), "email-mancante"],
      [ID(3), "tutto-ok"],
    ],
  );
  await assert.rejects(decryptJson(enc, "sbagliata", avvisiAad(OGGI)));
});

await t("oggetto: numero e nome della prenotazione", () => {
  const ota = versoRiga(item(1, { lang: "de", greetingName: "Anna Müller", codicePortale: "6012345671", portale: "Booking.com" }), OGGI);
  assert.equal(messaggio(ota, "checkin").oggetto, "Ihr Online-Check-in · Chalet Hotel Hartmann · Buchung Booking.com 6012345671 · Anna Müller");
  const diretta = versoRiga(item(2, { lang: "it", greetingName: "Luca Rossi", numeroOrdine: 8086376 }), OGGI);
  assert.equal(messaggio(diretta, "email").oggetto, "Il suo indirizzo email · Chalet Hotel Hartmann · Prenotazione n. 8086376 · Luca Rossi");
  const ditta = versoRiga(item(3, { lang: "en", name: "Example Srl", greetingName: "" }), OGGI);
  assert.equal(messaggio(ditta, "checkin").oggetto, "Your online check-in · Chalet Hotel Hartmann · Example Srl");
  // il portale prevale sul numero Slope
  assert.deepEqual(versoRiga(item(4, { codicePortale: "123", portale: "Expedia", numeroOrdine: 99 }), OGGI).riferimento, { portale: "Expedia", numero: "123" });
});

await t("promemoria: check-in 5 giorni prima, email 3 giorni prima, ritardi e contatti", () => {
  const g = (k: number): string => new Date(Date.parse(`${OGGI}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
  const righe = righeDa(
    [
      item(1, { arrival: g(5), departure: g(7) }), // check-in: oggi
      item(2, { arrival: g(6), departure: g(8) }), // check-in: domani
      item(3, { arrival: g(2), departure: g(4) }), // check-in: in ritardo di 3 giorni
      item(4, { arrival: g(3), departure: g(5), checkinFatto: true }), // email: oggi
      item(5, { arrival: g(4), departure: g(6), checkinFatto: true, email: "x@guest.booking.com" }), // email (inoltro = nulla): domani
      item(6, { arrival: g(1), departure: g(3), checkinFatto: true, email: "ok@example.com" }), // tutto a posto: niente
      item(7, { arrival: g(5), departure: g(7) }), // check-in: oggi, ma già contattato
    ],
    OGGI,
  );
  const reg = registroValido([{ id: ID(7), motivo: "checkin", canale: "whatsapp", quando: `${OGGI}T08:00:00Z`, arrivo: g(5) }], OGGI);
  const lista = promemoria(righe, reg, OGGI);
  const per = new Map(lista.map((p) => [p.riga.reservationId, p]));
  assert.equal(per.get(ID(1))?.quando, "oggi");
  assert.equal(per.get(ID(1))?.giorno, OGGI);
  assert.equal(per.get(ID(2))?.quando, "prossimamente");
  assert.equal(per.get(ID(3))?.quando, "in-ritardo");
  assert.equal(per.get(ID(4))?.quando, "oggi");
  assert.equal(per.get(ID(5))?.quando, "prossimamente");
  assert.equal(per.has(ID(6)), false);
  assert.deepEqual(daFareOggi(lista).map((p) => p.riga.reservationId).sort(), [ID(1), ID(3), ID(4)].sort());
  assert.equal(calendarioCompletoFino("2026-12-26"), "2026-12-21");
});

await t("email annotata: validazione, inoltro rifiutato, controllo incrociato con Slope", () => {
  assert.deepEqual(validaEmailNuova(" Mario.Rossi@GMAIL.com "), { ok: true, email: "Mario.Rossi@gmail.com" });
  assert.equal(validaEmailNuova("abc.1@guest.booking.com").ok, false);
  const typo = validaEmailNuova("mario@gmail.con");
  assert.ok(!typo.ok && typo.suggerita === "mario@gmail.com");
  assert.equal(validaEmailNuova("mario@gmail.con", true).ok, true);
  assert.equal(validaEmailNuova("mario").ok, false);

  const nuove = registroEmailNuove(
    [
      { id: ID(1), email: "anna@example.com", quando: "x", arrivo: OGGI },
      { id: ID(2), email: "luca@example.com", quando: "x", arrivo: OGGI },
      { id: ID(3), email: "carla@example.com", quando: "x", arrivo: OGGI },
      { id: ID(4), email: "vecchia@example.com", quando: "x", arrivo: "2026-11-01" }, // oltre 14 giorni
      { id: ID(5), email: "x@guest.booking.com", quando: "x", arrivo: OGGI }, // inoltro: scartato
    ],
    OGGI,
  );
  assert.deepEqual([...nuove.keys()], [ID(1), ID(2), ID(3)]);
  const righe = righeDa(
    [
      item(1, { checkinFatto: true, email: "x@guest.booking.com" }),
      item(2, { checkinFatto: true, email: "LUCA@example.com" }),
      item(3, { checkinFatto: true, email: "altra@example.com" }),
    ],
    OGGI,
  );
  const r = (k: number) => righe.find((x) => x.reservationId === ID(k))!;
  assert.equal(confrontaConSlope(r(1), nuove.get(ID(1))!), "da-inserire");
  assert.equal(confrontaConSlope(r(2), nuove.get(ID(2))!), "inserita");
  assert.equal(confrontaConSlope(r(3), nuove.get(ID(3))!), "diversa");
  assert.deepEqual(
    emailDaInserire(righe, nuove).map((x) => [x.riga.reservationId, x.esito]),
    [
      [ID(1), "da-inserire"],
      [ID(3), "diversa"],
    ],
  );
});

await t("feed: numero del portale e numero d'ordine Slope", () => {
  const riga = (k: number, x: Partial<ArrivalRow> = {}): ArrivalRow => ({
    reservation_id: ID(k), order_id: ID(200 + k), property_id: "22222222-2222-4222-8222-222222222222",
    property_name: "Hartmann", arrival: OGGI, departure: "2026-12-22", lodging_id: null, room_name: "101",
    adults: 2, children: 0, is_option: false, booking_status: "CONFIRMED", stay_status: "TO_ARRIVE", ...x,
  });
  const rows = [riga(1, { ota_channel: "BOOKING" }), riga(2, { ota_channel: "EXPEDIA", agency_name: "Expedia" }), riga(3), riga(4)];
  const refs = riferimentiPer(
    rows,
    [
      { reservation_id: ID(1), order_id: ID(201), agency_code: "6012345671", ota_channel: "BOOKING", agency_name: "Booking.com" },
      { reservation_id: ID(2), order_id: ID(202), agency_code: " 2300145678 ", ota_channel: "EXPEDIA" },
      { reservation_id: ID(3), order_id: ID(203), agency_code: null, ota_channel: null },
    ],
    [{ order_id: ID(203), order_number: 8086376 }, { order_id: ID(204), order_number: 8086377 }],
  );
  assert.deepEqual(refs.get(ID(1)), { codicePortale: "6012345671", portale: "Booking.com", numeroOrdine: null });
  assert.deepEqual(refs.get(ID(2)), { codicePortale: "2300145678", portale: "Expedia", numeroOrdine: null });
  assert.deepEqual(refs.get(ID(3)), { codicePortale: null, portale: null, numeroOrdine: 8086376 });
  // senza riga di curated_reservations vale l'order_id dell'arrivo
  assert.deepEqual(refs.get(ID(4)), { codicePortale: null, portale: null, numeroOrdine: 8086377 });
  // senza i file facoltativi: nessun numero, nessun errore
  assert.equal(avvisiItems(rows, [])[0].codicePortale, null);
});

await t("file: le due viste facoltative si riconoscono, gli ordini si controllano con order_id", () => {
  const dir = mkdtempSync(join(tmpdir(), "checkin-test-"));
  const f1 = join(dir, "rif.json");
  writeFileSync(f1, JSON.stringify({ data: [{ reservation_id: ID(1), order_id: ID(2), agency_code: "1", room_name: "101", arrival: OGGI }], page: { total: 1 } }));
  assert.equal(readBundle(f1).kind, "riferimenti");
  const f2 = join(dir, "ord.json");
  writeFileSync(f2, JSON.stringify({ data: [{ order_id: ID(2), order_number: 8086376, property_id: "x" }], page: { total: 1 } }));
  assert.equal(readBundle(f2).kind, "ordini");
  const f3 = join(dir, "ord-rotto.json");
  writeFileSync(f3, JSON.stringify({ vista: "curated_order_balances", rows: [{ order_id: "non-un-uuid", order_number: 1 }] }));
  assert.throws(() => readBundle(f3), /order_id mancante o non valido/);
});

await t("sollecito: senza risposta si telefona (check-in dopo 2 giorni, email dopo 1)", () => {
  const g = (k: number): string => new Date(Date.parse(`${OGGI}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
  const righe = righeDa(
    [
      item(1, { arrival: g(3), departure: g(5) }), // link mandato 2 giorni fa, check-in non fatto → telefonare
      item(2, { arrival: g(4), departure: g(6) }), // link mandato ieri → non ancora
      item(3, { arrival: g(2), departure: g(4), checkinFatto: true }), // email chiesta ieri → telefonare
      item(4, { arrival: g(1), departure: g(3), checkinFatto: true }), // email chiesta oggi → non ancora
      item(5, { arrival: g(2), departure: g(4), checkinFatto: true }), // link mandato, poi check-in fatto: il contatto non vale più
    ],
    OGGI,
  );
  const reg = registroValido(
    [
      { id: ID(1), motivo: "checkin", canale: "whatsapp", quando: `${g(-2)}T09:00:00Z`, arrivo: g(3) },
      { id: ID(2), motivo: "checkin", canale: "email", quando: `${g(-1)}T09:00:00Z`, arrivo: g(4) },
      { id: ID(3), motivo: "email", canale: "telefono", quando: `${g(-1)}T09:00:00Z`, arrivo: g(2) },
      { id: ID(4), motivo: "email", canale: "whatsapp", quando: `${OGGI}T09:00:00Z`, arrivo: g(1) },
      { id: ID(5), motivo: "checkin", canale: "whatsapp", quando: `${g(-4)}T09:00:00Z`, arrivo: g(2) },
    ],
    OGGI,
  );
  const lista = promemoria(righe, reg, OGGI);
  const per = new Map(lista.map((p) => [p.riga.reservationId, p]));
  assert.equal(per.get(ID(1))?.sollecito, true);
  assert.equal(per.get(ID(2))?.sollecito, false);
  assert.equal(per.get(ID(3))?.sollecito, true);
  assert.equal(per.get(ID(4))?.sollecito, false);
  assert.equal(per.get(ID(5))?.contatto, null); // ora manca l'email: promemoria nuovo, non un sollecito
  assert.deepEqual(daFareOggi(lista).map((p) => p.riga.reservationId).sort(), [ID(1), ID(3), ID(5)].sort());
  // il sollecito non cade mai dopo il giorno di arrivo
  assert.equal(giornoSollecito({ id: ID(9), motivo: "checkin", canale: "email", quando: `${OGGI}T09:00:00Z`, arrivo: g(1) }), g(1));
});

await t("Guest Pass: abbinamento dal nome, stato per prenotazione, registri condivisi con avvisi/", () => {
  const righe = righeDa(
    [
      item(1, { name: "Rossi Luca", greetingName: "Luca Rossi", checkinFatto: true, email: "luca@example.com" }),
      item(2, { name: "Bianchi Anna", greetingName: "Anna Bianchi", checkinFatto: true, email: "anna@example.com" }),
      item(3, { name: "Verdi Paolo", greetingName: "Paolo Verdi", checkinFatto: false, email: null }),
    ],
    OGGI,
  );
  const casella = [
    { id: "a".repeat(20), ricevuta: `${OGGI}T08:00:00Z`, lingua: "it" as const, firmata: true, pass: [{ nome: "LUCA ROSSI", codice: "C".repeat(24) }] },
    { id: "b".repeat(20), ricevuta: `${OGGI}T09:00:00Z`, lingua: "de" as const, firmata: true, pass: [{ nome: "PETER WAGNER", codice: "D".repeat(24) }] },
    { id: "c".repeat(20), ricevuta: `${OGGI}T07:00:00Z`, lingua: null, firmata: true, pass: [{ nome: "PAOLO VERDI", codice: "E".repeat(24) }] },
  ];
  const gestite = registroEmailGestite([["c".repeat(20), new Date().toISOString()], ["rotto"], ["x", "non-una-data"]]);
  assert.deepEqual([...gestite.keys()], ["c".repeat(20)]);
  let ab = abbinaGuestPass(casella, righe, gestite);
  assert.deepEqual(ab.map((a) => [a.email.id[0], a.id, a.sicura]), [["a", ID(1), true], ["b", null, false]]);
  // abbinamento a mano
  ab = abbinaGuestPass(casella, righe, gestite, new Map([["b".repeat(20), ID(2)]]));
  assert.equal(ab.find((a) => a.email.id === "b".repeat(20))?.id, ID(2));

  const invii = registroInviiGuestPass(
    [
      { id: ID(2), arrival: OGGI, canale: "email", pass: 1, inviatoIl: `${OGGI}T10:00:00Z`, emailId: "b".repeat(20) },
      { id: ID(9), arrival: "2026-10-01", canale: "email", pass: 1, inviatoIl: "x", emailId: null }, // oltre 30 giorni
    ],
    OGGI,
  );
  assert.deepEqual([...invii.keys()], [ID(2)]);
  const r = (k: number) => righe.find((x) => x.reservationId === ID(k))!;
  const ab0 = abbinaGuestPass(casella, righe, gestite);
  assert.equal(statoGuestPass(r(1), invii, ab0).stato, "pronto");
  assert.equal(statoGuestPass(r(2), invii, ab0).stato, "inviato");
  assert.equal(statoGuestPass(r(3), invii, ab0).stato, null); // check-in non fatto: prima il check-in
  assert.equal(statoGuestPass(r(1), invii, []).stato, "da-generare");
});

await t("Guest Pass: messaggio con pulsante GUEST PASS e link alla pagina d'arrivo della prenotazione", () => {
  const r = versoRiga(item(1, { name: "Rossi Luca", greetingName: "Luca Rossi", lang: "it", checkinFatto: true, email: "luca@example.com", numeroOrdine: 8086301 }), OGGI);
  const m = messaggioGuestPass(r, "it", [{ nome: "LUCA ROSSI", codice: "C".repeat(24) }]);
  assert.equal(m.oggetto, "Il vostro Guest Pass · Chalet Hotel Hartmann · Prenotazione n. 8086301 · Luca Rossi");
  assert.match(m.html, />GUEST PASS<\/a>/);
  assert.ok(m.html.includes(`#gp=${"C".repeat(24)}&amp;gn=LUCA%20ROSSI&amp;gr=${ID(1)}`));
  assert.ok(m.testo.includes("GUEST PASS: https://alpstay.github.io/5DAYTO-ARRIVAL/?lang=it#gp="));
  assert.ok(!m.testo.includes("*"));
  assert.ok(m.whatsapp.includes("*GUEST PASS* https://"));
  assert.ok(!m.html.includes("<br></p>"));
});

console.log(`checkin: ${n} test superati`);
