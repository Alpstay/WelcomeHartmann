// Tipi condivisi della piattaforma "Lettere di benvenuto" — Chalet Hotel Hartmann.

/** Lingue in cui la lettera è disponibile. */
export type LangCode = "it" | "de" | "en" | "fr" | "es" | "nl" | "pl" | "cs" | "da" | "sv";

/** Piani dello Chalet Hartmann con indicazioni per raggiungere la camera. */
export type Floor = "first" | "second" | "garden";

/** Un pezzo di testo, eventualmente in grassetto (numero di camera, telefono, password). */
export interface Segment {
  readonly text: string;
  readonly bold?: boolean;
}

/** Un paragrafo composto da segmenti. */
export type Paragraph = readonly Segment[];

/** Testi della lettera in una lingua. */
export interface LetterTexts {
  /** Nome della lingua in italiano, per il menu della receptionist. */
  readonly nameIt: string;
  /** Etichetta "Camera" nella lingua. */
  readonly roomLabel: string;
  readonly headline: string;
  readonly salutation: (guestName: string | null) => string;
  readonly intro: string;
  readonly room: (room: string, floor: Floor | null) => Paragraph;
  readonly home: string;
  readonly bar: string;
  /** Orario della colazione, con gli orari formattati secondo la lingua. */
  readonly breakfast: (from: string, to: string) => string;
  readonly sauna: string;
  readonly wifiLabel: string;
  readonly emergency: (phone: string) => Paragraph;
  readonly closing: string;
  /** Didascalia del QR con tutte le informazioni dello Hartmann. */
  readonly qr: string;
  /** Titolino sopra la nota scritta dalla reception. */
  readonly noteLabel: string;
}

/** Dati fissi della struttura stampati su ogni lettera. */
export interface HotelSettings {
  readonly hotelName: string;
  readonly place: string;
  readonly wifiPassword: string;
  readonly emergencyPhone: string;
  /** Orari colazione nel formato 24h "H:MM". */
  readonly breakfastFrom: string;
  readonly breakfastTo: string;
  readonly signer: string;
  readonly signerRole: string;
}

/** Cosa serve per comporre una lettera. */
export interface LetterInput {
  /** reservation_id di Slope, invariato. Null per le lettere manuali. */
  readonly reservationId: string | null;
  readonly room: string;
  readonly guestName: string | null;
  readonly lang: LangCode;
  readonly arrival: string | null;
  readonly departure: string | null;
  /** Nota libera della reception, stampata così com'è scritta. */
  readonly note?: string | null;
  /** PIN a 4 cifre per il post-it; null = caselle vuote da scrivere a mano. */
  readonly pin?: string | null;
}

/** Un blocco di testo completo in una lingua. */
export interface LetterBlock {
  readonly lang: LangCode;
  readonly headline: string;
  readonly salutation: string;
  readonly paragraphs: readonly Paragraph[];
  readonly wifiLabel: string;
  readonly wifiValue: string;
  readonly emergency: Paragraph;
  readonly closing: string;
}

/** Lettera pronta per anteprima e PDF. */
export interface LetterModel {
  readonly reservationId: string | null;
  readonly room: string;
  readonly floor: Floor | null;
  readonly guestName: string | null;
  readonly stayLabel: string | null;
  readonly roomLabel: string;
  readonly primary: LetterBlock;
  /** Testo inglese sotto la lingua dell'ospite; null se l'ospite è già inglese. */
  readonly english: LetterBlock | null;
  /** Didascalia del QR nella lingua dell'ospite e, se diversa, in inglese. */
  readonly qrCaption: string;
  readonly qrCaptionEnglish: string | null;
  /** Nota della reception (null se vuota) e il suo titolino nelle due lingue. */
  readonly note: string | null;
  readonly noteLabel: string;
  /** PIN a 4 cifre stampato sul post-it (null = caselle vuote). */
  readonly pin: string | null;
  readonly hotelName: string;
  readonly place: string;
  readonly signer: string;
  readonly signerRole: string;
}

// ——— Dati da La Scatola (connettore Databox, sola lettura) ———

export type FreshnessStatus = "fresh" | "stale" | "failing" | "unavailable";

export interface FreshnessSource {
  readonly property_id: string;
  readonly resource: string;
  readonly last_success_at: string | null;
  readonly status: FreshnessStatus;
}

export interface Freshness {
  readonly overall: { readonly status: FreshnessStatus };
  readonly sources: readonly FreshnessSource[];
}

export interface Page {
  readonly returned: number;
  readonly truncated: boolean;
  readonly next_cursor: string | null;
}

export interface Envelope<T> {
  readonly data: readonly T[];
  readonly freshness: Freshness;
  readonly page: Page;
}

/** Riga di list_arrivals (PII-free). Gli ID restano quelli di Slope. */
export interface ArrivalRow {
  readonly reservation_id: string;
  readonly order_id: string;
  readonly property_id: string;
  readonly property_name: string;
  readonly arrival: string;
  readonly departure: string;
  readonly lodging_id: string | null;
  readonly room_name: string | null;
  readonly adults: number;
  readonly children: number;
  readonly is_option: boolean;
  readonly booking_status: "CONFIRMED" | "OPTION" | "CANCELLED";
  readonly stay_status: "TO_ARRIVE" | "IN_HOUSE" | "DEPARTED";
}

/** Campi usati da curated_guest_stays: solo nome, tipo ospite e lingua. */
export interface GuestStayFields {
  readonly reservation_id: string;
  readonly guest_type: string | null;
  readonly is_primary_guest: boolean | null;
  readonly first_name: string | null;
  readonly last_name: string | null;
  readonly language: string | null;
}

/** Campi usati da curated_reservation_contacts: solo intestatario e lingua. */
export interface BookerFields {
  readonly reservation_id: string;
  readonly booker_type: "INDIVIDUAL" | "COMPANY" | null;
  readonly first_name: string | null;
  readonly last_name: string | null;
  readonly language: string | null;
  readonly company_language: string | null;
}

/** Da dove arriva la lingua proposta. */
export type LangSource = "ospite" | "prenotazione" | "predefinita" | "manuale";

/** Riga dell'elenco arrivi mostrato alla receptionist. */
export interface ArrivalItem {
  readonly key: string;
  readonly reservationId: string | null;
  room: string | null;
  readonly arrival: string | null;
  readonly departure: string | null;
  readonly adults: number;
  readonly children: number;
  readonly isOption: boolean;
  readonly inHouse: boolean;
  readonly manual: boolean;
  /** Codice lingua grezzo ricevuto da Slope (es. "th"), per spiegare il fallback. */
  readonly rawLang: string | null;
  /** Nota quando ospite e prenotazione indicano lingue diverse. */
  readonly langNote: string | null;
  langSource: LangSource;
  name: string;
  /** Nota della reception per questa lettera (resta solo su questo dispositivo). */
  note: string;
  /** PIN a 4 cifre scritto dalla reception (resta solo su questo dispositivo). */
  pin: string;
  lang: LangCode;
  selected: boolean;
}
