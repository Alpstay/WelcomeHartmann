// Generato da src/cli/feed-cli.ts con build.mjs: non modificare a mano.

// src/cli/feed-cli.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename as basename2, join } from "node:path";

// src/feed.ts
var FEED_FILE = "arrivi.json";
var FEED_DAYS = 7;
var ITERATIONS = 25e4;
var FEED_ITERATIONS = 6e5;
var avvisiAad = (from) => `WelcomeHartmann|avvisi|${from}`;
var feedAad = (from) => `WelcomeHartmann|${from}`;
var subtle = () => {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto non disponibile");
  return c.subtle;
};
function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
}
function fromB64(text) {
  const s = atob(text);
  const out2 = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out2[i] = s.charCodeAt(i);
  return out2;
}
async function keyFrom(password, salt, iter, usage) {
  const base = await subtle().importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, [usage]);
}
async function encryptJson(value, password, aad, iter = ITERATIONS) {
  const c = globalThis.crypto;
  const salt = c.getRandomValues(new Uint8Array(16));
  const iv = c.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password, salt, iter, "encrypt");
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    key,
    new TextEncoder().encode(JSON.stringify(value))
  );
  return { alg: "AES-GCM/PBKDF2-SHA256", iter, salt: toB64(salt), iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}
async function decryptJson(enc, password, aad) {
  const key = await keyFrom(password, fromB64(enc.salt), enc.iter, "decrypt");
  const pt = await subtle().decrypt(
    { name: "AES-GCM", iv: fromB64(enc.iv), additionalData: new TextEncoder().encode(aad) },
    key,
    fromB64(enc.ct)
  );
  return JSON.parse(new TextDecoder().decode(pt));
}
var toFeedItem = (i) => ({
  reservationId: i.reservationId,
  room: i.room,
  arrival: i.arrival ?? "",
  departure: i.departure ?? "",
  adults: i.adults,
  children: i.children,
  isOption: i.isOption,
  inHouse: i.inHouse,
  name: i.name,
  lang: i.lang,
  langSource: i.langSource,
  rawLang: i.rawLang,
  langNote: i.langNote
});
function isFeedEnvelope(v) {
  const e = v;
  return !!e && e.format === 1 && e.app === "WelcomeHartmann" && typeof e.from === "string" && typeof e.to === "string" && !!e.enc;
}

// src/hotel.ts
var HOTEL_DEFAULTS = {
  hotelName: "Chalet Hotel Hartmann",
  place: "Ortisei \xB7 Val Gardena",
  wifiPassword: "enjoyhartmann",
  emergencyPhone: "+39 333 6828717",
  breakfastFrom: "8:00",
  breakfastTo: "10:30",
  signer: "Chiara",
  signerRole: "Manager \xB7 Chalet Hotel Hartmann"
};
var HOTEL = { ...HOTEL_DEFAULTS };
var PROPERTY_NAME_MATCH = /hartmann/i;
var ROOM_FLOORS = {
  "101": "first",
  "102": "first",
  "103": "first",
  "105": "first",
  "107": "first",
  "108": "first",
  "119": "second",
  "121": "garden",
  "122": "garden"
};
var KNOWN_ROOMS = Object.keys(ROOM_FLOORS).sort(
  (a, b2) => a.localeCompare(b2, "it", { numeric: true })
);

