// Interfaccia della receptionist: arrivi del giorno → controllo nome/lingua → PDF A4.

import { ASSETS } from "./assets.generated";
import { FEED_FILE, decryptJson, feedAad, fromFeedItem, isFeedEnvelope } from "./feed";
import type { FeedEnvelope, FeedPayload } from "./feed";
import { FLOOR_LABEL_IT, HOTEL, KNOWN_ROOMS, floorOf } from "./hotel";
import { buildLetter, isPin, nightsBetween } from "./letter";
import { PDF_FONTS, buildDocDefinition, pdfVfs } from "./pdf";
import { SERVER, fetchArrivals, fetchGuestInfo, freshnessTime, isMcpError, toItems } from "./scatola";
import { LANG_ORDER, TEXTS } from "./texts";
import type { ArrivalItem, Freshness, LangCode, LetterModel, Paragraph } from "./types";

type Mcp = typeof Claude.mcp;
type Downloads = typeof Claude.downloads;
type Tone = "neutral" | "info" | "warn" | "error";

interface Chip {
  readonly text: string;
  readonly tone: Tone;
}

interface BannerView {
  readonly tone: Exclude<Tone, "neutral">;
  readonly text: string;
  readonly action?: { readonly label: string; readonly run: () => void };
}

interface AppState {
  /** Solo su GitHub: file arrivi.json pubblicato e il suo contenuto decifrato. */
  feed: FeedEnvelope | null;
  feedData: FeedPayload | null;
  /** Giorno scelto nel campo data. */
  date: string;
  /** Giorno degli arrivi attualmente in elenco (null se nessun dato scaricato). */
  loadedDate: string | null;
  items: ArrivalItem[];
  focusKey: string | null;
  loading: boolean;
  loadSeq: number;
  manualSeq: number;
  propertyIds: string[];
  mcp: Mcp | null;
  mcpChecked: boolean;
  downloads: Downloads | null;
  busy: boolean;
}

// ——— utilità ———

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento mancante: #${id}`);
  return el as T;
};

type Attrs = Record<string, string | number | boolean | undefined>;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== false) el.append(c);
  return el;
}

const romeDate = (offsetDays = 0): string => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};

const longDate = (iso: string): string =>
  new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );

const shortDate = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

// ——— stato ———

const state: AppState = {
  feed: null,
  feedData: null,
  date: romeDate(0),
  loadedDate: null,
  items: [],
  focusKey: null,
  loading: false,
  loadSeq: 0,
  manualSeq: 0,
  propertyIds: [],
  mcp: null,
  mcpChecked: false,
  downloads: null,
  busy: false,
};

const LOGO_URL = `data:image/png;base64,${ASSETS.logoPng}`;
/** Le lettere si stampano in bianco e nero: anche l'anteprima usa il logo nero. */
const LOGO_BW_URL = `data:image/png;base64,${ASSETS.logoBwPng}`;

// ——— modifiche della reception (nome, lingua, nota) ———
// Restano su questo dispositivo, così non si perdono quando si aggiornano i dati.

const NOTE_MAX = 240;
const EDITS_KEY = "welcomeHartmann.edits";
const EDITS_DAYS = 14;

interface ItemEdit {
  name?: string;
  pin?: string;
  lang?: LangCode;
  note?: string;
  at: number;
}

const noteOpen = new Set<string>();

function loadEdits(): Record<string, ItemEdit> {
  try {
    const raw = JSON.parse(localStorage.getItem(EDITS_KEY) ?? "{}") as Record<string, ItemEdit>;
    const limit = Date.now() - EDITS_DAYS * 86_400_000;
    return Object.fromEntries(Object.entries(raw).filter(([, e]) => e && typeof e.at === "number" && e.at > limit));
  } catch {
    return {};
  }
}

const edits: Record<string, ItemEdit> = loadEdits();

function saveEdit(item: ArrivalItem, patch: Omit<ItemEdit, "at">): void {
  if (item.manual) return;
  edits[item.key] = { ...edits[item.key], ...patch, at: Date.now() };
  try {
    localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
  } catch {
    /* archiviazione non disponibile: le modifiche valgono fino alla chiusura della pagina */
  }
}

function applyEdits(items: ArrivalItem[]): ArrivalItem[] {
  for (const i of items) {
    const e = edits[i.key];
    if (!e) continue;
    if (typeof e.name === "string") i.name = e.name;
    if (e.lang && e.lang in TEXTS) {
      i.lang = e.lang;
      i.langSource = "manuale";
    }
    if (typeof e.note === "string") i.note = e.note.slice(0, NOTE_MAX);
    if (typeof e.pin === "string") i.pin = e.pin.replace(/\D/g, "").slice(0, 4);
  }
  return items;
}
const QR_URL = `data:image/png;base64,${ASSETS.qrPng}`;

/** Vero dentro claude.ai (connettore e salvataggio file passano dalla piattaforma). */
const IN_CLAUDE = typeof (window as { claude?: Partial<Claude> }).claude?.use === "function";

const isIsoDate = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

// ——— messaggi ———

