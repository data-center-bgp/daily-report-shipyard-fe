-- ============================================================================
-- Add calculation-mode support to Material Control.
--
-- Previously every material_control row used one generic formula
-- (length * width * thickness * density * amount, with any missing dimension
-- treated as 1). That formula is kept as the "DIMENSIONAL" mode, and three
-- more modes are added to match how materials are actually measured on the
-- shipyard floor:
--   - AREA:        length * width * layers (blasting = 1 layer, painting = N
--                   layers). No density/thickness involved.
--   - DIMENSIONAL: the original length * width * thickness * density *
--                   amount formula (thickness optional, degrades to a 2D
--                   calculation when left blank).
--   - CIRCULAR:    pi * radius^2 * length * density * amount.
--   - COUNT:       amount only (Ls/pcs), no formula.
--
-- calc_mode lives on material_lists (the material master data) so picking a
-- material in the entry form auto-selects its mode. It's duplicated onto
-- material_control as a snapshot, so a later change to a material's default
-- mode doesn't reinterpret historical entries.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table material_lists
  add column calc_mode text not null default 'DIMENSIONAL'
    check (calc_mode in ('AREA', 'DIMENSIONAL', 'CIRCULAR', 'COUNT'));

alter table material_control
  add column calc_mode text not null default 'DIMENSIONAL'
    check (calc_mode in ('AREA', 'DIMENSIONAL', 'CIRCULAR', 'COUNT')),
  add column layers numeric,
  add column radius numeric;

comment on column material_lists.calc_mode is
  'Default calculation formula for this material: AREA (blasting/painting, length*width*layers), DIMENSIONAL (length*width*thickness*density*amount, thickness optional), CIRCULAR (pi*radius^2*length*density*amount), or COUNT (amount only). Drives which fields the material-entry form shows once this material is selected.';
comment on column material_control.calc_mode is
  'Snapshot of the material''s calc_mode at the time this row was entered — see material_lists.calc_mode.';
comment on column material_control.layers is
  'Number of coats/layers, used only in AREA mode (blasting = 1, painting = N). Null for other modes.';
comment on column material_control.radius is
  'Radius in mm, used only in CIRCULAR mode. Null for other modes.';
