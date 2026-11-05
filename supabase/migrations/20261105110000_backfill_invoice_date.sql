-- ============================================================================
-- One-off: give every invoice that has no invoice_date the date it was created
-- (in local Makassar time), which is the date its print and details page were
-- already showing. Staff then correct the real invoice dates by hand in the
-- invoice form. Safe to re-run: it only fills empty values.
-- ============================================================================

set search_path to daily_report_shipyard;

update invoice_details
set invoice_date = (created_at at time zone 'Asia/Makassar')::date
where invoice_date is null;
