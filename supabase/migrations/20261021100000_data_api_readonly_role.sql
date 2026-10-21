-- ============================================================================
-- Read-only database login for the shipyard-report Edge Function
-- (supabase/functions/shipyard-report), which hands out this app's data as
-- JSON to people who only need to fetch it.
--
-- One login PER SCHEMA (data_api_ro_<schema>): this Supabase project is shared
-- with other company apps, so each role can read its own schema and nothing
-- else, and the database refuses every write from it —
-- default_transaction_read_only is a property of the role, not something the
-- function has to remember to do.
--
-- To expose another schema later, change v_schema below (and only that), run
-- this against the database, then set that role's password and add it to the
-- function's DATA_API_CONFIG secret (see supabase/functions/shipyard-report).
--
-- The password is deliberately NOT here (this repo is public). It is set once,
-- outside git:   alter role data_api_ro_<schema> password '...';
--
-- Maintenance: a table added to the schema later is readable automatically
-- (default privileges below), but if it has row level security on it needs its
-- own "data_api_ro read" policy — re-running this file adds the missing ones.
-- ============================================================================

do $$
declare
  v_schema text := 'daily_report_shipyard';          -- <- the only line to change
  v_role   text := 'data_api_ro_' || v_schema;
  t record;
begin
  if not exists (select 1 from pg_roles where rolname = v_role) then
    execute format(
      'create role %I login nosuperuser nocreatedb nocreaterole noinherit noreplication',
      v_role);
  end if;

  execute format('alter role %I set default_transaction_read_only = on', v_role);
  execute format('alter role %I set statement_timeout = ''20s''', v_role);
  execute format('alter role %I set search_path = %I', v_role, v_schema);
  execute format('alter role %I connection limit 5', v_role);

  execute format('grant usage on schema %I to %I', v_schema, v_role);
  execute format('grant select on all tables in schema %I to %I', v_schema, v_role);
  execute format(
    'alter default privileges in schema %I grant select on tables to %I',
    v_schema, v_role);

  -- A table with row level security hides every row from a role no policy
  -- names; give this role an explicit read-everything policy on each of them.
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = v_schema and c.relkind = 'r' and c.relrowsecurity
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = v_schema and tablename = t.relname
        and policyname = 'data_api_ro read'
    ) then
      execute format(
        'create policy "data_api_ro read" on %I.%I for select to %I using (true)',
        v_schema, t.relname, v_role);
    end if;
  end loop;
end
$$;
