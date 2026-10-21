# shipyard-report

Read-only JSON API for people who only need to fetch this app's data. It never
writes, never asks anyone to log in to the app, and doesn't touch the app's own
accounts or keys.

## Documentation for users

- **Web page:** **Developer → API Documentation** in the shipyard app's sidebar
  (`/developer/api`). Only users with the **MASTER** role see it; anyone else who types
  the address is sent to the dashboard. It has an overview, access keys, an integration
  guide with a "try it" box, and a table reference. It is hidden in the app, not secret:
  the API itself is protected by its keys, and the page contains none.
- **Postman / Apidog:** download the collection (and, optionally, the environment) from
  the page's Integration guide tab, or take the files from
  `src/components/developer/data/`.
- The page is self-contained in `src/components/developer/` (plus one route in `App.tsx`,
  one sidebar entry in `Layout.tsx` and a `developer` entry in `useAuth.tsx`), so it can be
  moved into a separate documentation project later.
- The table list comes from `src/components/developer/data/tables.json`; refresh it (and
  the collection's per-table requests) when tables are added.

## Using it

Base URL: `https://<project-ref>.supabase.co/functions/v1/shipyard-report`
Send the key in a header: `x-api-key: <key>` (or `Authorization: Bearer <key>`).

| Request | Returns |
|---|---|
| `GET /` | the schemas your key can read, and when the key expires |
| `GET /<schema>` | that schema's tables, their columns and row counts |
| `GET /<schema>/<table>` | that table's rows, one page at a time |

Options on `GET /<schema>/<table>`:

| Option | Meaning |
|---|---|
| `limit=1000` | rows per page (default 1000, max 5000) |
| `offset=0` | where to start |
| `updated_since=2026-10-01T00:00:00Z` | only rows created or changed after this (a row never edited counts by its `created_at`; tables with neither column can't use it) |
| `include_deleted=true` | also return soft-deleted rows (hidden by default) |

A table response looks like:

```json
{ "schema": "daily_report_shipyard", "table": "work_details",
  "total": 3096, "limit": 1000, "offset": 0, "returned": 1000,
  "next_offset": 1000, "data": [ { "id": 1, "...": "..." } ] }
```

To get a whole table, keep requesting with `offset=<next_offset>` until
`next_offset` is `null`. Columns stored as `numeric` (prices) come back as text
so no precision is lost. Ids are plain numbers.

Example:

```bash
curl -H "x-api-key: $KEY" \
  "https://<project-ref>.supabase.co/functions/v1/shipyard-report/daily_report_shipyard/projects?limit=100"
```

Errors: `401` missing, wrong, expired or revoked key (the message says which),
`404` unknown schema/table (also when the key isn't allowed that schema),
`400` bad `limit`/`offset`/`updated_since`, `405` anything other than GET.

## Keys

A key is either **permanent** or **expiring**. Both only ever read.

| | Where it comes from | Lasts | Cancel it by |
|---|---|---|---|
| **Made in the app** (recommended) | **Developer → API Documentation → Manage keys**, MASTER users only | 7 days, 30 days, 90 days or permanent | the **Revoke** button on the same page |
| **Permanent, in the config** | the `keys` list in the `DATA_API_CONFIG` secret | never | removing it from the secret |
| **Made on the command line** | `mint-key.mjs` (below) | any length, or permanent | adding its id to `DATA_API_REVOKED` |

Keys made in the app start with `srt_`, are shown **once** when created (copy it then; it can't be
recovered) and are listed afterwards with who made them, when, when they expire and their status.
Revoking one stops it working straight away, and never affects any other key. Creating and revoking
are recorded in the Activity Log (never the key itself).

### How app-made keys work

- The page calls the **`shipyard-report-keys`** function, which first checks the caller's own login and
  that their profile is an **active MASTER** (anyone else gets 403). The signing secret lives only in that
  function — it can't reach the browser, which is why this isn't done in app code.
- It records the key (name, schemas, expiry, who made it) in `daily_report_shipyard.api_keys` (see
  `supabase/migrations/20261021120000_api_keys_registry.sql`) and signs the key. **The key itself is not
  stored**, so a database leak doesn't leak keys.
- The `api_keys` table can't be read by the browser or by the read-only API login, so it never appears in
  the data API. The read API only asks one question, `api_key_is_revoked(key_id)`, on every request.
- The function has its gateway JWT check switched off (`verify_jwt = false` in `config.toml`) because it
  verifies the login itself against Supabase Auth.

### Creating a key on the command line (alternative)

Only needed for scripting. You need the signing secret (the `DATA_API_SIGNING_SECRET` value, kept in your
password manager). From this folder:

```bash
# valid for 7 days
DATA_API_SIGNING_SECRET=<signing secret> node mint-key.mjs --name "Vendor X" --days 7

# other lengths
node mint-key.mjs --name "Audit" --hours 12
node mint-key.mjs --name "Quick check" --minutes 30

# limited to specific schemas (default: daily_report_shipyard)
node mint-key.mjs --name "Vendor X" --days 7 --schemas daily_report_shipyard

# a signed key that never expires (it can still be cancelled)
node mint-key.mjs --name "Dashboard" --permanent
```

The key is printed on its own line; the id and expiry are printed under it. These keys are not in the
app's key list. Cancel one by adding its **id** to the `DATA_API_REVOKED` secret, comma-separated:
`npx supabase secrets set DATA_API_REVOKED=id1,id2`.

### Cancelling in bulk

- **Every signed key at once** (app-made and command-line): set a new `DATA_API_SIGNING_SECRET`. Do this
  if the signing secret ever leaks.
- **A permanent config key:** remove its entry from `DATA_API_CONFIG` (below) and set the secret again.

## How it is locked down

- Each key is tied to the schemas it may read; anything else answers `404`.
- Each schema is read through its own database login,
  `data_api_ro_<schema>` (`supabase/migrations/20261021100000_data_api_readonly_role.sql`).
  The database itself refuses writes from it, it can only see its own schema,
  queries stop after 20 seconds, and it is limited to 5 connections.
- Only `GET` is accepted, and table names come from what the database login can
  actually see, never straight from the URL.
- Expiring keys are signed (HMAC-SHA256); a key that was edited, or signed with
  another secret, is rejected.

## Configuration (secrets)

Set with `npx supabase secrets set --env-file <file>` (keep that file out of git;
the repo is public). Supabase can't show a secret back to you, so keep your own
copy of anything you'll need again.

| Secret | What it holds |
|---|---|
| `DATA_API_CONFIG` | which schemas exist and how to connect to each, plus the permanent keys |
| `DATA_API_SIGNING_SECRET` | signs app-made and command-line keys (used by both functions); without it, only permanent config keys work |
| `DATA_API_REVOKED` | ids of cancelled command-line keys (optional; app-made keys are revoked in the app) |

`DATA_API_CONFIG` is JSON:

```json
{
  "schemas": {
    "daily_report_shipyard": {
      "db_url": "postgresql://data_api_ro_daily_report_shipyard.<project-ref>:<password>@<pooler-host>:6543/postgres"
    }
  },
  "keys": [
    { "name": "supervisor", "key": "<long random string>", "schemas": ["daily_report_shipyard"] }
  ]
}
```

- **Add a permanent key:** add another entry to `keys`.
- **Rotate a permanent key:** change its `key` and set the secret again.

## Adding another schema

1. In `supabase/migrations/20261021100000_data_api_readonly_role.sql`, change
   `v_schema` and run it. This creates that schema's own read-only login and the
   read policies it needs. (Other apps share this Supabase project, so get their
   owners' agreement first.)
2. Give the new login a password (outside git):
   `alter role data_api_ro_<schema> password '...';`
3. Add the schema under `schemas` in `DATA_API_CONFIG`, and list it in the `schemas`
   of whichever keys should reach it, then set the secret again.
4. When minting an expiring key for it, pass `--schemas <schema>`.

No code change or redeploy is needed for steps 1 to 4.

## Maintenance notes

- A table added later is readable automatically, but if it has row level security
  turned on it needs a read policy for the schema's login, or it will quietly
  return no rows. Re-running the migration adds the missing ones.
- The `<schema>` listing counts the tables one at a time on purpose. Counting all
  of them at once jams the small connection pool behind Supabase's pooler and the
  request hangs.

## Deploying

Order matters: apply the migrations first, then deploy the functions (the read function calls
`api_key_is_revoked`, which the second migration creates).

```bash
npx supabase db query --linked --file supabase/migrations/20261021100000_data_api_readonly_role.sql
npx supabase db query --linked --file supabase/migrations/20261021120000_api_keys_registry.sql
npx supabase functions deploy shipyard-report --use-api --no-verify-jwt
npx supabase functions deploy shipyard-report-keys --use-api --no-verify-jwt
```

`--no-verify-jwt` matters for both: they check their own credentials (an API key, or a MASTER login), so
Supabase's gateway must not also demand a Supabase login.
