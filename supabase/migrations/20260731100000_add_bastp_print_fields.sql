-- ============================================================================
-- Fields needed to print the BASTP ("Berita Acara Serah Terima Pekerjaan")
-- document, matching the paper form. None of this is derivable from existing
-- tables:
--   - The four docking milestone dates only apply to docking-type handovers
--     and aren't tracked anywhere (work_details/work_order only have
--     planned_start_date/target_close_date per work item, not these
--     vessel-level docking milestones).
--   - The "To: <name> / <role>" recipient line (e.g. "Agus Handoko / Owner
--     Surveyor") is the person receiving the handover on the owner's side —
--     not a system user, so it has no natural FK target.
--
-- All nullable and additive: no existing row, query, or screen references
-- these columns yet, so nothing already stored is affected by adding them.
-- Left blank on non-docking (pure repair) BASTPs.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table bastp
  add column tanggal_sandar date,
  add column tanggal_naik_docking date,
  add column tanggal_turun_docking date,
  add column tanggal_tambat_setelah_turun_dock date,
  add column to_name text,
  add column to_role text;

comment on column bastp.tanggal_sandar is
  'Docking BASTP: date the vessel moored before entering dry dock. Null when not applicable (pure repair, no docking).';
comment on column bastp.tanggal_naik_docking is
  'Docking BASTP: date the vessel entered dry dock.';
comment on column bastp.tanggal_turun_docking is
  'Docking BASTP: date the vessel left dry dock.';
comment on column bastp.tanggal_tambat_setelah_turun_dock is
  'Docking BASTP: date the vessel moored again after leaving dry dock.';
comment on column bastp.to_name is
  'Printed BASTP recipient name (the "To:" line) — typically the owner-side surveyor, not a system user.';
comment on column bastp.to_role is
  'Printed BASTP recipient role/title, e.g. "Owner Surveyor".';
