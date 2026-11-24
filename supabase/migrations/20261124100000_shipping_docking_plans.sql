-- ============================================================================
-- Shipping docking plans.
--
-- Target schema: daily_report_shipyard.
--
-- The Shipping business unit drafts a plan (the future project, its work orders
-- and work details) about two months before a vessel docks. Shipyard PPIC and
-- HSSE both review it, can send it back with notes per line, and approve it.
-- Once approved, PPIC converts it into the real project / work orders / work
-- details in one transaction.
--
-- Plans live in their own tables on purpose: live projects, work orders and
-- work details have no status column, and the dashboard, alerts, BASTP,
-- invoices, exports and the read-only report API all read them. Nothing here
-- touches those until a plan is converted.
--
-- Unlike most of this app, status changes are enforced in the database: the
-- plan's status can only move through the four functions at the bottom, and
-- authors can only edit a plan while it is a draft or sent back.
-- ============================================================================

set search_path to daily_report_shipyard;

-- ── New role ────────────────────────────────────────────────────────────────
-- Also re-adds ADMIN_SHIPPING: migration 20260727140000 was meant to, but the
-- live function still lacked it, so MASTER could not assign that role from the
-- User Management screen.
create or replace function admin_update_user_role(p_target_id bigint, p_new_role text)
returns void
language plpgsql
security definer
set search_path = daily_report_shipyard, public
as $$
declare
  v_caller_id bigint;
  v_target_role text;
  v_target_deleted_at timestamptz;
  v_remaining_masters int;
begin
  if admin_caller_role() is distinct from 'MASTER' then
    raise exception 'Access denied: MASTER role required';
  end if;

  if p_new_role not in ('MASTER', 'PPIC', 'PRODUCTION', 'OP_HEAD', 'ADMIN', 'FINANCE', 'MANAGER', 'HSSE', 'ADMIN_SHIPPING', 'SHIPPING') then
    raise exception 'Invalid role: %', p_new_role;
  end if;

  select id into v_caller_id from profiles where auth_user_id = auth.uid();

  select role, deleted_at into v_target_role, v_target_deleted_at
  from profiles where id = p_target_id;

  if not found then
    raise exception 'User not found';
  end if;

  if p_target_id = v_caller_id and p_new_role <> 'MASTER' then
    raise exception 'You cannot change your own role away from MASTER';
  end if;

  if v_target_role = 'MASTER' and v_target_deleted_at is null and p_new_role <> 'MASTER' then
    select count(*) into v_remaining_masters
    from profiles
    where role = 'MASTER' and deleted_at is null and id <> p_target_id;

    if v_remaining_masters = 0 then
      raise exception 'Cannot change role: this is the last active MASTER user';
    end if;
  end if;

  update profiles
  set role = p_new_role, updated_at = now()
  where id = p_target_id;
end;
$$;

grant execute on function admin_update_user_role(bigint, text) to authenticated;

-- ── Tables ──────────────────────────────────────────────────────────────────
create table docking_plans (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  plan_name text not null,
  vessel_id bigint not null references vessel(id),
  docking_type text,
  target_docking_date date not null,
  notes text,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SUBMITTED', 'NEEDS_CLARIFICATION', 'APPROVED', 'CONVERTED')),
  -- Number of times the plan has been submitted. 0 while it is still the first
  -- draft; reviews are tied to the revision they judged.
  revision_no int not null default 0,
  submitted_at timestamptz,
  submitted_by bigint references profiles(id),
  approved_at timestamptz,
  reopened_reason text,
  reopened_at timestamptz,
  reopened_by bigint references profiles(id),
  converted_project_id bigint references projects(id),
  converted_at timestamptz,
  converted_by bigint references profiles(id),
  user_id bigint not null references profiles(id)
);

create index docking_plans_vessel_id_idx on docking_plans (vessel_id) where deleted_at is null;
create index docking_plans_status_idx on docking_plans (status) where deleted_at is null;

create table docking_plan_work_orders (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  plan_id bigint not null references docking_plans(id),
  work_location text,
  customer_wo_number text,
  notes text,
  sort_order int not null default 0,
  -- Filled in when the plan is converted.
  converted_work_order_id bigint references work_order(id)
);

create index docking_plan_work_orders_plan_id_idx on docking_plan_work_orders (plan_id) where deleted_at is null;

