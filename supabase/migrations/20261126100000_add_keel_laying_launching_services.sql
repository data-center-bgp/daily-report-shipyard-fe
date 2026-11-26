-- ============================================================================
-- Date-only general services: a service that records one date and nothing else.
-- No days, no quantity, no price, so it never reaches an invoice. They are
-- optional picks on a BASTP like every other general service.
--
-- 1. general_service_types.uom accepts 'date' next to 'day'/'ton'/'kali'/'ls'.
-- 2. Two new service types, from the docking quotation's land-rental block:
--      Keel Laying (the date the keel was laid)
--      Launching   (the date the vessel was launched)
--    They go after the existing ones, so they show under "Other services" on
--    the BASTP form and last in its print and Excel export.
--
-- The single date is stored in both start_date and close_date (the same way a
-- Fresh Water Supply delivery stores its supply date), so code that reads
-- dates keeps working. Work Order Docking Planning stays day-based only.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table general_service_types
  drop constraint general_service_types_uom_check;
alter table general_service_types
  add constraint general_service_types_uom_check
  check (uom = any (array['day', 'ton', 'kali', 'ls', 'date']));

insert into general_service_types (service_name, service_code, display_order, uom)
select v.service_name, v.service_code, v.display_order, 'date'
from (values
  ('Keel Laying', 'KEEL_LAYING', 24),
  ('Launching',   'LAUNCHING',   25)
) as v(service_name, service_code, display_order)
where not exists (
  select 1 from general_service_types t where t.service_code = v.service_code
);