let toastTimer: number | undefined;
function toast(text: string, tone: Tone = "neutral"): void {
  const el = $("toast");
  el.textContent = text;
  el.dataset.tone = tone;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 5200);
}

function showBanners(banners: readonly BannerView[]): void {
  const box = $("banners");
  box.replaceChildren(
    ...banners.map((b) => {
      const btn = b.action ? h("button", { type: "button", class: "btn ghost small" }, b.action.label) : null;
      if (btn && b.action) btn.addEventListener("click", b.action.run);
      return h("div", { class: `banner ${b.tone}`, role: b.tone === "error" ? "alert" : "status" }, h("p", {}, b.text), btn);
    }),
  );
  box.hidden = banners.length === 0;
}

async function openPermissions(): Promise<void> {
  const perms = await window.claude?.use("permissions");
  try {
    if (!perms) throw new Error("no permissions");
    await perms.manage();
    void load();
  } catch {
    toast("Apri il menu Autorizzazioni dell'artifact e consenti La Scatola.", "warn");
  }
}

/** Ogni codice d'errore del connettore ha la sua soluzione. */
function bannerForError(e: unknown, what: string): BannerView {
  if (!isMcpError(e)) return { tone: "error", text: `Impossibile leggere ${what}. Premi Aggiorna dati per riprovare.` };
  switch (e.code) {
    case "needs_reauth":
      return { tone: "error", text: "La connessione a La Scatola è scaduta. Ricollegala da claude.ai → Impostazioni → Connettori, poi premi Aggiorna dati." };
    case "server_not_connected":
    case "server_not_found":
      return { tone: "error", text: "Il connettore La Scatola non è collegato al tuo account. Aggiungilo da claude.ai → Impostazioni → Connettori, poi premi Aggiorna dati." };
    case "selection_required":
      return { tone: "warn", text: "Hai più connettori chiamati La Scatola: scegli quale usare nella richiesta mostrata da Claude, poi premi Aggiorna dati." };
    case "not_in_manifest":
      return { tone: "warn", text: "Questa pagina non ha il permesso di leggere La Scatola.", action: { label: "Gestisci autorizzazioni", run: () => void openPermissions() } };
    case "approval_required":
    case "consent_required":
      return { tone: "warn", text: "Serve il tuo consenso per leggere La Scatola.", action: { label: "Consenti e carica", run: () => void load() } };
    case "blocked_by_policy":
      return { tone: "error", text: "La tua organizzazione non consente a questa pagina di leggere La Scatola. Puoi comunque creare lettere manuali." };
    case "server_unavailable":
    case "rate_limited":
      return { tone: "warn", text: "La Scatola non risponde in questo momento.", action: { label: "Riprova", run: () => void load() } };
    case "tool_error":
      return { tone: "error", text: `La Scatola ha restituito un errore leggendo ${what}: ${e.message}` };
    case "not_granted":
    case "capability_disabled":
    case "capability_removed":
      return { tone: "info", text: "In questa vista la pagina non può leggere La Scatola. Aprila da claude.ai oppure crea le lettere a mano." };
    default:
      return { tone: "error", text: `Impossibile leggere ${what} (${e.code}).`, action: { label: "Riprova", run: () => void load() } };
  }
}

function freshnessBanner(f: Freshness): BannerView | null {
  if (f.overall.status === "failing") return { tone: "warn", text: "L'ultimo aggiornamento non è riuscito; sono mostrati gli ultimi dati disponibili." };
  if (f.overall.status === "stale") return { tone: "warn", text: "I dati potrebbero non essere aggiornati." };
  return null;
}

// ——— caricamento: pagina su GitHub (file cifrato aggiornato ogni ora) ———

const PW_KEY = "welcomeHartmann.password";

function storedPassword(): string | null {
  try {
    return localStorage.getItem(PW_KEY);
  } catch {
    return null;
  }
}

function rememberPassword(pw: string | null): void {
  try {
    if (pw) localStorage.setItem(PW_KEY, pw);
    else localStorage.removeItem(PW_KEY);
  } catch {
    /* archiviazione non disponibile: la password andrà reinserita */
  }
}

