// Messaggio WhatsApp di benvenuto inviato dalla riga della camera: un testo unico che fonde la lettera di benvenuto
// (saluto con il nome, numero e piano della camera, PIN, «sentitevi a casa» e bar, informazioni Hartmann al posto
// del QR) con il testo WhatsApp fornito dalla reception il 24/10/2026, le cui righe in inglese restano alla lettera
// (orari, servizi, ristoranti, Guest Pass, autobus, taxi).
// Le frasi personali vengono dai testi della lettera (src/texts.ts), il resto è qui, in tutte le 13 lingue.
// Per cambiare orari, link o numeri: si modificano qui.

import { HOTEL, floorOf } from "./hotel";
import { TEXTS } from "./texts";
import type { LangCode, Paragraph } from "./types";

const WIFI = HOTEL.wifiPassword;
const INFO = "https://alpstay.github.io/InfoHartmann/";
const RESTAURANTS = "https://receptionacadia.github.io/Restaurants/";
const BUS = (l: "it" | "de" | "en"): string => `https://www.suedtirolmobil.info/${l}/#/`;
const EMERGENCY = "+39 333 68 28717";
const TAXI = "Taxi Fleur +39 335 6345264";
const SIGN = "Chiara - Alpstay Hotels";
/** Nei testi da destra a sinistra il segno LRM tiene il «+» del prefisso davanti al numero. */
const LRM = "‎";

interface WaTexts {
  /** Dopo «Sentitevi come a casa.»: introduce l'elenco. */
  readonly useful: string;
  readonly breakfast: string;
  readonly bar: string;
  readonly wellness: string;
  readonly checkout: string;
  readonly reception: string;
  readonly wifi: string;
  readonly emergency: string;
  readonly info: string;
  readonly restaurants: string;
  readonly guestPass: string;
  readonly busTitle: string;
  /** Fermata dell'hotel, centro di Ortisei, centro di Santa Cristina. */
  readonly stops: readonly [string, string, string];
  readonly timetable: string;
  readonly bus: "it" | "de" | "en";
  readonly taxi: string;
  readonly help: string;
  readonly wish: string;
  readonly regards: string;
}

