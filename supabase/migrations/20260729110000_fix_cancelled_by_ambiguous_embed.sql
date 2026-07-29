-- ============================================================================
-- URGENT FIX: 20260729100000_add_work_details_cancellation.sql added
-- work_details.cancelled_by as a foreign key to profiles(id). work_details
-- already has a foreign key to profiles via user_id (fk_work_details_user),
-- so adding a second one made every existing `profiles(...)` embed on
-- work_details ambiguous — PostgREST can no longer guess which relationship
-- to use and returns a 300 error ("more than one relationship was found").
-- This broke every "Created By" lookup across Work Details, Work
-- Verification, and related pages.
--
-- Rather than rewrite every embed site to disambiguate
-- (profiles!fk_work_details_user), drop the FK constraint — cancelled_by
-- doesn't need database-enforced referential integrity, just a profile id
-- for the audit trail. The column itself is untouched.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table work_details
  drop constraint work_details_cancelled_by_fkey;
