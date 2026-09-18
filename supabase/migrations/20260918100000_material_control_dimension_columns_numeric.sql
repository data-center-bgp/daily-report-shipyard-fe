-- ============================================================================
-- Widen material_control's dimension columns from bigint to numeric.
--
-- length, width, thickness, and density were bigint (whole numbers only)
-- since before the calc-mode feature existed, while their siblings added
-- alongside it (area, layers, diameter, amount, total_amount) were all
-- correctly typed numeric. The entry form has always invited decimal input
-- on all of these (step="0.0001"), so any real-world fractional measurement
-- (a thickness of "87.5mm", say) failed outright with a raw Postgres error:
--   22P02 invalid input syntax for type bigint: "87.5"
--
-- Widening bigint -> numeric is lossless for any existing whole-number data
-- already in these columns.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table material_control
  alter column length type numeric using length::numeric,
  alter column width type numeric using width::numeric,
  alter column thickness type numeric using thickness::numeric,
  alter column density type numeric using density::numeric;

comment on column material_control.length is
  'Length in mm. DIMENSIONAL/CIRCULAR/REPAIR/PIPE_LENGTH modes. Decimal values allowed.';
comment on column material_control.width is
  'Width in mm. DIMENSIONAL/REPAIR modes. Decimal values allowed.';
comment on column material_control.thickness is
  'Thickness in mm, optional (blank = 2D calculation). DIMENSIONAL/REPAIR modes. Decimal values allowed.';
comment on column material_control.density is
  'Density in kg/m^3, optionally overriding the selected density type. DIMENSIONAL/CIRCULAR/REPAIR modes. Decimal values allowed.';
