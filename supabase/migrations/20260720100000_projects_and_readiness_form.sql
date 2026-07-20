-- ============================================================================
-- Adds a Projects layer above Work Orders, and the FM-OPS-04-11 Vessel
-- Readiness Form ("Kesiapan Kapal Sebelum Memasuki Galangan") that must be
-- fully approved before a project's ORIGINAL work order can be created.
--
-- Hierarchy after this migration:
--   vessel -> project (one vessel per project) -> work_order (original + additional)
--                                                     -> work_details -> progress / verification
--   project -> vessel_readiness_form (one active form per project, gate for the
--              original work order only; additional work orders are not gated)
--
-- Run against the `daily_report_shipyard` schema.
-- ============================================================================

set search_path to daily_report_shipyard;

-- ----------------------------------------------------------------------------
-- 1. Projects
-- ----------------------------------------------------------------------------
create table projects (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  project_name text not null,                -- e.g. "PROJECT MT PATRICIA 20 JULI 2026"
  vessel_id bigint not null references vessel(id),
  readiness_form_id bigint,                  -- FK added after vessel_readiness_forms exists (see below)
  user_id bigint not null references profiles(id)
);

create index idx_projects_vessel_id on projects(vessel_id);

-- ----------------------------------------------------------------------------
-- 2. Vessel Readiness Form (FM-OPS-04-11) — one active form per project
-- ----------------------------------------------------------------------------
create table vessel_readiness_forms (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  project_id bigint not null references projects(id),
  vessel_id bigint not null references vessel(id),   -- denormalized for direct lookups; must match projects.vessel_id
  docking_date date,                                   -- "Tanggal Naik Docking/Sandar"
  owner_name text,                                     -- "Owner" field on the form
  last_cargo_info text,                                -- free-text "Informasi terkait muatan terakhir kapal"
  gas_test_document_url text,                          -- attachment for footnote (**), Gas Tester result FR-02-01
  gas_test_storage_path text,
  -- Mirrors how BASTP.status is computed client-side from child data rather than
  -- transitioned by a DB trigger — recompute this the same way:
  --   DRAFT              -> just created, checklist not fully answered
  --   PENDING_APPROVAL   -> checklist complete, signatures still missing
  --   APPROVED           -> all 9 approval slots signed (both parties) — this is
  --                         the state that gates the project's original work order
  --   REJECTED           -> superseded by a redone submission (kept for history)
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  user_id bigint not null references profiles(id)
);

create index idx_readiness_forms_project_id on vessel_readiness_forms(project_id);

-- Exactly one active (non-deleted) readiness form per project
create unique index one_active_readiness_form_per_project
  on vessel_readiness_forms(project_id) where deleted_at is null;

alter table projects
  add constraint fk_projects_readiness_form
  foreign key (readiness_form_id) references vessel_readiness_forms(id);

-- vessel_readiness_forms.vessel_id must match its project's vessel_id
create or replace function check_readiness_form_vessel() returns trigger as $$
begin
  if new.vessel_id is distinct from (select vessel_id from projects where id = new.project_id) then
    raise exception 'Readiness form vessel must match its project''s vessel';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_readiness_form_vessel
  before insert or update on vessel_readiness_forms
  for each row execute function check_readiness_form_vessel();

-- ----------------------------------------------------------------------------
-- 3. Checklist items (seeded lookup — same pattern as general_service_types)
-- ----------------------------------------------------------------------------
create table readiness_checklist_items (
  id bigint generated always as identity primary key,
  section text not null,          -- GAS_CONDITION | TANK_CONDITION | VESSEL_STATUS | FUEL_LUBE_TANK
  section_label text not null,
  item_text text not null,
  display_order int not null
);

insert into readiness_checklist_items (section, section_label, item_text, display_order) values
  ('GAS_CONDITION', 'Kondisi Gas Sebelum Kedatangan', 'Kandungan Oksigen tidak lebih dan tidak kurang dari 19.5%-23.5%', 1),
  ('GAS_CONDITION', 'Kondisi Gas Sebelum Kedatangan', 'Kadar Uap Hidrokarbon kurang dari 1% Lower Flamable Limit (LFL)/Lower Explosive Limit (LEL)', 2),
  ('GAS_CONDITION', 'Kondisi Gas Sebelum Kedatangan', 'Gas Beracun (H2S) dibawah exposure limit (<5 ppm)', 3),
  ('GAS_CONDITION', 'Kondisi Gas Sebelum Kedatangan', 'Gas Karbonmonoksida (CO) kurang dari 10 ppm', 4),
  ('TANK_CONDITION', 'Kondisi Tangki Cairan/Kargo/Minyak', 'Seluruh tangki bersih dari cairan mudah terbakar', 1),
  ('TANK_CONDITION', 'Kondisi Tangki Cairan/Kargo/Minyak', 'Seluruh tangki bersih dari cairan mudah meledak', 2),
  ('TANK_CONDITION', 'Kondisi Tangki Cairan/Kargo/Minyak', 'Seluruh tangki bersih dari Limbah B3 maupun Cairan', 3),
  ('VESSEL_STATUS', 'Verifikasi Status Kapal', 'Kapal sudah dinyatakan aman dari gas berbahaya oleh QSHE Shipping/Owner', 1),
  ('VESSEL_STATUS', 'Verifikasi Status Kapal', 'Kapal memiliki Blower Portable untuk melakukan free gas', 2),
  ('FUEL_LUBE_TANK', 'Tangki Bahan Bakar dan Oli Pelumas', 'Seluruh tangki yang berisi Bahan Bakar telah di identifikasi serta di informasikan kepada Tim Galangan', 1),
  ('FUEL_LUBE_TANK', 'Tangki Bahan Bakar dan Oli Pelumas', 'Seluruh tangki yang berisi Pelumas telah di identifikasi serta di informasikan kepada Tim Galangan', 2);

