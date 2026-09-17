-- ============================================================================
-- Enforce that a BASTP's document number is actually unique.
--
-- Nothing stopped the same number being inserted twice. A failed create
-- (see the app-side fix accompanying this migration) left three empty,
-- identically-numbered '0301/HR-PPIC/IX/2026' rows behind (ids 22, 23, 24)
-- — the header insert succeeded each retry while the work-details insert
-- that should have followed kept failing, and with no constraint in place,
-- that's silent instead of a clear "this number already exists" error.
--
-- All three rows are confirmed empty (no work details, materials, general
-- services, invoices, or uploaded documents) and otherwise identical —
-- there's nothing to distinguish which was the "real" attempt. The earliest
-- (id 22) is kept; the other two are soft-deleted so the unique index below
-- can actually be created.
-- ============================================================================

set search_path to daily_report_shipyard;

update bastp
set deleted_at = now()
where id in (23, 24)
  and number = '0301/HR-PPIC/IX/2026'
  and deleted_at is null;

create unique index bastp_unique_number_active
  on bastp (number)
  where deleted_at is null;

comment on index bastp_unique_number_active is
  'A BASTP document number must be unique among active (non-deleted) records.';
