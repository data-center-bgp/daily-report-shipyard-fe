-- ============================================================================
-- Work verification review workflow: approve or send back for rework.
--
-- Until now, work_verification was a single-state table: inserting a row
-- meant "verified, done." The Operation Head (OP_HEAD) needs to be able to
-- send completed work back to the shipyard for repair instead of always
-- approving it, and see the full history of that back-and-forth.
--
-- status distinguishes the two outcomes of a review:
--   APPROVED - work is accepted, ready to go into a BASTP
--   REJECTED - sent back to the shipyard; the work_details row is still at
--              100% progress but needs rework
--
-- Existing rows predate this column and were all plain "verified" records,
-- so they default to APPROVED.
--
-- "Needs rework" is derived in the app layer, not stored here: a work_details
-- row is open for rework (and the 100%-complete lock in Add Progress lifts)
-- when its latest work_verification row is REJECTED and no work_progress row
-- has been created since. Once the shipyard logs a new progress report, the
-- item is back in the review queue automatically.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table work_verification
  add column status text not null default 'APPROVED';

alter table work_verification
  add constraint work_verification_status_check
  check (status in ('APPROVED', 'REJECTED'));

create index idx_work_verification_work_details_id
  on work_verification(work_details_id, created_at desc);

comment on column work_verification.status is
  'APPROVED = accepted, ready for BASTP. REJECTED = sent back to shipyard for rework. Only the latest row per work_details_id reflects the current state.';
