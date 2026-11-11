-- ============================================================================
-- Fixed-quantity general services: lines billed as a count, not by days or
-- tons, and without dates — "Kali" (times) and "Ls" (lump sum). They are
-- optional picks on a BASTP like every other general service.
--
-- 1. general_service_types.uom accepts 'kali' and 'ls' next to 'day'/'ton'.
-- 2. Seven new service types from the standard docking quotation.
-- 3. display_order follows the quotation's order (the order the form, print,
--    Excel export and invoice list services in). Services that are not on the
--    quotation (Docking, Undocking, Towing, Floating, Fresh Water Supply,
--    Work Start, Work Completion) keep their place after it.
--
-- Day-based services stay the only ones offered in Work Order Docking
-- Planning, which filters on uom = 'day'.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table general_service_types
  drop constraint general_service_types_uom_check;
alter table general_service_types
  add constraint general_service_types_uom_check
  check (uom = any (array['day', 'ton', 'kali', 'ls']));

insert into general_service_types (service_name, service_code, display_order, uom)
select v.service_name, v.service_code, v.display_order, v.uom
from (values
  ('Docking / Undocking', 'DOCKING_UNDOCKING', 100, 'kali'),
  ('Tug Boat Assistensi Naik/Turun Dock', 'TUG_BOAT_ASSISTANCE', 100, 'kali'),
  ('Assistensi Naik/Turun Dock serta Pelayanan Tali Temali', 'DOCK_MOORING_ASSISTANCE', 100, 'kali'),
  ('Pengaturan Ganjal/Stop Block', 'BLOCK_ARRANGEMENT', 100, 'kali'),
  ('Docking Report / SN', 'DOCKING_REPORT', 100, 'ls'),
  ('Penyambungan dan Pelepasan Kabel Line', 'SHORE_POWER_CONNECTION', 100, 'ls'),
  ('Asistensi Penggunaan Alat Pendukung Kerja', 'WORK_EQUIPMENT_ASSISTANCE', 100, 'ls')
) as v(service_name, service_code, display_order, uom)
where not exists (
  select 1 from general_service_types t where t.service_code = v.service_code
);

update general_service_types t
set display_order = o.display_order
from (values
  ('DOCKING_UNDOCKING', 1),
  ('TUG_BOAT_ASSISTANCE', 2),
  ('DOCK_MOORING_ASSISTANCE', 3),
  ('BLOCK_ARRANGEMENT', 4),
  ('VESSEL_ON_DOCK', 5),
  ('BERTHING BEFORE DOCKING', 6),
  ('BERTHING AFTER DOCKING', 7),
  ('DOCKING', 8),
  ('UNDOCKING', 9),
  ('DOCKING_REPORT', 10),
  ('ELECTRICAL_SUPPLY', 11),
  ('SHORE_POWER_CONNECTION', 12),
  ('SECURITY_SERVICE', 13),
  ('TOILET_SERVICES', 14),
  ('TRASH_BIN_SERVICE', 15),
  ('SARFAS_AND_OPERATORS', 16),
  ('WORK_EQUIPMENT_ASSISTANCE', 17),
  ('TOWING', 18),
  ('FLOATING', 19),
  ('FRESH_WATER_SUPPLY', 20),
  ('WORK_START', 21),
  ('WORK_COMPLETION', 22)
) as o(service_code, display_order)
where t.service_code = o.service_code;
