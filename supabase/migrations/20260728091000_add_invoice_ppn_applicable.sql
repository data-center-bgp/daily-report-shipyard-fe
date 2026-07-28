-- ============================================================================
-- Make PPN (11%) optional per invoice while PPh 23 (2%) stays mandatory.
-- ppn_applicable defaults true so every existing invoice keeps behaving
-- exactly as before; unchecking "Apply PPN" on an invoice zeroes its ppn
-- and total_price_after in the app layer (src/components/invoice/ManageInvoice.tsx).
-- ============================================================================

set search_path to daily_report_shipyard;

alter table invoice_details
  add column ppn_applicable boolean not null default true;

comment on column invoice_details.ppn_applicable is
  'Whether PPN (11%) is charged on this invoice. PPh 23 (2%) is always applied regardless of this flag.';
