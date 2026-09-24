-- activity_logs previously scoped non-Master/Manager readers to "only my
-- own logs" (see 20260803100000_scope_activity_logs_rls_by_user.sql). Widen
-- that to "logs from anyone sharing my current role" — e.g. a PPIC user can
-- now see activity from other PPIC users too, not just their own — while
-- MASTER/MANAGER keep unrestricted visibility across every role. This is
-- the real security boundary; any client-side filtering is just UX on top
-- of it and can't be relied on alone.

set search_path to daily_report_shipyard;

drop policy if exists "Master/Manager read all, others read only their own logs" on activity_logs;

create policy "Master/Manager read all, others read only same-role logs"
  on activity_logs
  for select
  to authenticated
  using (
    admin_caller_role() in ('MASTER', 'MANAGER')
    or exists (
      select 1 from profiles p
      where p.id = activity_logs.user_id
        and p.role = admin_caller_role()
    )
  );