const timeRome = (iso: string): string =>
  new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const dayRome = (iso: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** Scarica arrivi.json; se il file è cambiato lo decifra con la password salvata (o chiede la password). */
async function refreshFeed(): Promise<"ok" | "locked" | "missing" | "error"> {
  let env: unknown;
  try {
    const res = await fetch(`${FEED_FILE}?t=${Date.now()}`, { cache: "no-store" });
    if (res.status === 404) return "missing";
    if (!res.ok) return "error";
    env = await res.json();
  } catch {
    return "error";
  }
  if (!isFeedEnvelope(env)) return "error";
  if (state.feed && state.feedData && state.feed.generated_at === env.generated_at) return "ok";
  state.feed = env;
  state.feedData = null;
  const pw = storedPassword();
  if (!pw) return "locked";
  try {
    state.feedData = await decryptJson<FeedPayload>(env.enc, pw, feedAad(env.from));
    return "ok";
  } catch {
    rememberPassword(null);
    return "locked";
  }
}

function showUnlock(show: boolean, message = ""): void {
  $("unlock").hidden = !show;
  $("unlock-msg").textContent = message;
  if (show) window.setTimeout(() => $<HTMLInputElement>("pw").focus(), 0);
}

async function loadFromFeed(seq: number, date: string): Promise<void> {
  const manual = state.items.filter((i) => i.manual);
  const status = await refreshFeed();
  if (seq !== state.loadSeq) return;
  state.loading = false;
  const banners: BannerView[] = [];

  if (status !== "ok" || !state.feed || !state.feedData) {
    state.items = manual;
    state.loadedDate = null;
    $("fresh").textContent = "";
    showUnlock(status === "locked");
    if (status === "missing")
      banners.push({ tone: "info", text: "Gli arrivi non sono ancora stati pubblicati: l'aggiornamento automatico gira ogni ora dalle 8 alle 18. Intanto puoi creare lettere a mano." });
    if (status === "error")
      banners.push({ tone: "error", text: "Non riesco a leggere il file degli arrivi. Controlla la connessione e premi Scarica dati.", action: { label: "Riprova", run: () => void load() } });
    showBanners(banners);
    renderAll();
    return;
  }

  showUnlock(false);
  const feed = state.feed;
  const inRange = date >= feed.from && date <= feed.to;
  const items = applyEdits(inRange ? (state.feedData.days[date] ?? []).map(fromFeedItem) : []);
  state.items = [...items, ...manual];
  state.loadedDate = inRange ? date : null;
  if (!inRange)
    banners.push({
      tone: "warn",
      text: `Qui ci sono gli arrivi da ${longDate(feed.from)} a ${longDate(feed.to)}. Per un'altra data apri la pagina su claude.ai oppure crea la lettera a mano.`,
    });

  const ageH = (Date.now() - Date.parse(feed.generated_at)) / 3_600_000;
  if (ageH > 3) banners.push({ tone: "warn", text: `I dati potrebbero non essere aggiornati: ultimo aggiornamento ${dayRome(feed.generated_at) === romeDate(0) ? "alle" : `del ${shortDate(dayRome(feed.generated_at))} alle`} ${timeRome(feed.generated_at)}.` });
  else if (feed.freshness === "failing") banners.push({ tone: "warn", text: "L'ultimo aggiornamento non è riuscito; sono mostrati gli ultimi dati disponibili." });
  else if (feed.freshness === "stale") banners.push({ tone: "warn", text: "I dati potrebbero non essere aggiornati." });

  const n = items.length;
  const when = feed.scatola_updated_at ?? feed.generated_at;
  $("fresh").textContent = inRange
    ? `${n === 0 ? "Nessun arrivo" : plural(n, "arrivo", "arrivi")} di ${longDate(date)} · La Scatola delle ${timeRome(when)} · si aggiorna ogni ora (8–18)`
    : "";
  if (!state.items.some((i) => i.key === state.focusKey)) state.focusKey = state.items[0]?.key ?? null;
  showBanners(banners);
  renderAll();
}

async function unlock(pw: string): Promise<void> {
  if (!state.feed) return;
  $<HTMLButtonElement>("unlock-btn").disabled = true;
  $("unlock-msg").textContent = "Controllo la password…";
  try {
    state.feedData = await decryptJson<FeedPayload>(state.feed.enc, pw, feedAad(state.feed.from));
    rememberPassword(pw);
    $<HTMLInputElement>("pw").value = "";
    void load();
  } catch {
    showUnlock(true, "Password non corretta. Chiedila in reception o a chi gestisce le app AlpStay.");
  } finally {
    $<HTMLButtonElement>("unlock-btn").disabled = false;
  }
}

// ——— caricamento ———

async function load(): Promise<void> {
  if (!isIsoDate(state.date)) {
    toast("Inserisci una data valida, poi premi Scarica dati.", "warn");
    return;
  }
  const seq = ++state.loadSeq;
  const date = state.date;
  state.loading = true;
  state.items = state.items.filter((i) => i.manual);
  state.loadedDate = date;
  renderToolbar();
  renderList();
  $("fresh").textContent = `Scarico da La Scatola gli arrivi di ${longDate(date)}…`;

  if (!IN_CLAUDE) {
    await loadFromFeed(seq, date);
    return;
  }

  if (!state.mcpChecked) {
    state.mcp = (await window.claude.use("mcp")) ?? null;
    state.mcpChecked = true;
  }
  if (seq !== state.loadSeq) return;

  const manual = state.items.filter((i) => i.manual);
  if (!state.mcp) {
    state.items = manual;
    state.loading = false;
    state.loadedDate = null;
    $("fresh").textContent = "";
    showBanners([{ tone: "info", text: "In questa vista la pagina non può leggere La Scatola. Puoi creare le lettere a mano con “Lettera manuale”." }]);
    renderAll();
    return;
  }

  const banners: BannerView[] = [];
  try {
    const { rows, freshness } = await fetchArrivals(state.mcp, date);
    if (seq !== state.loadSeq) return;
    state.propertyIds = [...new Set(rows.map((r) => r.property_id))];

    let lookup = null;
    if (rows.length > 0) {
      try {
        lookup = await fetchGuestInfo(state.mcp, rows.map((r) => r.reservation_id));
      } catch (e) {
        const b = bannerForError(e, "nomi e lingue degli ospiti");
        banners.push({ ...b, text: `${b.text} Le lettere usano il saluto generico in inglese: controlla nome e lingua prima di stampare.` });
      }
    }
    if (seq !== state.loadSeq) return;

    state.items = [...applyEdits(toItems(rows, lookup)), ...manual];
    const fb = freshnessBanner(freshness);
    if (fb) banners.unshift(fb);
    const time = freshnessTime(freshness, state.propertyIds);
    const n = rows.length;
    $("fresh").textContent =
      `${n === 0 ? "Nessun arrivo" : plural(n, "arrivo", "arrivi")} di ${longDate(date)}` +
      (time ? ` · La Scatola aggiornata alle ${time}` : "");
  } catch (e) {
    if (seq !== state.loadSeq) return;
    state.items = manual;
    state.loadedDate = null;
    banners.push(bannerForError(e, `gli arrivi di ${longDate(date)}`));
    $("fresh").textContent = "";
  }
  state.loading = false;
  if (!state.items.some((i) => i.key === state.focusKey)) state.focusKey = state.items[0]?.key ?? null;
  showBanners(banners);
  renderAll();
}

// ——— elenco ———

function chipsFor(item: ArrivalItem): Chip[] {
  const chips: Chip[] = [];
  if (!item.room) chips.push({ text: "Scegli la camera", tone: "error" });
  else {
    const floor = floorOf(item.room);
    chips.push(floor ? { text: FLOOR_LABEL_IT[floor], tone: "neutral" } : { text: "Piano non in elenco: lettera senza percorso", tone: "warn" });
  }
  if (item.isOption) chips.push({ text: "Opzione", tone: "warn" });
  if (item.inHouse) chips.push({ text: "Già arrivati", tone: "info" });
  if (item.langSource === "predefinita") chips.push({ text: "Lingua non indicata in Slope: inglese", tone: "warn" });
  else if (item.rawLang && item.langSource !== "manuale" && !(item.rawLang.toLowerCase().split(/[-_]/)[0] in TEXTS))
    chips.push({ text: `Lingua ${item.rawLang.toUpperCase()} non prevista: inglese`, tone: "warn" });
  else if (item.langSource === "ospite") chips.push({ text: "Lingua dal check-in", tone: "neutral" });
  else if (item.langSource === "prenotazione") chips.push({ text: "Lingua dalla prenotazione", tone: "neutral" });
  else if (item.langSource === "manuale") chips.push({ text: "Lingua scelta a mano", tone: "info" });
  if (item.langNote && item.langSource !== "manuale") chips.push({ text: item.langNote, tone: "info" });
  if (item.pin.length > 0 && !isPin(item.pin)) chips.push({ text: "PIN incompleto: servono 4 cifre", tone: "error" });
  else if (!isPin(item.pin)) chips.push({ text: "Senza PIN: caselle da scrivere a mano", tone: "warn" });
  if (item.note.trim()) chips.push({ text: "Con nota", tone: "info" });
  return chips;
}

function metaFor(item: ArrivalItem): string {
  if (item.manual) return "Lettera manuale";
  const parts: string[] = [];
  if (item.arrival && item.departure) {
    const n = nightsBetween(item.arrival, item.departure);
    parts.push(`${shortDate(item.arrival)} → ${shortDate(item.departure)}`);
    if (n !== null) parts.push(plural(n, "notte", "notti"));
  }
  const people = [plural(item.adults, "adulto", "adulti")];
  if (item.children > 0) people.push(plural(item.children, "bambino", "bambini"));
  parts.push(people.join(", "));
  return parts.join(" · ");
}

function langSelect(item: ArrivalItem): HTMLSelectElement {
  const sel = h("select", { class: "lang", id: `lang-${item.key}`, "aria-label": "Lingua della lettera" });
  for (const code of LANG_ORDER) {
    const opt = h("option", { value: code }, `${TEXTS[code].nameIt}${code === "en" ? "" : " + inglese"}`);
    if (code === item.lang) opt.selected = true;
    sel.append(opt);
  }
  return sel;
}

function roomCell(item: ArrivalItem): HTMLElement {
  if (item.room && !item.manual) {
    return h("button", { type: "button", class: "room-btn", "data-act": "focus", "aria-label": `Anteprima camera ${item.room}` }, item.room);
  }
  const sel = h("select", { class: "room-sel", id: `room-${item.key}`, "aria-label": "Camera" }, h("option", { value: "" }, "—"));
  for (const r of KNOWN_ROOMS) {
    const opt = h("option", { value: r }, r);
    if (r === item.room) opt.selected = true;
    sel.append(opt);
  }
  return sel;
}

function rowFor(item: ArrivalItem): HTMLLIElement {
  const check = h("input", { type: "checkbox", class: "sel", id: `sel-${item.key}`, "aria-label": `Includi ${item.room ? `camera ${item.room}` : "questa lettera"}` });
  check.checked = item.selected;
  const name = h("input", {
    type: "text",
    class: "name",
    id: `name-${item.key}`,
    value: item.name,
    placeholder: "Nome ospite (facoltativo)",
    autocomplete: "off",
    "aria-label": "Nome sull'intestazione e nel saluto",
  });
  const chips = h("div", { class: "chips" }, ...chipsFor(item).map((c) => h("span", { class: `chip ${c.tone}` }, c.text)));
  const remove = item.manual ? h("button", { type: "button", class: "btn ghost small", "data-act": "remove" }, "Rimuovi") : null;
  const showNote = noteOpen.has(item.key) || item.note.trim() !== "";
  let noteBox: HTMLElement;
  if (showNote) {
    const area = h("textarea", {
      class: "note",
      id: `note-${item.key}`,
      rows: 2,
      maxlength: NOTE_MAX,
      placeholder: "Nota per l'ospite, stampata così come la scrivi (es. Buon compleanno! In camera trovate…)",
      "aria-label": "Nota sulla lettera",
    });
    area.value = item.note;
    noteBox = h(
      "div",
      { class: "note-wrap" },
      area,
      h(
        "div",
        { class: "note-meta" },
        h("span", { class: "note-count", id: `count-${item.key}` }, `${item.note.length}/${NOTE_MAX}`),
        h("button", { type: "button", class: "btn link", "data-act": "note-all" }, "Usa per tutte le selezionate"),
        h("button", { type: "button", class: "btn link", "data-act": "note-clear" }, "Togli nota"),
      ),
    );
  } else {
    noteBox = h("button", { type: "button", class: "btn link add-note", "data-act": "note-open" }, "+ Aggiungi una nota");
  }
  const li = h(
    "li",
    { class: `row${item.key === state.focusKey ? " focused" : ""}${item.selected ? "" : " off"}`, "data-key": item.key },
    h("div", { class: "c-sel" }, check),
    h("div", { class: "c-room" }, roomCell(item)),
    h("div", { class: "c-who" }, name, h("p", { class: "meta" }, metaFor(item)), chips, noteBox),
    h(
      "div",
      { class: "c-lang" },
      langSelect(item),
      h(
        "label",
        { class: "pin-field", for: `pin-${item.key}` },
        "PIN",
        h("input", {
          class: "pin",
          id: `pin-${item.key}`,
          value: item.pin,
          inputmode: "numeric",
          autocomplete: "off",
          maxlength: 4,
          placeholder: "––––",
          "aria-label": "PIN a 4 cifre per il post-it",
        }),
      ),
      remove,
    ),
  );
  return li;
}

function renderList(): void {
  const list = $("rows");
  const empty = $("empty");
  const title = $("list-title");
  title.textContent = state.loadedDate ? `Arrivi di ${longDate(state.loadedDate)}` : "Arrivi";
  if (state.loading && state.items.length === 0) {
    list.replaceChildren(...[0, 1, 2].map(() => h("li", { class: "row skeleton", "aria-hidden": "true" })));
    empty.hidden = true;
    return;
  }
  list.replaceChildren(...state.items.map(rowFor));
  // Vuoto perché non ci sono arrivi, oppure perché i dati non sono stati caricati: due messaggi diversi.
  $("empty-title").textContent = state.loadedDate
    ? "Nessun arrivo allo Chalet Hartmann in questa data"
    : "Arrivi non ancora caricati";
  $("empty-text").textContent = state.loadedDate
    ? "Cambia giorno qui sopra, oppure crea una lettera a mano."
    : "Scegli il giorno e premi Scarica dati, oppure crea una lettera a mano.";
  list.setAttribute("aria-busy", String(state.loading));
  empty.hidden = state.items.length > 0 || state.loading;
  renderSelection();
}

function updateRowChrome(item: ArrivalItem): void {
  const li = document.querySelector<HTMLLIElement>(`li.row[data-key="${CSS.escape(item.key)}"]`);
  if (!li) return;
  li.classList.toggle("off", !item.selected);
  const chips = li.querySelector(".chips");
  chips?.replaceChildren(...chipsFor(item).map((c) => h("span", { class: `chip ${c.tone}` }, c.text)));
}

function setFocus(key: string): void {
  if (state.focusKey === key) return;
  state.focusKey = key;
  document.querySelectorAll<HTMLLIElement>("li.row").forEach((li) => li.classList.toggle("focused", li.dataset.key === key));
  renderPreview();
}

function renderSelection(): void {
  const chosen = state.items.filter((i) => i.selected);
  const n = chosen.length;
  const otherDay = dateChangedNotLoaded();
  $("sel-count").textContent = otherDay
    ? "Hai cambiato giorno: premi Scarica dati prima di creare il PDF"
    : n === 0
      ? "Nessuna lettera selezionata"
      : `${plural(n, "lettera selezionata", "lettere selezionate")}`;
  const all = $<HTMLInputElement>("all");
  all.checked = n > 0 && n === state.items.length;
  all.indeterminate = n > 0 && n < state.items.length;
  all.disabled = state.items.length === 0;
  const btn = $<HTMLButtonElement>("pdf-all");
  btn.disabled = n === 0 || state.busy || state.loading || otherDay;
  btn.textContent = state.busy ? "Creo il PDF…" : n > 1 ? `Crea PDF (${n} lettere)` : "Crea PDF";
}

/** Vero se nel campo data c'è un giorno diverso da quello degli arrivi in elenco. */
function dateChangedNotLoaded(): boolean {
  return state.loadedDate !== null && state.date !== state.loadedDate && state.items.some((i) => !i.manual);
}

function renderToolbar(): void {
  const today = romeDate(0);
  const tomorrow = romeDate(1);
  $("d-today").setAttribute("aria-pressed", String(state.date === today));
  $("d-tomorrow").setAttribute("aria-pressed", String(state.date === tomorrow));
  const input = $<HTMLInputElement>("date");
  if (document.activeElement !== input) input.value = state.date;
  const btn = $<HTMLButtonElement>("refresh");
  btn.disabled = state.loading;
  btn.textContent = state.loading ? "Scarico…" : state.date === state.loadedDate ? "Aggiorna dati" : "Scarica dati";
  const hint = $("date-hint");
  const valid = isIsoDate(state.date);
  hint.hidden = valid && (state.loadedDate === null || state.date === state.loadedDate);
  hint.textContent = valid
    ? `Hai scelto ${longDate(state.date)}: premi “Scarica dati” per caricare gli arrivi di quel giorno.`
    : "Data non valida: usa il formato giorno/mese/anno.";
}

// ——— anteprima ———

function paraEl(p: Paragraph, cls = "p"): HTMLParagraphElement {
  return h("p", { class: cls }, ...p.map((s) => (s.bold ? h("strong", {}, s.text) : s.text)));
}

function blockEl(b: LetterModel["primary"]): HTMLElement {
  return h(
    "div",
    { class: "l-block", lang: b.lang },
    h("h3", { class: "l-head" }, b.headline),
    h("p", { class: "p" }, b.salutation),
    ...b.paragraphs.map((p) => paraEl(p)),
    h("p", { class: "p" }, h("span", { class: "l-muted" }, `${b.wifiLabel}: `), h("strong", {}, b.wifiValue)),
    paraEl(b.emergency),
    h("p", { class: "p l-close" }, b.closing),
  );
}

/** Post-it dell'anteprima: stessa forma del PDF (angolo piegato), caselle vuote se manca il PIN. */
function postItEl(m: LetterModel): HTMLElement {
  const box = h("div", { class: "l-postit", "aria-label": m.pin ? `PIN ${m.pin}` : "PIN da scrivere a mano" });
  box.innerHTML =
    '<svg viewBox="0 0 104 90" aria-hidden="true"><polygon points="0.5,0.5 103.5,0.5 103.5,75 89,89.5 0.5,89.5" fill="#fff" stroke="#000" stroke-width="1"/><polygon points="103.5,75 89,75 89,89.5" fill="#d0d0d0" stroke="#000" stroke-width="0.8"/></svg>';
  const digits = m.pin
    ? h("p", { class: "l-postit-pin" }, m.pin)
    : h("div", { class: "l-postit-boxes" }, h("span", {}), h("span", {}), h("span", {}), h("span", {}));
  box.append(
    h(
      "div",
      { class: "l-postit-text" },
      h("p", { class: "l-postit-label" }, "PIN"),
      digits,
      h("p", { class: "l-postit-room" }, `${m.roomLabel.split(" · ")[0]} ${m.room}`),
    ),
  );
  return box;
}

function focusedItem(): ArrivalItem | null {
  return state.items.find((i) => i.key === state.focusKey) ?? null;
}

function modelFor(item: ArrivalItem): LetterModel | null {
  if (!item.room) return null;
  return buildLetter({
    reservationId: item.reservationId,
    room: item.room,
    guestName: item.name.trim() || null,
    lang: item.lang,
    arrival: item.arrival,
    departure: item.departure,
    note: item.note,
    pin: item.pin,
  });
}

const EXAMPLE = buildLetter({ reservationId: null, room: "107", guestName: null, lang: "de", arrival: null, departure: null });

function renderPreview(): void {
  const item = focusedItem();
  const model = item ? modelFor(item) : EXAMPLE;
  const sheet = $("sheet");
  $<HTMLButtonElement>("pdf-one").disabled = !item || !model || state.busy || (!item.manual && dateChangedNotLoaded());
  $("preview-note").textContent = !item
    ? "Esempio: comparirà la lettera dell'arrivo selezionato."
    : !model
      ? "Scegli la camera per vedere l'anteprima."
      : `Camera ${model.room} · ${TEXTS[model.primary.lang].nameIt}${model.english ? " + inglese" : ""}`;
  if (!model) {
    sheet.replaceChildren(h("div", { class: "l-empty" }, "Nessuna camera scelta"));
    return;
  }
  const m = model;
  sheet.classList.toggle("example", !item);
  sheet.replaceChildren(
    h(
      "div",
      { class: m.note ? "l-page compact" : "l-page" },
      postItEl(m),
      h("img", { class: "l-logo", src: LOGO_BW_URL, alt: "AlpStay" }),
      h("p", { class: "l-hotel" }, m.hotelName),
      h("p", { class: "l-place" }, m.place),
      h(
        "div",
        { class: "l-personal" },
        h("div", { class: "l-guest" }, m.guestName ? h("p", { class: "l-name" }, m.guestName) : null, m.stayLabel ? h("p", { class: "l-stay" }, m.stayLabel) : null),
        h("div", { class: "l-room" }, h("p", { class: "l-room-label" }, m.roomLabel), h("p", { class: "l-room-no" }, m.room)),
      ),
      h("hr", { class: "l-rule" }),
      blockEl(m.primary),
      m.english ? h("p", { class: "l-divider" }, "English") : null,
      m.english ? blockEl(m.english) : null,
      m.note ? h("div", { class: "l-note" }, h("p", { class: "l-note-label" }, m.noteLabel), h("p", { class: "l-note-text" }, m.note)) : null,
      h(
        "div",
        { class: "l-foot" },
        h("div", {}, h("p", { class: "l-sign" }, m.signer), h("p", { class: "l-role" }, m.signerRole)),
        h(
          "div",
          { class: "l-qr" },
          h("div", { class: "l-qr-text" }, h("p", {}, m.qrCaption), m.qrCaptionEnglish ? h("p", { class: "l-muted" }, m.qrCaptionEnglish) : null),
          h("img", { src: QR_URL, alt: "QR informazioni Chalet Hotel Hartmann" }),
        ),
      ),
    ),
  );
  if (!item) sheet.append(h("span", { class: "l-badge" }, "Esempio"));
}

function renderAll(): void {
  renderToolbar();
  renderList();
  renderPreview();
}

// ——— PDF ———

function pdfBlob(models: readonly LetterModel[]): Promise<Blob> {
  const lib = window.pdfMake;
  if (!lib) return Promise.reject(new Error("pdfmake non caricato"));
  return new Promise((resolve, reject) => {
    try {
      lib.createPdf(buildDocDefinition(models, ASSETS), undefined, PDF_FONTS, pdfVfs(ASSETS)).getBlob(resolve);
    } catch (e) {
      reject(e);
    }
  });
}

/** Fuori da claude.ai (file HTML aperto nel browser) il PDF si scarica direttamente. */
function saveDirect(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: filename, class: "sr" });
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

