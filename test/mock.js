// Finto window.claude per il test locale: dati inventati, nessun ospite reale.
(function () {
  const P = "22222222-2222-4222-8222-222222222222";
  const fresh = { overall: { status: "fresh" }, sources: [{ property_id: P, resource: "lodging_reservation", last_success_at: new Date(Date.now() - 120000).toISOString(), status: "fresh" }] };
  const row = (id, room, arr, dep, extra) => Object.assign({ reservation_id: id, order_id: "o-" + id, property_id: P, property_name: "Hartmann", arrival: arr, departure: dep, lodging_id: "l-" + id, lodging_type_id: "t", room_name: room, adults: 2, children: 0, is_option: false, is_overbooking: false, booking_status: "CONFIRMED", stay_status: "TO_ARRIVE" }, extra || {});
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  const arrivals = [
    row("r1", "101", today, "2026-10-16"),
    row("r2", "105", today, "2026-10-15", { children: 1 }),
    row("r3", "119", today, "2026-10-14"),
    row("r4", "121", today, "2026-10-18"),
    row("r5", "107", today, "2026-10-15", { is_option: true }),
    row("r6", null, today, "2026-10-15"),
    Object.assign(row("x1", "212", today, "2026-10-15"), { property_name: "Hotel Acadia", property_id: "11111111-1111-4111-8111-111111111111" }),
  ];
  const stays = [
    { reservation_id: "r1", guest_type: "HEAD_OF_HOUSEHOLD", is_primary_guest: null, first_name: "ESEMPIO", last_name: "MUSTERMANN", language: "de", identity_document: { number: "XX" } },
    { reservation_id: "r1", guest_type: "HOUSEHOLD_MEMBER", is_primary_guest: null, first_name: "Altro", last_name: "Membro", language: "it" },
    { reservation_id: "r4", guest_type: "HEAD_OF_HOUSEHOLD", is_primary_guest: null, first_name: "Test", last_name: "Janssen", language: "it" },
  ];
  const contacts = [
    { reservation_id: "r1", booker_type: "INDIVIDUAL", first_name: "Esempio", last_name: "Mustermann", language: "de", checkin_url: "https://secret" },
    { reservation_id: "r2", booker_type: "INDIVIDUAL", first_name: "sample", last_name: "guest", language: "en" },
    { reservation_id: "r3", booker_type: "INDIVIDUAL", first_name: "Prova", last_name: "Prova", language: "th" },
    { reservation_id: "r4", booker_type: "INDIVIDUAL", first_name: "Test", last_name: "Janssen", language: "nl" },
    { reservation_id: "r5", booker_type: "COMPANY", first_name: null, last_name: null, language: null, company_language: "pl" },
  ];
  window.__calls = [];
  const mcp = {
    async callTool(server, tool, input) {
      window.__calls.push({ server, tool, input });
      await new Promise((r) => setTimeout(r, 150));
      if (tool === "list_arrivals") return { content: [], payload: { data: arrivals, freshness: fresh, page: { returned: arrivals.length, truncated: false, next_cursor: null } } };
      const ids = input.filters[0].value;
      const src = input.view === "curated_guest_stays" ? stays : contacts;
      const data = src.filter((r) => ids.includes(r.reservation_id));
      return { content: [{ type: "text", text: JSON.stringify({ data, freshness: fresh, page: { returned: data.length, truncated: false, next_cursor: null } }) }], payload: JSON.stringify({ data, freshness: fresh, page: { returned: data.length, truncated: false, next_cursor: null } }) };
    },
  };
  const downloads = {
    async save({ filename, data }) {
      const buf = await data.arrayBuffer();
      let s = ""; const b = new Uint8Array(buf);
      for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      window.__saved = { filename, size: b.length, b64: btoa(s) };
      return { status: "saved" };
    },
  };
  window.claude = { use: async (n) => (n === "mcp" ? mcp : n === "downloads" ? downloads : null) };
})();
