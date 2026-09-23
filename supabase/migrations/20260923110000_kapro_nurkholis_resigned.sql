-- Kapro (Project Leader) roster update: Nur Kholis Akbar has resigned.
-- Soft-delete only (not a hard delete/rename) — 38 existing work_order rows
-- reference kapro_id = 6, and no query in the app re-filters an already-
-- assigned kapro by deleted_at, so his name keeps showing correctly on
-- every historical work order. This only removes him from the "pick a
-- Kapro" dropdown for new/edited work orders going forward.
update daily_report_shipyard.kapro
set deleted_at = now()
where id = 6 and kapro_name = 'Nur Kholis Akbar';

insert into daily_report_shipyard.kapro (kapro_name)
values ('Muhammad Surya Adiansyah');
