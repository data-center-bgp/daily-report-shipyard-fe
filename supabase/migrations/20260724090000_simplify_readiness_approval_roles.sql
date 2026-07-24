-- ============================================================================
-- Reduce the Vessel Readiness Form's sign-off roles from 9 down to 3:
-- Marketing & PPIC, Business Unit Head, and HSSE. The full Vessel Owner /
-- Shipyard dual-party sign-off (the original FM-OPS-04-11 design) is more
-- than this shipyard needs in practice — only these three shipyard-side
-- approvals are required going forward.
--
-- Mapping (per product decision, no rename left ambiguous):
--   Kepala Project (Kapro)        -> Business Unit Head
--   HSE Dept. Head Shipyard       -> HSSE
--   Marketing & PPIC              -> unchanged
--   HSE Kapal/Owner, Chief Officer, Chief Engineer, Operation Head, Master,
--   HSE Officer Shipyard          -> removed entirely
--
-- Decided: no production readiness form has real signatures yet, so this
-- edits the seed data directly instead of migrating historical
-- readiness_form_approvals rows.
-- ============================================================================

set search_path to daily_report_shipyard;

-- Drop any sign-off rows (dev/test data) tied to the roles being removed.
delete from readiness_form_approvals
where approval_role_id in (
  select id from readiness_approval_roles
  where role_code in (
    'HSE_VESSEL_OWNER', 'CHIEF_OFFICER', 'CHIEF_ENGINEER', 'OPERATION_HEAD', 'MASTER',
    'HSE_OFFICER_SHIPYARD'
  )
);

delete from readiness_approval_roles
where role_code in (
  'HSE_VESSEL_OWNER', 'CHIEF_OFFICER', 'CHIEF_ENGINEER', 'OPERATION_HEAD', 'MASTER',
  'HSE_OFFICER_SHIPYARD'
);

-- Kepala Project (Kapro) -> Business Unit Head
update readiness_approval_roles
set role_code = 'BUSINESS_UNIT_HEAD',
    role_label = 'Business Unit Head',
    display_order = 2
where role_code = 'KAPRO';

-- HSE Dept. Head Shipyard -> HSSE
update readiness_approval_roles
set role_code = 'HSSE',
    role_label = 'HSSE',
    display_order = 3
where role_code = 'HSE_DEPT_HEAD_SHIPYARD';

-- Marketing & PPIC is unchanged apart from renumbering to be first.
update readiness_approval_roles
set display_order = 1
where role_code = 'MARKETING_PPIC';
