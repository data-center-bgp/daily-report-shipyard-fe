import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  Hammer,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { PageSkeleton } from "../common/Skeleton";
import {
  NEW_BUILDING_TYPE,
  buildNewBuildingVessels,
  type NewBuildingStatus,
  type NewBuildingVessel,
  type RawNewBuildingProject,
  type RawNewBuildingWorkOrder,
} from "../../utils/newBuilding";

const pageShell = "mx-auto w-full max-w-[96rem] px-4 py-5 sm:px-6 lg:px-8 lg:py-8";
const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-800 sm:min-h-10";
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 sm:min-h-10";

// Status is told by an icon and a word as well as a colour.
const STATUS: Record<
  NewBuildingStatus,
  { label: string; className: string; Icon: typeof Clock }
> = {
  inProgress: { label: "In progress", className: "bg-blue-50 text-blue-900", Icon: Clock },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-900", Icon: CheckCircle2 },
  notStarted: { label: "Not started", className: "bg-slate-100 text-slate-800", Icon: CircleDashed },
};

function StatusTag({ status }: { status: NewBuildingStatus }) {
  const { label, className, Icon } = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ${className}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
    </span>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-slate-200"
      >
        <div className="h-full rounded-full bg-blue-700" style={{ width: `${value}%` }} />
      </div>
      <span className="w-10 text-right text-sm font-semibold tabular-nums text-slate-900">
        {value}%
      </span>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  note,
  alert,
}: {
  label: string;
  value: string;
  note?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border bg-white p-4 ${
        alert ? "border-red-300" : "border-slate-200"
      }`}
    >
      <dt className="text-sm font-medium text-slate-700">{label}</dt>
      <dd
        className={`mt-1 text-2xl font-bold tabular-nums ${
          alert ? "text-red-800" : "text-slate-900"
        }`}
      >
        {value}
      </dd>
      {note && <p className="mt-0.5 text-sm text-slate-600">{note}</p>}
    </div>
  );
}

function VesselCard({ vessel }: { vessel: NewBuildingVessel }) {
  const p = vessel.pipeline;
  const pipeline = [
    { label: "Not in a BASTP yet", value: p.notInBastp },
    { label: "BASTP draft", value: p.draft },
    { label: "BASTP verified", value: p.verified },
    { label: "Ready to invoice", value: p.readyForInvoice },
    { label: "Invoiced, unpaid", value: p.invoicedUnpaid },
    { label: "Invoiced and paid", value: p.invoicedPaid },
  ].filter((x) => x.value > 0);
  const headingId = `nb-vessel-${vessel.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className="overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <header className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-bold text-slate-900">
            {vessel.name}
          </h2>
          <p className="text-sm text-slate-600">
            {[vessel.type, vessel.company].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusTag status={vessel.status} />
          <Link to={`/vessel/${vessel.id}/work-orders`} className={secondaryButton}>
            Work orders
          </Link>
        </div>
      </header>

      <div className="space-y-4 p-4">
        <ProgressBar value={vessel.progress} label={`${vessel.name} overall progress`} />

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-600">Work orders</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{vessel.workOrderCount}</dd>
          </div>
          <div>
            <dt className="text-slate-600">Work details done</dt>
            <dd className="font-semibold tabular-nums text-slate-900">
              {vessel.completed} of {vessel.detailCount}
            </dd>
          </div>
          <div>
            <dt className="text-slate-600">Past planned close date</dt>
            <dd
              className={`flex items-center gap-1.5 font-semibold tabular-nums ${
                vessel.overdue > 0 ? "text-red-800" : "text-slate-900"
              }`}
            >
              {vessel.overdue > 0 && (
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              )}
              {vessel.overdue}
            </dd>
          </div>
          <div>
            <dt className="text-slate-600">Handover and billing</dt>
            <dd>
              {pipeline.length === 0 ? (
                <span className="text-slate-600">No work details yet</span>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {pipeline.map((x) => (
                    <li
                      key={x.label}
                      className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800"
                    >
                      {x.label} <span className="tabular-nums">{x.value}</span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>

        {vessel.projects.map((project) => (
          <section
            key={project.id ?? "unlinked"}
            aria-label={project.name}
            className="overflow-hidden rounded-lg border border-slate-200"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2.5">
              {project.id ? (
                <Link
                  to={`/projects/${project.id}`}
                  className="min-h-11 content-center text-sm font-semibold text-blue-800 hover:underline sm:min-h-0"
                >
                  {project.name}
                </Link>
              ) : (
                <p className="text-sm font-semibold text-amber-900">{project.name}</p>
              )}
              {!project.id && (
                <p className="text-sm text-slate-700">
                  These work orders belong to no project, so they are easy to miss.
                </p>
              )}
            </div>
            {project.workOrders.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-600">No work orders in this project yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-stack min-w-full divide-y divide-slate-200">
                  <caption className="sr-only">Work orders of {project.name}</caption>
                  <thead>
                    <tr>
                      {["Work order", "Location", "Progress", "Details"].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className="px-4 py-2 text-left text-sm font-semibold text-slate-700"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {project.workOrders.map((wo) => (
                      <tr key={wo.id}>
                        <td className="px-4 py-2.5 text-sm">
                          <div className="font-medium text-slate-900">{wo.number}</div>
                          {wo.customerNumber && wo.customerNumber !== wo.number && (
                            <div className="text-slate-600">Customer: {wo.customerNumber}</div>
                          )}
                          {wo.isAdditional && (
                            <span className="mt-1 inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-800">
                              Additional
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-700">{wo.location || "-"}</td>
                        <td className="min-w-48 px-4 py-2.5">
                          <ProgressBar value={wo.progress} label={`${wo.number} progress`} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-sm tabular-nums text-slate-900">
                          {wo.detailCount === 0 ? (
                            <span className="text-slate-600">No work details</span>
                          ) : (
                            <>
                              {wo.completed} of {wo.detailCount} done
                              {wo.overdue > 0 && (
                                <span className="ml-2 inline-flex items-center gap-1 text-red-800">
                                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                                  {wo.overdue} late
                                </span>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}

export default function NewBuildingPage() {
  const { isOperationsReadOnly } = useAuth();
  const [vessels, setVessels] = useState<NewBuildingVessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<NewBuildingStatus | "">("");
  const searchId = useId();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [ordersResult, projectsResult] = await Promise.all([
        supabase
          .from("work_order")
          .select(
            `
            id, vessel_id, project_id, is_additional_wo, shipyard_wo_number,
            customer_wo_number, work_location, shipyard_wo_date,
            vessel:vessel_id ( id, name, type, company ),
            project:project_id ( id, project_name ),
            work_details (
              id, cancelled_at, target_close_date, actual_close_date,
              work_progress ( progress_percentage, report_date, created_at ),
              bastp_work_details ( id, deleted_at, bastp:bastp_id ( status ) ),
              invoice_work_details ( id, invoice_details:invoice_details_id ( payment_status ) )
            )
          `,
          )
          .eq("work_type", NEW_BUILDING_TYPE)
          .is("deleted_at", null)
          .is("work_details.deleted_at", null),
        supabase
          .from("projects")
          .select("id, project_name, vessel:vessel_id ( id, name, type, company )")
          .eq("docking_type", NEW_BUILDING_TYPE)
          .is("deleted_at", null),
      ]);

      if (ordersResult.error) throw ordersResult.error;
      if (projectsResult.error) throw projectsResult.error;

      setVessels(
        buildNewBuildingVessels(
          (ordersResult.data ?? []) as unknown as RawNewBuildingWorkOrder[],
          (projectsResult.data ?? []) as unknown as RawNewBuildingProject[],
        ),
      );
    } catch (err) {
      console.error("Error loading new building overview:", err);
      setError(err instanceof Error ? err.message : "Failed to load new building work");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const sum = (pick: (v: NewBuildingVessel) => number) =>
      vessels.reduce((n, v) => n + pick(v), 0);
    const details = sum((v) => v.detailCount);
    const done = sum((v) => v.completed);
    return {
      vessels: vessels.length,
      building: vessels.filter((v) => v.status === "inProgress").length,
      workOrders: sum((v) => v.workOrderCount),
      details,
      done,
      donePercent: details > 0 ? Math.round((done / details) * 100) : 0,
      overdue: sum((v) => v.overdue),
      ready: sum((v) => v.pipeline.readyForInvoice),
    };
  }, [vessels]);

  // Search narrows first; the chips then count within the search.
  const searched = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return vessels;
    return vessels.filter((v) =>
      [
        v.name,
        v.company,
        v.type,
        ...v.projects.flatMap((p) => [
          p.name,
          ...p.workOrders.flatMap((w) => [w.number, w.customerNumber ?? "", w.location ?? ""]),
        ]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [vessels, searchTerm]);

  const statusCounts = useMemo(() => {
    const counts: Record<NewBuildingStatus, number> = {
      inProgress: 0,
      notStarted: 0,
      completed: 0,
    };
    searched.forEach((v) => counts[v.status]++);
    return counts;
  }, [searched]);

  const shown = statusFilter ? searched.filter((v) => v.status === statusFilter) : searched;
  const hasFilters = searchTerm !== "" || statusFilter !== "";

  if (loading) {
    return (
      <div className={pageShell}>
        <PageSkeleton
          label="Loading new building work..."
          padding="none"
          stats={4}
          filters
          list="cards"
          rows={3}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className={pageShell}>
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-red-900">
            <span className="font-semibold">New building work could not load.</span> {error}
          </p>
          <button
            type="button"
            onClick={load}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-red-700 bg-white px-4 text-sm font-medium text-red-800 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${pageShell} space-y-6`}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">New Building</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 sm:text-base">
            Vessels built at the shipyard, with their projects and work orders. This lists only
            work whose type is New Building.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={load} className={secondaryButton}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </button>
          {!isOperationsReadOnly && (
            <Link
              to="/projects/add"
              state={{ dockingType: NEW_BUILDING_TYPE }}
              className={primaryButton}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> New building project
            </Link>
          )}
        </div>
      </header>

      {vessels.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
          <Hammer className="mx-auto h-8 w-8 text-slate-500" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-slate-900">No new building work yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
            Create a project with the type New Building. Its vessel and work orders then appear
            here.
          </p>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <SummaryTile
              label="Vessels"
              value={String(totals.vessels)}
              note={`${totals.building} in progress`}
            />
            <SummaryTile label="Work orders" value={String(totals.workOrders)} />
            <SummaryTile
              label="Work details done"
              value={`${totals.donePercent}%`}
              note={`${totals.done} of ${totals.details}`}
            />
            <SummaryTile
              label="Past planned close date"
              value={String(totals.overdue)}
              alert={totals.overdue > 0}
            />
            <SummaryTile label="Ready to invoice" value={String(totals.ready)} />
          </dl>

          <section aria-label="Find a vessel" className="space-y-4">
            <form role="search" onSubmit={(e) => e.preventDefault()} className="max-w-xl">
              <label htmlFor={searchId} className="mb-1 block text-sm font-medium text-slate-700">
                Search new building work
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
                  aria-hidden="true"
                />
                <input
                  id={searchId}
                  type="search"
                  placeholder="Vessel, company, project or work order number"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="min-h-11 w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-blue-700 sm:min-h-10 sm:text-sm"
                />
              </div>
            </form>

            <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
              {(
                [
                  { key: "", label: "All", count: searched.length },
                  { key: "inProgress", label: "In progress", count: statusCounts.inProgress },
                  { key: "notStarted", label: "Not started", count: statusCounts.notStarted },
                  { key: "completed", label: "Completed", count: statusCounts.completed },
                ] as { key: NewBuildingStatus | ""; label: string; count: number }[]
              ).map((chip) => (
                <button
                  key={chip.key || "all"}
                  type="button"
                  aria-pressed={statusFilter === chip.key}
                  onClick={() => setStatusFilter(chip.key)}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors sm:min-h-10 ${
                    statusFilter === chip.key
                      ? "border-blue-950 bg-blue-950 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  {chip.label}
                  <span
                    className={`tabular-nums ${
                      statusFilter === chip.key ? "text-blue-100" : "text-slate-600"
                    }`}
                  >
                    {chip.count}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {shown.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
              <p className="text-sm font-medium text-slate-900">
                {hasFilters ? "No vessels match these filters" : "No vessels"}
              </p>
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter("");
                  }}
                  className={`mt-4 ${secondaryButton}`}
                >
                  Show all vessels
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {shown.map((v) => (
                <VesselCard key={v.id} vessel={v} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
