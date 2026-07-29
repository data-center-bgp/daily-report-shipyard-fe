-- ============================================================================
-- Let PPIC (or MASTER) cancel a work detail. A cancelled work detail:
--   - is excluded from its work order's average/overall progress calculation
--   - is excluded from the "every work detail verified" requirement that
--     promotes a BASTP from DRAFT to VERIFIED
--   - skips the normal 100%-complete requirement to be selectable when
--     composing a BASTP (src/components/bastp/CreateBASTP.tsx), since it
--     will never be worked on or verified
--   - can still be invoiced, but always at zero price, with a visible
--     "Cancelled" indicator (app-layer concern, not enforced here)
--   - is reversible via an "Uncancel" action, which clears all three columns
--
-- Nullable timestamp (not a boolean) to match the existing convention on
-- this table (deleted_at, verification_date, invoiced_date) — null means
-- active/not-cancelled.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table work_details
  add column cancelled_at timestamptz,
  add column cancelled_by bigint references profiles(id),
  add column cancellation_reason text;

comment on column work_details.cancelled_at is
  'When this work detail was cancelled by PPIC/MASTER. Null means active. Excludes it from progress averages and BASTP verification requirements; still selectable for a BASTP at zero invoice price.';
comment on column work_details.cancelled_by is
  'profiles.id of whoever cancelled (or most recently re-cancelled) this work detail.';
comment on column work_details.cancellation_reason is
  'Optional free-text reason captured at cancellation time, for monitoring cancellation patterns over time.';
