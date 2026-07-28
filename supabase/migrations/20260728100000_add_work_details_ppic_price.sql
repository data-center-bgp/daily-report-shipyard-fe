-- ============================================================================
-- Let PPIC record a reference price per work detail item at creation time.
-- This is not billed anywhere by itself — it exists purely so Finance can
-- compare it against the unit price they enter when building an invoice in
-- src/components/invoice/ManageInvoice.tsx. Optional: older work details and
-- new ones where PPIC hasn't priced the item yet simply have it null, and the
-- invoice form just won't show a comparison for those rows.
--
-- Deliberately scoped to work_details only — general_services pricing is a
-- separate concern set directly on the BASTP and isn't part of this ask.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table work_details
  add column ppic_price numeric;

comment on column work_details.ppic_price is
  'Optional reference unit price set by PPIC when the work detail is created/edited. Shown in the invoice form as a comparison against Finance''s entered unit price — not itself billed or persisted to the invoice.';
