-- ============================================================================
-- New Building Report: a lump-sum ("ls") general service, the new-building
-- counterpart of Docking Report / SN. Optional on a BASTP like the others, with
-- a quantity (1 to start with) and no dates.
--
-- It goes right after Docking Report / SN in display_order, so the form, print,
-- Excel export and invoice list the two reports together. The services after
-- it move down one place; their order relative to each other does not change.
-- Running this twice changes nothing.
-- ============================================================================

set search_path to daily_report_shipyard;

do $$
begin
  if not exists (
    select 1 from general_service_types where service_code = 'NEW_BUILDING_REPORT'
  ) then
    update general_service_types
    set display_order = display_order + 1
    where display_order > (
      select display_order from general_service_types where service_code = 'DOCKING_REPORT'
    );

    insert into general_service_types (service_name, service_code, display_order, uom)
    select 'New Building Report', 'NEW_BUILDING_REPORT', display_order + 1, 'ls'
    from general_service_types
    where service_code = 'DOCKING_REPORT';
  end if;
end $$;
