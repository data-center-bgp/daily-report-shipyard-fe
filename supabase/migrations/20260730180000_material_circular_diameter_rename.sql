-- ============================================================================
-- Rename material_control.radius to diameter.
--
-- The shipyard's existing Excel formula for round-stock weight is
-- =3.14*((L/2)^2)*length*amount*density/1000000 — it halves L before
-- squaring, which only makes sense if L is the diameter (e.g. "22" for a
-- D22 rod), not the radius. The CIRCULAR calc mode column is renamed to
-- match that convention; the app now divides by 2 internally, same as the
-- spreadsheet, so the team can type the same numbers they're used to.
--
-- Safe to rename outright (not just add+migrate): this column was added in
-- 20260730160000_material_calculation_modes.sql earlier the same day and no
-- real data has been entered against it yet.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table material_control
  rename column radius to diameter;

comment on column material_control.diameter is
  'Diameter in mm, used only in CIRCULAR mode — the formula halves this to get the radius (matches the team''s existing Excel convention). Null for other modes.';
