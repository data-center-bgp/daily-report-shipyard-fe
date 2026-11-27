import { getLatestProgressRecord } from "./progressPercentage";

// The "New Building" overview: vessels the shipyard is building, with their
// projects, work orders and how far the work has got. It is a view over the
// same tables as everything else: a work order is a new-building one when its
// work type is "New Building" (see src/constants/workTypes.ts).
//
// The progress, overdue and BASTP rules are the Dashboard's, so a number here
// never disagrees with the Dashboard (hooks/useDashboardData.tsx).

export const NEW_BUILDING_TYPE = "New Building";

interface RawVessel {
  id: number;
  name: string;
  type: string;
  company: string;
}

interface RawDetail {
  id: number;
  cancelled_at: string | null;
  target_close_date: string | null;
  actual_close_date: string | null;
  work_progress: {
    progress_percentage: number;
    report_date: string;
    created_at: string;
  }[];
  bastp_work_details: {
    id: number;
    deleted_at: string | null;
    bastp: { status: string } | null;
  }[];
  invoice_work_details: {
    id: number;
    invoice_details: { payment_status: boolean } | null;
  }[];
}

export interface RawNewBuildingWorkOrder {
  id: number;
  vessel_id: number;
  project_id: number | null;
  is_additional_wo: boolean | null;
  shipyard_wo_number: string | null;
  customer_wo_number: string | null;
  work_location: string | null;
  shipyard_wo_date: string | null;
  vessel: RawVessel | null;
  project: { id: number; project_name: string } | null;
  work_details: RawDetail[];
}

export interface RawNewBuildingProject {
  id: number;
  project_name: string;
  vessel: RawVessel | null;
}

export type NewBuildingStatus = "completed" | "inProgress" | "notStarted";

export interface BastpPipeline {
  notInBastp: number;
  draft: number;
  verified: number;
  readyForInvoice: number;
  invoicedPaid: number;
  invoicedUnpaid: number;
}

export interface NewBuildingWorkOrder {
  id: number;
  number: string;
  customerNumber: string | null;
  location: string | null;
  isAdditional: boolean;
  detailCount: number;
  completed: number;
  progress: number;
  overdue: number;
  status: NewBuildingStatus;
}

export interface NewBuildingProject {
  // null for work orders that are not linked to a project.
  id: number | null;
  name: string;
  workOrders: NewBuildingWorkOrder[];
}

export interface NewBuildingVessel {
  id: number;
  name: string;
  type: string;
  company: string;
  projects: NewBuildingProject[];
  workOrderCount: number;
  detailCount: number;
  completed: number;
  progress: number;
  overdue: number;
  pipeline: BastpPipeline;
  status: NewBuildingStatus;
}

const emptyPipeline = (): BastpPipeline => ({
  notInBastp: 0,
  draft: 0,
  verified: 0,
  readyForInvoice: 0,
  invoicedPaid: 0,
  invoicedUnpaid: 0,
});

// The same test the Dashboard uses: unfinished work is late once its target
// close date has passed, finished work is late when it finished after it.
function isLate(d: RawDetail, progress: number, now: Date): boolean {
  if (!d.target_close_date) return false;
  const target = new Date(d.target_close_date);
  if (progress < 100) return target < now;
  const latest = getLatestProgressRecord(d.work_progress || []);
  const finished = d.actual_close_date || latest?.report_date;
  return finished ? new Date(finished) > target : false;
}

const statusOf = (count: number, done: number, started: number): NewBuildingStatus =>
  count > 0 && done === count ? "completed" : started > 0 ? "inProgress" : "notStarted";

