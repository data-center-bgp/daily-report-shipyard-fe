-- Docking plans: tighten who does what.
--   * Every app role can VIEW plans; only SHIPPING and MASTER write them (the
--     write policies from 20261124100000 already say so).
--   * PPIC alone signs off a plan (MASTER can act for PPIC). HSSE's approval
--     stays on the project's readiness form, so HSSE is view-only here.

set search_path to daily_report_shipyard;

drop policy if exists "plans read" on docking_plans;
drop policy if exists "plan work orders read" on docking_plan_work_orders;
drop policy if exists "plan work details read" on docking_plan_work_details;
drop policy if exists "plan reviews read" on docking_plan_reviews;
drop policy if exists "plan review notes read" on docking_plan_review_notes;

create policy "plans read" on docking_plans for select
  using (admin_caller_role() in ('SHIPPING', 'MASTER', 'PPIC', 'PRODUCTION', 'OP_HEAD', 'ADMIN', 'FINANCE', 'MANAGER', 'HSSE', 'ADMIN_SHIPPING'));
create policy "plan work orders read" on docking_plan_work_orders for select
  using (admin_caller_role() in ('SHIPPING', 'MASTER', 'PPIC', 'PRODUCTION', 'OP_HEAD', 'ADMIN', 'FINANCE', 'MANAGER', 'HSSE', 'ADMIN_SHIPPING'));
create policy "plan work details read" on docking_plan_work_details for select
  using (admin_caller_role() in ('SHIPPING', 'MASTER', 'PPIC', 'PRODUCTION', 'OP_HEAD', 'ADMIN', 'FINANCE', 'MANAGER', 'HSSE', 'ADMIN_SHIPPING'));
create policy "plan reviews read" on docking_plan_reviews for select
  using (admin_caller_role() in ('SHIPPING', 'MASTER', 'PPIC', 'PRODUCTION', 'OP_HEAD', 'ADMIN', 'FINANCE', 'MANAGER', 'HSSE', 'ADMIN_SHIPPING'));
create policy "plan review notes read" on docking_plan_review_notes for select
  using (admin_caller_role() in ('SHIPPING', 'MASTER', 'PPIC', 'PRODUCTION', 'OP_HEAD', 'ADMIN', 'FINANCE', 'MANAGER', 'HSSE', 'ADMIN_SHIPPING'));

-- PPIC (or MASTER) approves or returns a submitted plan. One approval is enough.
-- p_line_notes: [{ "work_order_id": 1, "note": "..." }, { "work_detail_id": 2, "note": "..." }]
create or replace function review_docking_plan(
  p_plan_id bigint,
  p_reviewer_role text,
  p_decision text,
  p_general_note text default null,
  p_line_notes jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = daily_report_shipyard, public
as $$
declare
  v_pid bigint := docking_plan_caller_id();
  v_caller_role text := admin_caller_role();
  v_plan docking_plans%rowtype;
  v_review_id bigint;
  v_line jsonb;
  v_note text;
  v_wo bigint;
  v_wd bigint;
begin
  if v_caller_role not in ('PPIC', 'MASTER') then
    raise exception 'Access denied: only PPIC can review a plan';
  end if;

  if p_decision not in ('APPROVED', 'RETURNED') then
    raise exception 'Decision must be APPROVED or RETURNED';
  end if;

  select * into v_plan from docking_plans where id = p_plan_id and deleted_at is null for update;
  if not found then
    raise exception 'Plan not found';
  end if;
  if v_plan.status <> 'SUBMITTED' then
    raise exception 'Only a submitted plan can be reviewed (status is %)', v_plan.status;
  end if;

  if exists (
    select 1 from docking_plan_reviews
    where plan_id = p_plan_id and revision_no = v_plan.revision_no and reviewer_role = 'PPIC'
  ) then
    raise exception 'PPIC has already reviewed this revision';
  end if;

  if p_decision = 'RETURNED'
     and coalesce(btrim(p_general_note), '') = ''
     and jsonb_array_length(coalesce(p_line_notes, '[]'::jsonb)) = 0 then
    raise exception 'Add a note explaining what needs to change';
  end if;

  insert into docking_plan_reviews (plan_id, revision_no, reviewer_role, decision, general_note, reviewed_by)
  values (p_plan_id, v_plan.revision_no, 'PPIC', p_decision, nullif(btrim(coalesce(p_general_note, '')), ''), v_pid)
  returning id into v_review_id;

  for v_line in select * from jsonb_array_elements(coalesce(p_line_notes, '[]'::jsonb)) loop
    v_note := nullif(btrim(coalesce(v_line->>'note', '')), '');
    if v_note is null then
      continue;
    end if;
    v_wo := nullif(v_line->>'work_order_id', '')::bigint;
    v_wd := nullif(v_line->>'work_detail_id', '')::bigint;
    if (v_wo is null) = (v_wd is null) then
      raise exception 'Each line note must name exactly one work order or work detail';
    end if;
    if v_wo is not null and not exists (
      select 1 from docking_plan_work_orders where id = v_wo and plan_id = p_plan_id
    ) then
      raise exception 'Work order % is not part of this plan', v_wo;
    end if;
    if v_wd is not null and not exists (
      select 1 from docking_plan_work_details d
      join docking_plan_work_orders o on o.id = d.plan_work_order_id
      where d.id = v_wd and o.plan_id = p_plan_id
    ) then
      raise exception 'Work detail % is not part of this plan', v_wd;
    end if;
    insert into docking_plan_review_notes (review_id, plan_work_order_id, plan_work_detail_id, note)
    values (v_review_id, v_wo, v_wd, v_note);
  end loop;

  perform set_config('app.docking_plan_rpc', 'on', true);
  if p_decision = 'RETURNED' then
    update docking_plans set status = 'NEEDS_CLARIFICATION', updated_at = now() where id = p_plan_id;
  else
    update docking_plans set status = 'APPROVED', approved_at = now(), updated_at = now() where id = p_plan_id;
  end if;
end;
$$;

notify pgrst, 'reload schema';
