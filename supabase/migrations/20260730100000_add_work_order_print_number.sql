-- ============================================================================
-- Adds a document-print serial number to work_order, used by the new
-- "Perintah Kerja" (Work Order) PDF/print feature.
--
-- This is distinct from shipyard_wo_number (format NNNN/WO-PPIC/GAL-PL/M/YYYY)
-- and customer_wo_number (free text, e.g. from the customer's own numbering)
-- — it's a small sequential number specific to the printed document itself,
-- matching the real-world template's "No.: 025" field.
--
-- Assigned lazily, client-side, the first time a work order's document is
-- printed (see src/utils/workOrderPrintNumbering.ts) — same
-- query-max-then-increment approach already used for shipyard_wo_number
-- (src/utils/workOrderNumbering.ts), reset per calendar year based on
-- shipyard_wo_date. Left null for work orders that are never printed.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table work_order
  add column wo_print_number integer;

create unique index work_order_wo_print_number_year_idx
  on work_order (wo_print_number, date_part('year', shipyard_wo_date))
  where wo_print_number is not null and deleted_at is null;

comment on column work_order.wo_print_number is
  'Sequential document number for the printed "Perintah Kerja" (Work Order) form, e.g. 25 for "No.: 025". Resets per calendar year (of shipyard_wo_date). Null until the document has been printed once.';
