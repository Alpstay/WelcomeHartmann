// Dati fissi dello Chalet Hotel Hartmann.
// Per cambiare password Wi-Fi, numero di emergenza o camere si modifica solo questo file.

import type { Floor, HotelSettings } from "./types";

export const HOTEL_DEFAULTS: HotelSettings = {
  hotelName: "Chalet Hotel Hartmann",
  place: "Ortisei · Val Gardena",
  wifiPassword: "enjoyhartmann",
  emergencyPhone: "+39 333 6828717",
  breakfastFrom: "8:00",
  breakfastTo: "10:30",
  signer: "Chiara",
  signerRole: "Manager · Chalet Hotel Hartmann",
};

/** Dati in uso: i predefiniti più le modifiche fatte in Impostazioni su questo computer. */
export const HOTEL: HotelSettings = { ...HOTEL_DEFAULTS };

/** Dati che la reception può cambiare in Impostazioni. */
export const HOTEL_EDITABLE = ["wifiPassword", "emergencyPhone", "breakfastFrom", "breakfastTo", "signer", "signerRole"] as const;
export type HotelEditable = (typeof HOTEL_EDITABLE)[number];

/** Applica le modifiche di Impostazioni (sostituisce quelle precedenti). Orari solo nel formato H:MM. */
export function applyHotel(overrides: Partial<Record<HotelEditable, string>>): void {
  const ok = Object.fromEntries(
    HOTEL_EDITABLE.filter((k) => typeof overrides[k] === "string" && overrides[k]!.trim() !== "")
      .filter((k) => !k.startsWith("breakfast") || /^\d{1,2}:\d{2}$/.test(overrides[k]!.trim()))
      .map((k) => [k, overrides[k]!.trim()]),
  );
  Object.assign(HOTEL, HOTEL_DEFAULTS, ok);
}

/** Come riconoscere lo Hartmann negli arrivi di La Scatola (property_name). */
export const PROPERTY_NAME_MATCH = /hartmann/i;

/** Piano di ogni camera, come indicato dallo staff. */
export const ROOM_FLOORS: Readonly<Record<string, Floor>> = {
  "101": "first",
  "102": "first",
  "103": "first",
  "105": "first",
  "107": "first",
  "108": "first",
  "119": "second",
  "121": "garden",
  "122": "garden",
};

export const KNOWN_ROOMS: readonly string[] = Object.keys(ROOM_FLOORS).sort((a, b) =>
  a.localeCompare(b, "it", { numeric: true }),
);

export const FLOOR_LABEL_IT: Readonly<Record<Floor, string>> = {
  first: "1° piano",
  second: "2° piano",
  garden: "Piano giardino",
};

export const floorOf = (room: string | null): Floor | null =>
  room !== null && Object.prototype.hasOwnProperty.call(ROOM_FLOORS, room.trim())
    ? ROOM_FLOORS[room.trim()]
    : null;
