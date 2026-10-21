// Creates, lists and cancels shipyard-report API keys. Called by the app's
// Developer -> API Documentation -> Manage keys page; only an active MASTER user
// may use it. The signing secret lives here on the server and never reaches the
// browser — which is the whole reason this is a function and not app code.
//
//   POST { "action": "create", "name": "Vendor X", "duration": "7d" | "30d" | "90d" | "permanent",
//          "schemas"?: [...], "tables"?: [...] }     (tables omitted = every table)
//        -> { token, key }          (the token is returned once and can't be recovered)
//   POST { "action": "list" }       -> { keys: [...], available_tables: [...] }
//   POST { "action": "set_tables", "id": 12, "tables": [...] | null } -> { key }
//   POST { "action": "revoke", "id": 12 } -> { key }
//
// Who is calling is checked from their own login (the Authorization header),
// then their profile must be an active MASTER. Nothing else is trusted.

import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeKey, newKeyId, type KeyPayload } from "../_shared/signedKey.ts";

const REGISTRY_SCHEMA = "daily_report_shipyard";

// Days until expiry; null = never. Only these choices exist.
const DURATIONS: Record<string, number | null> = { "7d": 7, "30d": 30, "90d": 90, permanent: null };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function allowedSchemas(): string[] {
  try {
    const config = JSON.parse(Deno.env.get("DATA_API_CONFIG") ?? "{}");
    const names = Object.keys(config.schemas ?? {});
    if (names.length > 0) return names;
  } catch {
    // fall through
  }
  return [REGISTRY_SCHEMA];
}

function statusOf(row: { expires_at: string | null; revoked_at: string | null }): "active" | "expired" | "revoked" {
  if (row.revoked_at) return "revoked";
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return "expired";
  return "active";
}

const COLUMNS =
  "id, key_id, name, schemas, tables, created_at, created_by_name, expires_at, revoked_at, revoked_by_name";

// The client's schema-generic types add nothing here and fight the helpers below.
// deno-lint-ignore no-explicit-any
type Admin = any;

/** Every table a key can be limited to (the registry itself is never offered). */
async function availableTables(admin: Admin): Promise<string[]> {
  const { data, error } = await admin.rpc("api_readable_tables");
  if (error) throw error;
  return (data ?? []) as string[];
}

/**
 * Reads a "tables" value from a request: absent/null means every table;
 * otherwise a non-empty list of real tables. Returns the cleaned list (null =
 * every table) or an error message.
 */
function parseTables(value: unknown, available: string[]): { tables: string[] | null } | { error: string } {
  if (value === undefined || value === null) return { tables: null };
  if (!Array.isArray(value) || value.length === 0) {
    return { error: "Choose at least one table, or leave it as all tables" };
  }
  const unique = [...new Set(value)];
  const unknown = unique.filter((t) => typeof t !== "string" || !available.includes(t));
  if (unknown.length > 0) return { error: `Unknown table: ${String(unknown[0])}` };
  return { tables: (unique as string[]).sort() };
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Only POST is supported" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const signingSecret = Deno.env.get("DATA_API_SIGNING_SECRET");
  if (!url || !serviceKey || !signingSecret) {
    console.error("shipyard-report-keys: missing configuration");
    return json({ error: "Key management isn't configured" }, 500);
  }

  const admin = createClient(url, serviceKey, {
    db: { schema: REGISTRY_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Who is calling? Verified against Supabase Auth, not just decoded.
  const jwt = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!jwt) return json({ error: "Sign in to manage keys" }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !auth.user) return json({ error: "Sign in to manage keys" }, 401);

  // 2. Are they an active MASTER user?
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, name, role")
    .eq("auth_user_id", auth.user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.role !== "MASTER") return json({ error: "Only MASTER users can manage API keys" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Send a JSON body" }, 400);
  }

  switch (body.action) {
    case "list": {
      const { data, error } = await admin
        .from("api_keys")
        .select(COLUMNS)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return json({
        keys: (data ?? []).map((k) => ({ ...k, status: statusOf(k) })),
        // For the table picker in the app.
        available_tables: await availableTables(admin),
      });
    }

    case "create": {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (name.length < 1 || name.length > 80) return json({ error: "Give the key a name (up to 80 characters)" }, 400);

      const duration = String(body.duration ?? "");
      if (!(duration in DURATIONS)) return json({ error: "duration must be 7d, 30d, 90d or permanent" }, 400);
      const days = DURATIONS[duration];

      const permitted = allowedSchemas();
      const schemas = body.schemas === undefined ? [permitted[0]] : body.schemas;
      if (
        !Array.isArray(schemas) ||
        schemas.length === 0 ||
        !schemas.every((s) => typeof s === "string" && permitted.includes(s))
      ) {
        return json({ error: `schemas must be a non-empty list from: ${permitted.join(", ")}` }, 400);
      }

      const parsed = parseTables(body.tables, await availableTables(admin));
      if ("error" in parsed) return json({ error: parsed.error }, 400);

      const exp = days === null ? undefined : Math.floor(Date.now() / 1000 + days * 86400);
      const payload: KeyPayload = { v: 1, id: newKeyId(), name, schemas: [...new Set(schemas as string[])], ...(exp ? { exp } : {}) };

      // Register first: if that fails there is no key out in the world that we can't list or cancel.
      const { data: row, error } = await admin
        .from("api_keys")
        .insert({
          key_id: payload.id,
          name,
          schemas: payload.schemas,
          tables: parsed.tables,
          created_by: profile.id,
          created_by_name: profile.name,
          expires_at: exp ? new Date(exp * 1000).toISOString() : null,
        })
        .select(COLUMNS)
        .single();
      if (error) throw error;

      const token = await encodeKey(payload, signingSecret);
      return json({ token, key: { ...row, status: statusOf(row) } }, 201);
    }

    case "set_tables": {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) return json({ error: "id must be a key's number" }, 400);

      const parsed = parseTables(body.tables, await availableTables(admin));
      if ("error" in parsed) return json({ error: parsed.error }, 400);

      // Takes effect on the key's very next request — the key itself doesn't change.
      const { data: row, error } = await admin
        .from("api_keys")
        .update({ tables: parsed.tables })
        .eq("id", id)
        .is("revoked_at", null)
        .select(COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (row) return json({ key: { ...row, status: statusOf(row) } });

      const { data: existing } = await admin.from("api_keys").select("id").eq("id", id).maybeSingle();
      return existing ? json({ error: "A revoked key can't be changed" }, 409) : json({ error: "Key not found" }, 404);
    }

    case "revoke": {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) return json({ error: "id must be a key's number" }, 400);

      const { data: row, error } = await admin
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString(), revoked_by: profile.id, revoked_by_name: profile.name })
        .eq("id", id)
        .is("revoked_at", null)
        .select(COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (row) return json({ key: { ...row, status: statusOf(row) } });

      const { data: existing } = await admin.from("api_keys").select("id").eq("id", id).maybeSingle();
      return existing ? json({ error: "That key is already revoked" }, 409) : json({ error: "Key not found" }, 404);
    }

    default:
      return json({ error: "action must be create, list, set_tables or revoke" }, 400);
  }
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (err) {
    // Details stay in the function logs, not in the response.
    console.error("shipyard-report-keys error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
