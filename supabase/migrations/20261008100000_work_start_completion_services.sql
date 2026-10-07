-- Two new day-based General Services for work done at sea (no docking or
-- undocking happens, so those stages can't mark when the job began/ended):
--   Work Start      (Tanggal Mulai Pekerjaan)
--   Work Completion (Tanggal Selesai Pekerjaan)
-- They live in the shared general_service_types list, so they show up both in
-- a work order's Docking Planning and in a BASTP's General Services, just like
-- Docking / Undocking, with the same start/close date range and total days.
insert into daily_report_shipyard.general_service_types
  (service_name, service_code, display_order, uom)
select v.service_name, v.service_code, v.display_order, 'day'
from (values
  ('Work Start',      'WORK_START',      14),
  ('Work Completion', 'WORK_COMPLETION', 15)
) as v(service_name, service_code, display_order)
where not exists (
  select 1 from daily_report_shipyard.general_service_types t
  where t.service_code = v.service_code
);
