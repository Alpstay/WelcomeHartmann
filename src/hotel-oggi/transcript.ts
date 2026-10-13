// Lettura delle chiamate a La Scatola dal registro della sessione (~/.claude/projects/…/*.jsonl).
// Le risposte non passano mai per le mani di chi esegue la procedura: così gli ID restano quelli ricevuti.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { Freshness } from "../types";

export type ScatolaTool = "list_arrivals" | "list_departures" | "list_in_house" | "query_curated_view";
const TOOLS: readonly ScatolaTool[] = ["list_arrivals", "list_departures", "list_in_house", "query_curated_view"];

export interface Page {
  readonly data: readonly Record<string, unknown>[];
  readonly freshness: Freshness;
  readonly next: string | null;
}

export interface Call {
  readonly id: string;
  readonly at: string;
  readonly tool: ScatolaTool;
  readonly input: Record<string, unknown>;
  page: Page | null;
  error: string | null;
}

export const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** JSON con le chiavi in ordine: due chiamate con gli stessi argomenti danno lo stesso testo. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (isRec(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

export function transcripts(): { path: string; mtime: number }[] {
  const found: { path: string; mtime: number }[] = [];
  const walk = (dir: string, depth: number): void => {
    let names: string[] = [];
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
        /* file sparito nel frattempo */
      }
    }
  };
  walk(join(homedir(), ".claude", "projects"), 0);
  return found.sort((a, b) => b.mtime - a.mtime);
}

/** Il registro che contiene il segno stampato da `start`; null se non c'è. */
export function findTranscript(token: string): string | null {
  for (const t of transcripts()) {
    try {
      if (readFileSync(t.path, "utf8").includes(token)) return t.path;
    } catch {
      /* illeggibile: si passa al prossimo */
    }
  }
  return null;
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((b) => (isRec(b) && typeof b.text === "string" ? b.text : "")).join("");
  return "";
}

const SAVED_PATH = /saved to:?\s+(\/\S+?\.(?:txt|json))(?=[.,;)\s]|$)/i;

function asPage(v: unknown, depth = 0): Page | null {
  if (typeof v === "string") {
    const t = v.trim();
    if (depth > 3 || !/^[{["]/.test(t)) return null;
    try {
      return asPage(JSON.parse(t), depth + 1);
    } catch {
      return null;
    }
  }
  if (Array.isArray(v)) return asPage(v.map((b) => (isRec(b) && typeof b.text === "string" ? b.text : "")).join(""), depth + 1);
  if (!isRec(v) || !Array.isArray(v.data)) return null;
  const page = isRec(v.page) ? v.page : {};
  const fresh = isRec(v.freshness) ? (v.freshness as unknown as Freshness) : { overall: { status: "unavailable" as const }, sources: [] };
  return { data: v.data as Record<string, unknown>[], freshness: fresh, next: typeof page.next_cursor === "string" ? page.next_cursor : null };
}

export function parseResult(body: string, isError: boolean): { page: Page | null; error: string | null } {
  const raw = body.trim();
  if (isError) return { page: null, error: raw.replace(/\s+/g, " ").slice(0, 160) || "errore dello strumento" };
  let page = asPage(raw);
  if (!page) {
    const saved = SAVED_PATH.exec(raw);
    if (saved) {
      if (!existsSync(saved[1])) return { page: null, error: `file della risposta non trovato (${basename(saved[1])})` };
      page = asPage(readFileSync(saved[1], "utf8"));
    }
  }
  return page ? { page, error: null } : { page: null, error: `risposta non riconosciuta (${raw.length} caratteri)` };
}

/** Tutte le chiamate a La Scatola fatte dopo `since`, con la loro risposta. */
export function readCalls(transcript: string, since: string): Call[] {
  const byId = new Map<string, Call>();
  for (const line of readFileSync(transcript, "utf8").split("\n")) {
    if (!line || (!line.includes("Scatola") && !line.includes("tool_result"))) continue;
    let o: unknown;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRec(o) || !isRec(o.message) || !Array.isArray(o.message.content)) continue;
    const at = typeof o.timestamp === "string" ? o.timestamp : "";
    for (const block of o.message.content as unknown[]) {
      if (!isRec(block)) continue;
      if (block.type === "tool_use" && typeof block.name === "string" && /scatola/i.test(block.name) && typeof block.id === "string" && isRec(block.input)) {
        const name = block.name;
        const tool = TOOLS.find((t) => name.endsWith(t)) ?? null;
        if (tool && at >= since) byId.set(block.id, { id: block.id, at, tool, input: block.input, page: null, error: "nessuna risposta" });
      } else if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
        const call = byId.get(block.tool_use_id);
        if (call) Object.assign(call, parseResult(resultText(block.content), block.is_error === true));
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at));
}

export interface Chain {
  readonly rows: Record<string, unknown>[];
  readonly freshness: Freshness[];
  /** Argomenti della prossima chiamata da fare; null = lettura completa. */
  readonly next: Record<string, unknown> | null;
  readonly failures: number;
  readonly lastError: string | null;
}

/** Ricompone una lettura a pagine: prima pagina senza cursore, poi i cursori in ordine. */
export function follow(calls: readonly Call[], tool: ScatolaTool, first: Record<string, unknown>): Chain {
  const want = canonical(first);
  const mine = calls.filter((c) => {
    if (c.tool !== tool) return false;
    const rest: Record<string, unknown> = { ...c.input };
    delete rest.cursor;
    return canonical(rest) === want;
  });
  const lastError = mine.filter((c) => c.error).pop()?.error ?? null;
  const starts = mine.filter((c) => !c.input.cursor);
  const ok = starts.filter((c) => c.page).pop();
  if (!ok) return { rows: [], freshness: [], next: first, failures: starts.length, lastError };
  const rows: Record<string, unknown>[] = [];
  const freshness: Freshness[] = [];
  let cur: Call = ok;
  for (let guard = 0; guard < 200; guard++) {
    rows.push(...cur.page!.data);
    freshness.push(cur.page!.freshness);
    const cursor = cur.page!.next;
    if (!cursor) return { rows, freshness, next: null, failures: 0, lastError };
    const tries = mine.filter((c) => c.input.cursor === cursor && c.at >= ok.at);
    const good = tries.filter((c) => c.page).pop();
    if (!good) return { rows, freshness, next: { ...first, cursor }, failures: tries.length, lastError };
    cur = good;
  }
  throw new Error("la lettura a pagine non termina");
}