const WA: Readonly<Record<LangCode, WaTexts>> = {
  en: {
    useful: "Here is some useful information for your stay:",
    breakfast: "☕ Breakfast : 8 - 10.30 AM",
    bar: "🍸 Self-Service Bar: open 24/7 with room and price list",
    wellness: "🌿 Wellness Area: open daily from 4 - 8PM, level -1",
    checkout: "🔑 Check-out: by 11.00 AM",
    reception: "🛎️ Reception: from 8AM - 12.00 and from 2 - 6PM",
    wifi: "📶 WIFI password",
    emergency: "📞 Emergency Number",
    info: "ℹ️ All the information about Chalet Hotel Hartmann:",
    restaurants: "🍝🍷You can check out this link for all of our top restaurant recommendations in the area:",
    guestPass:
      "Your free public transport tickets (Guest Pass) have been sent to your email address. They are valid for your entire stay in Val Gardena and South Tyrol.",
    busTitle: "🚌Main bus stops:",
    stops: ["Hotel stop", "Ortisei center", "St.Cristina center"],
    timetable: "👉 For schedules, bus numbers, and travel times, visit:",
    bus: "en",
    taxi: "If no bus is available in the evening, you can contact:",
    help: "Please don't hesitate to reach out if you need any further information or assistance.",
    wish: "We wish you a pleasant stay.🤩",
    regards: "Best regards",
  },
  it: {
    useful: "Ecco alcune informazioni utili per il vostro soggiorno:",
    breakfast: "☕ Colazione: 8:00 - 10:30",
    bar: "🍸 Bar self-service: aperto 24 ore su 24, con lista per camera e listino prezzi",
    wellness: "🌿 Area wellness: aperta tutti i giorni dalle 16:00 alle 20:00, piano -1",
    checkout: "🔑 Check-out: entro le 11:00",
    reception: "🛎️ Reception: dalle 8:00 alle 12:00 e dalle 14:00 alle 18:00",
    wifi: "📶 Password WiFi",
    emergency: "📞 Numero di emergenza",
    info: "ℹ️ Tutte le informazioni sullo Chalet Hotel Hartmann:",
    restaurants: "🍝🍷 A questo link trovate tutti i ristoranti che vi consigliamo in zona:",
    guestPass:
      "I vostri biglietti gratuiti per i mezzi pubblici (Guest Pass) sono stati inviati al vostro indirizzo email. Sono validi per tutto il soggiorno in Val Gardena e in Alto Adige.",
    busTitle: "🚌 Fermate principali:",
    stops: ["Fermata dell'hotel", "Centro di Ortisei", "Centro di S. Cristina"],
    timetable: "👉 Orari, linee e tempi di percorrenza:",
    bus: "it",
    taxi: "Se la sera non ci sono autobus, potete contattare:",
    help: "Non esitate a contattarci per qualsiasi informazione o necessità.",
    wish: "Vi auguriamo un piacevole soggiorno. 🤩",
    regards: "Cordiali saluti",
  },
  de: {
    useful: "Hier einige nützliche Informationen für Ihren Aufenthalt:",
    breakfast: "☕ Frühstück: 8:00 - 10:30 Uhr",
    bar: "🍸 Self-Service-Bar: rund um die Uhr geöffnet, mit Zimmerliste und Preisliste",
    wellness: "🌿 Wellnessbereich: täglich von 16:00 bis 20:00 Uhr geöffnet, Ebene -1",
    checkout: "🔑 Check-out: bis 11:00 Uhr",
    reception: "🛎️ Rezeption: von 8:00 bis 12:00 Uhr und von 14:00 bis 18:00 Uhr",
    wifi: "📶 WLAN-Passwort",
    emergency: "📞 Notfallnummer",
    info: "ℹ️ Alle Informationen zum Chalet Hotel Hartmann:",
    restaurants: "🍝🍷 Unter diesem Link finden Sie alle unsere Restaurant-Empfehlungen in der Umgebung:",
    guestPass:
      "Ihre kostenlosen Tickets für die öffentlichen Verkehrsmittel (Guest Pass) haben wir Ihnen per E-Mail geschickt. Sie gelten während Ihres gesamten Aufenthalts in Gröden und in ganz Südtirol.",
    busTitle: "🚌 Wichtigste Bushaltestellen:",
    stops: ["Haltestelle beim Hotel", "Zentrum St. Ulrich", "Zentrum St. Christina"],
    timetable: "👉 Fahrpläne, Buslinien und Fahrzeiten:",
    bus: "de",
    taxi: "Falls abends kein Bus mehr fährt, erreichen Sie:",
    help: "Wenn Sie weitere Informationen oder Hilfe brauchen, melden Sie sich jederzeit gerne bei uns.",
    wish: "Wir wünschen Ihnen einen angenehmen Aufenthalt. 🤩",
    regards: "Herzliche Grüße",
  },
  fr: {
    useful: "Voici quelques informations utiles pour votre séjour :",
    breakfast: "☕ Petit-déjeuner : 8 h - 10 h 30",
    bar: "🍸 Bar en libre-service : ouvert 24 h/24, avec liste par chambre et liste des prix",
    wellness: "🌿 Espace bien-être : ouvert tous les jours de 16 h à 20 h, niveau -1",
    checkout: "🔑 Check-out : avant 11 h",
    reception: "🛎️ Réception : de 8 h à 12 h et de 14 h à 18 h",
    wifi: "📶 Mot de passe Wi-Fi",
    emergency: "📞 Numéro d'urgence",
    info: "ℹ️ Toutes les informations sur le Chalet Hotel Hartmann :",
    restaurants: "🍝🍷 Toutes nos adresses de restaurants recommandés dans la région se trouvent ici :",
    guestPass:
      "Vos titres de transport public gratuits (Guest Pass) ont été envoyés à votre adresse e-mail. Ils sont valables pendant tout votre séjour dans le Val Gardena et dans tout le Tyrol du Sud.",
    busTitle: "🚌 Principaux arrêts de bus :",
    stops: ["Arrêt de l'hôtel", "Centre d'Ortisei", "Centre de Santa Cristina"],
    timetable: "👉 Horaires, lignes et temps de trajet :",
    bus: "en",
    taxi: "S'il n'y a plus de bus le soir, vous pouvez contacter :",
    help: "N'hésitez pas à nous contacter si vous avez besoin d'informations ou d'aide.",
    wish: "Nous vous souhaitons un agréable séjour. 🤩",
    regards: "Bien cordialement,",
  },
  es: {
    useful: "Aquí tienen información útil para su estancia:",
    breakfast: "☕ Desayuno: 8:00 - 10:30",
    bar: "🍸 Bar de autoservicio: abierto 24 horas, con lista por habitación y lista de precios",
    wellness: "🌿 Zona wellness: abierta todos los días de 16:00 a 20:00, planta -1",
    checkout: "🔑 Check-out: hasta las 11:00",
    reception: "🛎️ Recepción: de 8:00 a 12:00 y de 14:00 a 18:00",
    wifi: "📶 Contraseña del wifi",
    emergency: "📞 Número de emergencia",
    info: "ℹ️ Toda la información sobre el Chalet Hotel Hartmann:",
    restaurants: "🍝🍷 En este enlace encontrarán todos los restaurantes que les recomendamos en la zona:",
    guestPass:
      "Sus billetes gratuitos de transporte público (Guest Pass) se han enviado a su dirección de correo electrónico. Son válidos durante toda su estancia en Val Gardena y en todo el Tirol del Sur.",
    busTitle: "🚌 Principales paradas de autobús:",
    stops: ["Parada del hotel", "Centro de Ortisei", "Centro de Santa Cristina"],
    timetable: "👉 Horarios, líneas y tiempos de viaje:",
    bus: "en",
    taxi: "Si por la noche no hay autobús, pueden llamar a:",
    help: "No duden en escribirnos si necesitan más información o ayuda.",
    wish: "Les deseamos una agradable estancia. 🤩",
    regards: "Un cordial saludo",
  },
  nl: {
    useful: "Hier wat handige informatie voor uw verblijf:",
    breakfast: "☕ Ontbijt: 8.00 - 10.30 uur",
    bar: "🍸 Selfservicebar: 24/7 open, met kamerlijst en prijslijst",
    wellness: "🌿 Wellnessruimte: dagelijks open van 16.00 tot 20.00 uur, verdieping -1",
    checkout: "🔑 Uitchecken: vóór 11.00 uur",
    reception: "🛎️ Receptie: van 8.00 tot 12.00 uur en van 14.00 tot 18.00 uur",
    wifi: "📶 Wifi-wachtwoord",
    emergency: "📞 Noodnummer",
    info: "ℹ️ Alle informatie over Chalet Hotel Hartmann:",
    restaurants: "🍝🍷 Via deze link vindt u al onze restaurantaanraders in de omgeving:",
    guestPass:
      "Uw gratis tickets voor het openbaar vervoer (Guest Pass) zijn naar uw e-mailadres gestuurd. Ze zijn geldig tijdens uw hele verblijf in Val Gardena en in heel Zuid-Tirol.",
    busTitle: "🚌 Belangrijkste bushaltes:",
    stops: ["Halte bij het hotel", "Centrum Ortisei", "Centrum Santa Cristina"],
    timetable: "👉 Dienstregelingen, buslijnen en reistijden:",
    bus: "en",
    taxi: "Rijdt er 's avonds geen bus meer, dan kunt u contact opnemen met:",
    help: "Neem gerust contact met ons op als u meer informatie of hulp nodig hebt.",
    wish: "Wij wensen u een fijn verblijf. 🤩",
    regards: "Met vriendelijke groet",
  },
  pl: {
    useful: "Oto kilka przydatnych informacji na czas Państwa pobytu:",
    breakfast: "☕ Śniadanie: 8:00 - 10:30",
    bar: "🍸 Bar samoobsługowy: czynny całą dobę, z listą dla pokoi i cennikiem",
    wellness: "🌿 Strefa wellness: czynna codziennie od 16:00 do 20:00, poziom -1",
    checkout: "🔑 Wymeldowanie: do 11:00",
    reception: "🛎️ Recepcja: od 8:00 do 12:00 i od 14:00 do 18:00",
    wifi: "📶 Hasło do Wi-Fi",
    emergency: "📞 Numer alarmowy",
    info: "ℹ️ Wszystkie informacje o Chalet Hotel Hartmann:",
    restaurants: "🍝🍷 Pod tym linkiem znajdą Państwo wszystkie polecane przez nas restauracje w okolicy:",
    guestPass:
      "Bezpłatne bilety na komunikację publiczną (Guest Pass) wysłaliśmy na Państwa adres e-mail. Są ważne przez cały pobyt w Val Gardena i w całym Południowym Tyrolu.",
    busTitle: "🚌 Najważniejsze przystanki autobusowe:",
    stops: ["Przystanek przy hotelu", "Centrum Ortisei", "Centrum Santa Cristina"],
    timetable: "👉 Rozkłady jazdy, numery linii i czasy przejazdu:",
    bus: "en",
    taxi: "Jeśli wieczorem nie kursuje już żaden autobus, można zadzwonić do:",
    help: "W razie potrzeby dodatkowych informacji lub pomocy prosimy o kontakt.",
    wish: "Życzymy przyjemnego pobytu. 🤩",
    regards: "Z serdecznymi pozdrowieniami",
  },
  cs: {
    useful: "Zde je několik užitečných informací pro Váš pobyt:",
    breakfast: "☕ Snídaně: 8:00 - 10:30",
    bar: "🍸 Samoobslužný bar: otevřený nonstop, se seznamem pro pokoje a ceníkem",
    wellness: "🌿 Wellness: otevřeno denně od 16:00 do 20:00, podlaží -1",
    checkout: "🔑 Check-out: do 11:00",
    reception: "🛎️ Recepce: od 8:00 do 12:00 a od 14:00 do 18:00",
    wifi: "📶 Heslo k Wi-Fi",
    emergency: "📞 Nouzové číslo",
    info: "ℹ️ Všechny informace o Chalet Hotelu Hartmann:",
    restaurants: "🍝🍷 Na tomto odkazu najdete všechny restaurace, které Vám v okolí doporučujeme:",
    guestPass:
      "Vaše bezplatné jízdenky na veřejnou dopravu (Guest Pass) jsme Vám poslali e-mailem. Platí po celou dobu Vašeho pobytu ve Val Gardena a v celém Jižním Tyrolsku.",
    busTitle: "🚌 Hlavní autobusové zastávky:",
    stops: ["Zastávka u hotelu", "Centrum Ortisei", "Centrum Santa Cristina"],
    timetable: "👉 Jízdní řády, čísla linek a doby jízdy:",
    bus: "en",
    taxi: "Pokud večer už nejede žádný autobus, můžete kontaktovat:",
    help: "Pokud budete potřebovat další informace nebo pomoc, neváhejte se na nás obrátit.",
    wish: "Přejeme Vám příjemný pobyt. 🤩",
    regards: "S pozdravem",
  },
  da: {
    useful: "Her er nogle nyttige oplysninger til jeres ophold:",
    breakfast: "☕ Morgenmad: kl. 8.00 - 10.30",
    bar: "🍸 Selvbetjeningsbar: åben døgnet rundt, med værelsesliste og prisliste",
    wellness: "🌿 Wellnessområde: åbent dagligt kl. 16.00 - 20.00, etage -1",
    checkout: "🔑 Check-ud: senest kl. 11.00",
    reception: "🛎️ Reception: kl. 8.00 - 12.00 og kl. 14.00 - 18.00",
    wifi: "📶 Wi-Fi-adgangskode",
    emergency: "📞 Nødnummer",
    info: "ℹ️ Alle oplysninger om Chalet Hotel Hartmann:",
    restaurants: "🍝🍷 Via dette link finder I alle vores anbefalede restauranter i området:",
    guestPass:
      "Jeres gratis billetter til offentlig transport (Guest Pass) er sendt til jeres e-mailadresse. De gælder under hele jeres ophold i Val Gardena og i hele Sydtyrol.",
    busTitle: "🚌 Vigtigste busstoppesteder:",
    stops: ["Stoppested ved hotellet", "Ortisei centrum", "Santa Cristina centrum"],
    timetable: "👉 Køreplaner, buslinjer og rejsetider:",
    bus: "en",
    taxi: "Hvis der ikke kører nogen bus om aftenen, kan I kontakte:",
    help: "Tøv ikke med at kontakte os, hvis I har brug for flere oplysninger eller hjælp.",
    wish: "Vi ønsker jer et dejligt ophold. 🤩",
    regards: "Med venlig hilsen",
  },
  sv: {
    useful: "Här är lite användbar information inför er vistelse:",
    breakfast: "☕ Frukost: kl. 8.00 - 10.30",
    bar: "🍸 Självservicebar: öppen dygnet runt, med rumslista och prislista",
    wellness: "🌿 Wellnessavdelning: öppen dagligen kl. 16.00 - 20.00, plan -1",
    checkout: "🔑 Utcheckning: senast kl. 11.00",
    reception: "🛎️ Reception: kl. 8.00 - 12.00 och kl. 14.00 - 18.00",
    wifi: "📶 Wi-Fi-lösenord",
    emergency: "📞 Nödnummer",
    info: "ℹ️ All information om Chalet Hotel Hartmann:",
    restaurants: "🍝🍷 Via den här länken hittar ni alla våra restaurangtips i området:",
    guestPass:
      "Era kostnadsfria biljetter för kollektivtrafiken (Guest Pass) har skickats till er e-postadress. De gäller under hela er vistelse i Val Gardena och i hela Sydtyrolen.",
    busTitle: "🚌 Viktigaste busshållplatserna:",
    stops: ["Hållplats vid hotellet", "Ortiseis centrum", "Santa Cristinas centrum"],
    timetable: "👉 Tidtabeller, busslinjer och restider:",
    bus: "en",
    taxi: "Om det inte går någon buss på kvällen kan ni kontakta:",
    help: "Tveka inte att höra av er om ni behöver mer information eller hjälp.",
    wish: "Vi önskar er en trevlig vistelse. 🤩",
    regards: "Vänliga hälsningar",
  },
  zh: {
    useful: "以下是您入住期间的一些实用信息：",
    breakfast: "☕ 早餐：8:00 - 10:30",
    bar: "🍸 自助酒吧：24 小时开放，备有房间登记表和价目表",
    wellness: "🌿 康体区：每天 16:00 - 20:00 开放，位于 -1 层",
    checkout: "🔑 退房：11:00 前",
    reception: "🛎️ 前台：8:00 - 12:00 及 14:00 - 18:00",
    wifi: "📶 WiFi 密码",
    emergency: "📞 紧急电话",
    info: "ℹ️ Chalet Hotel Hartmann 的全部信息：",
    restaurants: "🍝🍷 点击以下链接，查看我们推荐的当地餐厅：",
    guestPass: "您的免费公共交通票（Guest Pass）已发送至您的电子邮箱，在 Val Gardena 及整个南蒂罗尔逗留期间均可使用。",
    busTitle: "🚌 主要公交站：",
    stops: ["酒店车站", "Ortisei 市中心", "Santa Cristina 市中心"],
    timetable: "👉 时刻表、线路和行程时间请见：",
    bus: "en",
    taxi: "如晚间没有公交车，可联系：",
    help: "如需更多信息或帮助，请随时与我们联系。",
    wish: "祝您入住愉快！🤩",
    regards: "谨致问候",
  },
  ko: {
    useful: "숙박에 도움이 되는 정보를 안내해 드립니다:",
    breakfast: "☕ 조식: 8:00 - 10:30",
    bar: "🍸 셀프서비스 바: 24시간 운영, 객실별 기록표와 가격표 비치",
    wellness: "🌿 웰니스 구역: 매일 16:00 - 20:00 운영, 지하 1층",
    checkout: "🔑 체크아웃: 11:00까지",
    reception: "🛎️ 리셉션: 8:00 - 12:00, 14:00 - 18:00",
    wifi: "📶 와이파이 비밀번호",
    emergency: "📞 긴급 연락처",
    info: "ℹ️ Chalet Hotel Hartmann에 관한 모든 정보:",
    restaurants: "🍝🍷 아래 링크에서 저희가 추천하는 주변 레스토랑을 모두 확인하실 수 있습니다:",
    guestPass:
      "무료 대중교통 승차권(Guest Pass)은 고객님의 이메일 주소로 보내 드렸습니다. Val Gardena와 남티롤 전역에서 숙박 기간 내내 이용하실 수 있습니다.",
    busTitle: "🚌 주요 버스 정류장:",
    stops: ["호텔 정류장", "Ortisei 시내", "Santa Cristina 시내"],
    timetable: "👉 시간표, 버스 노선, 소요 시간:",
    bus: "en",
    taxi: "저녁에 버스가 없을 경우 아래로 연락하실 수 있습니다:",
    help: "추가 정보나 도움이 필요하시면 언제든지 연락해 주세요.",
    wish: "즐거운 숙박 되시기 바랍니다. 🤩",
    regards: "감사합니다.",
  },
  ar: {
    useful: "إليكم بعض المعلومات المفيدة لإقامتكم:",
    breakfast: "☕ الفطور: من 8:00 حتى 10:30 صباحًا",
    bar: "🍸 بار الخدمة الذاتية: مفتوح على مدار الساعة، مع قائمة للغرف وقائمة أسعار",
    wellness: "🌿 منطقة العافية: مفتوحة يوميًا من الساعة 4 حتى 8 مساءً، في الطابق -1",
    checkout: "🔑 تسجيل المغادرة: حتى الساعة 11:00 صباحًا",
    reception: "🛎️ الاستقبال: من 8:00 حتى 12:00 ومن 2 حتى 6 مساءً",
    wifi: "📶 كلمة مرور الواي فاي",
    emergency: "📞 رقم الطوارئ",
    info: "ℹ️ جميع المعلومات عن Chalet Hotel Hartmann:",
    restaurants: "🍝🍷 على هذا الرابط تجدون جميع المطاعم التي ننصح بها في المنطقة:",
    guestPass:
      "أرسلنا تذاكر النقل العام المجانية (Guest Pass) إلى بريدكم الإلكتروني، وهي صالحة طوال إقامتكم في Val Gardena وفي كل جنوب تيرول.",
    busTitle: "🚌 أهم محطات الحافلات:",
    stops: ["محطة الفندق", "وسط Ortisei", "وسط Santa Cristina"],
    timetable: "👉 المواعيد وأرقام الحافلات ومدة الرحلات:",
    bus: "en",
    taxi: "إذا لم تتوفر حافلة في المساء، يمكنكم الاتصال بـ:",
    help: "لا تترددوا في التواصل معنا إذا احتجتم إلى أي معلومات أو مساعدة.",
    wish: "نتمنى لكم إقامة ممتعة. 🤩",
    regards: "مع أطيب التحيات",
  },
};

