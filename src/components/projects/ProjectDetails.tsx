import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import {
  computeDateRange,
  formatDateRange,
  exceedsDeadline,
} from "../../utils/deadlineUtils";
import { getLatestProgressRecord } from "../../utils/progressPercentage";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  FileText,
  Link2,
  Loader2,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import LoadingState from "../common/LoadingState";
import RenameProjectModal from "./RenameProjectModal";
import { ProgressTrack, Section } from "../dashboard/widgets";
import { READINESS_STATUS } from "./readinessStatus";
import {
  WORK_TYPE_GROUP_STYLE,
  workTypeGroup,
} from "../../constants/workTypes";

interface ProjectDetail {
  id: number;
  created_at: string;
  project_name: string;
  docking_type: string | null;
  vessel: { id: number; name: string; type: string; company: string } | null;
  readiness_form: { id: number; status: string } | null;
}

interface UnassignedWorkOrder {
  id: number;
  shipyard_wo_number: string;
  shipyard_wo_date: string;
  is_additional_wo: boolean | null;
  work_type: string | null;
}

interface WorkOrderRow {
  id: number;
  shipyard_wo_number: string;
  shipyard_wo_date: string;
  is_additional_wo: boolean | null;
  work_details: {
    planned_start_date: string | null;
    target_close_date: string | null;
    cancelled_at?: string | null;
    work_progress: {
      progress_percentage: number;
      report_date: string;
      created_at: string;
    }[];
  }[];
}

const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 disabled:hover:bg-blue-700 sm:min-h-10";
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 sm:min-h-10";

const TYPE_TAG = "inline-flex rounded px-2 py-0.5 text-xs font-medium";

function overallProgress(wo: WorkOrderRow): number {
  // Cancelled work details don't count toward completion.
  const activeDetails = wo.work_details.filter((wd) => !wd.cancelled_at);
  if (!activeDetails.length) return 0;
  const totals = activeDetails.map((wd) => {
    const progress = wd.work_progress || [];
    if (!progress.length) return 0;
    // Latest by report_date, tie-broken by created_at: see WODetailsTable
    // for why report_date alone isn't enough for same-day entries.
    const latest = getLatestProgressRecord(progress);
    return latest?.progress_percentage || 0;
  });
  return Math.round(totals.reduce((sum, p) => sum + p, 0) / totals.length);
}