create table docking_plan_work_details (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  plan_work_order_id bigint not null references docking_plan_work_orders(id),
  description text not null,
  work_scope_id bigint references work_scope(id),
  location_id bigint references location(id),
  quantity numeric,
  uom text,
  planned_start_date date,
  target_close_date date,
  notes text,
  sort_order int not null default 0,
  converted_work_detail_id bigint references work_details(id)
);

create index docking_plan_work_details_wo_idx on docking_plan_work_details (plan_work_order_id) where deleted_at is null;

-- One row per reviewer per submitted revision. Append-only history.
create table docking_plan_reviews (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  plan_id bigint not null references docking_plans(id),
  revision_no int not null,
  reviewer_role text not null check (reviewer_role in ('PPIC', 'HSSE')),
  decision text not null check (decision in ('APPROVED', 'RETURNED')),
  general_note text,
  reviewed_by bigint not null references profiles(id),
  reviewed_at timestamptz not null default now(),
  unique (plan_id, revision_no, reviewer_role)
);

create table docking_plan_review_notes (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  review_id bigint not null references docking_plan_reviews(id),
  plan_work_order_id bigint references docking_plan_work_orders(id),
  plan_work_detail_id bigint references docking_plan_work_details(id),
  note text not null,
  check ((plan_work_order_id is null) <> (plan_work_detail_id is null))
);

create index docking_plan_review_notes_review_idx on docking_plan_review_notes (review_id);

