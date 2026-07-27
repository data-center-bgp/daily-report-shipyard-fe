-- ============================================================================
-- Recognize ADMIN_SHIPPING as a valid role for admin_update_user_role().
--
-- Target schema: daily_report_shipyard.
--
-- ADMIN_SHIPPING already exists as a live value in profiles.role (an
-- account was created with it directly, bypassing the app entirely) but
-- wasn't in admin_update_user_role()'s allow-list from migration
-- 20260727130000, so MASTER couldn't reassign anyone to/from it via the
-- User Management screen. This role creates Projects/Work Orders/Work
-- Details but can never edit or delete one afterward.
-- ============================================================================

set search_path to daily_report_shipyard;

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

  if p_new_role not in ('MASTER', 'PPIC', 'PRODUCTION', 'OP_HEAD', 'ADMIN', 'FINANCE', 'MANAGER', 'HSSE', 'ADMIN_SHIPPING') then
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

grant execute on function admin_update_user_role(bigint, text) to authenticated;
