-- ============================================================================
-- Add a PEMBUBUTAN (lathing/turning) calculation mode to Material Control.
--
-- Amount only, like COUNT — but unlike COUNT (free-text uom, e.g. Ls/pcs/
-- unit/set), the unit is locked to "Ls" since this mode is specifically for
-- lathing/turning work priced by quantity of pieces machined, not a generic
-- countable item.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table material_lists
  drop constraint material_lists_calc_mode_check,
  add constraint material_lists_calc_mode_check
    check (calc_mode in ('AREA', 'DIMENSIONAL', 'CIRCULAR', 'COUNT', 'PIPE_LENGTH', 'REPAIR', 'PEMBUBUTAN'));

alter table material_control
  drop constraint material_control_calc_mode_check,
  add constraint material_control_calc_mode_check
    check (calc_mode in ('AREA', 'DIMENSIONAL', 'CIRCULAR', 'COUNT', 'PIPE_LENGTH', 'REPAIR', 'PEMBUBUTAN'));

comment on column material_lists.calc_mode is
  'Default calculation formula for this material: AREA (blasting/painting, length*width*layers), DIMENSIONAL (length*width*thickness*density*amount, thickness optional), CIRCULAR (pi*radius^2*length*density*amount), COUNT (amount only, free-text uom), PIPE_LENGTH (per-pcs under 1m, per-meter at/above 1m), REPAIR (same formula as DIMENSIONAL, always billed in Ls), or PEMBUBUTAN (amount only, always billed in Ls). Drives which fields the material-entry form shows once this material is selected.';
