-- activity_logs previously had a blanket "Enable read access for all users"
-- SELECT policy (qual: true), meaning any authenticated request could read
-- every user's activity history regardless of role. The Activity Logs page
-- is now open to every role (not just Master/Manager), scoped client-side
-- to "only my own logs" for everyone else — but a client-side filter alone
-- doesn't stop a direct API call from dropping that filter. Enforce the
-- same scoping at the database level so it can't be bypassed.

set search_path to daily_report_shipyard;

drop policy if exists "Enable read access for all users" on activity_logs;

create policy "Master/Manager read all, others read only their own logs"
  on activity_logs
  for select
  to authenticated
  using (
    admin_caller_role() in ('MASTER', 'MANAGER')
    or user_id = (
      select id from profiles
      where auth_user_id = auth.uid() and deleted_at is null
      limit 1
    )
  );
