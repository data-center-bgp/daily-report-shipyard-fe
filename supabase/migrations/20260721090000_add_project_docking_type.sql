-- ============================================================================
-- Add docking_type to projects, to support the new project naming convention:
--
--   [PERUSAHAAN]-[NAMA KAPAL]-[JENIS DOCKING]-[YYYY]-[##]
--
-- JENIS DOCKING (docking_type) is chosen up front on the Add Project form,
-- using the same options as work_order.work_type (Docking, Docking - IS,
-- Docking - AS, Docking - SS, Repair). It's stored on the project itself
-- because it's decided before any work order exists (the original work order
-- can't be created until the readiness form is approved).
--
-- Nullable, forward-only, same as every other project field added since the
-- Projects module shipped: existing projects keep docking_type = NULL; the
-- app enforces "required" at the UI layer for new projects, not via a
-- NOT NULL constraint here.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table projects
  add column docking_type text;

comment on column projects.docking_type is
  'Jenis docking chosen when the project was created (same options as work_order.work_type). Used to build the project name: [PERUSAHAAN]-[NAMA KAPAL]-[JENIS DOCKING]-[YYYY]-[##]. NULL on projects created before this column existed.';
