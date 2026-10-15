// Configurazione dell'accesso a La Scatola da GitHub (file pubblico scatola-client.json: nessun segreto).

export const CLIENT_FILE = "scatola-client.json";

export interface ScatolaClient {
  /** Assegnato dall'amministratore della Scatola; vuoto finché non c'è. */
  readonly client_id: string;
  readonly mcp_url: string;
  readonly authorize_url: string;
  readonly token_url: string;
  readonly scope: string;
  /** Indicatore di risorsa OAuth (RFC 8707); vuoto per non inviarlo. */
  readonly resource: string;
}

/** https, oppure http solo verso questo computer (prove locali). */
const isHttps = (v: unknown): v is string =>
  typeof v === "string" && /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/)\S+$/.test(v);

/** Controlla il contenuto del file; lancia un errore leggibile se manca qualcosa. */
export function parseClient(v: unknown): ScatolaClient {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  for (const k of ["mcp_url", "authorize_url", "token_url"] as const) {
    if (!isHttps(o[k])) throw new Error(`${CLIENT_FILE}: ${k} mancante o non valido`);
  }
  return {
    client_id: typeof o.client_id === "string" ? o.client_id.trim() : "",
    mcp_url: o.mcp_url as string,
    authorize_url: o.authorize_url as string,
    token_url: o.token_url as string,
    scope: typeof o.scope === "string" && o.scope.trim() ? o.scope.trim() : "openid",
    resource: isHttps(o.resource) ? o.resource : "",
  };
}

export interface TokenResponse {
  readonly access_token: string;
  readonly refresh_token: string | null;
  readonly expires_in: number | null;
}

/** Risposta dell'endpoint token; mai riportare il contenuto nei messaggi d'errore (i registri di GitHub sono pubblici). */
export async function readTokenResponse(res: Response): Promise<TokenResponse> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* corpo non JSON */
  }
  if (!res.ok || typeof body.access_token !== "string") {
    const code = typeof body.error === "string" ? body.error.replace(/[^\w.-]/g, "").slice(0, 40) : "";
    throw new Error(`La Scatola ha rifiutato l'accesso (HTTP ${res.status}${code ? `, ${code}` : ""})`);
  }
  return {
    access_token: body.access_token,
    refresh_token: typeof body.refresh_token === "string" ? body.refresh_token : null,
    expires_in: typeof body.expires_in === "number" ? body.expires_in : null,
  };
}
