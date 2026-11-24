import { useId, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutGrid,
  List,
  Receipt,
  Search,
  Ship,
} from "lucide-react";
import type { VesselSummary } from "../../hooks/useDashboardData";
import { ProgressTrack, Section } from "./widgets";

const VESSELS_PER_PAGE = 12;

type VesselFilter = "all" | "active" | "completed" | "alerts";
type VesselSort = "name" | "activity" | "progress" | "workOrders";

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const controlClass =
  "min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-blue-700 sm:min-h-10 sm:text-sm";

// Status tags for a vessel. Overdue and ready-to-invoice can both apply, so
// they stack; a vessel with neither shows a single neutral tag instead. Each
// carries an icon and a word, so colour is never the only signal.
function VesselBadges({ vessel }: { vessel: VesselSummary }) {
  const tag =
    "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium";
  const none = !vessel.hasOverdue && vessel.readyForInvoiceCount === 0;
  const allDone = vessel.completed > 0 && vessel.inProgress === 0;
  return (
    <>
      {vessel.hasOverdue && (
        <span className={`${tag} bg-red-50 text-red-800`}>
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Overdue
        </span>
      )}
      {vessel.readyForInvoiceCount > 0 && (
        <span className={`${tag} bg-amber-50 text-amber-900`}>
          <Receipt className="h-3.5 w-3.5" aria-hidden="true" /> Ready to
          invoice
        </span>
      )}
      {none && (
        <span
          className={`${tag} ${
            allDone ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          {allDone ? "Completed" : "Normal"}
        </span>
      )}
    </>
  );
}

function VesselCard({ vessel }: { vessel: VesselSummary }) {
  const categories = [
    { label: "Docking", value: vessel.dockingProgress },
    { label: "Repair", value: vessel.repairProgress },
    { label: "New Building", value: vessel.newBuildingProgress },
  ].filter((c): c is { label: string; value: number } => c.value !== null);

  return (
    <Link
      to={`/vessel/${vessel.id}/work-orders`}
      className="group flex w-full flex-col rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-blue-700"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
          <Ship className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-sm font-semibold text-slate-900 group-hover:underline"
            title={vessel.name}
          >
            {vessel.name}
          </h3>
          <p
            className="truncate text-sm text-slate-600"
            title={`${vessel.type} • ${vessel.company}`}
          >
            {vessel.type} • {vessel.company}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <VesselBadges vessel={vessel} />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-y border-slate-200 py-3 text-center">
        {[
          { label: "Work orders", value: vessel.totalWorkOrders, tone: "text-slate-900" },
          { label: "In progress", value: vessel.inProgress, tone: "text-blue-800" },
          { label: "Done", value: vessel.completed, tone: "text-emerald-800" },
        ].map((stat) => (
          <div key={stat.label}>
            <dt className="text-xs text-slate-600">{stat.label}</dt>
            <dd className={`text-lg font-semibold tabular-nums ${stat.tone}`}>
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-sm font-medium text-slate-700">
            Overall progress
          </span>
          <span className="text-sm font-semibold tabular-nums text-slate-900">
            {vessel.overallProgress}%
          </span>
        </div>
        <ProgressTrack
          value={vessel.overallProgress}
          color="bg-blue-700"
          height="h-2"
          label={`Overall progress of ${vessel.name}`}
        />
      </div>

      {categories.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {categories.map((c) => (
            <li key={c.label} className="flex items-center gap-2">
              <span className="w-24 flex-shrink-0 text-xs text-slate-600">
                {c.label}
              </span>
              <ProgressTrack
                value={c.value}
                color="bg-slate-600"
                height="h-1.5"
                label={`${c.label} progress of ${vessel.name}`}
              />
              <span className="w-9 flex-shrink-0 text-right text-xs tabular-nums text-slate-700">
                {c.value}%
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-600">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        {vessel.lastActivity
          ? `Last activity ${formatDate(vessel.lastActivity)}`
          : "No activity yet"}
      </p>
    </Link>
  );
}

export default function VesselSection({
  vessels,
}: {
  vessels: VesselSummary[];
}) {
  const navigate = useNavigate();
  const idBase = useId();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState<VesselFilter>("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<VesselSort>("activity");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let result = vessels;

    if (searchTerm) {
      const needle = searchTerm.toLowerCase();
      result = result.filter(
        (v) =>
          (v.name?.toLowerCase() || "").includes(needle) ||
          (v.type?.toLowerCase() || "").includes(needle) ||
          (v.company?.toLowerCase() || "").includes(needle),
      );
    }

    switch (filter) {
      case "active":
        result = result.filter(
          (v) => v.inProgress > 0 || v.planned > 0 || v.readyForInvoiceCount > 0,
        );
        break;
      case "completed":
        result = result.filter((v) => v.completed > 0);
        break;
      case "alerts":
        result = result.filter((v) => v.hasOverdue || v.readyForInvoiceCount > 0);
        break;
      default:
        break;
    }

    return [...result].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "progress":
          return b.overallProgress - a.overallProgress;
        case "workOrders":
          return b.totalWorkOrders - a.totalWorkOrders;
        case "activity":
        default:
          if (a.lastActivity && !b.lastActivity) return -1;
          if (!a.lastActivity && b.lastActivity) return 1;
          if (a.lastActivity && b.lastActivity) {
            return (
              new Date(b.lastActivity).getTime() -
              new Date(a.lastActivity).getTime()
            );
          }
          return a.name.localeCompare(b.name);
      }
    });
  }, [vessels, searchTerm, filter, sortBy]);

  const counts = useMemo(
    () => ({
      all: vessels.length,
      // Same rule as the "active" filter above, so the number in the menu
      // matches the list it produces.
      active: vessels.filter(
        (v) => v.inProgress > 0 || v.planned > 0 || v.readyForInvoiceCount > 0,
      ).length,
      completed: vessels.filter((v) => v.completed > 0).length,
      alerts: vessels.filter((v) => v.hasOverdue || v.readyForInvoiceCount > 0)
        .length,
      overdue: vessels.filter((v) => v.hasOverdue).length,
      readyToInvoice: vessels.filter((v) => v.readyForInvoiceCount > 0).length,
      avgProgress: vessels.length
        ? Math.round(
            vessels.reduce((sum, v) => sum + v.overallProgress, 0) /
              vessels.length,
          )
        : 0,
    }),
    [vessels],
  );

  const totalPages = Math.ceil(filtered.length / VESSELS_PER_PAGE);
  const currentPage = Math.min(page, Math.max(totalPages, 1));
  const startIndex = (currentPage - 1) * VESSELS_PER_PAGE;
  const pageVessels = filtered.slice(startIndex, startIndex + VESSELS_PER_PAGE);

  const hasActiveFilters = searchTerm !== "" || filter !== "all";
  const clearFilters = () => {
    setSearchTerm("");
    setFilter("all");
    setPage(1);
  };

  if (vessels.length === 0) {
    return (
      <Section id="vessels" title="Vessels">
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
          <Ship className="mx-auto h-8 w-8 text-slate-500" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-slate-900">
            No vessels have work orders yet
          </p>
          <p className="mt-1 text-sm text-slate-600">
            A vessel appears here once it has a project with a work order.
          </p>
        </div>
      </Section>
    );
  }

  return (
    <Section
      id="vessels"
      title="Vessels"
      description={
        <>
          {counts.overdue} overdue · {counts.readyToInvoice} ready to invoice ·
          average progress {counts.avgProgress}%
        </>
      }
      action={
        <div
          role="group"
          aria-label="View mode"
          className="inline-flex self-start rounded-md border border-slate-300 bg-white p-0.5 sm:self-auto"
        >
          {(
            [
              { mode: "grid", label: "Cards", Icon: LayoutGrid },
              { mode: "list", label: "Table", Icon: List },
            ] as const
          ).map(({ mode, label, Icon }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              aria-pressed={viewMode === mode}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded px-3 sm:min-h-10 text-sm font-medium transition-colors ${
                viewMode === mode
                  ? "bg-blue-950 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      }
    >
      <form
        role="search"
        onSubmit={(e) => e.preventDefault()}
        className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_14rem_14rem]"
      >
        <div className="sm:col-span-2 lg:col-span-1">
          <label
            htmlFor={`${idBase}-search`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Search vessels
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
              aria-hidden="true"
            />
            <input
              id={`${idBase}-search`}
              type="search"
              placeholder="Name, type or company"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className={`${controlClass} pl-9 placeholder:text-slate-500`}
            />
          </div>
        </div>
        <div>
          <label
            htmlFor={`${idBase}-filter`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Show
          </label>
          <select
            id={`${idBase}-filter`}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as VesselFilter);
              setPage(1);
            }}
            className={controlClass}
          >
            <option value="all">All vessels ({counts.all})</option>
            <option value="active">Active work ({counts.active})</option>
            <option value="completed">Has completed ({counts.completed})</option>
            <option value="alerts">Needs attention ({counts.alerts})</option>
          </select>
        </div>
        <div>
          <label
            htmlFor={`${idBase}-sort`}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Sort by
          </label>
          <select
            id={`${idBase}-sort`}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as VesselSort)}
            className={controlClass}
          >
            <option value="activity">Recent activity</option>
            <option value="name">Name (A-Z)</option>
            <option value="progress">Progress %</option>
            <option value="workOrders">Work order count</option>
          </select>
        </div>
      </form>

      <p
        role="status"
        className="mb-3 text-sm text-slate-600"
      >
        Showing {filtered.length} of {vessels.length} vessels
      </p>

      {pageVessels.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
          <Ship className="mx-auto h-8 w-8 text-slate-500" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-slate-900">
            No vessels match these filters
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Try a different search, or show every vessel.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              Show all vessels
            </button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {pageVessels.map((vessel) => (
            <li key={vessel.id} className="flex">
              <VesselCard vessel={vessel} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="table-stack min-w-full divide-y divide-slate-200">
              <caption className="sr-only">Vessels and their work progress</caption>
              <thead className="bg-slate-50">
                <tr>
                  {["Vessel", "Work Orders", "Progress", "Status", "Last Activity"].map(
                    (heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="px-4 py-3 text-left text-sm font-semibold text-slate-700"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {pageVessels.map((vessel) => (
                  <tr
                    key={vessel.id}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                    onClick={() => navigate(`/vessel/${vessel.id}/work-orders`)}
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/vessel/${vessel.id}/work-orders`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex min-h-11 items-center rounded text-sm font-semibold text-blue-800 hover:underline md:inline-block md:min-h-0"
                      >
                        {vessel.name}
                      </Link>
                      <div className="text-sm text-slate-600">
                        {vessel.type} • {vessel.company}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums">
                      <span className="font-medium text-slate-900">
                        {vessel.totalWorkOrders} total
                      </span>
                      <span className="text-slate-600">
                        {" "}
                        · {vessel.inProgress} in progress · {vessel.completed} done
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-24">
                          <ProgressTrack
                            value={vessel.overallProgress}
                            color="bg-blue-700"
                            height="h-2"
                            label={`Overall progress of ${vessel.name}`}
                          />
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-slate-900">
                          {vessel.overallProgress}%
                        </span>
                      </div>
                      <div className="mt-1 text-xs tabular-nums text-slate-600">
                        Docking{" "}
                        {vessel.dockingProgress !== null
                          ? `${vessel.dockingProgress}%`
                          : "-"}{" "}
                        · Repair{" "}
                        {vessel.repairProgress !== null
                          ? `${vessel.repairProgress}%`
                          : "-"}
                        {vessel.newBuildingProgress !== null &&
                          ` · New Building ${vessel.newBuildingProgress}%`}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <VesselBadges vessel={vessel} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {vessel.lastActivity
                        ? formatDate(vessel.lastActivity)
                        : "No activity"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Vessel pages"
          className="mt-5 flex flex-col items-center justify-between gap-3 sm:flex-row"
        >
          <p className="text-sm tabular-nums text-slate-600">
            Showing {startIndex + 1}-
            {Math.min(startIndex + VESSELS_PER_PAGE, filtered.length)} of{" "}
            {filtered.length} vessels
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
              className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white sm:h-10 sm:w-10"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum =
                Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setPage(pageNum)}
                  aria-label={`Page ${pageNum}`}
                  aria-current={pageNum === currentPage ? "page" : undefined}
                  className={`h-11 min-w-11 rounded-md px-3 text-sm font-medium tabular-nums sm:h-10 sm:min-w-10 ${
                    pageNum === currentPage
                      ? "bg-blue-950 text-white"
                      : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              aria-label="Next page"
              className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white sm:h-10 sm:w-10"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}

      <p className="mt-6 text-center">
        <Link
          to="/work-orders"
          className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-blue-800 hover:underline"
        >
          Open the detailed vessel dashboard
        </Link>
      </p>
    </Section>
  );
}
