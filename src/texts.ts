// Testi della lettera di benvenuto in 10 lingue.
// Contenuti richiesti: numero di camera con il percorso, sentirsi a casa, bar self-service
// annotando le consumazioni, sauna al piano giardino fino alle 21:00, password Wi-Fi,
// numero per le emergenze, augurio di buon soggiorno.

import type { Floor, LangCode, LetterTexts, Paragraph, Segment } from "./types";

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

/** Ordine nel menu: prima le lingue più frequenti in Val Gardena. */
export const LANG_ORDER: readonly LangCode[] = ["de", "it", "en", "fr", "nl", "pl", "cs", "es", "da", "sv"];

export const TEXTS: Readonly<Record<LangCode, LetterTexts>> = {
  en: {
    nameIt: "Inglese",
    roomLabel: "Room",
    headline: "Welcome to Chalet Hotel Hartmann",
    salutation: (n) => (n ? `Dear ${n},` : "Dear Guests,"),
    intro: "We are delighted to have you with us.",
    room: (r, f) => {
      const where: Record<Floor, string> = {
        first: " and you will find it on the first floor (one floor up).",
        second: " and you will find it on the second floor (two floors up).",
        garden: " and you will find it on the garden floor – simply take the stairs down.",
      };
      return [t("Your room is number "), b(r), t(f ? where[f] : ".")];
    },
    home: "We would like you to feel at home here.",
    bar: "Please help yourself at the bar – simply jot down what you take.",
    breakfast: (f, to) => `Breakfast is served from ${en12(f)} to ${en12(to)}.`,
    sauna: "The sauna is on the garden floor and can be used until 9 pm.",
    wifiLabel: "Wi-Fi password",
    emergency: (p) => [t("In case of emergency, please call "), b(p), t(".")],
    closing: "We wish you a wonderful stay!",
    qr: "Scan the QR code to find all the information about Chalet Hotel Hartmann.",
    noteLabel: "A note for you",
  },

  it: {
    nameIt: "Italiano",
    roomLabel: "Camera",
    headline: "Benvenuti allo Chalet Hotel Hartmann",
    salutation: (n) => (n ? `Gentile ${n},` : "Gentili ospiti,"),
    intro: "Siamo felici di accogliervi.",
    room: (r, f) => {
      const where: Record<Floor, string> = {
        first: " e si trova al primo piano.",
        second: " e si trova al secondo piano.",
        garden: " e si trova al piano giardino: basta scendere le scale.",
      };
      return [t("La vostra camera è la numero "), b(r), t(f ? where[f] : ".")];
    },
    home: "Sentitevi come a casa.",
    bar: "Servitevi pure liberamente al bar: vi chiediamo soltanto di annotare quanto consumato.",
    breakfast: (f, to) => `La prima colazione è servita dalle ore ${f} alle ore ${to}.`,
    sauna: "La sauna si trova al piano giardino ed è accessibile fino alle ore 21:00.",
    wifiLabel: "Password Wi-Fi",
    emergency: (p) => [t("In caso di emergenza potete chiamare il numero "), b(p), t(".")],
    closing: "Vi auguriamo un buon soggiorno!",
    qr: "Inquadrate il codice QR: troverete tutte le informazioni sullo Chalet Hotel Hartmann.",
    noteLabel: "Una nota per voi",
  },

  de: {
    nameIt: "Tedesco",
    roomLabel: "Zimmer",
    headline: "Willkommen im Chalet Hotel Hartmann",
    salutation: (n) => (n ? `Guten Tag ${n},` : "Liebe Gäste,"),
    // Nach der Anrede mit Komma geht es im Deutschen klein weiter.
    intro: "wir freuen uns sehr, Sie bei uns begrüßen zu dürfen.",
    room: (r, f) => {
      const where: Record<Floor, string> = {
        first: " und befindet sich im ersten Stock.",
        second: " und befindet sich im zweiten Stock.",
        garden: " und befindet sich im Gartengeschoss – einfach die Treppe hinunter.",
      };
      return [t("Ihr Zimmer hat die Nummer "), b(r), t(f ? where[f] : ".")];
    },
    home: "Fühlen Sie sich bei uns wie zu Hause.",
    bar: "Bedienen Sie sich gerne an der Bar – notieren Sie einfach, was Sie genommen haben.",
    breakfast: (f, to) => `Das Frühstück servieren wir von ${f} bis ${to} Uhr.`,
    sauna: "Die Sauna befindet sich im Gartengeschoss und steht Ihnen bis 21:00 Uhr zur Verfügung.",
    wifiLabel: "WLAN-Passwort",
    emergency: (p) => [t("Im Notfall erreichen Sie uns unter "), b(p), t(".")],
    closing: "Wir wünschen Ihnen einen wunderschönen Aufenthalt!",
    qr: "Scannen Sie den QR-Code: Dort finden Sie alle Informationen zum Chalet Hotel Hartmann.",
    noteLabel: "Eine Notiz für Sie",
  },

  fr: {
    nameIt: "Francese",
    roomLabel: "Chambre",
    headline: "Bienvenue au Chalet Hotel Hartmann",
    salutation: (n) => (n ? `Bonjour ${n},` : "Chers hôtes,"),
    intro: "Nous sommes ravis de vous accueillir.",
    room: (r, f) => {
      const where: Record<Floor, string> = {
        first: " et se trouve au premier étage.",
        second: " et se trouve au deuxième étage.",
        garden: ` et se trouve au niveau jardin${NBSP}: il suffit de descendre l’escalier.`,
      };
      return [t("Votre chambre porte le numéro "), b(r), t(f ? where[f] : ".")];
    },
    home: `Faites comme chez vous${NBSP}!`,
    bar: `N’hésitez pas à vous servir au bar${NBSP}: notez simplement ce que vous avez consommé.`,
    breakfast: (f, to) => `Le petit-déjeuner est servi de ${frTime(f)} à ${frTime(to)}.`,
    sauna: `Le sauna se trouve au niveau jardin et est accessible jusqu’à 21${NBSP}h.`,
    wifiLabel: "Mot de passe Wi-Fi",
    emergency: (p) => [t("En cas d’urgence, vous pouvez nous appeler au "), b(p), t(".")],
    closing: `Nous vous souhaitons un excellent séjour${NBSP}!`,
    qr: "Scannez le code QR pour retrouver toutes les informations sur le Chalet Hotel Hartmann.",
    noteLabel: "Un petit mot pour vous",
  },

  es: {
    nameIt: "Spagnolo",
    roomLabel: "Habitación",
    headline: "Bienvenidos al Chalet Hotel Hartmann",
    // Saluto senza nome: evita la scelta Estimado/Estimada.
    salutation: () => "Estimados huéspedes:",
    intro: "Es un placer darles la bienvenida.",
    room: (r, f) => {
      const where: Record<Floor, string> = {
        first: " y se encuentra en la primera planta.",
        second: " y se encuentra en la segunda planta.",
        garden: " y se encuentra en la planta jardín: solo tienen que bajar las escaleras.",
      };
      return [t("Su habitación es la número "), b(r), t(f ? where[f] : ".")];
    },
    home: "Siéntanse como en casa.",
    bar: "Pueden servirse libremente en el bar: solo les pedimos que anoten lo que consuman.",
    breakfast: (f, to) => `El desayuno se sirve de ${f} a ${to}.`,
    sauna: "La sauna se encuentra en la planta jardín y está disponible hasta las 21:00.",
    wifiLabel: "Contraseña del wifi",
    emergency: (p) => [t("En caso de emergencia, pueden llamarnos al "), b(p), t(".")],
    closing: "¡Les deseamos una estancia maravillosa!",
    qr: "Escaneen el código QR para encontrar toda la información sobre el Chalet Hotel Hartmann.",
    noteLabel: "Una nota para ustedes",
  },

  nl: {
    nameIt: "Olandese",
    roomLabel: "Kamer",
    headline: "Welkom in Chalet Hotel Hartmann",
    salutation: (n) => (n ? `Beste ${n},` : "Beste gasten,"),
    intro: "Wat fijn dat u bij ons te gast bent.",
    room: (r, f) => {
      const where: Record<Floor, string> = {
        first: " en ligt op de eerste verdieping.",
        second: " en ligt op de tweede verdieping.",
        garden: " en ligt op de tuinverdieping: neem gewoon de trap naar beneden.",
      };
      return [t("Uw kamer heeft nummer "), b(r), t(f ? where[f] : ".")];
    },
    home: "Voelt u zich hier helemaal thuis.",
    bar: "Bedient u zich gerust aan de bar – noteer gewoon wat u neemt.",
    breakfast: (f, to) => `Het ontbijt wordt geserveerd van ${dotTime(f)} tot ${dotTime(to)} uur.`,
    sauna: "De sauna bevindt zich op de tuinverdieping en is tot 21.00 uur beschikbaar.",
    wifiLabel: "Wifi-wachtwoord",
    emergency: (p) => [t("In geval van nood kunt u ons bellen op "), b(p), t(".")],
    closing: "Wij wensen u een heerlijk verblijf!",
    qr: "Scan de QR-code voor alle informatie over Chalet Hotel Hartmann.",
    noteLabel: "Een bericht voor u",
  },

  pl: {
    nameIt: "Polacco",
    roomLabel: "Pokój",
    headline: "Witamy w Chalet Hotel Hartmann",
    // Saluto senza nome: evita la declinazione del nome.
    salutation: () => "Drodzy Goście!",
    intro: "Bardzo się cieszymy, że możemy Państwa u nas gościć.",
    room: (r, f) => {
      const where: Record<Floor, string> = {
        first: " i znajduje się na pierwszym piętrze.",
        second: " i znajduje się na drugim piętrze.",
        garden: " i znajduje się na poziomie ogrodu – wystarczy zejść schodami w dół.",
      };
      return [t("Państwa pokój ma numer "), b(r), t(f ? where[f] : ".")];
    },
    home: "Prosimy czuć się jak u siebie w domu.",
    bar: "Zapraszamy do swobodnego korzystania z baru – wystarczy zapisać, co Państwo wzięli.",
    breakfast: (f, to) => `Śniadanie serwujemy w godzinach ${f}–${to}.`,
    sauna: "Sauna znajduje się na poziomie ogrodu i jest dostępna do godziny 21:00.",
    wifiLabel: "Hasło do Wi-Fi",
    emergency: (p) => [t("W nagłych przypadkach prosimy dzwonić pod numer "), b(p), t(".")],
    closing: "Życzymy udanego pobytu!",
    qr: "Prosimy zeskanować kod QR – znajdą tam Państwo wszystkie informacje o Chalet Hotel Hartmann.",
    noteLabel: "Wiadomość dla Państwa",
  },

  cs: {
    nameIt: "Ceco",
    roomLabel: "Pokoj",
    headline: "Vítejte v Chalet Hotelu Hartmann",
    // Saluto senza nome: evita il vocativo.
    salutation: () => "Vážení hosté,",
    intro: "srdečně Vás u nás vítáme.",
    room: (r, f) => {
      const where: Record<Floor, string> = {
        first: " a najdete ho v prvním patře.",
        second: " a najdete ho ve druhém patře.",
        garden: " a najdete ho v zahradním podlaží – stačí sejít po schodech dolů.",
      };
      return [t("Váš pokoj má číslo "), b(r), t(f ? where[f] : ".")];
    },
    home: "Cíťte se u nás jako doma.",
    bar: "Z baru si můžete volně posloužit – stačí si jen poznamenat, co jste si vzali.",
    breakfast: (f, to) => `Snídani podáváme od ${f} do ${to}.`,
    sauna: "Sauna se nachází v zahradním podlaží a je k dispozici do 21:00.",
    wifiLabel: "Heslo k Wi-Fi",
    emergency: (p) => [t("V naléhavých případech nám volejte na číslo "), b(p), t(".")],
    closing: "Přejeme Vám příjemný pobyt!",
    qr: "Naskenujte QR kód – najdete v něm všechny informace o Chalet Hotelu Hartmann.",
    noteLabel: "Vzkaz pro Vás",
  },

  da: {
    nameIt: "Danese",
    roomLabel: "Værelse",
    headline: "Velkommen til Chalet Hotel Hartmann",
    salutation: (n) => (n ? `Kære ${n},` : "Kære gæster,"),
    intro: "Vi er glade for at byde jer velkommen.",
    room: (r, f) => {
      const where: Record<Floor, string> = {
        first: " og ligger på første sal.",
        second: " og ligger på anden sal.",
        garden: " og ligger på haveetagen – tag blot trappen ned.",
      };
      return [t("Jeres værelse har nummer "), b(r), t(f ? where[f] : ".")];
    },
    home: "Føl jer som hjemme.",
    bar: "I er velkomne til at forsyne jer i baren – skriv blot ned, hvad I tager.",
    breakfast: (f, to) => `Morgenmaden serveres kl. ${dotTime(f)}–${dotTime(to)}.`,
    sauna: "Saunaen ligger på haveetagen og kan benyttes indtil kl. 21.00.",
    wifiLabel: "Wi-Fi-adgangskode",
    emergency: (p) => [t("I nødstilfælde kan I ringe til os på "), b(p), t(".")],
    closing: "Vi ønsker jer et dejligt ophold!",
    qr: "Scan QR-koden, så finder I alle oplysninger om Chalet Hotel Hartmann.",
    noteLabel: "En besked til jer",
  },

  sv: {
    nameIt: "Svedese",
    roomLabel: "Rum",
    headline: "Välkommen till Chalet Hotel Hartmann",
    salutation: (n) => (n ? `Hej ${n}!` : "Kära gäster!"),
    intro: "Vi är glada att få välkomna er.",
    room: (r, f) => {
      const where: Record<Floor, string> = {
        first: " och ligger på första våningen.",
        second: " och ligger på andra våningen.",
        garden: " och ligger på trädgårdsplanet – ta bara trappan ned.",
      };
      return [t("Ert rum har nummer "), b(r), t(f ? where[f] : ".")];
    },
    home: "Känn er som hemma.",
    bar: "Ta gärna för er i baren – skriv bara upp vad ni tar.",
    breakfast: (f, to) => `Frukost serveras kl. ${dotTime(f)}–${dotTime(to)}.`,
    sauna: "Bastun ligger på trädgårdsplanet och kan användas fram till kl. 21.00.",
    wifiLabel: "Wi-Fi-lösenord",
    emergency: (p) => [t("Vid en nödsituation kan ni ringa oss på "), b(p), t(".")],
    closing: "Vi önskar er en riktigt trevlig vistelse!",
    qr: "Skanna QR-koden för all information om Chalet Hotel Hartmann.",
    noteLabel: "Ett meddelande till er",
  },
};

/** Paragrafo semplice da una stringa. */
export const plain = (text: string): Paragraph => [t(text)];
