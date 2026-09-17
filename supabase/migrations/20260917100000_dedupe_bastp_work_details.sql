-- ============================================================================
-- De-duplicate bastp_work_details and stop it happening again.
--
-- Nothing prevented the same work detail being linked to the same BASTP more
-- than once, and two BASTPs had accumulated 34 extra link rows (033/…/IX/2026
-- had 44 rows for 41 work details; 300/…/VIII/2026 had 98 for 67). The
-- duplicates:
--   - listed the same work detail twice on the Material Control page,
--   - inflated bastp.total_work_details (the "N items" count on the list),
--   - and, because each link row carries its own materials_status, forced the
--     same work detail's materials to be submitted twice before the BASTP
--     could be promoted VERIFIED -> READY_FOR_INVOICE.
--
-- Materials are unaffected: material_control rows are keyed by
-- (bastp_id, work_details_id), not by the link row, so they stay attached to
-- the surviving link. Every duplicate being removed here is DRAFT with no
-- submission timestamp, so no submitted state is discarded.
-- ============================================================================

set search_path to daily_report_shipyard;

-- 1. Soft-delete every duplicate link except the earliest (lowest id) one.
with ranked as (
  select
    id,
    row_number() over (
      partition by bastp_id, work_details_id order by id
    ) as rn
  from bastp_work_details
  where deleted_at is null
)
update bastp_work_details bwd
set deleted_at = now()
from ranked r
where r.id = bwd.id
  and r.rn > 1;

-- 2. Re-sync the denormalised count with what's actually linked now.
update bastp b
set total_work_details = counts.n
from (
  select bastp_id, count(*) as n
  from bastp_work_details
  where deleted_at is null
  group by bastp_id
) counts
where counts.bastp_id = b.id
  and b.total_work_details is distinct from counts.n;

-- 3. Make it structurally impossible from any path (app insert, concurrent
--    edits in two tabs, manual SQL). Partial, so soft-deleted links don't
--    block re-adding a work detail that was removed from a BASTP earlier.
create unique index bastp_work_details_unique_active_link
  on bastp_work_details (bastp_id, work_details_id)
  where deleted_at is null;

comment on index bastp_work_details_unique_active_link is
  'One active link per (bastp, work detail). Duplicates double-listed the work detail and required its materials to be submitted twice before the BASTP could go ready-for-invoice.';
