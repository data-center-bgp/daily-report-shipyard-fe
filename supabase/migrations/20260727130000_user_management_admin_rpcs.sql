-- ============================================================================
-- User Management (MASTER-only) admin RPCs.
--
-- Target schema: daily_report_shipyard.
--
-- profiles has no RLS policy granting cross-user SELECT/UPDATE — the app's
-- existing get_all_profiles() RPC (applied directly, not tracked in this
-- migration history) only exposes id/name/email for resolving "Created By"
-- labels, deliberately excluding role so any authenticated user can call it
-- without leaking who has admin access.
--
-- The new User Management screen needs the full picture (role, company,
-- active/inactive) plus the ability to change a user's role or
-- deactivate/reactivate them. Each function below is SECURITY DEFINER and
-- re-checks the CALLER's own role internally before doing anything — the
-- authorization lives in the function body, not in a GRANT, so it's safe to
-- grant EXECUTE to `authenticated` the same way get_all_profiles() is.
-- ============================================================================

set search_path to daily_report_shipyard;

-- ----------------------------------------------------------------------------
-- Shared guard: the calling user's own role, or null if they have no active
-- profile. Every admin_* function below rejects the call unless this is
-- 'MASTER'.
-- ----------------------------------------------------------------------------
create or replace function admin_caller_role()
returns text
language sql
stable
security definer
set search_path = daily_report_shipyard, public
as $$
  select role from profiles
  where auth_user_id = auth.uid() and deleted_at is null
  limit 1;
$$;

comment on function admin_caller_role() is
  'Internal helper: the calling user''s own role, used to gate the admin_* User Management RPCs. Not intended to be called directly by the app.';

-- ----------------------------------------------------------------------------
-- List every user for the User Management screen. MASTER only.
-- ----------------------------------------------------------------------------
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
  if admin_caller_role() is distinct from 'MASTER' then
    raise exception 'Access denied: MASTER role required';
  end if;

  return query
    select p.id, p.name, p.email, p.company, p.role, p.created_at, p.deleted_at
    from profiles p
    order by p.role, p.name;
end;
$$;

comment on function admin_list_all_profiles() is
  'MASTER-only: full user roster (including role and active/inactive status) for the User Management screen.';

-- ----------------------------------------------------------------------------
-- Change a user's role. MASTER only. Refuses to demote yourself, and refuses
-- to leave the system with zero active MASTER users.
-- ----------------------------------------------------------------------------
create or replace function admin_update_user_role(p_target_id bigint, p_new_role text)
returns void
language plpgsql
security definer
set search_path = daily_report_shipyard, public
as $$
declare
  v_caller_id bigint;
  v_target_role text;
  v_target_deleted_at timestamptz;
  v_remaining_masters int;
begin
  if admin_caller_role() is distinct from 'MASTER' then
    raise exception 'Access denied: MASTER role required';
  end if;

  if p_new_role not in ('MASTER', 'PPIC', 'PRODUCTION', 'OP_HEAD', 'ADMIN', 'FINANCE', 'MANAGER', 'HSSE') then
    raise exception 'Invalid role: %', p_new_role;
  end if;

  select id into v_caller_id from profiles where auth_user_id = auth.uid();

  select role, deleted_at into v_target_role, v_target_deleted_at
  from profiles where id = p_target_id;

  if not found then
    raise exception 'User not found';
  end if;

  if p_target_id = v_caller_id and p_new_role <> 'MASTER' then
    raise exception 'You cannot change your own role away from MASTER';
  end if;

  if v_target_role = 'MASTER' and v_target_deleted_at is null and p_new_role <> 'MASTER' then
    select count(*) into v_remaining_masters
    from profiles
    where role = 'MASTER' and deleted_at is null and id <> p_target_id;

    if v_remaining_masters = 0 then
      raise exception 'Cannot change role: this is the last active MASTER user';
    end if;
  end if;

  update profiles
  set role = p_new_role, updated_at = now()
  where id = p_target_id;
end;
$$;

comment on function admin_update_user_role(bigint, text) is
  'MASTER-only: change another user''s role. Blocks self-demotion and blocks removing the last active MASTER.';

-- ----------------------------------------------------------------------------
-- Deactivate (soft-delete) or reactivate a user. MASTER only. Refuses to
-- deactivate yourself, and refuses to leave the system with zero active
-- MASTER users.
-- ----------------------------------------------------------------------------
create or replace function admin_set_user_active(p_target_id bigint, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = daily_report_shipyard, public
as $$
declare
  v_caller_id bigint;
  v_target_role text;
  v_remaining_masters int;
begin
  if admin_caller_role() is distinct from 'MASTER' then
    raise exception 'Access denied: MASTER role required';
  end if;

  select id into v_caller_id from profiles where auth_user_id = auth.uid();

  select role into v_target_role from profiles where id = p_target_id;

  if not found then
    raise exception 'User not found';
  end if;

  if p_target_id = v_caller_id and not p_is_active then
    raise exception 'You cannot deactivate your own account';
  end if;

  if not p_is_active and v_target_role = 'MASTER' then
    select count(*) into v_remaining_masters
    from profiles
    where role = 'MASTER' and deleted_at is null and id <> p_target_id;

    if v_remaining_masters = 0 then
      raise exception 'Cannot deactivate: this is the last active MASTER user';
    end if;
  end if;

  update profiles
  set deleted_at = case when p_is_active then null else now() end,
      updated_at = now()
  where id = p_target_id;
end;
$$;

comment on function admin_set_user_active(bigint, boolean) is
  'MASTER-only: soft-delete or restore a user account. Blocks self-deactivation and blocks removing the last active MASTER.';

grant execute on function admin_caller_role() to authenticated;
grant execute on function admin_list_all_profiles() to authenticated;
grant execute on function admin_update_user_role(bigint, text) to authenticated;
grant execute on function admin_set_user_active(bigint, boolean) to authenticated;
