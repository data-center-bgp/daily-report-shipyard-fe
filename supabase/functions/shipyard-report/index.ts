// Read-only JSON API over this project's data, for people who only need to
// fetch it (no accounts, no app login). See README.md in this folder.
//
//   GET /functions/v1/shipyard-report                       -> schemas your key can read
//   GET /functions/v1/shipyard-report/<schema>              -> its tables, columns, row counts
//   GET /functions/v1/shipyard-report/<schema>/<table>      -> that table's rows, paged
//        ?limit=1000        rows per page (max 5000)
//        &offset=0          where to start
//        &updated_since=... ISO date/time, only rows created or changed after it
//        &include_deleted=true   also return soft-deleted rows (default: hidden)
//
// Auth is a key of its own in the x-api-key header (or "Authorization:
// Bearer <key>"). Each key is tied to the schemas it may read, and each schema
// is read through its own database role (data_api_ro_<schema>) that the
// database itself restricts to SELECT — so even a bug here can't write, and
// a key can't reach a schema it wasn't given.
//
// Two kinds of key:
//   * Permanent keys, listed in the DATA_API_CONFIG secret (JSON):
//       {
//         "schemas": { "daily_report_shipyard": { "db_url": "postgresql://..." } },
//         "keys":    [ { "name": "supervisor", "key": "...", "schemas": ["daily_report_shipyard"] } ]
//       }
//   * Signed keys ("srt_...") that carry their own expiry. They are made with
//     mint-key.mjs using the DATA_API_SIGNING_SECRET secret, so creating one
//     needs no change in Supabase. A signed key can be cancelled early by
//     adding its id to the DATA_API_REVOKED secret (comma-separated).

import postgres from "npm:postgres@3.4.5";
import { decodeKey, equalBytes } from "../_shared/signedKey.ts";

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

interface Config {
  schemas: Record<string, { db_url: string }>;
  keys: { name: string; key: string; schemas: string[]; tables?: string[] }[];
}

interface Caller {
  name: string;
  schemas: string[];
  /** ISO time the key stops working, or null for a key that never expires. */
  expires_at: string | null;
  /** The only tables the key may read, or null for every table. */
  tables: string[] | null;
}

type AuthResult = { caller: Caller } | { error: string };

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-api-key, authorization, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Read on each request (cheap) so a rotated secret never needs a redeploy
// beyond Supabase restarting the function.
function loadConfig(): Config {
  const raw = Deno.env.get("DATA_API_CONFIG");
  if (!raw) throw new Error("DATA_API_CONFIG is not set");
  return JSON.parse(raw) as Config;
}

// One small connection pool per schema, created on first use.
const pools = new Map<string, ReturnType<typeof postgres>>();
function getDb(schema: string, config: Config) {
  const existing = pools.get(schema);
  if (existing) return existing;
  const entry = config.schemas[schema];
  if (!entry) throw new Error(`No database configured for schema ${schema}`);
  const pool = postgres(entry.db_url, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    // Required behind Supabase's transaction pooler.
    prepare: false,
    // ids are bigint; postgres.js returns those as strings unless told otherwise.
    types: {
      bigint: {
        to: 20,
        from: [20],
        parse: (v: string) => Number(v),
        serialize: (v: number) => String(v),
      },
    },
  });
  pools.set(schema, pool);
  return pool;
}

