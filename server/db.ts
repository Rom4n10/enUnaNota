/**
 * Minimal Supabase (PostgREST) client. Only the server talks to the database,
 * using the service_role key; when the env vars are missing every caller falls
 * back to in-memory behaviour so local dev works without a database.
 */
type Config = { url: string; headers: Record<string, string> };

function loadConfig(): Config | null {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const headers: Record<string, string> = { apikey: key, "content-type": "application/json" };
  // New `sb_secret_` keys are not JWTs and must not be sent as a bearer token.
  if (!key.startsWith("sb_")) headers.authorization = `Bearer ${key}`;
  return { url: `${url}/rest/v1`, headers };
}

const config = loadConfig();

export const dbEnabled = config !== null;

type Options = { method?: string; body?: unknown; prefer?: string };

async function call(path: string, { method = "GET", body, prefer }: Options = {}): Promise<Response> {
  if (!config) throw new Error("supabase_disabled");
  const res = await fetch(`${config.url}/${path}`, {
    method,
    headers: prefer ? { ...config.headers, prefer } : config.headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`);
  return res;
}

export async function select<T>(table: string, query: URLSearchParams): Promise<T[]> {
  const res = await call(`${table}?${query}`);
  return (await res.json()) as T[];
}

export async function insert<T>(table: string, row: Record<string, unknown>): Promise<T> {
  const res = await call(table, { method: "POST", body: row, prefer: "return=representation" });
  const rows = (await res.json()) as T[];
  return rows[0];
}

export async function insertQuiet(table: string, row: Record<string, unknown>): Promise<void> {
  await call(table, { method: "POST", body: row, prefer: "return=minimal" });
}

export async function count(table: string, query: URLSearchParams): Promise<number> {
  query.set("select", "id");
  query.set("limit", "1");
  const res = await call(`${table}?${query}`, { prefer: "count=exact" });
  const total = res.headers.get("content-range")?.split("/")[1];
  return Number(total ?? 0);
}

export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await call(`rpc/${fn}`, { method: "POST", body: args });
  return (await res.json()) as T;
}