async function makePdf(items: readonly ArrivalItem[], filename: string): Promise<void> {
  const missingRoom = items.filter((i) => !i.room);
  if (missingRoom.length > 0) {
    toast(`Scegli la camera per ${plural(missingRoom.length, "lettera", "lettere")} prima di creare il PDF.`, "error");
    return;
  }
  if (IN_CLAUDE && !state.downloads) state.downloads = (await window.claude.use("downloads")) ?? null;
  if (IN_CLAUDE && !state.downloads) {
    toast("In questa vista non è possibile salvare file. Apri la pagina da claude.ai nel browser o nell'app desktop.", "error");
    return;
  }
  const models = items
    .map(modelFor)
    .filter((m): m is LetterModel => m !== null)
    .sort((a, b) => a.room.localeCompare(b.room, "it", { numeric: true }));

  state.busy = true;
  renderSelection();
  $<HTMLButtonElement>("pdf-one").disabled = true;
  try {
    const blob = await pdfBlob(models);
    if (state.downloads) await state.downloads.save({ filename, data: blob });
    else saveDirect(blob, filename);
    toast(models.length === 1 ? "PDF salvato: 1 lettera" : `PDF salvato: ${models.length} lettere, una pagina A4 per camera`, "info");
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === "declined") toast("Salvataggio annullato.");
    else if (code === "rate_limited") toast("C'è già una richiesta di salvataggio aperta: confermala o chiudila.", "warn");
    else if (code === "unavailable" || code === "not_granted" || code === "capability_disabled")
      toast("In questa vista non è possibile salvare file. Apri la pagina da claude.ai nel browser o nell'app desktop.", "error");
    else if (e instanceof Error && e.message.includes("pdfmake"))
      toast("Il generatore PDF non si è caricato. Ricarica la pagina.", "error");
    else toast("Non sono riuscito a creare il PDF. Riprova.", "error");
  } finally {
    state.busy = false;
    renderSelection();
    renderPreview();
  }
}

