-- ============================================================================
-- Cleans up stray leading/trailing whitespace in master-data name columns.
--
-- Found via QA testing: 7 vessel names (e.g. "TB YUDDY 01 ") and 1 work_scope
-- name ("Electrical ") carry an accidental trailing space. This isn't just
-- cosmetic — it also produced what looked like a duplicate "Electrical" work
-- scope: "Electrical" (id 2, unused) and "Electrical " (id 21, used by 3
-- work_details rows) are the same value once trimmed, not two real options.
--
-- Master data (vessel/kapro/location/work_scope) is managed outside this app
-- (Supabase dashboard/SQL, not an in-app form), so there's no single insert
-- path to defend here — this migration just repairs the current bad rows.
-- ============================================================================

set search_path to daily_report_shipyard;

-- Merge the whitespace-only "Electrical" duplicate into the one actually in
-- use, then trim its label.
update work_details set work_scope_id = 21 where work_scope_id = 2;
delete from work_scope where id = 2;
update work_scope set work_scope = trim(work_scope) where id = 21;

-- Trim any other stray whitespace across master-data name columns.
update vessel set name = trim(name) where name <> trim(name);
update kapro set kapro_name = trim(kapro_name) where kapro_name <> trim(kapro_name);
update location set location = trim(location) where location <> trim(location);
update work_scope set work_scope = trim(work_scope) where work_scope <> trim(work_scope);
