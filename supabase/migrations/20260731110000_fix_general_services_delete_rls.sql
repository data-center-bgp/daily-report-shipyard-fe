-- ============================================================================
-- Bug: editing a BASTP re-creates every general service row instead of
-- replacing them (CreateBASTP.tsx's update path does DELETE ... WHERE
-- bastp_id = X, then re-INSERTs the current selection). The DELETE was
-- silently matching zero rows on every edit because general_services had no
-- DELETE policy at all — only INSERT/SELECT/UPDATE — so RLS blocked it
-- without raising an error client-side. Each edit therefore left the old
-- rows in place and added a fresh copy, compounding with every edit.
--
-- This adds the missing DELETE policy, mirroring the existing
-- authenticated-only INSERT/UPDATE policies on this table.
-- ============================================================================

set search_path to daily_report_shipyard;

create policy "Enable delete for authenticated users only"
  on general_services
  for delete
  to authenticated
  using (true);
