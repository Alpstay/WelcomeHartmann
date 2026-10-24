// Testi della lettera di benvenuto in 13 lingue, come modelli modificabili dal menu Impostazioni.
// Contenuti richiesti: numero di camera con il percorso, sentirsi a casa, bar self-service annotando le
// consumazioni, sauna al piano giardino, password Wi-Fi, numero per le emergenze, augurio di buon soggiorno.
// Segnaposto: {nome}, {camera} (in grassetto), {dalle} {alle} (orari scritti secondo la lingua), {telefono}
// (in grassetto). Le modifiche fatte in Impostazioni si applicano sopra questi testi con applyLetterTemplates.

import type { Floor, LangCode, LetterTemplate, LetterTexts, Paragraph, Segment } from "./types";

const NBSP = " ";

const b = (text: string): Segment => ({ text, bold: true });
const t = (text: string): Segment => ({ text });

// Formati orari: "8:00" → "8 am" (EN), "8 h" / "10 h 30" (FR), "8.00" (NL, DA, SV).
const en12 = (hm: string): string => {
  const [h, m] = hm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${suffix}`;
};
const frTime = (hm: string): string => {
  const [h, m] = hm.split(":");
  return m === "00" ? `${Number(h)}${NBSP}h` : `${Number(h)}${NBSP}h${NBSP}${m}`;
};
const dotTime = (hm: string): string => hm.replace(":", ".");
const TIME_FORMAT: Partial<Record<LangCode, (hm: string) => string>> = { en: en12, fr: frTime, nl: dotTime, da: dotTime, sv: dotTime };

/** Ordine nel menu: prima le lingue più frequenti in Val Gardena. */
export const LANG_ORDER: readonly LangCode[] = ["de", "it", "en", "fr", "nl", "pl", "cs", "es", "da", "sv", "zh", "ko", "ar"];

/** Nome della lingua in italiano, per il menu della receptionist. */
export const LANG_NAMES: Readonly<Record<LangCode, string>> = {
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
  ar: "Arabo",
};

/** Lingue scritte da destra a sinistra. */
export const RTL_LANGS: ReadonlySet<LangCode> = new Set<LangCode>(["ar"]);

export const LETTER_DEFAULTS: Readonly<Record<LangCode, LetterTemplate>> = {
  en: {
    roomLabel: "Room",
    headline: "Welcome to Chalet Hotel Hartmann",
    salutation: "Dear {nome},",
    salutationNoName: "Dear Guests,",
    intro: "We are delighted to have you with us.",
    roomFirst: "Your room is number {camera} and you will find it on the first floor (one floor up).",
    roomSecond: "Your room is number {camera} and you will find it on the second floor (two floors up).",
    roomGarden: "Your room is number {camera} and you will find it on the garden floor – simply take the stairs down.",
    roomOther: "Your room is number {camera}.",
    home: "We would like you to feel at home here.",
    bar: "Please help yourself at the bar – simply jot down what you take.",
    breakfast: "Breakfast is served from {dalle} to {alle}.",
    sauna: "The sauna is on the garden floor and can be used until 9 pm.",
    wifiLabel: "Wi-Fi password",
    emergency: "In case of emergency, please call {telefono}.",
    closing: "We wish you a wonderful stay!",
    qr: "Scan the QR code to find all the information about Chalet Hotel Hartmann.",
    noteLabel: "A note for you",
  },

  it: {
    roomLabel: "Camera",
    headline: "Benvenuti allo Chalet Hotel Hartmann",
    salutation: "Gentile {nome},",
    salutationNoName: "Gentili ospiti,",
    intro: "Siamo felici di accogliervi.",
    roomFirst: "La vostra camera è la numero {camera} e si trova al primo piano.",
    roomSecond: "La vostra camera è la numero {camera} e si trova al secondo piano.",
    roomGarden: "La vostra camera è la numero {camera} e si trova al piano giardino: basta scendere le scale.",
    roomOther: "La vostra camera è la numero {camera}.",
    home: "Sentitevi come a casa.",
    bar: "Servitevi pure liberamente al bar: vi chiediamo soltanto di annotare quanto consumato.",
    breakfast: "La prima colazione è servita dalle ore {dalle} alle ore {alle}.",
    sauna: "La sauna si trova al piano giardino ed è accessibile fino alle ore 21:00.",
    wifiLabel: "Password Wi-Fi",
    emergency: "In caso di emergenza potete chiamare il numero {telefono}.",
    closing: "Vi auguriamo un buon soggiorno!",
    qr: "Inquadrate il codice QR: troverete tutte le informazioni sullo Chalet Hotel Hartmann.",
    noteLabel: "Una nota per voi",
  },

  de: {
    roomLabel: "Zimmer",
    headline: "Willkommen im Chalet Hotel Hartmann",
    salutation: "Guten Tag {nome},",
    salutationNoName: "Liebe Gäste,",
    // Nach der Anrede mit Komma geht es im Deutschen klein weiter.
    intro: "wir freuen uns sehr, Sie bei uns begrüßen zu dürfen.",
    roomFirst: "Ihr Zimmer hat die Nummer {camera} und befindet sich im ersten Stock.",
    roomSecond: "Ihr Zimmer hat die Nummer {camera} und befindet sich im zweiten Stock.",
    roomGarden: "Ihr Zimmer hat die Nummer {camera} und befindet sich im Gartengeschoss – einfach die Treppe hinunter.",
    roomOther: "Ihr Zimmer hat die Nummer {camera}.",
    home: "Fühlen Sie sich bei uns wie zu Hause.",
    bar: "Bedienen Sie sich gerne an der Bar – notieren Sie einfach, was Sie genommen haben.",
    breakfast: "Das Frühstück servieren wir von {dalle} bis {alle} Uhr.",
    sauna: "Die Sauna befindet sich im Gartengeschoss und steht Ihnen bis 21:00 Uhr zur Verfügung.",
    wifiLabel: "WLAN-Passwort",
    emergency: "Im Notfall erreichen Sie uns unter {telefono}.",
    closing: "Wir wünschen Ihnen einen wunderschönen Aufenthalt!",
    qr: "Scannen Sie den QR-Code: Dort finden Sie alle Informationen zum Chalet Hotel Hartmann.",
    noteLabel: "Eine Notiz für Sie",
  },

  fr: {
    roomLabel: "Chambre",
    headline: "Bienvenue au Chalet Hotel Hartmann",
    salutation: "Bonjour {nome},",
    salutationNoName: "Chers hôtes,",
    intro: "Nous sommes ravis de vous accueillir.",
    roomFirst: "Votre chambre porte le numéro {camera} et se trouve au premier étage.",
    roomSecond: "Votre chambre porte le numéro {camera} et se trouve au deuxième étage.",
    roomGarden: `Votre chambre porte le numéro {camera} et se trouve au niveau jardin${NBSP}: il suffit de descendre l’escalier.`,
    roomOther: "Votre chambre porte le numéro {camera}.",
    home: `Faites comme chez vous${NBSP}!`,
    bar: `N’hésitez pas à vous servir au bar${NBSP}: notez simplement ce que vous avez consommé.`,
    breakfast: "Le petit-déjeuner est servi de {dalle} à {alle}.",
    sauna: `Le sauna se trouve au niveau jardin et est accessible jusqu’à 21${NBSP}h.`,
    wifiLabel: "Mot de passe Wi-Fi",
    emergency: "En cas d’urgence, vous pouvez nous appeler au {telefono}.",
    closing: `Nous vous souhaitons un excellent séjour${NBSP}!`,
    qr: "Scannez le code QR pour retrouver toutes les informations sur le Chalet Hotel Hartmann.",
    noteLabel: "Un petit mot pour vous",
  },

  es: {
    roomLabel: "Habitación",
    headline: "Bienvenidos al Chalet Hotel Hartmann",
    // Saluto senza nome: evita la scelta Estimado/Estimada.
    salutation: "",
    salutationNoName: "Estimados huéspedes:",
    intro: "Es un placer darles la bienvenida.",
    roomFirst: "Su habitación es la número {camera} y se encuentra en la primera planta.",
    roomSecond: "Su habitación es la número {camera} y se encuentra en la segunda planta.",
    roomGarden: "Su habitación es la número {camera} y se encuentra en la planta jardín: solo tienen que bajar las escaleras.",
    roomOther: "Su habitación es la número {camera}.",
    home: "Siéntanse como en casa.",
    bar: "Pueden servirse libremente en el bar: solo les pedimos que anoten lo que consuman.",
    breakfast: "El desayuno se sirve de {dalle} a {alle}.",
    sauna: "La sauna se encuentra en la planta jardín y está disponible hasta las 21:00.",
    wifiLabel: "Contraseña del wifi",
    emergency: "En caso de emergencia, pueden llamarnos al {telefono}.",
    closing: "¡Les deseamos una estancia maravillosa!",
    qr: "Escaneen el código QR para encontrar toda la información sobre el Chalet Hotel Hartmann.",
    noteLabel: "Una nota para ustedes",
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
    bar: "Bedient u zich gerust aan de bar – noteer gewoon wat u neemt.",
    breakfast: "Het ontbijt wordt geserveerd van {dalle} tot {alle} uur.",
    sauna: "De sauna bevindt zich op de tuinverdieping en is tot 21.00 uur beschikbaar.",
    wifiLabel: "Wifi-wachtwoord",
    emergency: "In geval van nood kunt u ons bellen op {telefono}.",
    closing: "Wij wensen u een heerlijk verblijf!",
    qr: "Scan de QR-code voor alle informatie over Chalet Hotel Hartmann.",
    noteLabel: "Een bericht voor u",
  },

  pl: {
    roomLabel: "Pokój",
    headline: "Witamy w Chalet Hotel Hartmann",
    // Saluto senza nome: evita la declinazione del nome.
    salutation: "",
    salutationNoName: "Drodzy Goście!",
    intro: "Bardzo się cieszymy, że możemy Państwa u nas gościć.",
    roomFirst: "Państwa pokój ma numer {camera} i znajduje się na pierwszym piętrze.",
    roomSecond: "Państwa pokój ma numer {camera} i znajduje się na drugim piętrze.",
    roomGarden: "Państwa pokój ma numer {camera} i znajduje się na poziomie ogrodu – wystarczy zejść schodami w dół.",
    roomOther: "Państwa pokój ma numer {camera}.",
    home: "Prosimy czuć się jak u siebie w domu.",
    bar: "Zapraszamy do swobodnego korzystania z baru – wystarczy zapisać, co Państwo wzięli.",
    breakfast: "Śniadanie serwujemy w godzinach {dalle}–{alle}.",
    sauna: "Sauna znajduje się na poziomie ogrodu i jest dostępna do godziny 21:00.",
    wifiLabel: "Hasło do Wi-Fi",
    emergency: "W nagłych przypadkach prosimy dzwonić pod numer {telefono}.",
    closing: "Życzymy udanego pobytu!",
    qr: "Prosimy zeskanować kod QR – znajdą tam Państwo wszystkie informacje o Chalet Hotel Hartmann.",
    noteLabel: "Wiadomość dla Państwa",
  },

  cs: {
    roomLabel: "Pokoj",
    headline: "Vítejte v Chalet Hotelu Hartmann",
    // Saluto senza nome: evita il vocativo.
    salutation: "",
    salutationNoName: "Vážení hosté,",
    intro: "srdečně Vás u nás vítáme.",
    roomFirst: "Váš pokoj má číslo {camera} a najdete ho v prvním patře.",
    roomSecond: "Váš pokoj má číslo {camera} a najdete ho ve druhém patře.",
    roomGarden: "Váš pokoj má číslo {camera} a najdete ho v zahradním podlaží – stačí sejít po schodech dolů.",
    roomOther: "Váš pokoj má číslo {camera}.",
    home: "Cíťte se u nás jako doma.",
    bar: "Z baru si můžete volně posloužit – stačí si jen poznamenat, co jste si vzali.",
    breakfast: "Snídani podáváme od {dalle} do {alle}.",
    sauna: "Sauna se nachází v zahradním podlaží a je k dispozici do 21:00.",
    wifiLabel: "Heslo k Wi-Fi",
    emergency: "V naléhavých případech nám volejte na číslo {telefono}.",
    closing: "Přejeme Vám příjemný pobyt!",
    qr: "Naskenujte QR kód – najdete v něm všechny informace o Chalet Hotelu Hartmann.",
    noteLabel: "Vzkaz pro Vás",
  },

  da: {
    roomLabel: "Værelse",
    headline: "Velkommen til Chalet Hotel Hartmann",
    salutation: "Kære {nome},",
    salutationNoName: "Kære gæster,",
    intro: "Vi er glade for at byde jer velkommen.",
    roomFirst: "Jeres værelse har nummer {camera} og ligger på første sal.",
    roomSecond: "Jeres værelse har nummer {camera} og ligger på anden sal.",
    roomGarden: "Jeres værelse har nummer {camera} og ligger på haveetagen – tag blot trappen ned.",
    roomOther: "Jeres værelse har nummer {camera}.",
    home: "Føl jer som hjemme.",
    bar: "I er velkomne til at forsyne jer i baren – skriv blot ned, hvad I tager.",
    breakfast: "Morgenmaden serveres kl. {dalle}–{alle}.",
    sauna: "Saunaen ligger på haveetagen og kan benyttes indtil kl. 21.00.",
    wifiLabel: "Wi-Fi-adgangskode",
    emergency: "I nødstilfælde kan I ringe til os på {telefono}.",
    closing: "Vi ønsker jer et dejligt ophold!",
    qr: "Scan QR-koden, så finder I alle oplysninger om Chalet Hotel Hartmann.",
    noteLabel: "En besked til jer",
  },

  sv: {
    roomLabel: "Rum",
    headline: "Välkommen till Chalet Hotel Hartmann",
    salutation: "Hej {nome}!",
    salutationNoName: "Kära gäster!",
    intro: "Vi är glada att få välkomna er.",
    roomFirst: "Ert rum har nummer {camera} och ligger på första våningen.",
    roomSecond: "Ert rum har nummer {camera} och ligger på andra våningen.",
    roomGarden: "Ert rum har nummer {camera} och ligger på trädgårdsplanet – ta bara trappan ned.",
    roomOther: "Ert rum har nummer {camera}.",
    home: "Känn er som hemma.",
    bar: "Ta gärna för er i baren – skriv bara upp vad ni tar.",
    breakfast: "Frukost serveras kl. {dalle}–{alle}.",
    sauna: "Bastun ligger på trädgårdsplanet och kan användas fram till kl. 21.00.",
    wifiLabel: "Wi-Fi-lösenord",
    emergency: "Vid en nödsituation kan ni ringa oss på {telefono}.",
    closing: "Vi önskar er en riktigt trevlig vistelse!",
    qr: "Skanna QR-koden för all information om Chalet Hotel Hartmann.",
    noteLabel: "Ett meddelande till er",
  },

  // Cinese semplificato. I piani si descrivono «di quanti piani salire»: in Cina il piano terra è il «primo piano».
  zh: {
    roomLabel: "房间",
    headline: "欢迎入住 Chalet Hotel Hartmann",
    salutation: "尊敬的 {nome}：",
    salutationNoName: "尊敬的宾客：",
    intro: "我们非常高兴迎接您的到来。",
    roomFirst: "您的房间号为 {camera}，在楼上一层。",
    roomSecond: "您的房间号为 {camera}，在楼上两层。",
    roomGarden: "您的房间号为 {camera}，位于花园层，沿楼梯下楼即可到达。",
    roomOther: "您的房间号为 {camera}。",
    home: "请把这里当作自己的家。",
    bar: "吧台饮品可自行取用，只需记下您取用的物品即可。",
    breakfast: "早餐供应时间为 {dalle} 至 {alle}。",
    sauna: "桑拿位于花园层，开放至晚上 9 点。",
    wifiLabel: "Wi-Fi 密码",
    emergency: "如遇紧急情况，请拨打 {telefono}。",
    closing: "祝您入住愉快！",
    qr: "扫描二维码，即可查看 Chalet Hotel Hartmann 的全部信息。",
    noteLabel: "给您的留言",
  },

  // Coreano, registro di cortesia. Piani descritti in modo relativo: in Corea il piano terra è il «1층».
  ko: {
    roomLabel: "객실",
    headline: "Chalet Hotel Hartmann에 오신 것을 환영합니다",
    salutation: "{nome} 님께",
    salutationNoName: "소중한 고객님께",
    intro: "저희와 함께해 주셔서 진심으로 기쁩니다.",
    roomFirst: "고객님의 객실은 {camera}호이며, 한 층 위에 있습니다.",
    roomSecond: "고객님의 객실은 {camera}호이며, 두 층 위에 있습니다.",
    roomGarden: "고객님의 객실은 {camera}호이며, 정원 층에 있습니다. 계단으로 내려가시면 됩니다.",
    roomOther: "고객님의 객실은 {camera}호입니다.",
    home: "집처럼 편안하게 지내시기 바랍니다.",
    bar: "바에서는 자유롭게 음료를 드셔도 됩니다. 드신 것만 적어 주세요.",
    breakfast: "조식은 오전 {dalle}부터 {alle}까지 제공됩니다.",
    sauna: "사우나는 정원 층에 있으며 오후 9시까지 이용하실 수 있습니다.",
    wifiLabel: "Wi-Fi 비밀번호",
    emergency: "긴급 상황 시에는 {telefono}번으로 연락해 주세요.",
    closing: "편안하고 즐거운 시간 보내시기 바랍니다!",
    qr: "QR 코드를 스캔하시면 Chalet Hotel Hartmann에 관한 모든 정보를 확인하실 수 있습니다.",
    noteLabel: "고객님께 드리는 메모",
  },

  // Arabo standard, plurale di cortesia. Saluto senza nome (il nome è già in alto). Le frasi non finiscono con
  // numeri o nomi latini quando si può evitare, così la lettura da destra a sinistra resta pulita anche nel PDF.
  ar: {
    roomLabel: "الغرفة",
    headline: "أهلاً وسهلاً بكم في Chalet Hotel Hartmann",
    salutation: "",
    salutationNoName: "ضيوفنا الكرام،",
    intro: "يسعدنا أن نرحب بكم بيننا.",
    roomFirst: "رقم غرفتكم {camera} وتقع في الطابق الأول، أي طابق واحد إلى الأعلى.",
    roomSecond: "رقم غرفتكم {camera} وتقع في الطابق الثاني، أي طابقين إلى الأعلى.",
    roomGarden: "رقم غرفتكم {camera} وتقع في طابق الحديقة، ويكفي أن تنزلوا الدرج للوصول إليها.",
    roomOther: "رقم غرفتكم {camera}.",
    home: "نرجو أن تشعروا وكأنكم في بيتكم.",
    bar: "تفضلوا بخدمة أنفسكم في البار، ويكفي أن تدوّنوا ما تتناولونه.",
    breakfast: "يقدم الفطور من الساعة {dalle} حتى الساعة {alle} صباحًا.",
    sauna: "تقع الساونا في طابق الحديقة، ويمكن استخدامها حتى الساعة التاسعة مساءً.",
    wifiLabel: "كلمة مرور الواي فاي",
    emergency: "في حالات الطوارئ يرجى الاتصال بالرقم {telefono}.",
    closing: "نتمنى لكم إقامة رائعة!",
    qr: "امسحوا رمز QR ضوئيًا لتجدوا جميع المعلومات عن Chalet Hotel Hartmann.",
    noteLabel: "ملاحظة لكم",
  },
};

/** Segnaposto in grassetto nella lettera. */
const BOLD_VARS = new Set(["camera", "telefono"]);

/** Testo con segnaposto → segmenti (i segnaposto sconosciuti restano come scritti). */
export function fillSegments(template: string, vars: Readonly<Record<string, string>>): Paragraph {
  const out: Segment[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    const key = m[1];
    if (!(key in vars)) continue;
    if (m.index > last) out.push(t(template.slice(last, m.index)));
    out.push(BOLD_VARS.has(key) ? b(vars[key]) : t(vars[key]));
    last = m.index + m[0].length;
  }
  if (last < template.length) out.push(t(template.slice(last)));
  // Pezzi uniti dove lo stile è uguale: la lettera resta identica a quella scritta a mano in codice.
  return out.reduce<Segment[]>((acc, s) => {
    const prev = acc[acc.length - 1];
    if (prev && (prev.bold === true) === (s.bold === true)) acc[acc.length - 1] = s.bold ? b(prev.text + s.text) : t(prev.text + s.text);
    else if (s.text) acc.push(s);
    return acc;
  }, []);
}

const fillText = (template: string, vars: Readonly<Record<string, string>>): string =>
  fillSegments(template, vars)
    .map((s) => s.text)
    .join("");

const ROOM_KEY: Readonly<Record<Floor, keyof LetterTemplate>> = { first: "roomFirst", second: "roomSecond", garden: "roomGarden" };

/** Modello → testi pronti per la lettera (con nome, camera, orari e telefono al loro posto). */
export function compileLetter(lang: LangCode, tpl: LetterTemplate): LetterTexts {
  const time = TIME_FORMAT[lang] ?? ((hm: string) => hm);
  return {
    nameIt: LANG_NAMES[lang],
    roomLabel: tpl.roomLabel,
    headline: tpl.headline,
    salutation: (n) => (n && tpl.salutation.includes("{nome}") ? fillText(tpl.salutation, { nome: n }) : tpl.salutationNoName),
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
    noteLabel: tpl.noteLabel,
  };
}

const compileAll = (overrides: Partial<Record<LangCode, Partial<LetterTemplate>>> = {}): Record<LangCode, LetterTexts> =>
  Object.fromEntries(
    (Object.keys(LETTER_DEFAULTS) as LangCode[]).map((l) => [l, compileLetter(l, { ...LETTER_DEFAULTS[l], ...overrides[l] })]),
  ) as Record<LangCode, LetterTexts>;

/** Testi in uso: quelli predefiniti, più le modifiche fatte in Impostazioni su questo computer. */
export const TEXTS: Record<LangCode, LetterTexts> = compileAll();

/** Applica le modifiche di Impostazioni (sostituisce quelle precedenti). */
export function applyLetterTemplates(overrides: Partial<Record<LangCode, Partial<LetterTemplate>>>): void {
  Object.assign(TEXTS, compileAll(overrides));
}

/** Paragrafo semplice da una stringa. */
export const plain = (text: string): Paragraph => [t(text)];
