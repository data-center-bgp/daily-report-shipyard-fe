set search_path to daily_report_shipyard;

-- Master data (vessel/location/work_scope) previously had no in-app write
-- path: SELECT was public, INSERT was open to *any* authenticated user, and
-- there was no UPDATE/DELETE policy at all (fixes/edits had to go through
-- direct SQL against Supabase). Now that a Master Data screen exists in the
-- app, tighten this to match the rest of the admin surface: only
-- MASTER/PPIC can write, and edits/soft-deletes go through UPDATE.

drop policy if exists "Enable insert for authenticated users only" on vessel;
drop policy if exists "Enable insert for authenticated users only" on location;
drop policy if exists "Enable insert for authenticated users only" on work_scope;

create policy "MASTER/PPIC can insert vessel"
  on vessel for insert
  to authenticated
  with check (admin_caller_role() in ('MASTER', 'PPIC'));

create policy "MASTER/PPIC can update vessel"
  on vessel for update
  to authenticated
  using (admin_caller_role() in ('MASTER', 'PPIC'))
  with check (admin_caller_role() in ('MASTER', 'PPIC'));

create policy "MASTER/PPIC can insert location"
  on location for insert
  to authenticated
  with check (admin_caller_role() in ('MASTER', 'PPIC'));

create policy "MASTER/PPIC can update location"
  on location for update
  to authenticated
  using (admin_caller_role() in ('MASTER', 'PPIC'))
  with check (admin_caller_role() in ('MASTER', 'PPIC'));

create policy "MASTER/PPIC can insert work_scope"
  on work_scope for insert
  to authenticated
  with check (admin_caller_role() in ('MASTER', 'PPIC'));

create policy "MASTER/PPIC can update work_scope"
  on work_scope for update
  to authenticated
  using (admin_caller_role() in ('MASTER', 'PPIC'))
  with check (admin_caller_role() in ('MASTER', 'PPIC'));