-- ── Guard: status and bookkeeping columns only move through the functions ──
create or replace function docking_plans_guard()
returns trigger
language plpgsql
as $$
begin
  -- Direct SQL (migrations, maintenance) has no signed-in user and is left alone.
  if auth.uid() is null or current_setting('app.docking_plan_rpc', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT' or new.revision_no <> 0
       or new.submitted_at is not null or new.approved_at is not null
       or new.converted_project_id is not null then
      raise exception 'A new plan must start as a draft';
    end if;
  else
    if new.status is distinct from old.status
       or new.revision_no is distinct from old.revision_no
       or new.submitted_at is distinct from old.submitted_at
       or new.submitted_by is distinct from old.submitted_by
       or new.approved_at is distinct from old.approved_at
       or new.reopened_reason is distinct from old.reopened_reason
       or new.reopened_at is distinct from old.reopened_at
       or new.reopened_by is distinct from old.reopened_by
       or new.converted_project_id is distinct from old.converted_project_id
       or new.converted_at is distinct from old.converted_at
       or new.converted_by is distinct from old.converted_by
       or new.user_id is distinct from old.user_id then
      raise exception 'Plan status can only be changed through submit, review, reopen or convert';
    end if;
  end if;
  return new;
end;
$$;

create trigger docking_plans_guard_trg
  before insert or update on docking_plans
  for each row execute function docking_plans_guard();

-- ── Row level security ──────────────────────────────────────────────────────
alter table docking_plans enable row level security;
alter table docking_plan_work_orders enable row level security;
alter table docking_plan_work_details enable row level security;
alter table docking_plan_reviews enable row level security;
alter table docking_plan_review_notes enable row level security;

grant select, insert, update on docking_plans, docking_plan_work_orders, docking_plan_work_details to authenticated;
grant select on docking_plan_reviews, docking_plan_review_notes to authenticated;

-- Profile id of the signed-in user (null when signed out or deactivated).
create or replace function docking_plan_caller_id()
returns bigint
language sql
stable
security definer
set search_path = daily_report_shipyard, public
as $$
  select id from profiles where auth_user_id = auth.uid() and deleted_at is null limit 1;
$$;

grant execute on function docking_plan_caller_id() to authenticated;

-- Can the signed-in user edit this plan's contents right now?
create or replace function docking_plan_editable(p_plan_id bigint)
returns boolean
language sql
stable
security definer
set search_path = daily_report_shipyard, public
as $$
  select exists (
    select 1 from docking_plans p
    where p.id = p_plan_id
      and p.deleted_at is null
      and p.status in ('DRAFT', 'NEEDS_CLARIFICATION')
      and (
        admin_caller_role() = 'MASTER'
        or (admin_caller_role() = 'SHIPPING' and p.user_id = docking_plan_caller_id())
      )
  );
$$;

grant execute on function docking_plan_editable(bigint) to authenticated;

-- Reads: Shipping and the shipyard roles that review or oversee plans.
create policy "plans read" on docking_plans for select
  using (admin_caller_role() in ('SHIPPING', 'PPIC', 'HSSE', 'MASTER', 'MANAGER', 'OP_HEAD'));
create policy "plan work orders read" on docking_plan_work_orders for select
  using (admin_caller_role() in ('SHIPPING', 'PPIC', 'HSSE', 'MASTER', 'MANAGER', 'OP_HEAD'));
create policy "plan work details read" on docking_plan_work_details for select
  using (admin_caller_role() in ('SHIPPING', 'PPIC', 'HSSE', 'MASTER', 'MANAGER', 'OP_HEAD'));
create policy "plan reviews read" on docking_plan_reviews for select
  using (admin_caller_role() in ('SHIPPING', 'PPIC', 'HSSE', 'MASTER', 'MANAGER', 'OP_HEAD'));
create policy "plan review notes read" on docking_plan_review_notes for select
  using (admin_caller_role() in ('SHIPPING', 'PPIC', 'HSSE', 'MASTER', 'MANAGER', 'OP_HEAD'));

-- Writes: the author (or MASTER), only while the plan is a draft or sent back.
create policy "plans insert" on docking_plans for insert
  with check (
    status = 'DRAFT'
    and (
      admin_caller_role() = 'MASTER'
      or (admin_caller_role() = 'SHIPPING' and user_id = docking_plan_caller_id())
    )
  );
create policy "plans update" on docking_plans for update
  using (docking_plan_editable(id))
  with check (status in ('DRAFT', 'NEEDS_CLARIFICATION'));

create policy "plan work orders insert" on docking_plan_work_orders for insert
  with check (docking_plan_editable(plan_id));
create policy "plan work orders update" on docking_plan_work_orders for update
  using (docking_plan_editable(plan_id))
  with check (docking_plan_editable(plan_id));

create policy "plan work details insert" on docking_plan_work_details for insert
  with check (docking_plan_editable(
    (select o.plan_id from docking_plan_work_orders o where o.id = plan_work_order_id)));
create policy "plan work details update" on docking_plan_work_details for update
  using (docking_plan_editable(
    (select o.plan_id from docking_plan_work_orders o where o.id = plan_work_order_id)))
  with check (docking_plan_editable(
    (select o.plan_id from docking_plan_work_orders o where o.id = plan_work_order_id)));

-- Reviews and notes are written only by review_docking_plan() (security definer).

-- The read-only report API role needs its own read policy on RLS tables.
do $$
declare
  v_role text := 'data_api_ro_daily_report_shipyard';
  t text;
begin
  if exists (select 1 from pg_roles where rolname = v_role) then
    foreach t in array array[
      'docking_plans', 'docking_plan_work_orders', 'docking_plan_work_details',
      'docking_plan_reviews', 'docking_plan_review_notes'
    ] loop
      execute format('grant select on daily_report_shipyard.%I to %I', t, v_role);
      if not exists (
        select 1 from pg_policies
        where schemaname = 'daily_report_shipyard' and tablename = t
          and policyname = 'data_api_ro read'
      ) then
        execute format(
          'create policy "data_api_ro read" on daily_report_shipyard.%I for select to %I using (true)',
          t, v_role);
      end if;
    end loop;
  end if;
end
$$;

-- ── Workflow functions ──────────────────────────────────────────────────────

-- Shipping (author) or MASTER submits a draft / sent-back plan for review.
create or replace function submit_docking_plan(p_plan_id bigint)
returns void
language plpgsql
security definer
set search_path = daily_report_shipyard, public
as $$
declare
  v_pid bigint := docking_plan_caller_id();
  v_role text := admin_caller_role();
  v_plan docking_plans%rowtype;
  v_empty_wo int;
  v_wo_count int;
begin
  select * into v_plan from docking_plans where id = p_plan_id and deleted_at is null for update;
  if not found then
    raise exception 'Plan not found';
  end if;

  if not (v_role = 'MASTER' or (v_role = 'SHIPPING' and v_plan.user_id = v_pid)) then
    raise exception 'Access denied: only the plan''s author can submit it';
  end if;

  if v_plan.status not in ('DRAFT', 'NEEDS_CLARIFICATION') then
    raise exception 'Only a draft or a plan sent back for clarification can be submitted (status is %)', v_plan.status;
  end if;

  select count(*) into v_wo_count
  from docking_plan_work_orders where plan_id = p_plan_id and deleted_at is null;
  if v_wo_count = 0 then
    raise exception 'Add at least one work order before submitting';
  end if;

  select count(*) into v_empty_wo
  from docking_plan_work_orders o
  where o.plan_id = p_plan_id and o.deleted_at is null
    and not exists (
      select 1 from docking_plan_work_details d
      where d.plan_work_order_id = o.id and d.deleted_at is null
    );
  if v_empty_wo > 0 then
    raise exception '% work order(s) have no work details yet', v_empty_wo;
  end if;

  perform set_config('app.docking_plan_rpc', 'on', true);
  update docking_plans
  set status = 'SUBMITTED',
      revision_no = revision_no + 1,
      submitted_at = now(),
      submitted_by = v_pid,
      approved_at = null,
      updated_at = now()
  where id = p_plan_id;
end;
$$;

-- PPIC or HSSE (or MASTER, naming the role) approves or returns a submitted plan.
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
  v_role text;
  v_plan docking_plans%rowtype;
  v_review_id bigint;
  v_line jsonb;
  v_note text;
  v_wo bigint;
  v_wd bigint;
begin
  if v_caller_role in ('PPIC', 'HSSE') then
    v_role := v_caller_role;
  elsif v_caller_role = 'MASTER' and p_reviewer_role in ('PPIC', 'HSSE') then
    v_role := p_reviewer_role;
  else
    raise exception 'Access denied: only PPIC or HSSE can review a plan';
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
    where plan_id = p_plan_id and revision_no = v_plan.revision_no and reviewer_role = v_role
  ) then
    raise exception '% has already reviewed this revision', v_role;
  end if;

  if p_decision = 'RETURNED'
     and coalesce(btrim(p_general_note), '') = ''
     and jsonb_array_length(coalesce(p_line_notes, '[]'::jsonb)) = 0 then
    raise exception 'Add a note explaining what needs to change';
  end if;

  insert into docking_plan_reviews (plan_id, revision_no, reviewer_role, decision, general_note, reviewed_by)
  values (p_plan_id, v_plan.revision_no, v_role, p_decision, nullif(btrim(coalesce(p_general_note, '')), ''), v_pid)
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
  elsif (
    select count(distinct reviewer_role) from docking_plan_reviews
    where plan_id = p_plan_id and revision_no = v_plan.revision_no and decision = 'APPROVED'
  ) = 2 then
    update docking_plans set status = 'APPROVED', approved_at = now(), updated_at = now() where id = p_plan_id;
  end if;
