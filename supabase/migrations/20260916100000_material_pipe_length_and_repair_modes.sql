-- ============================================================================
-- Add two more Material Control calculation modes: PIPE_LENGTH and REPAIR.
--
--   - PIPE_LENGTH: length-based, billed either per piece or per meter.
--       If length < 1000mm, uom is "pcs" and total_amount = amount.
--       If length >= 1000mm, uom is "m" and total_amount = (length / 1000)
--       * amount — the same "multiply by amount for identical batched rows"
--       convention as DIMENSIONAL/CIRCULAR. No density involved.
--   - REPAIR: same formula as DIMENSIONAL (length * width * (thickness or 1)
--       * density * amount, thickness optional for a 2D vs 3D calculation),
--       but always billed as "Ls" (lump sum) rather than falling through
--       DIMENSIONAL's kg/pcs weight-threshold logic — a repair service is
--       priced by job done, not by the material weight it consumes.
--
-- Both modes reuse existing material_control columns (length, width,
-- thickness, density, amount) — no new columns needed, only widening the two
-- calc_mode CHECK constraints.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table material_lists
  drop constraint material_lists_calc_mode_check,
  add constraint material_lists_calc_mode_check
    check (calc_mode in ('AREA', 'DIMENSIONAL', 'CIRCULAR', 'COUNT', 'PIPE_LENGTH', 'REPAIR'));

alter table material_control
  drop constraint material_control_calc_mode_check,
  add constraint material_control_calc_mode_check
    check (calc_mode in ('AREA', 'DIMENSIONAL', 'CIRCULAR', 'COUNT', 'PIPE_LENGTH', 'REPAIR'));

comment on column material_lists.calc_mode is
  'Default calculation formula for this material: AREA (blasting/painting, length*width*layers), DIMENSIONAL (length*width*thickness*density*amount, thickness optional), CIRCULAR (pi*radius^2*length*density*amount), COUNT (amount only), PIPE_LENGTH (per-pcs under 1m, per-meter at/above 1m), or REPAIR (same formula as DIMENSIONAL, always billed in Ls). Drives which fields the material-entry form shows once this material is selected.';
