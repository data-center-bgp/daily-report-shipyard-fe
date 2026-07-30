-- ============================================================================
-- AREA mode no longer derives area from Length x Width — blasting/painting
-- areas are measured directly in the field, not computed from two
-- dimensions. Add a dedicated column for that direct m^2 entry.
--
-- layers stays optional (already nullable): blasting is implicitly 1 layer,
-- painting sets it when more than one coat was applied.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table material_control
  add column area numeric;

comment on column material_control.area is
  'Directly-entered area in m^2, used only in AREA mode (length/width are not used for this mode). Total = area * layers.';
