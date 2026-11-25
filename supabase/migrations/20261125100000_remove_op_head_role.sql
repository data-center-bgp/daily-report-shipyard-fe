-- Retire the OP_HEAD role. Its people are now SHIPPING, and SHIPPING takes over
-- what OP_HEAD did (work verification, additional work order approvals, view
-- access to operations). The access rules for that live in the app's role
-- lists, not in the database, so only three things change here:
--   1. any profile still on OP_HEAD becomes SHIPPING (none were left on the
--      date this was written, so this is a safety net),
--   2. User Management can no longer assign OP_HEAD,
--   3. the docking plan read policies stop listing OP_HEAD.

set search_path to daily_report_shipyard;

update profiles
set role = 'SHIPPING', updated_at = now()
where role = 'OP_HEAD';

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

  if p_new_role not in ('MASTER', 'PPIC', 'PRODUCTION', 'ADMIN', 'FINANCE', 'MANAGER', 'HSSE', 'ADMIN_SHIPPING', 'SHIPPING') then
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

drop policy if exists "plans read" on docking_plans;
drop policy if exists "plan work orders read" on docking_plan_work_orders;
drop policy if exists "plan work details read" on docking_plan_work_details;
drop policy if exists "plan reviews read" on docking_plan_reviews;
drop policy if exists "plan review notes read" on docking_plan_review_notes;

create policy "plans read" on docking_plans for select
  using (admin_caller_role() in ('SHIPPING', 'MASTER', 'PPIC', 'PRODUCTION', 'ADMIN', 'FINANCE', 'MANAGER', 'HSSE', 'ADMIN_SHIPPING'));
create policy "plan work orders read" on docking_plan_work_orders for select
  using (admin_caller_role() in ('SHIPPING', 'MASTER', 'PPIC', 'PRODUCTION', 'ADMIN', 'FINANCE', 'MANAGER', 'HSSE', 'ADMIN_SHIPPING'));
create policy "plan work details read" on docking_plan_work_details for select
  using (admin_caller_role() in ('SHIPPING', 'MASTER', 'PPIC', 'PRODUCTION', 'ADMIN', 'FINANCE', 'MANAGER', 'HSSE', 'ADMIN_SHIPPING'));
create policy "plan reviews read" on docking_plan_reviews for select
  using (admin_caller_role() in ('SHIPPING', 'MASTER', 'PPIC', 'PRODUCTION', 'ADMIN', 'FINANCE', 'MANAGER', 'HSSE', 'ADMIN_SHIPPING'));
create policy "plan review notes read" on docking_plan_review_notes for select
  using (admin_caller_role() in ('SHIPPING', 'MASTER', 'PPIC', 'PRODUCTION', 'ADMIN', 'FINANCE', 'MANAGER', 'HSSE', 'ADMIN_SHIPPING'));

notify pgrst, 'reload schema';
