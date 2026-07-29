-- ============================================================================
-- Auto-approve work verification after a 2-day Operation Head review deadline.
--
-- Business rule: if a completed work detail (100% progress) hasn't been
-- manually reviewed by the Operation Head within 2 days of reaching 100%,
-- it is automatically approved so it doesn't block downstream BASTP/invoice
-- work indefinitely. is_auto_verified distinguishes these from real human
-- reviews for monitoring purposes (distinct note + distinct "Approved By"
-- display in the app).
--
-- There is no backend job runner in this app (Supabase + static frontend
-- only) — same as the BASTP DRAFT->VERIFIED auto-promotion — so this is
-- evaluated client-side whenever an Operation Head/MASTER user has the Work
-- Verification queue open, not by a true server-side cron. See
-- WorkVerification.tsx.
--
-- user_id is relaxed to nullable because an auto-verified row has no human
-- reviewer to attribute it to.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table work_verification
  add column is_auto_verified boolean not null default false;

alter table work_verification
  alter column user_id drop not null;

comment on column daily_report_shipyard.work_verification.is_auto_verified is
  'True when this row was auto-approved because the Operation Head did not review it within 2 days of the work detail reaching 100% progress, instead of a real manual review. user_id is null for these rows.';
comment on column daily_report_shipyard.work_verification.user_id is
  'profiles.id of the reviewer. Null when is_auto_verified = true (no one actually reviewed it).';
