import { useState, useEffect, useCallback, useId, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { computeDateRange, formatDateRange } from "../../utils/deadlineUtils";
import {
  CheckCircle2,
  FolderKanban,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { PageSkeleton } from "../common/Skeleton";
import Pagination from "../common/Pagination";
import { READINESS_STATUS } from "./readinessStatus";
import { ApprovalTags, type PlanApproval } from "./ApprovalTags";

const PAGE_SIZE = 20;

interface ProjectRow {
  id: number;
  project_name: string;
  created_at: string;
  vessel: { id: number; name: string; type: string; company: string } | null;
  readiness_form: { id: number; status: string } | null;
  work_order:
    | {
        id: number;
        is_additional_wo: boolean | null;
        work_details: {
          planned_start_date: string | null;
          target_close_date: string | null;
        }[];
      }[]
    | null;
}

const STATUS_BADGE = READINESS_STATUS;

const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-800 sm:min-h-10";
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 sm:min-h-10";

export default function ProjectsList() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [planByProject, setPlanByProject] = useState<Map<number, PlanApproval>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const searchId = useId();
  const { isOperationsReadOnly } = useAuth();

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("projects")
        .select(
          `
          id,
          project_name,
          created_at,
          vessel:vessel_id ( id, name, type, company ),
          readiness_form:readiness_form_id ( id, status ),
          work_order (
            id,
            is_additional_wo,
            work_details ( planned_start_date, target_close_date )
          )
        `,
        )
        .is("deleted_at", null)
        .is("work_order.work_details.deleted_at", null)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setProjects((data as unknown as ProjectRow[]) || []);

      // Which projects came from an approved docking plan. If this fails the
      // PPIC tag just reads "Not required", so it never blocks the list.
      const { data: plans } = await supabase
        .from("docking_plans")
        .select("id, approved_at, converted_project_id")
        .not("converted_project_id", "is", null)
        .is("deleted_at", null);
      setPlanByProject(
        new Map(
          ((plans as (PlanApproval & { converted_project_id: number })[]) || []).map(
            (p) => [p.converted_project_id, p],
          ),
        ),
      );
    } catch (err) {
      console.error("Error fetching projects:", err);
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (location.state?.message) {
      setShowSuccessMessage(true);
      navigate(location.pathname, { replace: true, state: {} });
      const timer = setTimeout(() => setShowSuccessMessage(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [location, navigate]);

  // Search narrows first; the status chips then count within the search, so
  // the number on a chip is the number of rows it will show.
  const searched = useMemo(() => {
    if (!searchTerm) return projects;
    const needle = searchTerm.toLowerCase();
    return projects.filter(
      (p) =>
        p.project_name?.toLowerCase().includes(needle) ||
        p.vessel?.name?.toLowerCase().includes(needle) ||
        p.vessel?.company?.toLowerCase().includes(needle),
    );
  }, [projects, searchTerm]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    searched.forEach((p) => {
      const key = p.readiness_form?.status || "NONE";
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [searched]);

  const filteredProjects = useMemo(
    () =>
      statusFilter
        ? searched.filter(
            (p) => (p.readiness_form?.status || "NONE") === statusFilter,
          )
        : searched,
    [searched, statusFilter],
  );

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageProjects = filteredProjects.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const hasFilters = searchTerm !== "" || statusFilter !== "";

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("");
    setPage(1);
  };

  const pageShell = "mx-auto w-full max-w-[96rem] px-4 py-5 sm:px-6 lg:px-8 lg:py-8";

  if (loading) {
    return (
      <div className={pageShell}>
        <PageSkeleton
          label="Loading projects..."
          padding="none"
          action
          filters
          rows={8}
          columns={5}
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
            <span className="font-semibold">Projects could not load.</span>{" "}
            {error}
          </p>
          <button
            type="button"
            onClick={fetchProjects}
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
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Projects
          </h1>
          <p className="mt-1 text-sm text-slate-600 sm:text-base">
            Every docking event, grouped by vessel. Work orders live inside a
            project.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={fetchProjects} className={secondaryButton}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </button>
          {!isOperationsReadOnly && (
            <Link to="/projects/add" className={primaryButton}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New project
            </Link>
          )}
        </div>
      </header>

      {showSuccessMessage && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-900">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            Project created successfully.
          </p>
          <button
            type="button"
            onClick={() => setShowSuccessMessage(false)}
            aria-label="Dismiss message"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md text-emerald-900 hover:bg-emerald-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <section aria-label="Find a project" className="space-y-4">
        <form
          role="search"
          onSubmit={(e) => e.preventDefault()}
          className="max-w-xl"
        >
          <label
            htmlFor={searchId}
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Search projects
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
              aria-hidden="true"
            />
            <input
              id={searchId}
              type="search"
              placeholder="Project name, vessel or company"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="min-h-11 w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-blue-700 sm:min-h-10 sm:text-sm"
            />
          </div>
        </form>

        <div
          role="group"
          aria-label="Filter by readiness form status"
          className="flex flex-wrap gap-2"
        >
          {[
            { key: "", label: "All", count: searched.length },
            ...Object.entries(STATUS_BADGE).map(([key, { label }]) => ({
              key,
              label,
              count: statusCounts[key] || 0,
            })),
          ].map((chip) => (
            <button
              key={chip.key || "all"}
              type="button"
              aria-pressed={statusFilter === chip.key}
              onClick={() => {
                setStatusFilter(chip.key);
                setPage(1);
              }}
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

        <p role="status" className="text-sm text-slate-600">
          {filteredProjects.length === projects.length
            ? `${projects.length} projects`
            : `${filteredProjects.length} of ${projects.length} projects`}
        </p>
      </section>

      {filteredProjects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
          <FolderKanban
            className="mx-auto h-8 w-8 text-slate-500"
            aria-hidden="true"
          />
          <p className="mt-2 text-sm font-medium text-slate-900">
            {hasFilters ? "No projects match these filters" : "No projects yet"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {hasFilters
              ? "Try a different search, or show every readiness status."
              : "A project groups the work orders of one docking event for a vessel."}
          </p>
          {hasFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className={`mt-4 ${secondaryButton}`}
            >
              Show all projects
            </button>
          ) : (
            !isOperationsReadOnly && (
              <Link to="/projects/add" className={`mt-4 ${primaryButton}`}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Create the first
                project
              </Link>
            )
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="table-stack min-w-full divide-y divide-slate-200">
              <caption className="sr-only">Projects, newest first</caption>
              <thead className="bg-slate-50">
                <tr>
                  {[
                    "Project",
                    "Vessel",
                    "Planned dates",
                    "Work orders",
                    "Checked by",
                  ].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-4 py-3 text-left text-sm font-semibold text-slate-700"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {pageProjects.map((project) => {
                  const woCount = project.work_order?.length || 0;
                  const originalWorkDetails = (project.work_order || [])
                    .filter((wo) => !wo.is_additional_wo)
                    .flatMap((wo) => wo.work_details);
                  const projectRange = computeDateRange(originalWorkDetails);

                  return (
                    <tr
                      key={project.id}
                      onClick={() => navigate(`/projects/${project.id}`)}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/projects/${project.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex min-h-11 items-center rounded text-sm font-semibold text-blue-800 hover:underline md:inline-block md:min-h-0"
                        >
                          {project.project_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-slate-900">
                          {project.vessel?.name || "No vessel"}
                        </div>
                        {project.vessel?.company && (
                          <div className="text-slate-600">
                            {project.vessel.company}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {formatDateRange(projectRange)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-slate-900">
                        {woCount} work order{woCount === 1 ? "" : "s"}
                      </td>
                      <td className="px-4 py-3">
                        <ApprovalTags
                          plan={planByProject.get(project.id) ?? null}
                          readinessStatus={project.readiness_form?.status}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination
        page={currentPage}
        totalItems={filteredProjects.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
}
