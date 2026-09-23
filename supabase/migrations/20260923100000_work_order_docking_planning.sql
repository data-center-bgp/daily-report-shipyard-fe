-- Work Order-level "Docking Planning": a schedule estimate (service + date
-- range -> auto-derived total_days) attached directly to a work_order,
-- independent of BASTP's own general_services (which records what was
-- actually billed per BASTP, potentially split across many partial BASTPs
-- for the same work order). See project discussion: WO-level planning is
-- never auto-allocated across BASTPs — it's a planning artifact only.

-- Two additional shared vocabulary entries alongside the existing
-- Docking/Undocking rows in general_service_types (shared with BASTP's
-- General Services, since both describe the same physical docking stages).
insert into daily_report_shipyard.general_service_types
  (service_name, service_code, display_order)
values
  ('Floating', 'FLOATING', 11),
  ('Vessel on Dock', 'VESSEL_ON_DOCK', 12);

create table daily_report_shipyard.work_order_general_services (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  work_order_id bigint not null references daily_report_shipyard.work_order(id),
  service_type_id bigint references daily_report_shipyard.general_service_types(id),
  start_date date,
  close_date date,
  total_days numeric,
  remarks text
);

create index work_order_general_services_work_order_id_idx
  on daily_report_shipyard.work_order_general_services (work_order_id)
  where deleted_at is null;

alter table daily_report_shipyard.work_order_general_services enable row level security;

create policy "Enable read access for all users"
  on daily_report_shipyard.work_order_general_services
  for select
  using (true);

-- Write access restricted to MASTER/PPIC/ADMIN_SHIPPING, matching the
-- existing role-restricted policy pattern already used on work_order's own
-- soft-delete ("Users can soft delete work order").
create policy "MASTER/PPIC/ADMIN_SHIPPING can insert docking planning"
  on daily_report_shipyard.work_order_general_services
  for insert
  with check (
    auth.uid() in (
      select profiles.auth_user_id from daily_report_shipyard.profiles
      where profiles.role = any (array['MASTER', 'PPIC', 'ADMIN_SHIPPING'])
    )
  );

create policy "MASTER/PPIC/ADMIN_SHIPPING can update docking planning"
  on daily_report_shipyard.work_order_general_services
  for update
  using (
    auth.uid() in (
      select profiles.auth_user_id from daily_report_shipyard.profiles
      where profiles.role = any (array['MASTER', 'PPIC', 'ADMIN_SHIPPING'])
    )
  )
  with check (
    auth.uid() in (
      select profiles.auth_user_id from daily_report_shipyard.profiles
      where profiles.role = any (array['MASTER', 'PPIC', 'ADMIN_SHIPPING'])
    )
  );

create policy "MASTER/PPIC/ADMIN_SHIPPING can delete docking planning"
  on daily_report_shipyard.work_order_general_services
  for delete
  using (
    auth.uid() in (
      select profiles.auth_user_id from daily_report_shipyard.profiles
      where profiles.role = any (array['MASTER', 'PPIC', 'ADMIN_SHIPPING'])
    )
  );