end;
$$;

-- PPIC or MASTER takes an approved plan back to draft; both approvals are void.
create or replace function reopen_docking_plan(p_plan_id bigint, p_reason text)
returns void
language plpgsql
security definer
set search_path = daily_report_shipyard, public
as $$
declare
  v_pid bigint := docking_plan_caller_id();
  v_plan docking_plans%rowtype;
begin
  if admin_caller_role() not in ('PPIC', 'MASTER') then
    raise exception 'Access denied: only PPIC or MASTER can reopen a plan';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Give a reason for reopening the plan';
  end if;

  select * into v_plan from docking_plans where id = p_plan_id and deleted_at is null for update;
  if not found then
    raise exception 'Plan not found';
  end if;
  if v_plan.status <> 'APPROVED' then
    raise exception 'Only an approved plan can be reopened (status is %)', v_plan.status;
  end if;

  perform set_config('app.docking_plan_rpc', 'on', true);
  update docking_plans
  set status = 'DRAFT',
      approved_at = null,
      reopened_reason = btrim(p_reason),
      reopened_at = now(),
      reopened_by = v_pid,
      updated_at = now()
  where id = p_plan_id;
end;
$$;

-- PPIC or MASTER turns an approved plan into the real project, work orders and
-- work details, all in one transaction. The project name and work order numbers
-- are made by the app (the same helpers the normal Add Work Order screen uses)
-- and passed in, so the numbering rules stay in one place.
-- p_work_orders: [{ "plan_work_order_id", "shipyard_wo_number", "shipyard_wo_date",
--                   "customer_wo_date", "kapro_id" }]
create or replace function convert_docking_plan(
  p_plan_id bigint,
  p_project_name text,
  p_work_orders jsonb
)
returns bigint
language plpgsql
security definer
set search_path = daily_report_shipyard, public
as $$
declare
  v_pid bigint := docking_plan_caller_id();
  v_plan docking_plans%rowtype;
  v_project_id bigint;
  v_wo_id bigint;
  v_plan_wo docking_plan_work_orders%rowtype;
  v_item jsonb;
  v_wd docking_plan_work_details%rowtype;
  v_new_wd_id bigint;
  v_expected int;
  v_given int;
