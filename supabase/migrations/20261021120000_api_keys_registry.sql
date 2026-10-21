-- ============================================================================
-- Registry of the API keys MASTER users create from the app
-- (Developer -> API Documentation -> Manage keys).
--
-- A key itself is a signed token (see supabase/functions/_shared/signedKey.ts)
-- and is NOT stored here — only who it was made for, when it expires and
-- whether it has been cancelled, so it can be listed and revoked. The token is
-- shown once when it is created and can't be recovered afterwards.
--
-- Nothing in the browser can touch this table: row level security is on with no
-- policies and the public roles have no privileges. It is read and written only
-- by the shipyard-report-keys Edge Function (service role), which first checks
-- the caller is an active MASTER user. The read-only API role can't read it
-- either (so it never shows up in the data API); it can only ask the one
-- question api_key_is_revoked() answers.
-- ============================================================================

create table if not exists daily_report_shipyard.api_keys (
  id bigint generated always as identity primary key,
  key_id text not null unique,                 -- the id inside the signed token
  name text not null,                          -- who/what the key is for
  schemas text[] not null,                     -- schemas it may read
  created_at timestamptz not null default now(),
  created_by bigint references daily_report_shipyard.profiles(id),
  created_by_name text,                        -- snapshot, so it survives renames
  expires_at timestamptz,                      -- null = never expires
  revoked_at timestamptz,
  revoked_by bigint references daily_report_shipyard.profiles(id),
  revoked_by_name text
);

alter table daily_report_shipyard.api_keys enable row level security;

revoke all on daily_report_shipyard.api_keys from public, anon, authenticated;
grant all on daily_report_shipyard.api_keys to service_role;

-- Default privileges gave the read-only API role SELECT on every new table;
-- take it back for this one.
revoke all on daily_report_shipyard.api_keys from data_api_ro_daily_report_shipyard;

-- The only thing the read-only API role may ask about the registry: has this
-- key been cancelled? (A key that isn't listed at all counts as not revoked,
-- which keeps keys made with mint-key.mjs working.)
create or replace function daily_report_shipyard.api_key_is_revoked(p_key_id text)
returns boolean
language sql
stable
security definer
set search_path = daily_report_shipyard
as $$
  select coalesce(
    (select revoked_at is not null from daily_report_shipyard.api_keys where key_id = p_key_id),
    false
  )
$$;

-- Supabase also hands EXECUTE to anon/authenticated by default; only the read-only API role needs it.
revoke all on function daily_report_shipyard.api_key_is_revoked(text) from public, anon, authenticated;
grant execute on function daily_report_shipyard.api_key_is_revoked(text) to data_api_ro_daily_report_shipyard;
