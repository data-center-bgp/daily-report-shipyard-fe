-- Sea Trial: a fixed-quantity (lump sum) general service, optional on a BASTP
-- like the others. It is not part of the quotation's numbered blocks, so the
-- form lists it under "Other services", after the existing ones.

set search_path to daily_report_shipyard;

insert into general_service_types (service_name, service_code, display_order, uom)
select 'Sea Trial', 'SEA_TRIAL', 23, 'ls'
where not exists (
  select 1 from general_service_types where service_code = 'SEA_TRIAL'
);
