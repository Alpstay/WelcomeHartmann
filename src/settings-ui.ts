// Menu Impostazioni: modifica di tutti i testi (dati dell'hotel, lettera in 13 lingue, messaggio WhatsApp).
// Ogni modifica si salva subito nel browser e si vede subito nell'anteprima; «Ripristina» torna al testo predefinito.

import { HOTEL_DEFAULTS } from "./hotel";
import type { HotelEditable } from "./hotel";
import { applySettings, changedCount, compact, emptySettings, exportSettings, loadSettings, parseSettings, saveSettings } from "./settings";
import type { LetterKey, TextSettings } from "./settings";
import { LANG_NAMES, LANG_ORDER, LETTER_DEFAULTS } from "./texts";
import type { LangCode } from "./types";
import { WA_PLACEHOLDERS, defaultWhatsappTemplate, welcomeWhatsappText } from "./whatsapp-welcome";
import type { WelcomeInput } from "./whatsapp-welcome";

type Tab = "hotel" | "lettera" | "whatsapp";

export interface SettingsContext {
  /** Dopo ogni modifica: anteprima, elenco e intestazione si aggiornano. */
  readonly onChange: () => void;
  /** Dati della camera selezionata per l'anteprima del WhatsApp (o un esempio). */
  readonly sample: () => WelcomeInput;
  readonly toast: (text: string, tone?: "neutral" | "info" | "warn" | "error") => void;
}

const HOTEL_FIELDS: readonly { key: HotelEditable; label: string; hint?: string; time?: boolean }[] = [
  { key: "wifiPassword", label: "Password Wi-Fi", hint: "Lettera ({wifi} nel WhatsApp) e intestazione della pagina." },
  { key: "emergencyPhone", label: "Numero per le emergenze", hint: "Lettera ({telefono}) e WhatsApp." },
  { key: "breakfastFrom", label: "Colazione dalle", hint: "Formato H:MM, es. 8:00. Nella lettera è scritto secondo la lingua (8 am, 8 h…).", time: true },
  { key: "breakfastTo", label: "Colazione alle", hint: "Formato H:MM, es. 10:30.", time: true },
  { key: "signer", label: "Firma della lettera" },
  { key: "signerRole", label: "Ruolo sotto la firma" },
];

const LETTER_FIELDS: readonly { key: LetterKey; label: string; needs?: readonly string[]; hint?: string }[] = [
  { key: "headline", label: "Titolo" },
  { key: "salutation", label: "Saluto con il nome", hint: "{nome} = nome dell'ospite. Vuoto: si usa sempre il saluto senza nome." },
  { key: "salutationNoName", label: "Saluto senza nome" },
  { key: "intro", label: "Frase di benvenuto" },
  { key: "roomFirst", label: "Camera al 1° piano", needs: ["camera"], hint: "{camera} = numero della camera, in grassetto." },
  { key: "roomSecond", label: "Camera al 2° piano", needs: ["camera"] },
  { key: "roomGarden", label: "Camera al piano giardino", needs: ["camera"] },
  { key: "roomOther", label: "Camera non in elenco (senza piano)", needs: ["camera"] },
  { key: "home", label: "Sentirsi a casa" },
  { key: "bar", label: "Bar self-service" },
  { key: "breakfast", label: "Colazione", needs: ["dalle", "alle"], hint: "{dalle} {alle} = orari da Impostazioni › Hotel." },
  { key: "sauna", label: "Sauna" },
  { key: "wifiLabel", label: "Etichetta della password Wi-Fi" },
  { key: "emergency", label: "Emergenze", needs: ["telefono"], hint: "{telefono} = numero da Impostazioni › Hotel, in grassetto." },
  { key: "closing", label: "Augurio finale" },
  { key: "qr", label: "Didascalia del QR" },
  { key: "noteLabel", label: "Titolino della nota" },
  { key: "roomLabel", label: "Parola «Camera» (intestazione e post-it)" },
];

const SAVE_FAIL = "Il browser non permette di salvare: le modifiche valgono fino alla chiusura della pagina.";

type Attrs = Record<string, string | number | boolean | undefined>;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string | null)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "class") e.className = String(v);
    else if (v === true) e.setAttribute(k, "");
    else e.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null) e.append(c);
  return e;
}

/** Segnaposto obbligatori che mancano in un testo. */
const missing = (text: string, needs: readonly string[] = []): string[] => needs.filter((n) => !text.includes(`{${n}}`));