// src/texts.ts
var NBSP = "\xA0";
var b = (text) => ({ text, bold: true });
var t = (text) => ({ text });
var en12 = (hm) => {
  const [h, m] = hm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${suffix}`;
};
var frTime = (hm) => {
  const [h, m] = hm.split(":");
  return m === "00" ? `${Number(h)}${NBSP}h` : `${Number(h)}${NBSP}h${NBSP}${m}`;
};
var dotTime = (hm) => hm.replace(":", ".");
var TIME_FORMAT = { en: en12, fr: frTime, nl: dotTime, da: dotTime, sv: dotTime };
var LANG_NAMES = {
  en: "Inglese",
  it: "Italiano",
  de: "Tedesco",
  fr: "Francese",
  es: "Spagnolo",
  nl: "Olandese",
  pl: "Polacco",
  cs: "Ceco",
  da: "Danese",
  sv: "Svedese",
  zh: "Cinese",
  ko: "Coreano",
  ar: "Arabo"
};
var LETTER_DEFAULTS = {
  en: {
    roomLabel: "Room",
    headline: "Welcome to Chalet Hotel Hartmann",
    salutation: "Dear {nome},",
    salutationNoName: "Dear Guests,",
    intro: "We are delighted to have you with us.",
    roomFirst: "Your room is number {camera} and you will find it on the first floor (one floor up).",
    roomSecond: "Your room is number {camera} and you will find it on the second floor (two floors up).",
    roomGarden: "Your room is number {camera} and you will find it on the garden floor \u2013 simply take the stairs down.",
    roomOther: "Your room is number {camera}.",
    home: "We would like you to feel at home here.",
    bar: "Please help yourself at the bar \u2013 simply jot down what you take.",
    breakfast: "Breakfast is served from {dalle} to {alle}.",
    sauna: "The sauna is on the garden floor and can be used until 9 pm.",
    wifiLabel: "Wi-Fi password",
    emergency: "In case of emergency, please call {telefono}.",
    closing: "We wish you a wonderful stay!",
    qr: "Scan the QR code to find all the information about Chalet Hotel Hartmann.",
    noteLabel: "A note for you"
  },
  it: {
    roomLabel: "Camera",
    headline: "Benvenuti allo Chalet Hotel Hartmann",
    salutation: "Gentile {nome},",
    salutationNoName: "Gentili ospiti,",
    intro: "Siamo felici di accogliervi.",
    roomFirst: "La vostra camera \xE8 la numero {camera} e si trova al primo piano.",
    roomSecond: "La vostra camera \xE8 la numero {camera} e si trova al secondo piano.",
    roomGarden: "La vostra camera \xE8 la numero {camera} e si trova al piano giardino: basta scendere le scale.",
    roomOther: "La vostra camera \xE8 la numero {camera}.",
    home: "Sentitevi come a casa.",
    bar: "Servitevi pure liberamente al bar: vi chiediamo soltanto di annotare quanto consumato.",
    breakfast: "La prima colazione \xE8 servita dalle ore {dalle} alle ore {alle}.",
    sauna: "La sauna si trova al piano giardino ed \xE8 accessibile fino alle ore 21:00.",
    wifiLabel: "Password Wi-Fi",
    emergency: "In caso di emergenza potete chiamare il numero {telefono}.",
    closing: "Vi auguriamo un buon soggiorno!",
    qr: "Inquadrate il codice QR: troverete tutte le informazioni sullo Chalet Hotel Hartmann.",
    noteLabel: "Una nota per voi"
  },
  de: {
    roomLabel: "Zimmer",
    headline: "Willkommen im Chalet Hotel Hartmann",
    salutation: "Guten Tag {nome},",
    salutationNoName: "Liebe G\xE4ste,",
    // Nach der Anrede mit Komma geht es im Deutschen klein weiter.
    intro: "wir freuen uns sehr, Sie bei uns begr\xFC\xDFen zu d\xFCrfen.",
    roomFirst: "Ihr Zimmer hat die Nummer {camera} und befindet sich im ersten Stock.",
    roomSecond: "Ihr Zimmer hat die Nummer {camera} und befindet sich im zweiten Stock.",
    roomGarden: "Ihr Zimmer hat die Nummer {camera} und befindet sich im Gartengeschoss \u2013 einfach die Treppe hinunter.",
    roomOther: "Ihr Zimmer hat die Nummer {camera}.",
    home: "F\xFChlen Sie sich bei uns wie zu Hause.",
    bar: "Bedienen Sie sich gerne an der Bar \u2013 notieren Sie einfach, was Sie genommen haben.",
    breakfast: "Das Fr\xFChst\xFCck servieren wir von {dalle} bis {alle} Uhr.",
    sauna: "Die Sauna befindet sich im Gartengeschoss und steht Ihnen bis 21:00 Uhr zur Verf\xFCgung.",
    wifiLabel: "WLAN-Passwort",
    emergency: "Im Notfall erreichen Sie uns unter {telefono}.",
    closing: "Wir w\xFCnschen Ihnen einen wundersch\xF6nen Aufenthalt!",
    qr: "Scannen Sie den QR-Code: Dort finden Sie alle Informationen zum Chalet Hotel Hartmann.",
    noteLabel: "Eine Notiz f\xFCr Sie"
  },
  fr: {
    roomLabel: "Chambre",
    headline: "Bienvenue au Chalet Hotel Hartmann",
    salutation: "Bonjour {nome},",
    salutationNoName: "Chers h\xF4tes,",
    intro: "Nous sommes ravis de vous accueillir.",
    roomFirst: "Votre chambre porte le num\xE9ro {camera} et se trouve au premier \xE9tage.",
    roomSecond: "Votre chambre porte le num\xE9ro {camera} et se trouve au deuxi\xE8me \xE9tage.",
    roomGarden: `Votre chambre porte le num\xE9ro {camera} et se trouve au niveau jardin${NBSP}: il suffit de descendre l\u2019escalier.`,
    roomOther: "Votre chambre porte le num\xE9ro {camera}.",
    home: `Faites comme chez vous${NBSP}!`,
    bar: `N\u2019h\xE9sitez pas \xE0 vous servir au bar${NBSP}: notez simplement ce que vous avez consomm\xE9.`,
    breakfast: "Le petit-d\xE9jeuner est servi de {dalle} \xE0 {alle}.",
    sauna: `Le sauna se trouve au niveau jardin et est accessible jusqu\u2019\xE0 21${NBSP}h.`,
    wifiLabel: "Mot de passe Wi-Fi",
    emergency: "En cas d\u2019urgence, vous pouvez nous appeler au {telefono}.",
    closing: `Nous vous souhaitons un excellent s\xE9jour${NBSP}!`,
    qr: "Scannez le code QR pour retrouver toutes les informations sur le Chalet Hotel Hartmann.",
    noteLabel: "Un petit mot pour vous"
  },
  es: {
    roomLabel: "Habitaci\xF3n",
    headline: "Bienvenidos al Chalet Hotel Hartmann",
    // Saluto senza nome: evita la scelta Estimado/Estimada.
    salutation: "",
    salutationNoName: "Estimados hu\xE9spedes:",
    intro: "Es un placer darles la bienvenida.",
    roomFirst: "Su habitaci\xF3n es la n\xFAmero {camera} y se encuentra en la primera planta.",
    roomSecond: "Su habitaci\xF3n es la n\xFAmero {camera} y se encuentra en la segunda planta.",
    roomGarden: "Su habitaci\xF3n es la n\xFAmero {camera} y se encuentra en la planta jard\xEDn: solo tienen que bajar las escaleras.",
    roomOther: "Su habitaci\xF3n es la n\xFAmero {camera}.",
    home: "Si\xE9ntanse como en casa.",
    bar: "Pueden servirse libremente en el bar: solo les pedimos que anoten lo que consuman.",
    breakfast: "El desayuno se sirve de {dalle} a {alle}.",
    sauna: "La sauna se encuentra en la planta jard\xEDn y est\xE1 disponible hasta las 21:00.",
    wifiLabel: "Contrase\xF1a del wifi",
    emergency: "En caso de emergencia, pueden llamarnos al {telefono}.",
    closing: "\xA1Les deseamos una estancia maravillosa!",
    qr: "Escaneen el c\xF3digo QR para encontrar toda la informaci\xF3n sobre el Chalet Hotel Hartmann.",
    noteLabel: "Una nota para ustedes"
  },
  nl: {
    roomLabel: "Kamer",
    headline: "Welkom in Chalet Hotel Hartmann",
    salutation: "Beste {nome},",
    salutationNoName: "Beste gasten,",
    intro: "Wat fijn dat u bij ons te gast bent.",
    roomFirst: "Uw kamer heeft nummer {camera} en ligt op de eerste verdieping.",
    roomSecond: "Uw kamer heeft nummer {camera} en ligt op de tweede verdieping.",
    roomGarden: "Uw kamer heeft nummer {camera} en ligt op de tuinverdieping: neem gewoon de trap naar beneden.",
    roomOther: "Uw kamer heeft nummer {camera}.",
    home: "Voelt u zich hier helemaal thuis.",
    bar: "Bedient u zich gerust aan de bar \u2013 noteer gewoon wat u neemt.",
    breakfast: "Het ontbijt wordt geserveerd van {dalle} tot {alle} uur.",
    sauna: "De sauna bevindt zich op de tuinverdieping en is tot 21.00 uur beschikbaar.",
    wifiLabel: "Wifi-wachtwoord",
    emergency: "In geval van nood kunt u ons bellen op {telefono}.",
    closing: "Wij wensen u een heerlijk verblijf!",
    qr: "Scan de QR-code voor alle informatie over Chalet Hotel Hartmann.",
    noteLabel: "Een bericht voor u"
  },
  pl: {
    roomLabel: "Pok\xF3j",
    headline: "Witamy w Chalet Hotel Hartmann",
    // Saluto senza nome: evita la declinazione del nome.
    salutation: "",
    salutationNoName: "Drodzy Go\u015Bcie!",
    intro: "Bardzo si\u0119 cieszymy, \u017Ce mo\u017Cemy Pa\u0144stwa u nas go\u015Bci\u0107.",
    roomFirst: "Pa\u0144stwa pok\xF3j ma numer {camera} i znajduje si\u0119 na pierwszym pi\u0119trze.",
    roomSecond: "Pa\u0144stwa pok\xF3j ma numer {camera} i znajduje si\u0119 na drugim pi\u0119trze.",
    roomGarden: "Pa\u0144stwa pok\xF3j ma numer {camera} i znajduje si\u0119 na poziomie ogrodu \u2013 wystarczy zej\u015B\u0107 schodami w d\xF3\u0142.",
    roomOther: "Pa\u0144stwa pok\xF3j ma numer {camera}.",
    home: "Prosimy czu\u0107 si\u0119 jak u siebie w domu.",
    bar: "Zapraszamy do swobodnego korzystania z baru \u2013 wystarczy zapisa\u0107, co Pa\u0144stwo wzi\u0119li.",
    breakfast: "\u015Aniadanie serwujemy w godzinach {dalle}\u2013{alle}.",
    sauna: "Sauna znajduje si\u0119 na poziomie ogrodu i jest dost\u0119pna do godziny 21:00.",
    wifiLabel: "Has\u0142o do Wi-Fi",
    emergency: "W nag\u0142ych przypadkach prosimy dzwoni\u0107 pod numer {telefono}.",
    closing: "\u017Byczymy udanego pobytu!",
    qr: "Prosimy zeskanowa\u0107 kod QR \u2013 znajd\u0105 tam Pa\u0144stwo wszystkie informacje o Chalet Hotel Hartmann.",
    noteLabel: "Wiadomo\u015B\u0107 dla Pa\u0144stwa"
  },
  cs: {
    roomLabel: "Pokoj",
    headline: "V\xEDtejte v Chalet Hotelu Hartmann",
    // Saluto senza nome: evita il vocativo.
    salutation: "",
    salutationNoName: "V\xE1\u017Een\xED host\xE9,",
    intro: "srde\u010Dn\u011B V\xE1s u n\xE1s v\xEDt\xE1me.",
    roomFirst: "V\xE1\u0161 pokoj m\xE1 \u010D\xEDslo {camera} a najdete ho v prvn\xEDm pat\u0159e.",
    roomSecond: "V\xE1\u0161 pokoj m\xE1 \u010D\xEDslo {camera} a najdete ho ve druh\xE9m pat\u0159e.",
    roomGarden: "V\xE1\u0161 pokoj m\xE1 \u010D\xEDslo {camera} a najdete ho v zahradn\xEDm podla\u017E\xED \u2013 sta\u010D\xED sej\xEDt po schodech dol\u016F.",
    roomOther: "V\xE1\u0161 pokoj m\xE1 \u010D\xEDslo {camera}.",
    home: "C\xED\u0165te se u n\xE1s jako doma.",
    bar: "Z baru si m\u016F\u017Eete voln\u011B poslou\u017Eit \u2013 sta\u010D\xED si jen poznamenat, co jste si vzali.",
    breakfast: "Sn\xEDdani pod\xE1v\xE1me od {dalle} do {alle}.",
    sauna: "Sauna se nach\xE1z\xED v zahradn\xEDm podla\u017E\xED a je k dispozici do 21:00.",
    wifiLabel: "Heslo k Wi-Fi",
    emergency: "V nal\xE9hav\xFDch p\u0159\xEDpadech n\xE1m volejte na \u010D\xEDslo {telefono}.",
    closing: "P\u0159ejeme V\xE1m p\u0159\xEDjemn\xFD pobyt!",
    qr: "Naskenujte QR k\xF3d \u2013 najdete v n\u011Bm v\u0161echny informace o Chalet Hotelu Hartmann.",
    noteLabel: "Vzkaz pro V\xE1s"
  },
  da: {
    roomLabel: "V\xE6relse",
    headline: "Velkommen til Chalet Hotel Hartmann",
    salutation: "K\xE6re {nome},",
    salutationNoName: "K\xE6re g\xE6ster,",
    intro: "Vi er glade for at byde jer velkommen.",
    roomFirst: "Jeres v\xE6relse har nummer {camera} og ligger p\xE5 f\xF8rste sal.",
    roomSecond: "Jeres v\xE6relse har nummer {camera} og ligger p\xE5 anden sal.",
    roomGarden: "Jeres v\xE6relse har nummer {camera} og ligger p\xE5 haveetagen \u2013 tag blot trappen ned.",
    roomOther: "Jeres v\xE6relse har nummer {camera}.",
    home: "F\xF8l jer som hjemme.",
    bar: "I er velkomne til at forsyne jer i baren \u2013 skriv blot ned, hvad I tager.",
    breakfast: "Morgenmaden serveres kl. {dalle}\u2013{alle}.",
    sauna: "Saunaen ligger p\xE5 haveetagen og kan benyttes indtil kl. 21.00.",
    wifiLabel: "Wi-Fi-adgangskode",
    emergency: "I n\xF8dstilf\xE6lde kan I ringe til os p\xE5 {telefono}.",
    closing: "Vi \xF8nsker jer et dejligt ophold!",
    qr: "Scan QR-koden, s\xE5 finder I alle oplysninger om Chalet Hotel Hartmann.",
    noteLabel: "En besked til jer"
  },
  sv: {
    roomLabel: "Rum",
    headline: "V\xE4lkommen till Chalet Hotel Hartmann",
    salutation: "Hej {nome}!",
    salutationNoName: "K\xE4ra g\xE4ster!",
    intro: "Vi \xE4r glada att f\xE5 v\xE4lkomna er.",
    roomFirst: "Ert rum har nummer {camera} och ligger p\xE5 f\xF6rsta v\xE5ningen.",
    roomSecond: "Ert rum har nummer {camera} och ligger p\xE5 andra v\xE5ningen.",
    roomGarden: "Ert rum har nummer {camera} och ligger p\xE5 tr\xE4dg\xE5rdsplanet \u2013 ta bara trappan ned.",
    roomOther: "Ert rum har nummer {camera}.",
    home: "K\xE4nn er som hemma.",
    bar: "Ta g\xE4rna f\xF6r er i baren \u2013 skriv bara upp vad ni tar.",
    breakfast: "Frukost serveras kl. {dalle}\u2013{alle}.",
    sauna: "Bastun ligger p\xE5 tr\xE4dg\xE5rdsplanet och kan anv\xE4ndas fram till kl. 21.00.",
    wifiLabel: "Wi-Fi-l\xF6senord",
    emergency: "Vid en n\xF6dsituation kan ni ringa oss p\xE5 {telefono}.",
    closing: "Vi \xF6nskar er en riktigt trevlig vistelse!",
    qr: "Skanna QR-koden f\xF6r all information om Chalet Hotel Hartmann.",
    noteLabel: "Ett meddelande till er"
  },
  // Cinese semplificato. I piani si descrivono «di quanti piani salire»: in Cina il piano terra è il «primo piano».
  zh: {
    roomLabel: "\u623F\u95F4",
    headline: "\u6B22\u8FCE\u5165\u4F4F Chalet Hotel Hartmann",
    salutation: "\u5C0A\u656C\u7684 {nome}\uFF1A",
    salutationNoName: "\u5C0A\u656C\u7684\u5BBE\u5BA2\uFF1A",
    intro: "\u6211\u4EEC\u975E\u5E38\u9AD8\u5174\u8FCE\u63A5\u60A8\u7684\u5230\u6765\u3002",
    roomFirst: "\u60A8\u7684\u623F\u95F4\u53F7\u4E3A {camera}\uFF0C\u5728\u697C\u4E0A\u4E00\u5C42\u3002",
    roomSecond: "\u60A8\u7684\u623F\u95F4\u53F7\u4E3A {camera}\uFF0C\u5728\u697C\u4E0A\u4E24\u5C42\u3002",
    roomGarden: "\u60A8\u7684\u623F\u95F4\u53F7\u4E3A {camera}\uFF0C\u4F4D\u4E8E\u82B1\u56ED\u5C42\uFF0C\u6CBF\u697C\u68AF\u4E0B\u697C\u5373\u53EF\u5230\u8FBE\u3002",
    roomOther: "\u60A8\u7684\u623F\u95F4\u53F7\u4E3A {camera}\u3002",
    home: "\u8BF7\u628A\u8FD9\u91CC\u5F53\u4F5C\u81EA\u5DF1\u7684\u5BB6\u3002",
    bar: "\u5427\u53F0\u996E\u54C1\u53EF\u81EA\u884C\u53D6\u7528\uFF0C\u53EA\u9700\u8BB0\u4E0B\u60A8\u53D6\u7528\u7684\u7269\u54C1\u5373\u53EF\u3002",
    breakfast: "\u65E9\u9910\u4F9B\u5E94\u65F6\u95F4\u4E3A {dalle} \u81F3 {alle}\u3002",
    sauna: "\u6851\u62FF\u4F4D\u4E8E\u82B1\u56ED\u5C42\uFF0C\u5F00\u653E\u81F3\u665A\u4E0A 9 \u70B9\u3002",
    wifiLabel: "Wi-Fi \u5BC6\u7801",
    emergency: "\u5982\u9047\u7D27\u6025\u60C5\u51B5\uFF0C\u8BF7\u62E8\u6253 {telefono}\u3002",
    closing: "\u795D\u60A8\u5165\u4F4F\u6109\u5FEB\uFF01",
    qr: "\u626B\u63CF\u4E8C\u7EF4\u7801\uFF0C\u5373\u53EF\u67E5\u770B Chalet Hotel Hartmann \u7684\u5168\u90E8\u4FE1\u606F\u3002",
    noteLabel: "\u7ED9\u60A8\u7684\u7559\u8A00"
  },
  // Coreano, registro di cortesia. Piani descritti in modo relativo: in Corea il piano terra è il «1층».
  ko: {
    roomLabel: "\uAC1D\uC2E4",
    headline: "Chalet Hotel Hartmann\uC5D0 \uC624\uC2E0 \uAC83\uC744 \uD658\uC601\uD569\uB2C8\uB2E4",
    salutation: "{nome} \uB2D8\uAED8",
    salutationNoName: "\uC18C\uC911\uD55C \uACE0\uAC1D\uB2D8\uAED8",
    intro: "\uC800\uD76C\uC640 \uD568\uAED8\uD574 \uC8FC\uC154\uC11C \uC9C4\uC2EC\uC73C\uB85C \uAE30\uC069\uB2C8\uB2E4.",
    roomFirst: "\uACE0\uAC1D\uB2D8\uC758 \uAC1D\uC2E4\uC740 {camera}\uD638\uC774\uBA70, \uD55C \uCE35 \uC704\uC5D0 \uC788\uC2B5\uB2C8\uB2E4.",
    roomSecond: "\uACE0\uAC1D\uB2D8\uC758 \uAC1D\uC2E4\uC740 {camera}\uD638\uC774\uBA70, \uB450 \uCE35 \uC704\uC5D0 \uC788\uC2B5\uB2C8\uB2E4.",
    roomGarden: "\uACE0\uAC1D\uB2D8\uC758 \uAC1D\uC2E4\uC740 {camera}\uD638\uC774\uBA70, \uC815\uC6D0 \uCE35\uC5D0 \uC788\uC2B5\uB2C8\uB2E4. \uACC4\uB2E8\uC73C\uB85C \uB0B4\uB824\uAC00\uC2DC\uBA74 \uB429\uB2C8\uB2E4.",
    roomOther: "\uACE0\uAC1D\uB2D8\uC758 \uAC1D\uC2E4\uC740 {camera}\uD638\uC785\uB2C8\uB2E4.",
    home: "\uC9D1\uCC98\uB7FC \uD3B8\uC548\uD558\uAC8C \uC9C0\uB0B4\uC2DC\uAE30 \uBC14\uB78D\uB2C8\uB2E4.",
    bar: "\uBC14\uC5D0\uC11C\uB294 \uC790\uC720\uB86D\uAC8C \uC74C\uB8CC\uB97C \uB4DC\uC154\uB3C4 \uB429\uB2C8\uB2E4. \uB4DC\uC2E0 \uAC83\uB9CC \uC801\uC5B4 \uC8FC\uC138\uC694.",
    breakfast: "\uC870\uC2DD\uC740 \uC624\uC804 {dalle}\uBD80\uD130 {alle}\uAE4C\uC9C0 \uC81C\uACF5\uB429\uB2C8\uB2E4.",
    sauna: "\uC0AC\uC6B0\uB098\uB294 \uC815\uC6D0 \uCE35\uC5D0 \uC788\uC73C\uBA70 \uC624\uD6C4 9\uC2DC\uAE4C\uC9C0 \uC774\uC6A9\uD558\uC2E4 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
    wifiLabel: "Wi-Fi \uBE44\uBC00\uBC88\uD638",
    emergency: "\uAE34\uAE09 \uC0C1\uD669 \uC2DC\uC5D0\uB294 {telefono}\uBC88\uC73C\uB85C \uC5F0\uB77D\uD574 \uC8FC\uC138\uC694.",
    closing: "\uD3B8\uC548\uD558\uACE0 \uC990\uAC70\uC6B4 \uC2DC\uAC04 \uBCF4\uB0B4\uC2DC\uAE30 \uBC14\uB78D\uB2C8\uB2E4!",
    qr: "QR \uCF54\uB4DC\uB97C \uC2A4\uCE94\uD558\uC2DC\uBA74 Chalet Hotel Hartmann\uC5D0 \uAD00\uD55C \uBAA8\uB4E0 \uC815\uBCF4\uB97C \uD655\uC778\uD558\uC2E4 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
    noteLabel: "\uACE0\uAC1D\uB2D8\uAED8 \uB4DC\uB9AC\uB294 \uBA54\uBAA8"
  },
  // Arabo standard, plurale di cortesia. Saluto senza nome (il nome è già in alto). Le frasi non finiscono con
  // numeri o nomi latini quando si può evitare, così la lettura da destra a sinistra resta pulita anche nel PDF.
  ar: {
    roomLabel: "\u0627\u0644\u063A\u0631\u0641\u0629",
    headline: "\u0623\u0647\u0644\u0627\u064B \u0648\u0633\u0647\u0644\u0627\u064B \u0628\u0643\u0645 \u0641\u064A Chalet Hotel Hartmann",
    salutation: "",
    salutationNoName: "\u0636\u064A\u0648\u0641\u0646\u0627 \u0627\u0644\u0643\u0631\u0627\u0645\u060C",
    intro: "\u064A\u0633\u0639\u062F\u0646\u0627 \u0623\u0646 \u0646\u0631\u062D\u0628 \u0628\u0643\u0645 \u0628\u064A\u0646\u0646\u0627.",
    roomFirst: "\u0631\u0642\u0645 \u063A\u0631\u0641\u062A\u0643\u0645 {camera} \u0648\u062A\u0642\u0639 \u0641\u064A \u0627\u0644\u0637\u0627\u0628\u0642 \u0627\u0644\u0623\u0648\u0644\u060C \u0623\u064A \u0637\u0627\u0628\u0642 \u0648\u0627\u062D\u062F \u0625\u0644\u0649 \u0627\u0644\u0623\u0639\u0644\u0649.",
    roomSecond: "\u0631\u0642\u0645 \u063A\u0631\u0641\u062A\u0643\u0645 {camera} \u0648\u062A\u0642\u0639 \u0641\u064A \u0627\u0644\u0637\u0627\u0628\u0642 \u0627\u0644\u062B\u0627\u0646\u064A\u060C \u0623\u064A \u0637\u0627\u0628\u0642\u064A\u0646 \u0625\u0644\u0649 \u0627\u0644\u0623\u0639\u0644\u0649.",
    roomGarden: "\u0631\u0642\u0645 \u063A\u0631\u0641\u062A\u0643\u0645 {camera} \u0648\u062A\u0642\u0639 \u0641\u064A \u0637\u0627\u0628\u0642 \u0627\u0644\u062D\u062F\u064A\u0642\u0629\u060C \u0648\u064A\u0643\u0641\u064A \u0623\u0646 \u062A\u0646\u0632\u0644\u0648\u0627 \u0627\u0644\u062F\u0631\u062C \u0644\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u064A\u0647\u0627.",
    roomOther: "\u0631\u0642\u0645 \u063A\u0631\u0641\u062A\u0643\u0645 {camera}.",
    home: "\u0646\u0631\u062C\u0648 \u0623\u0646 \u062A\u0634\u0639\u0631\u0648\u0627 \u0648\u0643\u0623\u0646\u0643\u0645 \u0641\u064A \u0628\u064A\u062A\u0643\u0645.",
    bar: "\u062A\u0641\u0636\u0644\u0648\u0627 \u0628\u062E\u062F\u0645\u0629 \u0623\u0646\u0641\u0633\u0643\u0645 \u0641\u064A \u0627\u0644\u0628\u0627\u0631\u060C \u0648\u064A\u0643\u0641\u064A \u0623\u0646 \u062A\u062F\u0648\u0651\u0646\u0648\u0627 \u0645\u0627 \u062A\u062A\u0646\u0627\u0648\u0644\u0648\u0646\u0647.",
    breakfast: "\u064A\u0642\u062F\u0645 \u0627\u0644\u0641\u0637\u0648\u0631 \u0645\u0646 \u0627\u0644\u0633\u0627\u0639\u0629 {dalle} \u062D\u062A\u0649 \u0627\u0644\u0633\u0627\u0639\u0629 {alle} \u0635\u0628\u0627\u062D\u064B\u0627.",
    sauna: "\u062A\u0642\u0639 \u0627\u0644\u0633\u0627\u0648\u0646\u0627 \u0641\u064A \u0637\u0627\u0628\u0642 \u0627\u0644\u062D\u062F\u064A\u0642\u0629\u060C \u0648\u064A\u0645\u0643\u0646 \u0627\u0633\u062A\u062E\u062F\u0627\u0645\u0647\u0627 \u062D\u062A\u0649 \u0627\u0644\u0633\u0627\u0639\u0629 \u0627\u0644\u062A\u0627\u0633\u0639\u0629 \u0645\u0633\u0627\u0621\u064B.",
    wifiLabel: "\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0627\u0644\u0648\u0627\u064A \u0641\u0627\u064A",
    emergency: "\u0641\u064A \u062D\u0627\u0644\u0627\u062A \u0627\u0644\u0637\u0648\u0627\u0631\u0626 \u064A\u0631\u062C\u0649 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0627\u0644\u0631\u0642\u0645 {telefono}.",
    closing: "\u0646\u062A\u0645\u0646\u0649 \u0644\u0643\u0645 \u0625\u0642\u0627\u0645\u0629 \u0631\u0627\u0626\u0639\u0629!",
    qr: "\u0627\u0645\u0633\u062D\u0648\u0627 \u0631\u0645\u0632 QR \u0636\u0648\u0626\u064A\u064B\u0627 \u0644\u062A\u062C\u062F\u0648\u0627 \u062C\u0645\u064A\u0639 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0639\u0646 Chalet Hotel Hartmann.",
    noteLabel: "\u0645\u0644\u0627\u062D\u0638\u0629 \u0644\u0643\u0645"
  }
};
var BOLD_VARS = /* @__PURE__ */ new Set(["camera", "telefono"]);
function fillSegments(template, vars) {
  const out2 = [];
  let last = 0;
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    const key = m[1];
    if (!(key in vars)) continue;
    if (m.index > last) out2.push(t(template.slice(last, m.index)));
    out2.push(BOLD_VARS.has(key) ? b(vars[key]) : t(vars[key]));
    last = m.index + m[0].length;
  }
  if (last < template.length) out2.push(t(template.slice(last)));
  return out2.reduce((acc, s) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.bold === true === (s.bold === true)) acc[acc.length - 1] = s.bold ? b(prev.text + s.text) : t(prev.text + s.text);
    else if (s.text) acc.push(s);
    return acc;
  }, []);
}
var fillText = (template, vars) => fillSegments(template, vars).map((s) => s.text).join("");
var ROOM_KEY = { first: "roomFirst", second: "roomSecond", garden: "roomGarden" };
function compileLetter(lang, tpl) {
  const time = TIME_FORMAT[lang] ?? ((hm) => hm);
  return {
    nameIt: LANG_NAMES[lang],
    roomLabel: tpl.roomLabel,
    headline: tpl.headline,
    salutation: (n) => n && tpl.salutation.includes("{nome}") ? fillText(tpl.salutation, { nome: n }) : tpl.salutationNoName,
    intro: tpl.intro,
    room: (r, f) => fillSegments(tpl[f ? ROOM_KEY[f] : "roomOther"], { camera: r }),
    home: tpl.home,
    bar: tpl.bar,
    breakfast: (from, to) => fillText(tpl.breakfast, { dalle: time(from), alle: time(to) }),
    sauna: tpl.sauna,
    wifiLabel: tpl.wifiLabel,
    emergency: (p) => fillSegments(tpl.emergency, { telefono: p }),
    closing: tpl.closing,
    qr: tpl.qr,
    noteLabel: tpl.noteLabel
  };
}
var compileAll = (overrides = {}) => Object.fromEntries(
  Object.keys(LETTER_DEFAULTS).map((l) => [l, compileLetter(l, { ...LETTER_DEFAULTS[l], ...overrides[l] })])
);
var TEXTS = compileAll();

// src/letter.ts
var SUPPORTED = new Set(Object.keys(TEXTS));
function normalizeLang(code) {
  const raw = code?.trim() || null;
  if (!raw) return { lang: "en", supported: false, raw: null };
  const base = raw.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED.has(base) ? { lang: base, supported: true, raw } : { lang: "en", supported: false, raw };
}
var titleCaseWord = (w) => w.split(/([-'’])/).map((part) => part.length > 0 && !/[-'’]/.test(part) ? part[0].toLocaleUpperCase() + part.slice(1).toLocaleLowerCase() : part).join("");
function normalizeGuestName(first, last) {
  const f = (first ?? "").replace(/\s+/g, " ").trim();
  const l = (last ?? "").replace(/\s+/g, " ").trim();
  let full = f && l && f.toLocaleLowerCase() === l.toLocaleLowerCase() ? f : [f, l].filter(Boolean).join(" ");
  if (!full) return "";
  const letters = full.replace(/[^\p{L}]/gu, "");
  const allUpper = letters === letters.toLocaleUpperCase();
  const allLower = letters === letters.toLocaleLowerCase();
  if (allUpper || allLower) full = full.split(" ").map(titleCaseWord).join(" ");
  return full;
}

// src/scatola.ts
var pickGuest = (r) => ({
  reservation_id: r.reservation_id,
  guest_type: r.guest_type ?? null,
  is_primary_guest: r.is_primary_guest ?? null,
  first_name: r.first_name ?? null,
  last_name: r.last_name ?? null,
  language: r.language ?? null
});
var pickBooker = (r) => ({
  reservation_id: r.reservation_id,
  booker_type: r.booker_type ?? null,
  first_name: r.first_name ?? null,
  last_name: r.last_name ?? null,
  language: r.language ?? null,
  company_language: r.company_language ?? null
});
var isLeadGuest = (g) => g.is_primary_guest === true || /HEAD|SINGLE/i.test(g.guest_type ?? "");
function lookupFromRows(stays, contacts) {
  const guests = /* @__PURE__ */ new Map();
  const bookers = /* @__PURE__ */ new Map();
  for (const g of stays.map(pickGuest)) {
    if (!isLeadGuest(g) || guests.has(g.reservation_id)) continue;
    guests.set(g.reservation_id, { name: normalizeGuestName(g.first_name, g.last_name), lang: g.language });
  }
  for (const c of contacts.map(pickBooker)) {
    const individual = c.booker_type !== "COMPANY";
    bookers.set(c.reservation_id, {
      name: individual ? normalizeGuestName(c.first_name, c.last_name) : "",
      lang: individual ? c.language : c.company_language ?? c.language
    });
  }
  return { guests, bookers };
}
function chooseLang(guestLang, bookerLang) {
  const g = normalizeLang(guestLang);
  const bk = normalizeLang(bookerLang);
  const differ = g.raw && bk.raw && g.raw.toLowerCase() !== bk.raw.toLowerCase();
  const note = differ ? `Slope: ospite ${g.raw.toUpperCase()}, prenotazione ${bk.raw.toUpperCase()}` : null;
  if (g.raw && !(g.raw.toLowerCase().startsWith("it") && bk.raw && differ)) {
    return { lang: g.lang, source: "ospite", raw: g.raw, note };
  }
  if (bk.raw) return { lang: bk.lang, source: "prenotazione", raw: bk.raw, note };
  return { lang: "en", source: "predefinita", raw: null, note };
}
function toItems(rows, lookup) {
  return rows.map((r) => {
    const guest = lookup?.guests.get(r.reservation_id) ?? null;
    const booker = lookup?.bookers.get(r.reservation_id) ?? null;
    const choice = chooseLang(guest?.lang ?? null, booker?.lang ?? null);
    return {
      key: r.reservation_id,
      reservationId: r.reservation_id,
      room: r.room_name?.trim() || null,
      arrival: r.arrival,
      departure: r.departure,
      adults: r.adults,
      children: r.children,
      isOption: r.is_option || r.booking_status === "OPTION",
      inHouse: r.stay_status === "IN_HOUSE",
      manual: false,
      rawLang: choice.raw,
      langSource: choice.source,
      langNote: choice.note,
      name: guest?.name || booker?.name || "",
      note: "",
      pin: "",
      lang: choice.lang,
      selected: true
    };
  }).sort((a, b2) => (a.room ?? "zzz").localeCompare(b2.room ?? "zzz", "it", { numeric: true }));
}

// src/feed-build.ts
var HARTMANN_ID = "22222222-2222-4222-8222-222222222222";
var romeToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
var addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
var dm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
var feedDates = (from = romeToday()) => Array.from({ length: FEED_DAYS }, (_, i) => addDays(from, i));
function hartmannRows(arrivals) {
  return [...new Map(arrivals.map((r) => [r.reservation_id, r])).values()].filter(
    (r) => typeof r.reservation_id === "string" && (r.property_id === HARTMANN_ID || PROPERTY_NAME_MATCH.test(String(r.property_name ?? ""))) && r.booking_status !== "CANCELLED"
  );
}
var RANK = { fresh: 0, unavailable: 1, stale: 2, failing: 3 };
var EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,24}$/i;
var CHECKIN = /^https:\/\/booking\.slope\.it\/g\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/reservations\/[0-9a-f-]{36}\/check-in$/i;
var clean = (v) => typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
var titolo = (s) => s && s === s.toUpperCase() ? s.toLowerCase().replace(new RegExp("(^|[\\s'\u2019-])(\\p{L})", "gu"), (_, a, b2) => a + b2.toUpperCase()) : s;
function nomePortale(agencyName, otaChannel) {
  const canale = clean(otaChannel).toUpperCase();
  if (!canale) return null;
  if (canale === "BOOKING") return "Booking.com";
  if (canale === "EXPEDIA") return "Expedia";
  return clean(agencyName) || canale.charAt(0) + canale.slice(1).toLowerCase();
}
function riferimentiPer(rows, references = [], orders = []) {
  const refById = new Map(references.map((x) => [x.reservation_id, x]));
  const numeri = new Map(orders.filter((o) => typeof o.order_number === "number").map((o) => [o.order_id, o.order_number]));
  const out2 = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const ref = refById.get(r.reservation_id);
    const portale = nomePortale(ref?.agency_name ?? r.agency_name, ref?.ota_channel ?? r.ota_channel);
    const codice = clean(ref?.agency_code);
    const ordine = numeri.get(clean(ref?.order_id) || r.order_id) ?? null;
    out2.set(r.reservation_id, { codicePortale: portale && codice ? codice : null, portale: portale && codice ? portale : null, numeroOrdine: ordine });
  }
  return out2;
}
function avvisiItems(rows, contacts, references = [], orders = []) {
  const byId = new Map(contacts.map((c) => [c.reservation_id, c]));
  const rif = riferimentiPer(rows, references, orders);
  return rows.filter((r) => !r.is_option && r.booking_status !== "OPTION" && r.booking_status !== "CANCELLED").map((r) => {
    const c = byId.get(r.reservation_id);
    const azienda = c?.booker_type === "COMPANY" ? clean(c.organization_name) : "";
    const first = titolo(clean(c?.first_name));
    const last = titolo(clean(c?.last_name));
    const url = clean(c?.checkin_url);
    const lang = azienda ? clean(c?.company_language) || clean(c?.language) : clean(c?.language) || clean(c?.company_language);
    return {
      reservationId: r.reservation_id,
      arrival: r.arrival,
      departure: r.departure,
      name: azienda || [last, first].filter(Boolean).join(" "),
      greetingName: azienda ? "" : [first, last].filter(Boolean).join(" "),
      email: [c?.primary_email, c?.company_email].map(clean).find((e) => EMAIL.test(e)) ?? null,
      phone: [c?.primary_phone_number, c?.company_phone].map(clean).find(Boolean) ?? null,
      lang: lang || null,
      checkinUrl: CHECKIN.test(url) ? url : null,
      checkinFatto: c?.is_privacy_policy_acknowledged === true && typeof c.identity_document === "object" && c.identity_document !== null,
      room: clean(r.room_name) || null,
      ...rif.get(r.reservation_id)
    };
  }).sort((a, b2) => a.arrival.localeCompare(b2.arrival) || a.name.localeCompare(b2.name));
}
async function buildFeed(src, password) {
  const lookup = lookupFromRows(src.stays, src.contacts);
  const days = {};
  const counts = {};
  for (const date of src.dates) {
    const items = toItems(src.rows.filter((r) => r.arrival === date), lookup).map(toFeedItem);
    days[date] = items;
    counts[date] = items.length;
  }
  const worst = src.freshness.reduce((w, f) => RANK[f.overall.status] > RANK[w] ? f.overall.status : w, "fresh");
  const times = src.freshness.flatMap((f) => f.sources).filter((s) => s.resource === "lodging_reservation" && s.property_id === HARTMANN_ID && s.last_success_at).map((s) => Date.parse(s.last_success_at)).filter(Number.isFinite);
  const from = src.dates[0];
  const payload = { days };
  const avvisi = { items: avvisiItems(src.rows, src.contacts, src.references, src.orders) };
  const envelope = {
    format: 1,
    app: "WelcomeHartmann",
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    scatola_updated_at: times.length ? new Date(Math.max(...times)).toISOString() : null,
    freshness: worst,
    from,
    to: src.dates[src.dates.length - 1],
    counts,
    enc: await encryptJson(payload, password, feedAad(from), FEED_ITERATIONS),
    avvisi_count: avvisi.items.length,
    avvisi: await encryptJson(avvisi, password, avvisiAad(from), FEED_ITERATIONS)
  };
  const back = await decryptJson(envelope.enc, password, feedAad(from));
  if (JSON.stringify(back) !== JSON.stringify(payload)) throw new Error("la verifica della cifratura non torna");
  const backAvvisi = await decryptJson(envelope.avvisi, password, avvisiAad(from));
  if (JSON.stringify(backAvvisi) !== JSON.stringify(avvisi)) throw new Error("la verifica della cifratura dei contatti non torna");
  const noRoom = src.rows.filter((r) => !r.room_name).length;
  const noName = Object.values(days).flat().filter((i) => !i.name).length;
  return {
    envelope,
    summary: [
      `RIEPILOGO arrivi ${src.dates.map((d) => `${dm(d)}: ${counts[d]}`).join(" \xB7 ")}`,
      `RIEPILOGO La Scatola: ${worst}${envelope.scatola_updated_at ? `, prenotazioni aggiornate alle ${envelope.scatola_updated_at}` : ""}`,
      `RIEPILOGO senza camera: ${noRoom} \xB7 senza nome: ${noName}`,
      `RIEPILOGO avvisi: ${avvisi.items.length} prenotazioni confermate \xB7 ${avvisi.items.filter((i) => i.email).length} con email \xB7 ${avvisi.items.filter((i) => i.checkinUrl).length} con link di check-in \xB7 ${avvisi.items.filter((i) => i.checkinFatto).length} con check-in gi\xE0 fatto \xB7 ${avvisi.items.filter((i) => i.codicePortale || i.numeroOrdine).length} con numero di prenotazione`
    ]
  };
}

// src/cli/feed-files.ts
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
var isRec = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var VIEW_KIND = {
  curated_operational_stays: "arrivi",
  list_arrivals: "arrivi",
  curated_guest_stays: "ospiti",
  curated_reservation_contacts: "intestatari",
  curated_reservations: "riferimenti",
  curated_order_balances: "ordini"
};
function kindOf(vista, rows) {
  if (typeof vista === "string" && VIEW_KIND[vista]) return VIEW_KIND[vista];
  const r = rows[0];
  if (!r) return null;
  if ("booker_type" in r) return "intestatari";
  if ("guest_type" in r || "is_primary_guest" in r || "stay_start" in r) return "ospiti";
  if ("order_number" in r) return "ordini";
  if ("agency_code" in r) return "riferimenti";
  if ("room_name" in r || "adults" in r || "lodging_type_id" in r) return "arrivi";
  return null;
}
function parse(text, depth = 0) {
  const v = JSON.parse(text);
  if (Array.isArray(v) && depth < 2 && v.every((b2) => isRec(b2) && typeof b2.text === "string")) {
    return parse(v.map((b2) => b2.text).join(""), depth + 1);
  }
  if (typeof v === "string" && depth < 2) return parse(v, depth + 1);
  return v;
}
var FileError = class extends Error {
};
function readBundle(path) {
  const name = basename(path);
  if (!existsSync(path)) throw new FileError(`file non trovato: ${name}`);
  let v;
  try {
    v = parse(readFileSync(path, "utf8").trim());
  } catch {
    throw new FileError(`${name} non \xE8 un JSON leggibile`);
  }
  if (!isRec(v)) throw new FileError(`${name}: contenuto non riconosciuto`);
  let rows;
  let total = null;
  let more = false;
  if (Array.isArray(v.data)) {
    rows = v.data;
    const page = isRec(v.page) ? v.page : {};
    total = typeof page.total === "number" ? page.total : null;
    more = page.truncated === true || typeof page.next_cursor === "string" && page.next_cursor !== "";
  } else if (Array.isArray(v.rows)) {
    rows = v.rows;
    total = typeof v.total === "number" ? v.total : null;
  } else {
    throw new FileError(`${name}: mancano le righe ("data" o "rows")`);
  }
  const kind = kindOf(v.vista ?? v.view, rows);
  if (!kind) {
    if (rows.length === 0) throw new FileError(`${name}: vuoto e senza "vista": indica quale vista \xE8`);
    throw new FileError(`${name}: vista non riconosciuta (aggiungi "vista")`);
  }
  const chiave = kind === "ordini" ? "order_id" : "reservation_id";
  rows.forEach((r, i) => {
    if (!isRec(r) || typeof r[chiave] !== "string" || !UUID.test(r[chiave]))
      throw new FileError(`${name}: ${chiave} mancante o non valido alla riga ${i + 1}`);
  });
  const freshness = isRec(v.freshness) && isRec(v.freshness.overall) ? v.freshness : null;
  return { file: name, kind, rows, freshness, total, more };
}
function checkPages(bundles) {
  const groups = /* @__PURE__ */ new Map();
  for (const b2 of bundles) {
    if (b2.total === null) continue;
    const key = `${b2.kind}|${b2.total}`;
    groups.set(key, [...groups.get(key) ?? [], b2]);
  }
  for (const [key, list] of groups) {
    const total = Number(key.split("|")[1]);
    const rows = list.reduce((n, b2) => n + b2.rows.length, 0);
    if (rows < total) {
      const files = list.map((b2) => b2.file).join(", ");
      throw new FileError(`${files}: ${rows} righe su ${total}: mancano pagine (segui next_cursor e passa anche i file delle pagine successive)`);
    }
  }
}
var splitPaths = (args) => args.flatMap((a) => a.split(",")).map((s) => s.trim()).filter(Boolean);

// src/cli/feed-cli.ts
var RUN_FILE = join(tmpdir(), "welcome-hartmann-run.json");
var MAX_TRIES = 3;
function out(line) {
  process.stdout.write(`${line}
`);
}
function fail(message) {
  out(`ERRORE ${message}`);
  process.exit(2);
}
function transcripts() {
  const found = [];
  const walk = (dir, depth) => {
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const p = join(dir, name);
      try {
        const st = statSync(p);
        if (st.isDirectory()) {
          if (depth < 5) walk(p, depth + 1);
        } else if (name.endsWith(".jsonl")) found.push({ path: p, mtime: st.mtimeMs });
      } catch {
      }
    }
  };
  walk(join(homedir(), ".claude", "projects"), 0);
  return found.sort((a, b2) => b2.mtime - a.mtime);
}
function findTranscript(run2) {
  if (run2.transcript) return run2.transcript;
  const all = transcripts();
  if (all.length === 0) fail(`nessun registro di sessione in ${join(homedir(), ".claude", "projects")}. Passa --transcript <file> a start.`);
  const marked = all.find((t2) => {
    try {
      return readFileSync2(t2.path, "utf8").includes(run2.token);
    } catch {
      return false;
    }
  });
  if (!marked) fail(`nessun registro contiene il segno ${run2.token}: riesegui start e poi next.`);
  return marked.path;
}
var isRec2 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function resultText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((b2) => isRec2(b2) && typeof b2.text === "string" ? b2.text : "").join("");
  return "";
}
var SAVED_PATH = /saved to:?\s+(\/\S+?\.(?:txt|json))(?=[.,;)\s]|$)/i;
function asEnvelope(v, depth = 0) {
  if (typeof v === "string") {
    const t2 = v.trim();
    if (depth > 3 || !/^[{["]/.test(t2)) return null;
    try {
      return asEnvelope(JSON.parse(t2), depth + 1);
    } catch {
      return null;
    }
  }
  if (Array.isArray(v)) return asEnvelope(v.map((b2) => isRec2(b2) && typeof b2.text === "string" ? b2.text : "").join(""), depth + 1);
  if (!isRec2(v) || !Array.isArray(v.data)) return null;
  const page = isRec2(v.page) ? v.page : {};
  const fresh = isRec2(v.freshness) ? v.freshness : { overall: { status: "unavailable" }, sources: [] };
  return { data: v.data, freshness: fresh, next: typeof page.next_cursor === "string" ? page.next_cursor : null };
}
function parseResult(body, isError) {
  const raw = body.trim();
  if (isError) return { page: null, error: raw.replace(/\s+/g, " ").slice(0, 160) || "errore dello strumento" };
  let env = asEnvelope(raw);
  if (!env) {
    const saved = SAVED_PATH.exec(raw);
    if (saved) {
      if (!existsSync2(saved[1])) return { page: null, error: `file della risposta non trovato (${basename2(saved[1])})` };
      env = asEnvelope(readFileSync2(saved[1], "utf8"));
    }
  }
  return env ? { page: env, error: null } : { page: null, error: `risposta non riconosciuta (${raw.length} caratteri)` };
}
function readCalls(transcript, since) {
  const byId = /* @__PURE__ */ new Map();
  for (const line of readFileSync2(transcript, "utf8").split("\n")) {
    if (!line || !line.includes("Scatola") && !line.includes("tool_result")) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRec2(o) || !isRec2(o.message) || !Array.isArray(o.message.content)) continue;
    const at = typeof o.timestamp === "string" ? o.timestamp : "";
    for (const block of o.message.content) {
      if (!isRec2(block)) continue;
      if (block.type === "tool_use" && typeof block.name === "string" && /scatola/i.test(block.name) && typeof block.id === "string" && isRec2(block.input)) {
        const tool = /list_arrivals$/.test(block.name) ? "list_arrivals" : /query_curated_view$/.test(block.name) ? "query_curated_view" : null;
        if (tool && at >= since) byId.set(block.id, { id: block.id, at, tool, input: block.input, page: null, error: "nessuna risposta" });
      } else if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
        const call = byId.get(block.tool_use_id);
        if (call) Object.assign(call, parseResult(resultText(block.content), block.is_error === true));
      }
    }
  }
  return [...byId.values()].sort((a, b2) => a.at.localeCompare(b2.at));
}
var sameIds = (a, b2) => Array.isArray(a) && a.length === b2.length && [...a].map(String).sort().join("|") === [...b2].sort().join("|");
function follow(calls, match, first) {
  const mine = calls.filter(match);
  const starts = mine.filter((c) => !c.input.cursor);
  const ok = starts.filter((c) => c.page).pop();
  if (!ok) return { rows: [], freshness: [], next: first, failures: starts.length };
  const rows = [];
  const freshness = [];
  let cur = ok;
  for (let guard = 0; guard < 200; guard++) {
    rows.push(...cur.page.data);
    freshness.push(cur.page.freshness);
    const cursor = cur.page.next;
    if (!cursor) return { rows, freshness, next: null, failures: 0 };
    const tries = mine.filter((c) => c.input.cursor === cursor && c.at >= ok.at);
    const good = tries.filter((c) => c.page).pop();
    if (!good) return { rows, freshness, next: { ...first, cursor }, failures: tries.length };
    cur = good;
  }
  return fail("la lettura a pagine non termina");
}
function ask(tool, input, failures, lastError2) {
  if (failures >= MAX_TRIES) fail(`La Scatola non risponde a ${tool} dopo ${failures} tentativi (${lastError2 ?? "errore"}). Non pubblicare.`);
  out(`CHIAMA mcp__La_Scatola__${tool} ${JSON.stringify(input)}`);
  out("Copia gli argomenti identici, poi riesegui: node tools/feed.mjs next");
  process.exit(0);
}
var lastError = (calls, match) => calls.filter(match).filter((c) => c.error).pop()?.error ?? null;
function loadRun() {
  if (!existsSync2(RUN_FILE)) fail("nessuna esecuzione avviata: esegui prima start.");
  return JSON.parse(readFileSync2(RUN_FILE, "utf8"));
}
function start(args) {
  const password = args[0];
  if (!password || password.length < 8) fail('serve la password: node tools/feed.mjs start "<PASSWORD>"');
  if (!existsSync2("index.html")) fail("esegui il comando dalla cartella del repository WelcomeHartmann.");
  const ti = args.indexOf("--transcript");
  const run2 = {
    token: `WH-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    startedAt: new Date(Date.now() - 1e3).toISOString(),
    password,
    dates: feedDates(),
    transcript: ti >= 0 ? args[ti + 1] ?? null : null
  };
  writeFileSync(RUN_FILE, JSON.stringify(run2), { mode: 384 });
  out(`SEGNO ${run2.token}`);
  out(`Giorni: ${run2.dates[0]} \u2192 ${run2.dates[run2.dates.length - 1]}`);
  out("Ora esegui: node tools/feed.mjs next");
}
async function next() {
  const run2 = loadRun();
  const calls = readCalls(findTranscript(run2), run2.startedAt);
  const arrivals = [];
  const fresh = [];
  for (const date of run2.dates) {
    const first = { date, property_id: HARTMANN_ID, limit: 100 };
    const match = (c) => c.tool === "list_arrivals" && c.input.date === date && c.input.property_id === HARTMANN_ID && c.input.limit === 100;
    const chain = follow(calls, match, first);
    if (chain.next) ask("list_arrivals", chain.next, chain.failures, lastError(calls, match));
    arrivals.push(...chain.rows);
    fresh.push(...chain.freshness);
  }
  const rows = hartmannRows(arrivals);
  const ids = rows.map((r) => r.reservation_id).sort();
  const stays = [];
  const contacts = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const views = [
      ["curated_guest_stays", 500, (r) => stays.push(...r)],
      ["curated_reservation_contacts", 100, (r) => contacts.push(...r)]
    ];
    for (const [view, limit, sink] of views) {
      const first = { view, filters: [{ field: "reservation_id", op: "in", value: chunk }], limit };
      const match = (c) => {
        const f = Array.isArray(c.input.filters) ? c.input.filters : [];
        return c.tool === "query_curated_view" && c.input.view === view && c.input.limit === limit && f.length === 1 && f[0].field === "reservation_id" && f[0].op === "in" && sameIds(f[0].value, chunk);
      };
      const chain = follow(calls, match, first);
      if (chain.next) ask("query_curated_view", chain.next, chain.failures, lastError(calls, match));
      sink(chain.rows);
    }
  }
  const built = await buildFeed({ dates: run2.dates, rows, stays, contacts, freshness: fresh }, run2.password).catch(
    (e) => fail(`${e instanceof Error ? e.message : String(e)}. Non pubblicare.`)
  );
  writeFileSync(FEED_FILE, `${JSON.stringify(built.envelope)}
`);
  for (const line of built.summary) out(line.startsWith("RIEPILOGO senza") ? `${line} \xB7 chiamate lette: ${calls.length}` : line);
  out(`PRONTO ${FEED_FILE} scritto e verificato`);
}
var VIEW_OF = {
  arrivi: "curated_operational_stays",
  ospiti: "curated_guest_stays",
  intestatari: "curated_reservation_contacts",
  riferimenti: "curated_reservations",
  ordini: "curated_order_balances"
};
var MAX_IN = 50;
function ordini(args) {
  const files = splitPaths(args);
  if (files.length === 0) fail("uso: node tools/feed.mjs ordini <file di curated_reservations> [...]");
  let bundles = [];
  try {
    bundles = files.map(readBundle);
    checkPages(bundles);
  } catch (e) {
    fail(e instanceof FileError ? e.message : "file non leggibili");
  }
  if (bundles.some((b2) => b2.kind !== "riferimenti")) fail("indica solo i file della vista curated_reservations");
  const dates = feedDates();
  const ids = [
    ...new Set(
      bundles.flatMap((b2) => b2.rows).filter((r) => (r.property_id === void 0 || r.property_id === HARTMANN_ID) && r.booking_status !== "CANCELLED").filter((r) => typeof r.arrival !== "string" || r.arrival >= dates[0] && r.arrival <= dates[dates.length - 1]).filter((r) => !(typeof r.agency_code === "string" && r.agency_code.trim())).map((r) => r.order_id).filter((id) => typeof id === "string" && id !== "")
    )
  ].sort();
  if (ids.length === 0) {
    out("NESSUNA chiamata: tutte le prenotazioni hanno il numero del portale");
    return;
  }
  for (let i = 0; i < ids.length; i += MAX_IN) {
    const value = ids.slice(i, i + MAX_IN);
    out(`ARGOMENTI ${JSON.stringify({ view: "curated_order_balances", filters: [{ field: "order_id", op: "in", value }], limit: 100 })}`);
  }
}
async function build(args) {
  const force = args.includes("--forza");
  const rest2 = args.filter((a) => a !== "--forza");
  const password = rest2[0];
  if (!password || password.length < 8) fail('uso: node tools/feed.mjs build "<PASSWORD>" <file> [<file> ...]');
  if (!existsSync2("index.html")) fail("esegui il comando dalla cartella del repository WelcomeHartmann.");
  const files = splitPaths(rest2.slice(1));
  if (files.length === 0) fail("indica i file con le risposte di La Scatola");
  let bundles = [];
  try {
    bundles = files.map(readBundle);
    checkPages(bundles);
  } catch (e) {
    fail(e instanceof FileError ? e.message : "file non leggibili");
  }
  const of = (k) => bundles.filter((b2) => b2.kind === k);
  for (const k of ["arrivi", "ospiti", "intestatari"]) {
    if (of(k).length === 0) fail(`manca il file della vista ${VIEW_OF[k]}`);
  }
  const dates = feedDates();
  const inWindow = (d) => typeof d === "string" && d >= dates[0] && d <= dates[dates.length - 1];
  const rows = hartmannRows(of("arrivi").flatMap((b2) => b2.rows)).filter((r) => inWindow(r.arrival));
  const stays = of("ospiti").flatMap((b2) => b2.rows);
  const contactRows = of("intestatari").flatMap((b2) => b2.rows);
  const contacts = contactRows;
  const references = of("riferimenti").flatMap((b2) => b2.rows);
  const orders = of("ordini").flatMap((b2) => b2.rows);
  const ids = new Set(rows.map((r) => r.reservation_id));
  const withBooker = new Set(contactRows.map((c) => c.reservation_id));
  const warnings = [];
  for (const r of rows) {
    if (!withBooker.has(r.reservation_id))
      warnings.push(`ATTENZIONE camera ${r.room_name ?? "senza camera"}, arrivo ${dm(r.arrival)}: nessun intestatario con lo stesso reservation_id`);
  }
  for (const c of contactRows) {
    const pid = c.property_id;
    if (inWindow(c.arrival) && c.booking_status !== "CANCELLED" && (pid === void 0 || pid === HARTMANN_ID) && !ids.has(c.reservation_id))
      warnings.push(`ATTENZIONE un intestatario con arrivo ${dm(String(c.arrival))} non corrisponde a nessun arrivo`);
  }
  for (const w of warnings) out(w);
  if (warnings.length && !force) fail("controlla i reservation_id copiati nei file e rilancia (se sono giusti: --forza). Non pubblicare.");
  const freshness = bundles.map((b2) => b2.freshness).filter((f) => f !== null);
  const built = await buildFeed({ dates, rows, stays, contacts, freshness, references, orders }, password).catch(
    (e) => fail(`${e instanceof Error ? e.message : String(e)}. Non pubblicare.`)
  );
  writeFileSync(FEED_FILE, `${JSON.stringify(built.envelope)}
`);
  for (const line of built.summary) out(line.startsWith("RIEPILOGO senza") ? `${line} \xB7 file letti: ${bundles.length}` : line);
  out(`PRONTO ${FEED_FILE} scritto e verificato`);
}
async function verify(args) {
  const file = args.length > 1 ? args[0] : FEED_FILE;
  const password = args.length > 1 ? args[1] : args[0];
  if (!password) fail('uso: node tools/feed.mjs verify [arrivi.json] "<PASSWORD>"');
  const env = JSON.parse(readFileSync2(file, "utf8"));
  if (!isFeedEnvelope(env)) fail(`${file} non \xE8 un file arrivi valido`);
  const payload = await decryptJson(env.enc, password, feedAad(env.from)).catch(() => fail("password errata o file alterato"));
  const total = Object.values(payload.days).reduce((n, d) => n + d.length, 0);
  const ok = Object.entries(env.counts).every(([d, n]) => (payload.days[d]?.length ?? -1) === n);
  if (!ok) fail("i conteggi in chiaro non corrispondono al contenuto cifrato");
  let avvisi = "senza contatti per le email";
  if (env.avvisi) {
    const a = await decryptJson(env.avvisi, password, avvisiAad(env.from)).catch(() => fail("contatti per le email: password errata o file alterato"));
    if (a.items.length !== env.avvisi_count) fail("il numero di contatti in chiaro non corrisponde al contenuto cifrato");
    avvisi = `${a.items.length} contatti per le email`;
  }
  out(`verifica OK: ${env.from} \u2192 ${env.to}, ${total} arrivi, ${avvisi}, scritto ${env.generated_at}`);
}
var [cmd, ...rest] = process.argv.slice(2);
var run = cmd === "start" ? async () => start(rest) : cmd === "next" ? next : cmd === "verify" ? () => verify(rest) : cmd === "build" ? () => build(rest) : cmd === "ordini" ? async () => ordini(rest) : null;
if (!run) fail('comandi: build "<PASSWORD>" <file>\u2026 \xB7 ordini <file>\u2026 \xB7 verify [file] "<PASSWORD>" \xB7 start "<PASSWORD>" \xB7 next');
run().catch((e) => fail(e instanceof Error ? e.message : String(e)));
