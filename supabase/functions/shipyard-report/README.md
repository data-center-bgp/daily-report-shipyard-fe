# shipyard-report

Read-only JSON API for people who only need to fetch this app's data. It never
writes, never asks anyone to log in to the app, and doesn't touch the app's own
accounts or keys.

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

## The two kinds of key

**Permanent keys** never expire. They live in the `DATA_API_CONFIG` secret (see
below). Use these for people or systems that need standing access.

**Expiring keys** (they start with `srt_`) carry their own expiry and are
created on your own computer, so nothing has to change in Supabase when you hand
one out. Use these for one-off or temporary access.

### Creating an expiring key

You need the signing secret (the `DATA_API_SIGNING_SECRET` value, kept in your
password manager). Then, from this folder:

```bash
# valid for 7 days
DATA_API_SIGNING_SECRET=<signing secret> node mint-key.mjs --name "Vendor X" --days 7

# other lengths
node mint-key.mjs --name "Audit" --hours 12
node mint-key.mjs --name "Quick check" --minutes 30

# limited to specific schemas (default: daily_report_shipyard)
node mint-key.mjs --name "Vendor X" --days 7 --schemas daily_report_shipyard

# a signed key that never expires (it can still be cancelled, see below)
node mint-key.mjs --name "Dashboard" --permanent
```

The key is printed on its own line; the id and expiry are printed under it. Give
the key to the person. Once it expires the API answers `401 This API key has
expired`; you don't have to do anything.

### Cancelling a key early

- **An expiring or signed key:** add its **id** (printed when you made it) to the
  `DATA_API_REVOKED` secret, comma-separated:
  `npx supabase secrets set DATA_API_REVOKED=id1,id2`
- **A permanent key:** remove its entry from `DATA_API_CONFIG` (below) and set
  the secret again.
- **Every expiring key at once:** set a new `DATA_API_SIGNING_SECRET`.

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
| `DATA_API_SIGNING_SECRET` | signs expiring keys; without it, only permanent keys work |
| `DATA_API_REVOKED` | ids of cancelled expiring keys (optional) |

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

```bash
npx supabase functions deploy shipyard-report --use-api --no-verify-jwt
```

`--no-verify-jwt` matters: this function checks its own keys, so Supabase's
gateway must not also demand a Supabase login.
