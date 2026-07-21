-- ============================================================================
-- Add is_imported to work_progress, to support bulk-importing progress
-- updates without polluting the history table with duplicate rows.
--
-- work_progress is an open/append-only history table today: every manual
-- progress update (via the Add/Edit Progress screen) is its own row, dated
-- by report_date, and that's exactly what we want to keep for manual entries.
--
-- Bulk import is different: PPIC will re-upload an updated tracking sheet
-- repeatedly, and each work item should only ever have ONE row that import
-- owns and keeps overwriting — not a new row every time the sheet is
-- re-uploaded. is_imported marks that row so the importer can find it again
-- next time (per work_details_id, at most one row with is_imported = true).
--
-- Decided: manual entries are never touched by import (is_imported stays
-- false/default on them), and import never touches manual rows. If a newer
-- import row has an older report_date than what's already stored in the
-- is_imported row, the import skips it rather than overwriting — enforced in
-- the app layer (src/utils/importHandler.ts), not here.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table work_progress
  add column is_imported boolean not null default false;

create index idx_work_progress_work_details_imported
  on work_progress(work_details_id, is_imported);

comment on column work_progress.is_imported is
  'True for the single row per work_details_id that bulk import owns and updates in place. Manual entries via Add/Edit Progress always stay false and are never touched by import.';
