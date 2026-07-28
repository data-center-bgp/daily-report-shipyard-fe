-- ============================================================================
-- Track when a BASTP was promoted to READY_FOR_INVOICE, so the invoice form
-- can auto-fill "BASTP Collection Date" from it instead of requiring manual
-- entry every time. Set once, in the app (src/components/bastp/BASTP.tsx),
-- at the moment the auto status ladder promotes VERIFIED -> READY_FOR_INVOICE.
--
-- Existing BASTPs already past that transition keep this null — there's no
-- reliable way to backfill the exact historical transition time — so the
-- invoice form falls back to manual entry for those, same as today.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table bastp
  add column ready_for_invoice_date timestamptz;

comment on column bastp.ready_for_invoice_date is
  'Timestamp when this BASTP''s status transitioned to READY_FOR_INVOICE. Used to auto-fill the invoice''s BASTP Collection Date.';