export function setupSettings(ctx: SettingsContext): { readonly count: () => number } {
  let settings: TextSettings = loadSettings();
  applySettings(settings);
  let tab: Tab = "lettera";
  let lang: LangCode = "en";
  let resetArmed = false;

  const dialog = document.getElementById("settings") as HTMLDialogElement;
  const box = document.getElementById("set-box")!;
  const openBtn = document.getElementById("settings-open") as HTMLButtonElement;

  const syncButton = (): void => {
    const n = changedCount(settings);
    openBtn.textContent = n ? `Impostazioni · ${n} ${n === 1 ? "modifica" : "modifiche"}` : "Impostazioni";
  };

  const commit = (): void => {
    settings = compact(settings);
    if (!saveSettings(settings)) ctx.toast(SAVE_FAIL, "warn");
    applySettings(settings);
    ctx.onChange();
    syncButton();
    const c = box.querySelector(".set-count");
    if (c) c.textContent = countText();
    renderWaPreview();
  };

  const countText = (): string => {
    const n = changedCount(settings);
    return n === 0 ? "Tutti i testi sono quelli predefiniti" : `${n} ${n === 1 ? "testo cambiato" : "testi cambiati"} su questo computer`;
  };

  // ——— campi ———

  function field(opts: {
    id: string;
    label: string;
    value: string;
    def: string;
    rows?: number;
    hint?: string;
    check?: (v: string) => string | null;
    set: (v: string | null) => void;
    input?: boolean;
  }): HTMLElement {
    const ctrl = opts.input
      ? el("input", { id: opts.id, class: "set-input", value: opts.value, autocomplete: "off", spellcheck: "false" })
      : el("textarea", { id: opts.id, class: "set-text", rows: opts.rows ?? Math.min(6, Math.max(2, Math.ceil(opts.value.length / 90))), dir: "auto", spellcheck: "false" });
    if (ctrl instanceof HTMLTextAreaElement) ctrl.value = opts.value;
    const reset = el("button", { type: "button", class: "btn link set-reset", hidden: opts.value === opts.def }, "Ripristina");
    const warn = el("p", { class: "set-warn", hidden: true });
    const showWarn = (v: string): void => {
      const w = opts.check?.(v) ?? null;
      warn.hidden = !w;
      warn.textContent = w ?? "";
    };
    showWarn(opts.value);
    ctrl.addEventListener("input", () => {
      const v = (ctrl as HTMLInputElement | HTMLTextAreaElement).value;
      opts.set(v === opts.def ? null : v);
      reset.hidden = v === opts.def;
      showWarn(v);
      commit();
    });
    reset.addEventListener("click", () => {
      (ctrl as HTMLInputElement | HTMLTextAreaElement).value = opts.def;
      opts.set(null);
      reset.hidden = true;
      showWarn(opts.def);
      commit();
    });
    return el(
      "div",
      { class: "set-field" },
      el("div", { class: "set-label" }, el("label", { for: opts.id }, opts.label), reset),
      ctrl,
      opts.hint ? el("p", { class: "set-hint" }, opts.hint) : null,
      warn,
    );
  }

  // ——— schede ———

  const hotelBody = (): HTMLElement[] =>
    HOTEL_FIELDS.map((f) =>
      field({
        id: `set-h-${f.key}`,
        label: f.label,
        value: settings.hotel[f.key] ?? HOTEL_DEFAULTS[f.key],
        def: HOTEL_DEFAULTS[f.key],
        hint: f.hint,
        input: true,
        check: (v) => (f.time && !/^\d{1,2}:\d{2}$/.test(v.trim()) ? "Scrivi l'orario come 8:00: finché non è giusto resta quello predefinito." : !v.trim() ? "Vuoto: resta il valore predefinito." : null),
        set: (v) => {
          const hotel = { ...settings.hotel };
          if (v === null) delete hotel[f.key];
          else hotel[f.key] = v;
          settings = { ...settings, hotel };
        },
      }),
    );

  const letterBody = (): HTMLElement[] =>
    LETTER_FIELDS.map((f) => {
      const def = LETTER_DEFAULTS[lang][f.key];
      return field({
        id: `set-l-${lang}-${f.key}`,
        label: f.label,
        value: settings.letter[lang]?.[f.key] ?? def,
        def,
        hint: f.hint,
        check: (v) => {
          const m = missing(v, f.needs);
          return m.length ? `Manca ${m.map((x) => `{${x}}`).join(" ")}: senza, quel dato non compare nella lettera.` : null;
        },
        set: (v) => {
          const mine = { ...(settings.letter[lang] ?? {}) };
          if (v === null) delete mine[f.key];
          else mine[f.key] = v;
          settings = { ...settings, letter: { ...settings.letter, [lang]: mine } };
        },
      });
    });

  let waPreview: HTMLElement | null = null;
  function renderWaPreview(): void {
    if (!waPreview) return;
    waPreview.textContent = welcomeWhatsappText({ ...ctx.sample(), lang });
  }

  const whatsappBody = (): HTMLElement[] => {
    const def = defaultWhatsappTemplate(lang);
    waPreview = el("pre", { class: "set-preview", dir: "auto" });
    const s = ctx.sample();
    const legend = el(
      "ul",
      { class: "set-legend" },
      ...WA_PLACEHOLDERS.map((p) => el("li", {}, el("code", {}, `{${p.key}}`), ` ${p.what}`)),
    );
    const out = [
      field({
        id: `set-w-${lang}`,
        label: `Messaggio WhatsApp in ${LANG_NAMES[lang].toLowerCase()}`,
        value: settings.whatsapp[lang] ?? def,
        def,
        rows: 18,
        hint: "*parola* = grassetto su WhatsApp. Le righe con {pin} o {camera} spariscono se il PIN o la camera mancano.",
        set: (v) => {
          const whatsapp = { ...settings.whatsapp };
          if (v === null) delete whatsapp[lang];
          else whatsapp[lang] = v;
          settings = { ...settings, whatsapp };
        },
      }),
      el("details", { class: "set-details" }, el("summary", {}, "Segnaposto disponibili"), legend),
      el(
        "div",
        { class: "set-field" },
        el("p", { class: "set-label" }, `Anteprima · camera ${s.room ?? "—"}${s.name ? ` · ${s.name}` : ""}${s.pin ? ` · PIN ${s.pin}` : ""}`),
        waPreview,
      ),
    ];
    renderWaPreview();
    return out;
  };

  function render(): void {
    const tabs = el(
      "div",
      { class: "set-tabs", role: "tablist" },
      ...(
        [
          ["hotel", "Hotel"],
          ["lettera", "Lettera"],
          ["whatsapp", "WhatsApp"],
        ] as const
      ).map(([k, label]) => el("button", { type: "button", class: `set-tab${tab === k ? " on" : ""}`, role: "tab", "aria-selected": String(tab === k), "data-tab": k }, label)),
    );
    const langSel = el("select", { class: "lang set-lang", "aria-label": "Lingua dei testi", hidden: tab === "hotel" });
    for (const code of LANG_ORDER) {
      const changed = tab === "lettera" ? Object.keys(compact(settings).letter[code] ?? {}).length > 0 : tab === "whatsapp" && compact(settings).whatsapp[code] !== undefined;
      const opt = el("option", { value: code }, `${LANG_NAMES[code]}${changed ? " · modificato" : ""}`);
      if (code === lang) opt.selected = true;
      langSel.append(opt);
    }
    langSel.addEventListener("change", () => {
      lang = langSel.value as LangCode;
      render();
    });
    const body = el("div", { class: "set-body" }, ...(tab === "hotel" ? hotelBody() : tab === "lettera" ? letterBody() : whatsappBody()));
    const file = el("input", { type: "file", accept: ".json,application/json", hidden: true });
    file.addEventListener("change", () => void importFile(file));
    const resetAll = el("button", { type: "button", class: "btn ghost", "data-set": "reset-all" }, resetArmed ? "Conferma: ripristina tutti i testi" : "Ripristina tutto");
    box.replaceChildren(
      el("div", { class: "wa-head" }, el("h2", { id: "set-title" }, "Impostazioni testi"), el("button", { type: "button", class: "btn ghost small", "data-set": "close" }, "Chiudi")),
      el("p", { class: "wa-sub" }, "Le modifiche si salvano subito e valgono su questo computer. Per usarle su un altro computer della reception: Esporta qui e Importa là."),
      tabs,
      el("div", { class: "set-tools" }, langSel, el("span", { class: "set-count" }, countText())),
      body,
      el(
        "div",
        { class: "wa-actions" },
        el("button", { type: "button", class: "btn ghost", "data-set": "export" }, "Esporta"),
        el("button", { type: "button", class: "btn ghost", "data-set": "import" }, "Importa"),
        resetAll,
        file,
      ),
    );
  }

  async function importFile(input: HTMLInputElement): Promise<void> {
    const f = input.files?.[0];
    input.value = "";
    if (!f) return;
    let parsed: TextSettings | null = null;
    try {
      parsed = parseSettings(JSON.parse(await f.text()));
    } catch {
      parsed = null;
    }
    if (!parsed) {
      ctx.toast("Il file non contiene impostazioni dei testi valide.", "error");
      return;
    }
    settings = parsed;
    commit();
    render();
    ctx.toast(`Importate ${changedCount(settings)} modifiche ai testi.`, "info");
  }

  function exportFile(): void {
    const blob = new Blob([exportSettings(settings)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: `impostazioni-testi-hartmann-${new Date().toISOString().slice(0, 10)}.json`, class: "sr" });
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 15_000);
  }

  box.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const tabBtn = t.closest<HTMLElement>("[data-tab]");
    if (tabBtn) {
      tab = tabBtn.dataset.tab as Tab;
      resetArmed = false;
      render();
      return;
    }
    const act = t.closest<HTMLElement>("[data-set]")?.dataset.set;
    if (act === "close") dialog.close();
    else if (act === "export") exportFile();
    else if (act === "import") box.querySelector<HTMLInputElement>('input[type="file"]')?.click();
    else if (act === "reset-all") {
      if (!resetArmed) {
        resetArmed = true;
        render();
        return;
      }
      resetArmed = false;
      settings = emptySettings();
      commit();
      render();
      ctx.toast("Tutti i testi sono tornati quelli predefiniti.", "info");
    }
  });

  openBtn.addEventListener("click", () => {
    resetArmed = false;
    // Si apre sulla lingua della camera selezionata.
    lang = ctx.sample().lang;
    render();
    dialog.showModal();
  });
  dialog.addEventListener("close", () => {
    resetArmed = false;
    ctx.onChange();
  });
  syncButton();
  return { count: () => changedCount(settings) };
}
