-- ============================================================================
-- Reworks the Vessel Readiness Form into a two-party review workflow:
-- WO Shipyard (PPIC/MASTER) fills the checklist, then Shipyard HSSE reviews
-- and approves/rejects EACH checklist item individually (with notes), looping
-- back to WO Shipyard — who clarifies with the vessel owner — if anything is
-- rejected. The form only becomes APPROVED once HSSE has approved every item
-- and signed off. HSSE is now the ONLY sign-off role: Marketing & PPIC and
-- Business Unit Head (added in 20260724090000) are removed.
--
-- New status lifecycle (replaces DRAFT/PENDING_APPROVAL/APPROVED/REJECTED):
--   DRAFT               -> WO Shipyard still filling the checklist
--   SUBMITTED           -> all items answered, waiting on HSSE review
--   NEEDS_CLARIFICATION -> HSSE rejected >=1 item; back to WO Shipyard
--   APPROVED            -> HSSE approved every item and signed off
--
-- Decided: on every WO Shipyard resubmission, every item's hsse_status is
-- reset to PENDING (the app enforces this) so HSSE always reviews the whole
-- checklist fresh — but hsse_notes are left in place across the reset so
-- HSSE's prior feedback stays visible as context, not wiped every round.
-- ============================================================================

set search_path to daily_report_shipyard;

-- Map existing rows onto the new status set before narrowing the constraint.
update vessel_readiness_forms set status = 'SUBMITTED' where status = 'PENDING_APPROVAL';
update vessel_readiness_forms set status = 'NEEDS_CLARIFICATION' where status = 'REJECTED';

alter table vessel_readiness_forms drop constraint vessel_readiness_forms_status_check;
alter table vessel_readiness_forms
  add constraint vessel_readiness_forms_status_check
  check (status in ('DRAFT', 'SUBMITTED', 'NEEDS_CLARIFICATION', 'APPROVED'));

-- Per-item HSSE review: each checklist answer gets its own approve/reject
-- decision, notes, and reviewer trail, independent of the other items.
alter table readiness_form_responses
  add column hsse_status text not null default 'PENDING'
    check (hsse_status in ('PENDING', 'APPROVED', 'REJECTED')),
  add column hsse_notes text,
  add column hsse_reviewed_by bigint references profiles(id),
  add column hsse_reviewed_at timestamptz;

-- Drop the two non-HSSE sign-off roles — HSSE is now the only sign-off.
delete from readiness_form_approvals
where approval_role_id in (
  select id from readiness_approval_roles
  where role_code in ('MARKETING_PPIC', 'BUSINESS_UNIT_HEAD')
);
delete from readiness_approval_roles
where role_code in ('MARKETING_PPIC', 'BUSINESS_UNIT_HEAD');
