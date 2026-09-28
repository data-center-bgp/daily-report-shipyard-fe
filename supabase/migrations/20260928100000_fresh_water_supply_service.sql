-- General services were all day-based (start/close date -> total_days,
-- priced per day). Fresh Water Supply is billed per ton on a single supply
-- date, so each service type now declares its unit of measure, and BASTP
-- general_services gets a separate quantity column for non-day units —
-- kept apart from total_days so days and tons never get summed together.

alter table daily_report_shipyard.general_service_types
  add column uom text not null default 'day'
  check (uom in ('day', 'ton'));

alter table daily_report_shipyard.general_services
  add column quantity numeric;

insert into daily_report_shipyard.general_service_types
  (service_name, service_code, display_order, uom)
values
  ('Fresh Water Supply', 'FRESH_WATER_SUPPLY', 13, 'ton');