// Pick unassigned work orders of the vessel to move into this project. A
// native modal <dialog>: the page behind goes inert, focus moves in and comes
// back to the trigger, and Escape closes it.
function AssignWorkOrderDialog({
  vesselName,
  workOrders,
  loading,
  loadError,
  assignError,
  selectedIds,
  assigning,
  onToggle,
  onAssign,
  onClose,
}: {
  vesselName: string | undefined;
  workOrders: UnassignedWorkOrder[];
  loading: boolean;
  loadError: string | null;
  assignError: string | null;
  selectedIds: Set<number>;
  assigning: boolean;
  onToggle: (id: number) => void;
  onAssign: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="assign-wo-title"
      onClose={onClose}
      onClick={(e) => {
        // A click on the dialog's own box (the backdrop area) dismisses it.
        if (e.target === dialogRef.current) onClose();
      }}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/50"
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 py-2 pl-4 pr-2">
          <h2
            id="assign-wo-title"
            className="flex items-center gap-2 text-lg font-semibold"
          >
            <Link2 className="h-5 w-5" aria-hidden="true" /> Assign existing work
            order
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="mb-4 text-sm text-slate-600">
            Only unassigned work orders for {vesselName} are shown. Once
            assigned, a work order can't be picked up by another project.
          </p>

          {loading ? (
            <div
              role="status"
              className="flex items-center justify-center py-8 text-slate-600"
            >
              <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
              Loading work orders
            </div>
          ) : loadError ? (
            <p role="alert" className="text-sm text-red-800">
              {loadError}
            </p>
          ) : workOrders.length === 0 ? (
            <p className="py-4 text-sm text-slate-600">
              This vessel has no unassigned work orders. Create one from Add
              work order instead.
            </p>
          ) : (
            <ul className="space-y-2">
              {workOrders.map((wo) => (
                <li key={wo.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(wo.id)}
                      onChange={() => onToggle(wo.id)}
                      className="h-5 w-5 flex-shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900">
                        {wo.shipyard_wo_number}
                      </span>
                      <span className="block text-sm text-slate-600">
                        {new Date(wo.shipyard_wo_date).toLocaleDateString()}
                      </span>
                    </span>
                    <span className="flex flex-wrap justify-end gap-1.5">
                      {wo.work_type ? (
                        <span
                          title={wo.work_type}
                          className={`${TYPE_TAG} ${
                            WORK_TYPE_GROUP_STYLE[workTypeGroup(wo.work_type)]
                          }`}
                        >
                          {workTypeGroup(wo.work_type)}
                        </span>
                      ) : (
                        <span className={`${TYPE_TAG} bg-slate-100 text-slate-700`}>
                          Type unknown
                        </span>
                      )}
                      <span
                        className={`${TYPE_TAG} ${
                          wo.is_additional_wo
                            ? "bg-purple-50 text-purple-800"
                            : "bg-blue-50 text-blue-800"
                        }`}
                      >
                        {wo.is_additional_wo ? "Additional" : "Original"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {assignError && (
            <p role="alert" className="mt-3 text-sm text-red-800">
              {assignError}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 p-3">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onAssign}
            disabled={selectedIds.size === 0 || assigning}
            className={primaryButton}
          >
            {assigning && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Assign{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default function ProjectDetails() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isOperationsReadOnly } = useAuth();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [unassignedWOs, setUnassignedWOs] = useState<UnassignedWorkOrder[]>([]);
  const [unassignedLoading, setUnassignedLoading] = useState(false);
  const [unassignedError, setUnassignedError] = useState<string | null>(null);
  const [selectedWOIds, setSelectedWOIds] = useState<Set<number>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const [removingWOId, setRemovingWOId] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("projects")
        .select(
          `
          id,
          created_at,
          project_name,
          docking_type,
          vessel:vessel_id ( id, name, type, company ),
          readiness_form:readiness_form_id ( id, status )
        `,
        )
        .eq("id", projectId)
        .is("deleted_at", null)
        .single();

      if (fetchError) throw fetchError;
      setProject(data as unknown as ProjectDetail);

      const { data: woData, error: woError } = await supabase
        .from("work_order")
        .select(
          `
          id,
          shipyard_wo_number,
          shipyard_wo_date,
          is_additional_wo,
          work_details (
            planned_start_date,
            target_close_date,
            cancelled_at,
            work_progress ( progress_percentage, report_date, created_at )
          )
        `,
        )
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .is("work_details.deleted_at", null)
        .order("shipyard_wo_date", { ascending: true });

      if (woError) throw woError;
      setWorkOrders((woData as unknown as WorkOrderRow[]) || []);
    } catch (err) {
      console.error("Error fetching project:", err);
      setError(err instanceof Error ? err.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    if (location.state?.message) {
      setShowSuccessMessage(true);
      navigate(location.pathname, { replace: true, state: {} });
      const timer = setTimeout(() => setShowSuccessMessage(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [location, navigate]);

  const handleAddWorkOrder = () => {
    navigate("/add-work-order", {
      state: { preselectedProjectId: project?.id },
    });
  };

  // The dialog unmounts as it closes, so the browser can't hand focus back to
  // the button that opened it; do it by hand.
  const assignTriggerRef = useRef<HTMLElement | null>(null);
  const closeAssignModal = () => {
    setShowAssignModal(false);
    requestAnimationFrame(() => assignTriggerRef.current?.focus());
  };

  const openAssignModal = async () => {
    if (!project?.vessel) return;
    assignTriggerRef.current = document.activeElement as HTMLElement | null;
    setShowAssignModal(true);
    setSelectedWOIds(new Set());
    setAssignError(null);
    setUnassignedError(null);
    setUnassignedLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from("work_order")
        .select("id, shipyard_wo_number, shipyard_wo_date, is_additional_wo, work_type")
        .eq("vessel_id", project.vessel.id)
        .is("project_id", null)
        .is("deleted_at", null)
        .order("shipyard_wo_date", { ascending: true });

      if (fetchError) throw fetchError;
      setUnassignedWOs((data as unknown as UnassignedWorkOrder[]) || []);
    } catch (err) {
      setUnassignedError(
        err instanceof Error ? err.message : "Failed to load unassigned work orders",
      );
    } finally {
      setUnassignedLoading(false);
    }
  };

  const toggleSelectedWO = (id: number) => {
    setSelectedWOIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssignWorkOrders = async () => {
    if (!project || selectedWOIds.size === 0) return;
    setAssigning(true);
    setAssignError(null);
    try {
      const ids = Array.from(selectedWOIds);
      // Fresh re-check at submit time: only update rows still unassigned, in
      // case another user assigned one of these elsewhere in the meantime.
      const { data, error: updateError } = await supabase
        .from("work_order")
        .update({ project_id: project.id })
        .in("id", ids)
        .is("project_id", null)
        .select("id");

      if (updateError) throw updateError;

      const updatedCount = data?.length || 0;
      if (updatedCount < ids.length) {
        setAssignError(
          `${updatedCount} of ${ids.length} work orders were assigned. The rest were already claimed by another project in the meantime.`,
        );
      }
      setShowAssignModal(false);
      await fetchProject();
      setShowSuccessMessage(true);
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Failed to assign work orders");
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveWorkOrder = async (wo: WorkOrderRow) => {
    if (!project) return;
    const confirmed = window.confirm(
      `Remove ${wo.shipyard_wo_number} from this project?\n\nThe work order and its data won't be deleted. It becomes unassigned and can be re-assigned to a project later.`,
    );
    if (!confirmed) return;

    setRemovingWOId(wo.id);
    setRemoveError(null);
    try {
      const { error: updateError } = await supabase
        .from("work_order")
        .update({ project_id: null })
        .eq("id", wo.id)
        .eq("project_id", project.id);

      if (updateError) throw updateError;

      await fetchProject();
      setShowSuccessMessage(true);
    } catch (err) {
      setRemoveError(
        err instanceof Error ? err.message : "Failed to remove work order from project",
      );
    } finally {
      setRemovingWOId(null);
    }
  };

  const pageShell = "mx-auto w-full max-w-[96rem] px-4 py-5 sm:px-6 lg:px-8 lg:py-8";

  if (loading) {
    return <LoadingState label="Loading project..." />;
  }

  if (error || !project) {
    return (
      <div className={pageShell}>
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-red-900">
            <span className="font-semibold">This project could not load.</span>{" "}
            {error || "Project not found"}
          </p>
          <Link to="/projects" className={secondaryButton}>
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  // Project deadline comes only from ORIGINAL work orders' work details;
  // additional work orders get their own deadline but never move this one.
  const originalWorkOrders = workOrders.filter((wo) => !wo.is_additional_wo);
  const projectRange = computeDateRange(
    originalWorkOrders.flatMap((wo) => wo.work_details),
  );
  const additionalWorkOrdersBeyondDeadline = workOrders.filter((wo) => {
    if (!wo.is_additional_wo) return false;
    const woRange = computeDateRange(wo.work_details);
    return exceedsDeadline(woRange, projectRange);
  });

  const readiness = project.readiness_form
    ? READINESS_STATUS[project.readiness_form.status] || null
    : READINESS_STATUS.NONE;
  const vesselId = project.vessel?.id;

  return (
    <div className={`${pageShell} space-y-8`}>
      <header className="space-y-3">
        <Link
          to="/projects"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-blue-800 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back to Projects
        </Link>

        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold text-slate-900 sm:text-3xl">
              {project.project_name}
            </h1>
            <p className="mt-1 text-sm text-slate-700 sm:text-base">
              {project.vessel ? (
                <>
                  <span className="font-medium">{project.vessel.name}</span>
                  {", "}
                  {project.vessel.type}, {project.vessel.company}
                </>
              ) : (
                "No vessel"
              )}
            </p>
            {project.docking_type && (
              <p className="mt-0.5 text-sm text-slate-600">
                Jenis Docking: {project.docking_type}
              </p>
            )}
          </div>

          {!isOperationsReadOnly && (
            <div className="flex flex-wrap gap-2">
              {project.vessel && (
                <button
                  type="button"
                  onClick={() => setShowRenameModal(true)}
                  className={secondaryButton}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" /> Rename project
                </button>
              )}
              <button
                type="button"
                onClick={openAssignModal}
                className={secondaryButton}
              >
                <Link2 className="h-4 w-4" aria-hidden="true" /> Assign existing
                work order
              </button>
              <button
                type="button"
                onClick={handleAddWorkOrder}
                className={primaryButton}
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Add work order
              </button>
            </div>
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
            Saved successfully.
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

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-6 xl:gap-8">
        <Section
          id="timeline"
          title="Project timeline"
          description="From the planned start and target close dates of the original work orders' work details."
        >
          <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
            <p className="text-xl font-semibold text-slate-900">
              {formatDateRange(projectRange)}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Additional work orders don't move this timeline.
            </p>

            {additionalWorkOrdersBeyondDeadline.length > 0 && (
              <div
                role="note"
                className="mt-4 flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3"
              >
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-800"
                  aria-hidden="true"
                />
                <div className="text-sm text-amber-950">
                  <p className="font-medium">
                    {additionalWorkOrdersBeyondDeadline.length} additional work
                    order
                    {additionalWorkOrdersBeyondDeadline.length > 1 ? "s" : ""}{" "}
                    {additionalWorkOrdersBeyondDeadline.length > 1
                      ? "extend"
                      : "extends"}{" "}
                    beyond the project's target finish date
                  </p>
                  <p className="mt-1">
                    {additionalWorkOrdersBeyondDeadline
                      .map((wo) => wo.shipyard_wo_number)
                      .join(", ")}
                    . The project's own deadline is unaffected, but these work
                    orders individually run later.
                  </p>
                </div>
              </div>
            )}
          </div>
        </Section>

        <Section
          id="readiness"
          title="Vessel readiness form"
          description="FM-OPS-04-11: checks the vessel's readiness before it enters the shipyard."
        >
          <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
            {readiness && (
              <span
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm font-medium ${readiness.className}`}
              >
                <readiness.Icon className="h-4 w-4" aria-hidden="true" />
                {readiness.label}
              </span>
            )}
            <p className="mt-3 text-sm text-slate-700">
              The original (non-additional) work order for this project can't be
              created until this form is approved.
            </p>
            <Link
              to={`/projects/${project.id}/readiness`}
              className={`mt-4 ${primaryButton}`}
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              {project.readiness_form
                ? "View or edit readiness form"
                : "Start readiness form"}
            </Link>
          </div>
        </Section>
      </div>

      <Section
        id="work-orders"
        title={`Work orders in this project (${workOrders.length})`}
      >
        {removeError && (
          <div
            role="alert"
            className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900"
          >
            {removeError}
          </div>
        )}
        {workOrders.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="table-stack w-full divide-y divide-slate-200">
                <caption className="sr-only">
                  Work orders in this project, oldest first
                </caption>
                <thead className="bg-slate-50">
                  <tr>
                    {["WO number", "Date", "Type", "Deadline", "Progress", "Actions"].map(
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
                <tbody className="divide-y divide-slate-200">
                  {workOrders.map((wo) => {
                    const woRange = computeDateRange(wo.work_details);
                    const beyondDeadline =
                      !!wo.is_additional_wo && exceedsDeadline(woRange, projectRange);
                    const progress = overallProgress(wo);

                    return (
                      <tr key={wo.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-semibold">
                          {/* Opens this work order, with its work details, on
                              the vessel's Work Orders page. Back there
                              returns to this project. */}
                          {vesselId ? (
                            <Link
                              to={`/vessel/${vesselId}/work-orders`}
                              state={{
                                highlightWorkOrderId: wo.id,
                                from: { path: `/projects/${projectId}` },
                              }}
                              title="Open this work order and its work details"
                              className="flex min-h-11 items-center text-blue-800 hover:underline md:inline-block md:min-h-0"
                            >
                              {wo.shipyard_wo_number}
                            </Link>
                          ) : (
                            wo.shipyard_wo_number
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {new Date(wo.shipyard_wo_date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`${TYPE_TAG} ${
                              wo.is_additional_wo
                                ? "bg-purple-50 text-purple-800"
                                : "bg-blue-50 text-blue-800"
                            }`}
                          >
                            {wo.is_additional_wo ? "Additional" : "Original"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          <div>{formatDateRange(woRange)}</div>
                          {beyondDeadline && (
                            <span className="mt-1 inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                              <AlertTriangle
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              Beyond project deadline
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-24">
                              <ProgressTrack
                                value={progress}
                                color="bg-blue-700"
                                height="h-2"
                                label={`Progress of ${wo.shipyard_wo_number}`}
                              />
                            </div>
                            <span className="text-sm font-semibold tabular-nums text-slate-900">
                              {progress}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-1">
                            <Link
                              to={`/edit-work-order/${wo.id}`}
                              aria-label={`Edit ${wo.shipyard_wo_number}`}
                              className="inline-flex min-h-11 items-center rounded-md px-3 font-medium text-blue-800 hover:bg-blue-50 md:min-h-10"
                            >
                              Edit
                            </Link>
                            {!isOperationsReadOnly && (
                              <button
                                type="button"
                                onClick={() => handleRemoveWorkOrder(wo)}
                                disabled={removingWOId === wo.id}
                                aria-label={`Remove ${wo.shipyard_wo_number} from this project`}
                                className="inline-flex min-h-11 items-center rounded-md px-3 font-medium text-red-800 hover:bg-red-50 disabled:opacity-50 disabled:hover:bg-transparent md:min-h-10"
                              >
                                {removingWOId === wo.id ? "Removing..." : "Remove"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
            <p className="text-sm font-medium text-slate-900">
              No work orders in this project yet
            </p>
            {!isOperationsReadOnly && (
              <p className="mt-1 text-sm text-slate-600">
                Add a new work order, or assign one the vessel already has.
              </p>
            )}
          </div>
        )}
      </Section>

      {showRenameModal && project.vessel && (
        <RenameProjectModal
          project={{ ...project, vessel: project.vessel }}
          onClose={() => setShowRenameModal(false)}
          onRenamed={(updated) => {
            setShowRenameModal(false);
            setProject((prev) => (prev ? { ...prev, ...updated } : prev));
            // A vessel change reshuffles which work orders belong here.
            if (updated.vessel.id !== project.vessel?.id) fetchProject();
            setShowSuccessMessage(true);
            setTimeout(() => setShowSuccessMessage(false), 5000);
          }}
        />
      )}

      {showAssignModal && (
        <AssignWorkOrderDialog
          vesselName={project.vessel?.name}
          workOrders={unassignedWOs}
          loading={unassignedLoading}
          loadError={unassignedError}
          assignError={assignError}
          selectedIds={selectedWOIds}
          assigning={assigning}
          onToggle={toggleSelectedWO}
          onAssign={handleAssignWorkOrders}
          onClose={closeAssignModal}
        />
      )}
    </div>
  );
}
