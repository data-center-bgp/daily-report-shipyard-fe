-- ============================================================================
-- Rename a project (name, jenis docking and — optionally — its vessel).
--
-- Changing a project's vessel is not a one-column update: work_order,
-- vessel_readiness_forms and additional_wo_requests each carry a denormalized
-- vessel_id that a trigger forces to equal their project's vessel_id. Those
-- triggers only fire on the CHILD tables, so the project has to be updated
-- first and the children after, and all of it has to happen together or not at
-- all — hence one function instead of several client-side updates that could
-- leave a project half-moved.
--
-- A BASTP is built from one vessel's work details, so a project whose work
-- details are already in a (non-deleted) BASTP cannot be moved to another
-- vessel; renaming it on the same vessel is still fine.
--
-- SECURITY INVOKER (the default): runs with the caller's own permissions, so
-- it can't do anything the caller couldn't already do through the tables.
-- ============================================================================

set search_path to daily_report_shipyard;

create or replace function daily_report_shipyard.rename_project(
  p_project_id bigint,
  p_project_name text,
  p_docking_type text,
  p_vessel_id bigint
) returns daily_report_shipyard.projects
language plpgsql
set search_path = daily_report_shipyard
as $$
declare
  v_old_vessel_id bigint;
  v_project daily_report_shipyard.projects;
begin
  select vessel_id into v_old_vessel_id
  from daily_report_shipyard.projects
  where id = p_project_id and deleted_at is null
  for update;

  if not found then
    raise exception 'Project not found';
  end if;

  if p_project_name is null or btrim(p_project_name) = '' then
    raise exception 'Project name is required';
  end if;

  if not exists (
    select 1 from daily_report_shipyard.vessel
    where id = p_vessel_id and deleted_at is null
  ) then
    raise exception 'Vessel not found';
  end if;

  if p_vessel_id is distinct from v_old_vessel_id then
    if exists (
      select 1
      from daily_report_shipyard.bastp_work_details bwd
      join daily_report_shipyard.bastp b on b.id = bwd.bastp_id
      join daily_report_shipyard.work_details wd on wd.id = bwd.work_details_id
      join daily_report_shipyard.work_order wo on wo.id = wd.work_order_id
      where wo.project_id = p_project_id
        and bwd.deleted_at is null
        and b.deleted_at is null
    ) then
      raise exception 'This project already has work details in a BASTP, so it cannot be moved to another vessel';
    end if;
  end if;

  update daily_report_shipyard.projects
  set project_name = btrim(p_project_name),
      docking_type = p_docking_type,
      vessel_id = p_vessel_id,
      updated_at = now()
  where id = p_project_id
  returning * into v_project;

  if p_vessel_id is distinct from v_old_vessel_id then
    update daily_report_shipyard.work_order
      set vessel_id = p_vessel_id where project_id = p_project_id;
    update daily_report_shipyard.vessel_readiness_forms
      set vessel_id = p_vessel_id where project_id = p_project_id;
    update daily_report_shipyard.additional_wo_requests
      set vessel_id = p_vessel_id where project_id = p_project_id;
  end if;

  return v_project;
end;
$$;

revoke all on function daily_report_shipyard.rename_project(bigint, text, text, bigint) from public;
grant execute on function daily_report_shipyard.rename_project(bigint, text, text, bigint) to authenticated;