/** In cinese le frasi si accostano senza spazio (come nella lettera). */
const gap = (lang: LangCode): string => (lang === "zh" ? "" : " ");

/**
 * *grassetto* di WhatsApp al posto delle parti in grassetto della lettera (numero di camera). WhatsApp lo riconosce
 * solo se gli asterischi non toccano lettere (in coreano «*107*호» resterebbe con gli asterischi): lì niente grassetto.
 */
const waText = (p: Paragraph): string =>
  p
    .map((s, i) => {
      const before = p[i - 1]?.text.slice(-1) ?? "";
      const after = p[i + 1]?.text.charAt(0) ?? "";
      return s.bold && !/\p{L}/u.test(before) && !/\p{L}/u.test(after) ? `*${s.text}*` : s.text;
    })
    .join("");

export interface WelcomeInput {
  readonly lang: LangCode;
  /** Nome sull'intestazione della lettera (può mancare). */
  readonly name: string | null;
  readonly room: string | null;
  /** PIN a 4 cifre, solo se compilato. */
  readonly pin: string | null;
}

/** Il messaggio completo per una camera, nella lingua scelta per la lettera. */
export function welcomeWhatsappText(i: WelcomeInput): string {
  const tx = TEXTS[i.lang];
  const wa = WA[i.lang];
  const sp = gap(i.lang);
  const rtl = i.lang === "ar";
  const num = (n: string): string => (rtl ? `${LRM}${n}` : n);
  const room = i.room?.trim() || null;
  const personal = room ? `${tx.intro}${sp}${waText(tx.room(room, floorOf(room)))}` : tx.intro;
  return [
    `*${tx.headline}* 😀`,
    "",
    tx.salutation(i.name?.trim() || null),
    personal,
    ...(i.pin ? [`🔐 PIN: *${i.pin}*`] : []),
    `${tx.home}${sp}${tx.bar}`,
    "",
    wa.useful,
    "",
    wa.breakfast,
    wa.bar,
    wa.wellness,
    "",
    wa.checkout,
    wa.reception,
    `${wa.wifi}: ${WIFI}`,
    "",
    `${wa.emergency}: ${num(EMERGENCY)}`,
    "",
    wa.info,
    INFO,
    "",
    wa.restaurants,
    RESTAURANTS,
    "",
    wa.guestPass,
    "",
    wa.busTitle,
    `• ${wa.stops[0]}: Skasa - Santa Cristina`,
    `• ${wa.stops[1]}: Antoniusplatz - St.Ulrich`,
    `• ${wa.stops[2]}: Dosses - St. Cristina`,
    "",
    `${wa.timetable} ${BUS(wa.bus)}`,
    "",
    wa.taxi,
    rtl ? TAXI.replace("+", `${LRM}+`) : TAXI,
    "",
    wa.help,
    wa.wish,
    "",
    wa.regards,
    SIGN,
  ].join("\n");
}

/**
 * Link WhatsApp verso il numero dell'ospite (solo cifre, con prefisso) con il testo già scritto.
 * Direttamente api.whatsapp.com e non wa.me: il rimando di wa.me, da computer, trasforma le emoji in «�».
 */
export const welcomeWhatsappUrl = (digits: string, text: string): string =>
  `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(text)}`;
