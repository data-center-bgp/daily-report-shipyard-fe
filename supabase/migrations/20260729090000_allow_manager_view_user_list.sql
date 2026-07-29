-- ============================================================================
-- Let MANAGER view the User Management screen (read-only), matching the
-- app-wide policy that MANAGER sees everything MASTER does but can never
-- write. admin_list_all_profiles() was MASTER-only at the database level,
-- which would have made the frontend's read-only view impossible to load no
-- matter how the UI was gated.
--
-- admin_update_user_role() and admin_set_user_active() are deliberately left
-- untouched — they stay MASTER-only, since those are the actual write
-- actions (change a role, deactivate/reactivate an account).
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
  if admin_caller_role() not in ('MASTER', 'MANAGER') then
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
