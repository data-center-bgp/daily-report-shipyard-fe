-- ============================================================================
-- Third and final gate for VERIFIED -> READY_FOR_INVOICE: uploading the
-- "Form Penawaran" (offer/quotation form), PDF only.
--
-- Combined with the other two gates already in place:
--   1. All non-cancelled work details verified (implicit in reaching VERIFIED)
--   2. All non-cancelled work details' materials submitted (see
--      20260729140000_bastp_materials_submission_gate.sql)
--   3. Form Penawaran uploaded (this migration)
--
-- This is a distinct upload from the old BASTP "signed document" feature
-- that was removed — that one's storage_path/bastp_upload_date columns are
-- untouched and still only used by the Invoice screens for legacy records.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table bastp
  add column form_penawaran_storage_path text,
  add column form_penawaran_uploaded_at timestamptz;

comment on column bastp.form_penawaran_storage_path is
  'Storage path (bucket "bastp") of the uploaded Form Penawaran PDF. Null until uploaded. Required, along with materials submission, before VERIFIED -> READY_FOR_INVOICE.';
comment on column bastp.form_penawaran_uploaded_at is
  'Timestamp of the most recent Form Penawaran upload. Null until uploaded.';
