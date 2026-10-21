-- ============================================================================
-- Per-key table limits for the shipyard-report API.
--
-- A key can be limited to chosen tables (e.g. everything except profiles and
-- activity_logs). The limit lives here, not inside the signed key, so it can be
-- changed later without issuing a new key; the read API looks it up on every
-- request (it already asks the registry whether the key was revoked).
--
--   api_keys.tables   null = every table (how all existing keys behave),
--                     otherwise the only tables the key may read
-- ============================================================================

alter table daily_report_shipyard.api_keys
  add column if not exists tables text[];

-- One lookup for the read API: is the key revoked, and which tables may it read?
-- Returns null for a key that isn't in the registry (keys made with mint-key.mjs),
-- which the API treats as "not revoked, all tables".
create or replace function daily_report_shipyard.api_key_policy(p_key_id text)
returns jsonb
language sql
stable
security definer
set search_path = daily_report_shipyard
as $$
  select jsonb_build_object(
    'revoked', k.revoked_at is not null,
    'tables', to_jsonb(k.tables)
  )
  from daily_report_shipyard.api_keys k
  where k.key_id = p_key_id
$$;

revoke all on function daily_report_shipyard.api_key_policy(text) from public, anon, authenticated;
grant execute on function daily_report_shipyard.api_key_policy(text) to data_api_ro_daily_report_shipyard;

-- The tables a key can be limited to, for validating a request and filling the
-- picker in the app. The registry itself is never offered. Only the key
-- management function (service role) may call it.
create or replace function daily_report_shipyard.api_readable_tables()
returns text[]
language sql
stable
security definer
set search_path = daily_report_shipyard
as $$
  select coalesce(array_agg(c.relname::text order by c.relname), '{}')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'daily_report_shipyard'
    and c.relkind = 'r'
    and c.relname <> 'api_keys'
$$;

revoke all on function daily_report_shipyard.api_readable_tables() from public, anon, authenticated;
grant execute on function daily_report_shipyard.api_readable_tables() to service_role;