-- Note: the form's "Informasi terkait muatan terakhir kapal" line under
-- Kondisi Tangki is free text, not Ya/Tidak — that lives on
-- vessel_readiness_forms.last_cargo_info instead of as a checklist item.

-- ----------------------------------------------------------------------------
-- 4. Per-form answers to each checklist item
-- ----------------------------------------------------------------------------
create table readiness_form_responses (
  id bigint generated always as identity primary key,
  readiness_form_id bigint not null references vessel_readiness_forms(id),
  checklist_item_id bigint not null references readiness_checklist_items(id),
  is_compliant boolean,        -- Ya = true, Tidak = false, null = unanswered
  explanation text,            -- "Bila tidak, jelaskan"
  unique (readiness_form_id, checklist_item_id)
);

-- ----------------------------------------------------------------------------
-- 5. Approval roles (seeded lookup) and per-form sign-offs
-- ----------------------------------------------------------------------------
create table readiness_approval_roles (
  id bigint generated always as identity primary key,
  party text not null check (party in ('VESSEL_OWNER', 'SHIPYARD')),
  role_code text not null unique,
  role_label text not null,      -- e.g. "Chief Officer"
  action_label text not null,    -- e.g. "Diketahui oleh" / Acknowledged by
  display_order int not null
);

insert into readiness_approval_roles (party, role_code, role_label, action_label, display_order) values
  ('VESSEL_OWNER', 'HSE_VESSEL_OWNER',       'HSE Kapal/Owner',   'Disiapkan oleh',  1),
  ('VESSEL_OWNER', 'CHIEF_OFFICER',          'Chief Officer',     'Diketahui oleh',  2),
  ('VESSEL_OWNER', 'CHIEF_ENGINEER',         'Chief Engineer',    'Diketahui oleh',  3),
  ('VESSEL_OWNER', 'OPERATION_HEAD',         'Operation Head',    'Diketahui oleh',  4),
  ('VESSEL_OWNER', 'MASTER',                 'Master',            'Disetujui oleh',  5),
  ('SHIPYARD',     'MARKETING_PPIC',         'Marketing & PPIC',  'Diterima oleh',   6),
  ('SHIPYARD',     'HSE_OFFICER_SHIPYARD',   'HSE Officer Shipyard', 'Diperiksa oleh', 7),
  ('SHIPYARD',     'KAPRO',                  'Kepala Project (Kapro)', 'Diketahui oleh', 8),
  ('SHIPYARD',     'HSE_DEPT_HEAD_SHIPYARD', 'HSE Dept. Head Shipyard', 'Disetujui oleh', 9);

create table readiness_form_approvals (
  id bigint generated always as identity primary key,
  readiness_form_id bigint not null references vessel_readiness_forms(id),
  approval_role_id bigint not null references readiness_approval_roles(id),
  signer_name text,
  signed_date date,
  unique (readiness_form_id, approval_role_id)
);

-- ----------------------------------------------------------------------------
-- 6. Work orders join a project; vessel must match the project's vessel
-- ----------------------------------------------------------------------------
alter table work_order
  add column project_id bigint references projects(id);

create index idx_work_order_project_id on work_order(project_id);

create or replace function check_wo_project_vessel() returns trigger as $$
begin
  if new.project_id is not null
     and new.vessel_id is distinct from (select vessel_id from projects where id = new.project_id) then
    raise exception 'Work order vessel must match its project''s vessel';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_wo_project_vessel
  before insert or update on work_order
  for each row execute function check_wo_project_vessel();

-- ============================================================================
-- Decided: existing work orders are left unassigned, not backfilled.
--
--   work_order.project_id stays NULL on all 86 pre-existing rows (and on the
--   6 rows that don't even have a vessel_id). PPIC will assign these to
--   projects manually, on their own schedule, through whatever UI/process is
--   built for that later — this migration does not attempt to group historical
--   work orders into projects, and does not need to.
--
--   The requirement is forward-only: the app enforces "every NEW work order
--   must belong to a project" at the UI layer (the Add Work Order flow picks
--   a project first, which pins the vessel), not via a NOT NULL constraint
--   here — a plain NOT NULL would also reject the legacy unassigned rows on
--   any future update to them.
--
-- Still needs a human decision before it can be enforced:
--
--   Application-layer gate: when creating an ORIGINAL work order
--   (is_additional_wo = false), the UI/service layer must check that
--   projects.readiness_form_id points to a vessel_readiness_forms row with
--   status = 'APPROVED' before allowing the insert. This migration does not
--   enforce that in the database, matching how BASTP's status gating in this
--   app is already done in the client, not via triggers.
-- ============================================================================
