-- ============================================================================
-- Replace the BASTP document upload with a materials-submission gate for
-- VERIFIED -> READY_FOR_INVOICE.
--
-- Business rule: a BASTP becomes ready for invoicing once every one of its
-- (non-cancelled) work details has its materials finalized. PPIC can save
-- material_control rows as a draft while still figuring out what was used,
-- then explicitly submit. Submitting with zero materials is valid — some
-- work genuinely needs none — the submit action itself is what counts, not
-- the row count. See BASTPMaterialsPage.tsx / MaterialControl.tsx / BASTP.tsx.
--
-- The BASTP document upload feature (storage_path / bastp_upload_date /
-- document_url) is removed from the BASTP module's own screens. Those
-- columns are left in place — existing uploaded documents remain visible on
-- already-invoiced BASTPs via the Invoice screens, which read them
-- independently — but the BASTP module no longer reads or writes them.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table bastp_work_details
  add column materials_status text not null default 'DRAFT'
    check (materials_status in ('DRAFT', 'SUBMITTED')),
  add column materials_submitted_at timestamptz,
  add column materials_submitted_by bigint references profiles(id);

comment on column bastp_work_details.materials_status is
  'DRAFT while PPIC is still entering material_control rows for this work detail on this BASTP; SUBMITTED once finalized (even with zero materials, for work that needs none). All non-cancelled work details on a BASTP must be SUBMITTED before it can move to READY_FOR_INVOICE.';
comment on column bastp_work_details.materials_submitted_at is
  'Timestamp of the most recent submit action. Null while DRAFT.';
comment on column bastp_work_details.materials_submitted_by is
  'profiles.id of who submitted. Null while DRAFT.';
