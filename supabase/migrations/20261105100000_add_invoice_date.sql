-- ============================================================================
-- Adds an editable invoice date to invoice_details.
--
-- The printed "Invoice Date" used to be invoice_details.created_at, i.e. the
-- moment the record was first saved, which staff could not correct for a late
-- or backdated invoice. invoice_date is nullable: invoices that never had one
-- set keep showing created_at until someone edits them.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table invoice_details
  add column if not exists invoice_date date;