begin
  if admin_caller_role() not in ('PPIC', 'MASTER') then
    raise exception 'Access denied: only PPIC or MASTER can convert a plan';
  end if;
  if coalesce(btrim(p_project_name), '') = '' then
    raise exception 'A project name is required';
  end if;

  select * into v_plan from docking_plans where id = p_plan_id and deleted_at is null for update;
  if not found then
    raise exception 'Plan not found';
  end if;
  if v_plan.status <> 'APPROVED' then
    raise exception 'Only an approved plan can be converted (status is %)', v_plan.status;
  end if;

  select count(*) into v_expected
  from docking_plan_work_orders where plan_id = p_plan_id and deleted_at is null;
  select count(distinct (e->>'plan_work_order_id')) into v_given
  from jsonb_array_elements(coalesce(p_work_orders, '[]'::jsonb)) e;
  if v_expected = 0 or v_given <> v_expected
     or jsonb_array_length(p_work_orders) <> v_expected then
    raise exception 'Every work order in the plan needs exactly one number and date';
  end if;

  insert into projects (project_name, vessel_id, user_id, docking_type)
  values (btrim(p_project_name), v_plan.vessel_id, v_pid, v_plan.docking_type)
  returning id into v_project_id;

  for v_item in select * from jsonb_array_elements(p_work_orders) loop
    select * into v_plan_wo
    from docking_plan_work_orders
    where id = (v_item->>'plan_work_order_id')::bigint
      and plan_id = p_plan_id and deleted_at is null;
    if not found then
      raise exception 'Work order % is not part of this plan', v_item->>'plan_work_order_id';
    end if;
    if coalesce(btrim(v_item->>'shipyard_wo_number'), '') = '' then
      raise exception 'Every work order needs a shipyard WO number';
    end if;

    insert into work_order (
      customer_wo_number, customer_wo_date, shipyard_wo_date, shipyard_wo_number,
      user_id, vessel_id, is_additional_wo, kapro_id, work_location, work_type, project_id
    ) values (
      v_plan_wo.customer_wo_number,
      nullif(v_item->>'customer_wo_date', '')::date,
      nullif(v_item->>'shipyard_wo_date', '')::date,
      btrim(v_item->>'shipyard_wo_number'),
      v_pid, v_plan.vessel_id, false,
      nullif(v_item->>'kapro_id', '')::bigint,
      v_plan_wo.work_location, v_plan.docking_type, v_project_id
    ) returning id into v_wo_id;

    update docking_plan_work_orders
    set converted_work_order_id = v_wo_id, updated_at = now()
    where id = v_plan_wo.id;

    for v_wd in
      select * from docking_plan_work_details
      where plan_work_order_id = v_plan_wo.id and deleted_at is null
      order by sort_order, id
    loop
      insert into work_details (
        description, planned_start_date, target_close_date, user_id, work_order_id,
        work_scope_id, location_id, uom, quantity, is_additional_wo_details, notes
      ) values (
        v_wd.description, v_wd.planned_start_date, v_wd.target_close_date, v_pid, v_wo_id,
        v_wd.work_scope_id, v_wd.location_id, v_wd.uom, v_wd.quantity, false, v_wd.notes
      ) returning id into v_new_wd_id;

      update docking_plan_work_details
      set converted_work_detail_id = v_new_wd_id, updated_at = now()
      where id = v_wd.id;
    end loop;
  end loop;

  perform set_config('app.docking_plan_rpc', 'on', true);
  update docking_plans
  set status = 'CONVERTED',
      converted_project_id = v_project_id,
      converted_at = now(),
      converted_by = v_pid,
      updated_at = now()
  where id = p_plan_id;

  return v_project_id;
end;
$$;

revoke all on function submit_docking_plan(bigint) from public, anon;
revoke all on function review_docking_plan(bigint, text, text, text, jsonb) from public, anon;
revoke all on function reopen_docking_plan(bigint, text) from public, anon;
revoke all on function convert_docking_plan(bigint, text, jsonb) from public, anon;
grant execute on function submit_docking_plan(bigint) to authenticated;
grant execute on function review_docking_plan(bigint, text, text, text, jsonb) to authenticated;
grant execute on function reopen_docking_plan(bigint, text) to authenticated;
grant execute on function convert_docking_plan(bigint, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
