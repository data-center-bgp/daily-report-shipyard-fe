-- ============================================================================
-- URGENT FIX: 20260729090000_allow_manager_view_user_list.sql introduced a
-- security bug. It rewrote the guard as:
--
--   if admin_caller_role() not in ('MASTER', 'MANAGER') then raise exception...
--
-- In SQL, `NULL NOT IN (...)` evaluates to NULL, not TRUE — and PL/pgSQL
-- treats `IF NULL THEN` as false, so the exception never fired for an
-- unauthenticated caller (admin_caller_role() returns NULL when there's no
-- session). This let anyone call admin_list_all_profiles() with just the
-- public anon key, no login required, and get back every user's name,
-- email, company, and role. Confirmed and fixed same-day.
--
-- The original function avoided this using `IS DISTINCT FROM`, which is
-- NULL-safe (`NULL IS DISTINCT FROM 'MASTER'` correctly evaluates to true).
-- This migration restores that safety while keeping the MANAGER view access
-- the previous migration intended to add.
-- ============================================================================

set search_path to daily_report_shipyard;

create or replace function admin_list_all_profiles()
returns table (
  id bigint,
  name text,
  email text,
  company text,
  role text,
  created_at timestamptz,
  deleted_at timestamptz
)
language plpgsql
security definer
set search_path = daily_report_shipyard, public
as $$
begin
  if admin_caller_role() is distinct from 'MASTER'
     and admin_caller_role() is distinct from 'MANAGER' then
    raise exception 'Access denied: MASTER or MANAGER role required';
  end if;

  return query
    select p.id, p.name, p.email, p.company, p.role, p.created_at, p.deleted_at
    from profiles p
    order by p.role, p.name;
end;
$$;

comment on function admin_list_all_profiles() is
  'MASTER or MANAGER: full user roster (including role and active/inactive status) for the User Management screen. MANAGER is view-only — role changes and activation toggles stay MASTER-only via admin_update_user_role()/admin_set_user_active().';