export function buildNewBuildingVessels(
  orders: RawNewBuildingWorkOrder[],
  projects: RawNewBuildingProject[],
  now: Date = new Date(),
): NewBuildingVessel[] {
  interface Acc {
    vessel: RawVessel;
    projects: Map<number, NewBuildingProject>;
    progressSum: number;
    detailCount: number;
    completed: number;
    started: number;
    overdue: number;
    pipeline: BastpPipeline;
    workOrders: NewBuildingWorkOrder[];
  }
  const vessels = new Map<number, Acc>();

  const accFor = (vessel: RawVessel): Acc => {
    let acc = vessels.get(vessel.id);
    if (!acc) {
      acc = {
        vessel,
        projects: new Map(),
        progressSum: 0,
        detailCount: 0,
        completed: 0,
        started: 0,
        overdue: 0,
        pipeline: emptyPipeline(),
        workOrders: [],
      };
      vessels.set(vessel.id, acc);
    }
    return acc;
  };
  const projectFor = (acc: Acc, id: number | null, name: string) => {
    const key = id ?? 0;
    let project = acc.projects.get(key);
    if (!project) {
      project = { id, name, workOrders: [] };
      acc.projects.set(key, project);
    }
    return project;
  };

  // A new-building project with no work order yet still shows up.
  projects.forEach((p) => {
    if (p.vessel) projectFor(accFor(p.vessel), p.id, p.project_name);
  });

  orders.forEach((wo) => {
    if (!wo.vessel) return;
    const acc = accFor(wo.vessel);
    const details = (wo.work_details || []).filter((d) => !d.cancelled_at);

    let progressSum = 0;
    let completed = 0;
    let started = 0;
    let overdue = 0;
    details.forEach((d) => {
      const latest = getLatestProgressRecord(d.work_progress || []);
      const progress = latest?.progress_percentage ?? 0;
      progressSum += progress;
      if (progress === 100) completed++;
      if (progress > 0) started++;
      if (isLate(d, progress, now)) overdue++;

      const link = (d.bastp_work_details || []).find((b) => !b.deleted_at);
      const status = link?.bastp?.status ?? null;
      if (!link) acc.pipeline.notInBastp++;
      else if (status === "DRAFT") acc.pipeline.draft++;
      else if (status === "VERIFIED") acc.pipeline.verified++;
      else if (status === "READY_FOR_INVOICE") acc.pipeline.readyForInvoice++;
      else if (status === "INVOICED") {
        const paid = (d.invoice_work_details || []).find((i) => i.invoice_details)
          ?.invoice_details?.payment_status;
        if (paid) acc.pipeline.invoicedPaid++;
        else acc.pipeline.invoicedUnpaid++;
      }
    });

    const row: NewBuildingWorkOrder = {
      id: wo.id,
      number: wo.shipyard_wo_number || wo.customer_wo_number || `WO-${wo.id}`,
      customerNumber: wo.customer_wo_number,
      location: wo.work_location,
      isAdditional: !!wo.is_additional_wo,
      detailCount: details.length,
      completed,
      progress: details.length > 0 ? Math.round(progressSum / details.length) : 0,
      overdue,
      status: statusOf(details.length, completed, started),
    };

    projectFor(
      acc,
      wo.project?.id ?? null,
      wo.project?.project_name ?? "Not linked to a project",
    ).workOrders.push(row);
    acc.workOrders.push(row);
    acc.progressSum += progressSum;
    acc.detailCount += details.length;
    acc.completed += completed;
    acc.started += started;
    acc.overdue += overdue;
  });

  const rank: Record<NewBuildingStatus, number> = { inProgress: 0, notStarted: 1, completed: 2 };

  return [...vessels.values()]
    .map((acc): NewBuildingVessel => {
      const projectList = [...acc.projects.values()]
        // Real projects first, oldest first; the unlinked group last.
        .sort((a, b) => (a.id ?? Infinity) - (b.id ?? Infinity));
      projectList.forEach((p) => p.workOrders.sort((a, b) => a.id - b.id));
      return {
        id: acc.vessel.id,
        name: acc.vessel.name,
        type: acc.vessel.type,
        company: acc.vessel.company,
        projects: projectList,
        workOrderCount: acc.workOrders.length,
        detailCount: acc.detailCount,
        completed: acc.completed,
        progress:
          acc.detailCount > 0 ? Math.round(acc.progressSum / acc.detailCount) : 0,
        overdue: acc.overdue,
        pipeline: acc.pipeline,
        status:
          acc.workOrders.length > 0 &&
          acc.workOrders.every((w) => w.status === "completed")
            ? "completed"
            : acc.started > 0
              ? "inProgress"
              : "notStarted",
      };
    })
    .sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
}