// ——— eventi ———

function itemFromEvent(e: Event): ArrivalItem | null {
  const li = (e.target as HTMLElement).closest<HTMLLIElement>("li.row");
  return li ? (state.items.find((i) => i.key === li.dataset.key) ?? null) : null;
}

function wire(): void {
  $("d-today").addEventListener("click", () => {
    state.date = romeDate(0);
    void load();
  });
  $("d-tomorrow").addEventListener("click", () => {
    state.date = romeDate(1);
    void load();
  });
  const dateInput = $<HTMLInputElement>("date");
  const syncDate = (): void => {
    state.date = dateInput.value;
    renderToolbar();
    renderSelection();
  };
  dateInput.addEventListener("input", syncDate);
  dateInput.addEventListener("change", syncDate);
  dateInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      syncDate();
      void load();
    }
  });
  $<HTMLFormElement>("unlock").addEventListener("submit", (e) => {
    e.preventDefault();
    const pw = $<HTMLInputElement>("pw").value.trim();
    if (pw) void unlock(pw);
  });
  $("refresh").addEventListener("click", () => {
    state.date = dateInput.value || state.date;
    void load();
  });

  const list = $("rows");
  list.addEventListener("click", (e) => {
    const item = itemFromEvent(e);
    if (!item) return;
    const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
    if (act === "remove") {
      state.items = state.items.filter((i) => i.key !== item.key);
      if (state.focusKey === item.key) state.focusKey = state.items[0]?.key ?? null;
      renderList();
      renderPreview();
      return;
    }
    if (act === "note-open") {
      noteOpen.add(item.key);
      state.focusKey = item.key;
      renderList();
      renderPreview();
      document.getElementById(`note-${item.key}`)?.focus();
      return;
    }
    if (act === "note-clear") {
      item.note = "";
      noteOpen.delete(item.key);
      saveEdit(item, { note: "" });
      state.focusKey = item.key;
      renderList();
      renderPreview();
      return;
    }
    if (act === "note-all") {
      const targets = state.items.filter((i) => i.selected && i.key !== item.key);
      for (const t of targets) {
        t.note = item.note;
        saveEdit(t, { note: item.note });
      }
      renderList();
      renderPreview();
      toast(targets.length ? `Nota copiata su altre ${plural(targets.length, "lettera", "lettere")}.` : "Seleziona prima le altre lettere.", targets.length ? "info" : "warn");
      return;
    }
    setFocus(item.key);
  });
  list.addEventListener("focusin", (e) => {
    const item = itemFromEvent(e);
    if (item) setFocus(item.key);
  });
  list.addEventListener("input", (e) => {
    const item = itemFromEvent(e);
    const target = e.target as HTMLElement;
    if (!item) return;
    if (target.classList.contains("name")) {
      item.name = (target as HTMLInputElement).value;
      saveEdit(item, { name: item.name });
    } else if (target.classList.contains("pin")) {
      const input = target as HTMLInputElement;
      const digits = input.value.replace(/\D/g, "").slice(0, 4);
      if (input.value !== digits) input.value = digits;
      item.pin = digits;
      saveEdit(item, { pin: digits });
      updateRowChrome(item);
    } else if (target.classList.contains("note")) {
      item.note = (target as HTMLTextAreaElement).value.slice(0, NOTE_MAX);
      saveEdit(item, { note: item.note });
      const count = document.getElementById(`count-${item.key}`);
      if (count) count.textContent = `${item.note.length}/${NOTE_MAX}`;
      updateRowChrome(item);
    } else return;
    if (item.key === state.focusKey) renderPreview();
  });
  list.addEventListener("change", (e) => {
    const item = itemFromEvent(e);
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    if (!item) return;
    if (target.classList.contains("sel")) {
      item.selected = (target as HTMLInputElement).checked;
      updateRowChrome(item);
      renderSelection();
    } else if (target.classList.contains("lang")) {
      item.lang = target.value as LangCode;
      item.langSource = "manuale";
      saveEdit(item, { lang: item.lang });
      updateRowChrome(item);
    } else if (target.classList.contains("room-sel")) {
      item.room = target.value || null;
      updateRowChrome(item);
    }
    setFocus(item.key);
    renderPreview();
  });

  $<HTMLInputElement>("all").addEventListener("change", (e) => {
    const on = (e.target as HTMLInputElement).checked;
    state.items.forEach((i) => (i.selected = on));
    renderList();
  });

  $("add-manual").addEventListener("click", () => {
    const key = `manuale-${++state.manualSeq}`;
    state.items.push({
      key,
      reservationId: null,
      room: null,
      arrival: null,
      departure: null,
      adults: 0,
      children: 0,
      isOption: false,
      inHouse: false,
      manual: true,
      rawLang: null,
      langNote: null,
      langSource: "manuale",
      name: "",
      note: "",
      pin: "",
      lang: "de",
      selected: true,
    });
    state.focusKey = key;
    renderList();
    renderPreview();
    document.getElementById(`room-${key}`)?.focus();
  });

  $("pdf-all").addEventListener("click", () => {
    const chosen = state.items.filter((i) => i.selected);
    if (chosen.length === 0) return;
    const name = chosen.length === 1 && chosen[0].room
      ? `Benvenuto Hartmann camera ${chosen[0].room}.pdf`
      : `Lettere benvenuto Hartmann ${state.date}.pdf`;
    void makePdf(chosen, name);
  });
  $("pdf-one").addEventListener("click", () => {
    const item = focusedItem();
    if (item) void makePdf([item], `Benvenuto Hartmann camera ${item.room ?? ""}.pdf`.replace(" .pdf", ".pdf"));
  });
}

// ——— avvio ———

function start(): void {
  $<HTMLImageElement>("brand-logo").src = LOGO_URL;
  $("server-name").textContent = SERVER;
  $("hotel-facts").replaceChildren(
    h("span", {}, `Wi-Fi ${HOTEL.wifiPassword}`),
    h("span", {}, `Emergenze ${HOTEL.emergencyPhone}`),
    h("span", {}, `Colazione ${HOTEL.breakfastFrom}–${HOTEL.breakfastTo} · Sauna fino alle 21:00`),
  );
  wire();
  renderAll();
  void load();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
