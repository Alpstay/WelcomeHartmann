// Test delle regole della pagina checkin/ con dati inventati (nessuna prenotazione reale).
// Esecuzione: npx esbuild test/checkin.test.ts --bundle --platform=node --format=esm --outfile=out/checkin-test.mjs && node out/checkin-test.mjs
import { strict as assert } from "node:assert";
import { avvisiAad, decryptJson, encryptJson } from "../src/feed";
import type { AvvisiPayload, AvvisoItem } from "../src/feed";
import { avvisiItems } from "../src/feed-build";
import type { ArrivalRow, ContactFields } from "../src/types";
import {
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
  assert.equal(statoDa(true, e("a@guest.booking.com")), "email-da-correggere");
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
    [ID(3), ID(2), ID(6), ID(5), ID(1)],
  );
  assert.deepEqual(conteggi(righe), { "checkin-da-fare": 2, "email-da-correggere": 1, "email-mancante": 1, "tutto-ok": 1 });
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
  assert.ok(m.testo.includes(LINK(1)));
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

console.log(`checkin: ${n} test superati`);
