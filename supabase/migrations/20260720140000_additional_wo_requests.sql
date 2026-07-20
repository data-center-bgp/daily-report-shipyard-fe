-- ============================================================================
-- Additional Work Order approval requests.
--
-- Target schema: daily_report_shipyard (this app's own schema in the shared
-- "CGA" Postgres instance — other apps in this project use their own schemas:
-- barokah_guestbook, kemala_security, monitoring_*, kpi, etc. Nothing here
-- touches those).
--
-- Depends on these existing daily_report_shipyard tables:
--   projects        — the request is scoped to one project
--   vessel          — denormalized alongside project_id, must match it
--   profiles        — both the requester and the deciding Operation Head
--   work_order      — set once the approval is consumed by an actual WO
--
-- Business rule: creating an ADDITIONAL work order (is_additional_wo = true)
-- for a project now requires prior approval from the Operation Head (the
-- fleet's operation lead) — distinct from the Vessel Readiness Form, which
-- only gates the ORIGINAL work order.
--
-- One request = one potential additional work order. Once a request is
-- APPROVED, it can be consumed exactly once (work_order_id gets set when the
-- resulting work order is created), after which it can't be reused.
--
-- Decided: forward-only, same as the readiness-form rollout — existing
-- additional work orders created before this migration are not required to
-- have a request on file. This is enforced in the app layer (Add Work Order
-- flow), not backfilled here.
-- ============================================================================

set search_path to daily_report_shipyard;

create table additional_wo_requests (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  project_id bigint not null references projects(id),
  vessel_id bigint not null references vessel(id),   -- denormalized; must match project's vessel
  requested_by bigint not null references profiles(id),
  reason text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  decided_by bigint references profiles(id),
  decided_at timestamptz,
  decision_notes text,
  -- Set once this approval is consumed by creating the actual work order.
  -- A request can only ever back one work order.
  work_order_id bigint references work_order(id)
);

create index idx_additional_wo_requests_project_id on additional_wo_requests(project_id);
create index idx_additional_wo_requests_status on additional_wo_requests(status);

-- Same vessel-consistency guard used for projects/readiness forms
create or replace function check_additional_wo_request_vessel() returns trigger as $$
begin
  if new.vessel_id is distinct from (select vessel_id from projects where id = new.project_id) then
    raise exception 'Additional work order request vessel must match its project''s vessel';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_additional_wo_request_vessel
  before insert or update on additional_wo_requests
  for each row execute function check_additional_wo_request_vessel();

-- ----------------------------------------------------------------------------
-- Self-documenting schema: these comments show up in Supabase Studio's table
-- editor and via `\d+ daily_report_shipyard.additional_wo_requests` in psql,
-- so the business rules are visible from the schema itself, not just here.
-- ----------------------------------------------------------------------------
comment on table daily_report_shipyard.additional_wo_requests is
  'Approval requests an Operation Head must grant before an ADDITIONAL work order (work_order.is_additional_wo = true) can be created for a project. One request backs at most one work order.';

comment on column daily_report_shipyard.additional_wo_requests.project_id is
  'The project this additional work order would belong to. Must already have an original (non-additional) work order.';
comment on column daily_report_shipyard.additional_wo_requests.vessel_id is
  'Denormalized from projects.vessel_id; kept in sync by trg_additional_wo_request_vessel.';
comment on column daily_report_shipyard.additional_wo_requests.requested_by is
  'profiles.id of the PPIC/PRODUCTION user asking for the additional work order.';
comment on column daily_report_shipyard.additional_wo_requests.reason is
  'Free-text justification shown to the Operation Head when deciding.';
comment on column daily_report_shipyard.additional_wo_requests.status is
  'PENDING (awaiting decision) -> APPROVED or REJECTED. Set by the Operation Head via the Additional WO Approvals screen.';
comment on column daily_report_shipyard.additional_wo_requests.decided_by is
  'profiles.id of the Operation Head (or MASTER override) who approved/rejected this request.';
comment on column daily_report_shipyard.additional_wo_requests.decided_at is
  'Timestamp of the approve/reject decision. Null while status = PENDING.';
comment on column daily_report_shipyard.additional_wo_requests.decision_notes is
  'Optional note on approval; required by the app (not the DB) on rejection to explain why.';
comment on column daily_report_shipyard.additional_wo_requests.work_order_id is
  'Set once this APPROVED request is consumed by actually creating the work order. Null = not yet used (or not approved). A request is spent the first time it backs a work order.';

-- ============================================================================
-- NOT covered here — application-layer responsibility, matching how every
-- other gate in this app (BASTP status, readiness-form status) is enforced:
--
--   The Add Work Order flow must check for an APPROVED request with
--   work_order_id IS NULL for the selected project before allowing an
--   additional WO to be created, and must set work_order_id on that request
--   immediately after the work order insert succeeds.
-- ============================================================================
