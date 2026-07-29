-- ============================================================================
-- Chairman-directive additional work orders.
--
-- Normally an ADDITIONAL work order (work_order.is_additional_wo = true)
-- needs an approved additional_wo_requests row from the Operation Head
-- before it can be created (see 20260720140000_additional_wo_requests.sql).
--
-- Business rule: when the company's chairman directly orders urgent work,
-- the requester can skip that Operation Head review entirely and create the
-- additional work order immediately. This is still required to have an
-- original work order in the project first (same as any additional WO) —
-- only the approval step is bypassed.
--
-- Implementation: rather than a new status, this is modeled as a request
-- that is self-approved at insert time (status = 'APPROVED' immediately),
-- flagged by is_chairman_directive so it stays distinguishable from a real
-- Operation Head approval for monitoring purposes. decided_by/decided_at
-- stay null for these rows since no one actually reviewed them — only
-- is_chairman_directive + reason explain why status is already APPROVED.
-- ============================================================================

set search_path to daily_report_shipyard;

alter table additional_wo_requests
  add column is_chairman_directive boolean not null default false;

comment on column daily_report_shipyard.additional_wo_requests.is_chairman_directive is
  'True when this request was self-approved because the chairman directly ordered the work and it must proceed immediately, bypassing Operation Head review. When true, status is set to APPROVED at insert time and decided_by/decided_at stay null (no one actually reviewed it) — reason holds the requester''s justification instead.';
