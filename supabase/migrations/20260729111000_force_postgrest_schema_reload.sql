-- ============================================================================
-- Force PostgREST to immediately reload its in-memory schema cache.
--
-- After 20260729110000 dropped work_details_cancelled_by_fkey, direct REST
-- calls succeeded consistently, but the running app kept hitting the exact
-- same PGRST201 "more than one relationship" error — a sign that whatever
-- PostgREST worker/connection the app's session is pinned to hadn't picked
-- up the catalog change yet. PostgREST listens for this NOTIFY and reloads
-- its schema cache synchronously instead of waiting for its next scheduled
-- poll.
-- ============================================================================

notify pgrst, 'reload schema';
