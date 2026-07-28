-- ============================================================================
-- Remove bastp.delivery_date — no longer used anywhere in the app. It was
-- distinct from invoice_details.delivery_date ("Delivery Date (to Customer)"
-- on the invoice), which is untouched by this migration.
--
-- Destructive: this permanently discards whatever delivery_date values are
-- currently stored on bastp rows. Confirmed with the user before writing
-- this migration.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table bastp
  drop column delivery_date;