async function sha256(text: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(text);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

// Which schema's database holds the key registry (see the api_keys migration).
const REGISTRY_SCHEMA = "daily_report_shipyard";

// A signed key proves who it is for, which schemas it may read and when it
// expires by itself. On top of that it can be cancelled: ids listed in the
// DATA_API_REVOKED secret, and keys revoked in the registry, stop working.
async function verifySignedKey(supplied: string, config: Config): Promise<AuthResult | null> {
  const secret = Deno.env.get("DATA_API_SIGNING_SECRET");
  if (!secret || !supplied.startsWith("srt_")) return null;

  const payload = await decodeKey(supplied, secret);
  if (!payload) return null;

  const revoked = (Deno.env.get("DATA_API_REVOKED") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (revoked.includes(payload.id)) return { error: "This API key has been revoked" };

  if (payload.exp !== undefined && Date.now() / 1000 >= payload.exp) {
    return { error: "This API key has expired" };
  }

  // Registry check: is it cancelled, and is it limited to certain tables? A key
  // that isn't in the registry (made with mint-key.mjs) counts as not revoked
  // and unlimited. If the lookup itself fails we refuse rather than let a
  // possibly-cancelled key through (handled by the 500 below).
  let tables: string[] | null = null;
  if (config.schemas[REGISTRY_SCHEMA]) {
    const sql = getDb(REGISTRY_SCHEMA, config);
    const [row] = await sql<{ policy: { revoked: boolean; tables: string[] | null } | null }[]>`
      select ${sql(REGISTRY_SCHEMA + ".api_key_policy")}(${payload.id}) as policy`;
    if (row?.policy?.revoked) return { error: "This API key has been revoked" };
    tables = row?.policy?.tables ?? null;
  }

  return {
    caller: {
      name: payload.name,
      schemas: payload.schemas,
      expires_at: payload.exp === undefined ? null : new Date(payload.exp * 1000).toISOString(),
      tables,
    },
  };
}

// Permanent keys are compared as fixed-length hashes in constant time, against
// every key, so response timing can't leak how much of a guess was right.
async function authenticate(req: Request, config: Config): Promise<AuthResult> {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supplied = req.headers.get("x-api-key") ?? bearer;
  if (!supplied) return { error: "Missing or invalid API key" };

  const suppliedHash = await sha256(supplied);
  let match: Config["keys"][number] | null = null;
  for (const entry of config.keys) {
    if (equalBytes(await sha256(entry.key), suppliedHash)) match = entry;
  }
  if (match) {
    return { caller: { name: match.name, schemas: match.schemas, expires_at: null, tables: match.tables ?? null } };
  }

  return (await verifySignedKey(supplied, config)) ?? { error: "Missing or invalid API key" };
}

// Tables (and columns) the schema's read-only role can actually see — so the
// API only ever exposes what the database role allows, never a name from the URL.
async function readableTables(schema: string, config: Config): Promise<Map<string, string[]>> {
  const sql = getDb(schema, config);
  const rows = await sql<{ table_name: string; column_name: string }[]>`
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
     and t.table_type = 'BASE TABLE'
    where c.table_schema = ${schema}
    order by c.table_name, c.ordinal_position`;
  const tables = new Map<string, string[]>();
  for (const r of rows) {
    if (!tables.has(r.table_name)) tables.set(r.table_name, []);
    tables.get(r.table_name)!.push(r.column_name);
  }
  return tables;
}

function intParam(value: string | null, fallback: number, min: number, max: number) {
  if (value === null || value === "") return fallback;
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n < min || n > max ? null : n;
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });
  if (req.method !== "GET") return json({ error: "Only GET is supported" }, 405);

  const config = loadConfig();
  const auth = await authenticate(req, config);
  if ("error" in auth) return json({ error: auth.error }, 401);
  const caller = auth.caller;

  const url = new URL(req.url);
  const path = url.pathname
    .replace(/^\/(functions\/v1\/)?shipyard-report\/?/, "")
    .replace(/\/$/, "");
  const [schema, table, ...extra] = path === "" ? [] : path.split("/");

  // Index: which schemas this key may read.
  if (!schema) {
    return json({
      caller: caller.name,
      expires_at: caller.expires_at,
      schemas: caller.schemas.filter((s) => config.schemas[s]),
      // null = every table; otherwise the only tables this key can read.
      tables: caller.tables,
    });
  }

  // Same answer for "doesn't exist" and "not yours", so a key can't probe
  // for schemas it wasn't given.
  if (extra.length > 0 || !caller.schemas.includes(schema) || !config.schemas[schema]) {
    return json({ error: `Unknown schema or table: ${path}` }, 404);
  }

  const sql = getDb(schema, config);

  // What the database login can see, narrowed to what this key may read. A
  // table outside the key's list is simply absent, so it answers 404 exactly
  // like a table that doesn't exist — nothing reveals that it's there.
  const tables = await readableTables(schema, config);
  if (caller.tables) {
    for (const name of [...tables.keys()]) {
      if (!caller.tables.includes(name)) tables.delete(name);
    }
  }

  // Schema index: its tables.
  if (!table) {
    // One at a time: firing all the counts at once jams the small connection
    // pool behind Supabase's pooler, and 27 tiny counts are still quick.
    const counts = [];
    for (const [name, cols] of tables) {
      const [{ count }] = await sql`select count(*)::int as count from ${sql(`${schema}.${name}`)}`;
      counts.push({ table: name, rows: count as number, columns: cols });
    }
    return json({ schema, tables: counts });
  }

  const columns = tables.get(table);
  if (!columns) return json({ error: `Unknown schema or table: ${path}` }, 404);

  const limit = intParam(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = intParam(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  if (limit === null) return json({ error: `limit must be a whole number from 1 to ${MAX_LIMIT}` }, 400);
  if (offset === null) return json({ error: "offset must be a whole number, 0 or more" }, 400);

  const includeDeleted = url.searchParams.get("include_deleted") === "true";
  const hideDeleted = columns.includes("deleted_at") && !includeDeleted;

  const sinceRaw = url.searchParams.get("updated_since");
  let since: Date | null = null;
  if (sinceRaw) {
    since = new Date(sinceRaw);
    if (Number.isNaN(since.getTime())) {
      return json({ error: "updated_since must be an ISO date or date-time, e.g. 2026-10-01T00:00:00Z" }, 400);
    }
    if (!columns.includes("updated_at") && !columns.includes("created_at")) {
      return json({ error: `${table} has no updated_at or created_at column, so updated_since can't be used` }, 400);
    }
  }

  // Most rows are never edited after they are created, so updated_at is empty
  // for them; fall back to created_at so a new row still counts as a change.
  const changedAt = columns.includes("updated_at") && columns.includes("created_at")
    ? sql`coalesce(updated_at, created_at)`
    : columns.includes("updated_at")
      ? sql`updated_at`
      : sql`created_at`;

  const target = sql(`${schema}.${table}`);
  const where = sql`where true
    ${hideDeleted ? sql`and deleted_at is null` : sql``}
    ${since ? sql`and ${changedAt} > ${since}` : sql``}`;

  const [{ total }] = await sql`select count(*)::int as total from ${target} ${where}`;
  const data = await sql`select * from ${target} ${where} order by id limit ${limit} offset ${offset}`;

  return json({
    schema,
    table,
    total,
    limit,
    offset,
    returned: data.length,
    next_offset: offset + data.length < total ? offset + data.length : null,
    data,
  });
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (err) {
    // Details stay in the function logs, not in the response.
    console.error("shipyard-report error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
