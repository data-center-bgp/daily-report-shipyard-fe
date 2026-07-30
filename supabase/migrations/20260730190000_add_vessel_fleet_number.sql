-- ============================================================================
-- Add a fleet number to vessels, sourced from the company's internal fleet
-- API (fleet.id — a plain integer 1-7). The API also carries a roman-numeral
-- display name ("Fleet I", "Fleet III", ...) but that's derivable from the
-- number, so only the number is stored; render "Fleet {n}" wherever needed.
--
-- Nullable and additive: no existing row, query, or screen references this
-- column yet, so nothing already stored is affected by adding it.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table vessel
  add column fleet_number integer check (fleet_number is null or fleet_number > 0);

comment on column vessel.fleet_number is
  'Fleet number (1-7) from the company''s internal fleet API. Display as "Fleet {n}".';
