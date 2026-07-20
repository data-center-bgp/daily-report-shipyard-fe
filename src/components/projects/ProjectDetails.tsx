import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import {
  computeDateRange,
  formatDateRange,
  exceedsDeadline,
} from "../../utils/deadlineUtils";
import {
  ArrowLeft,
  FolderKanban,
  Ship,
  Plus,
  ClipboardCheck,
  FileText,
  CheckCircle2,
  X,
  CalendarRange,
  AlertTriangle,
} from "lucide-react";

interface ProjectDetail {
  id: number;
  project_name: string;
  vessel: { id: number; name: string; type: string; company: string } | null;
  readiness_form: { id: number; status: string } | null;
}

interface WorkOrderRow {
  id: number;
  shipyard_wo_number: string;
  shipyard_wo_date: string;
  is_additional_wo: boolean | null;
  work_details: {
    planned_start_date: string | null;
    target_close_date: string | null;
    work_progress: { progress_percentage: number; report_date: string }[];
  }[];
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-gray-100 text-gray-700" },
  PENDING_APPROVAL: {
    label: "Pending approval",
    className: "bg-amber-100 text-amber-700",
  },
  APPROVED: { label: "Approved", className: "bg-green-100 text-green-700" },
  REJECTED: { label: "Rejected", className: "bg-red-100 text-red-700" },
};

function overallProgress(wo: WorkOrderRow): number {
  if (!wo.work_details.length) return 0;
  const totals = wo.work_details.map((wd) => {
    const progress = wd.work_progress || [];
    if (!progress.length) return 0;
    const latest = [...progress].sort(
      (a, b) => new Date(b.report_date).getTime() - new Date(a.report_date).getTime(),
    )[0];
    return latest?.progress_percentage || 0;
  });
  return Math.round(totals.reduce((sum, p) => sum + p, 0) / totals.length);
}

export default function ProjectDetails() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isReadOnly } = useAuth();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

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
          project_name,
          vessel:vessel_id ( id, name, type, company ),
          readiness_form:readiness_form_id ( id, status )
        `,
        )
        .eq("id", projectId)
        .is("deleted_at", null)
        .single();

      if (fetchError) throw fetchError;
      setProject(data as any);

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
            work_progress ( progress_percentage, report_date )
          )
        `,
        )
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("shipyard_wo_date", { ascending: true });

      if (woError) throw woError;
      setWorkOrders((woData as any) || []);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading project...</span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error Loading Project</h3>
          <p className="text-red-600 mt-1">{error || "Project not found"}</p>
          <button
            onClick={() => navigate("/projects")}
            className="mt-3 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  // Project deadline comes only from ORIGINAL work orders' work details —
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

  const statusKey = project.readiness_form?.status || null;
  const badge = statusKey ? STATUS_BADGE[statusKey] : null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate("/projects")}
            className="text-gray-600 hover:text-gray-900 flex items-center gap-2 mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Projects
          </button>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FolderKanban className="w-7 h-7 text-blue-600" />
            {project.project_name}
          </h1>
          <p className="text-gray-600 flex items-center gap-1 mt-1">
            <Ship className="w-4 h-4" /> {project.vessel?.name} —{" "}
            {project.vessel?.type} ({project.vessel?.company})
          </p>
        </div>
        {!isReadOnly && (
          <button
            onClick={handleAddWorkOrder}
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" /> Add Work Order
          </button>
        )}
      </div>

      {showSuccessMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center">
            <CheckCircle2 className="w-5 h-5 text-green-600 mr-2" />
            <p className="text-green-700 font-medium">Saved successfully!</p>
          </div>
          <button
            onClick={() => setShowSuccessMessage(false)}
            className="text-green-600 hover:text-green-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Project timeline — from original work orders only */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <CalendarRange className="w-5 h-5 text-blue-600" /> Project Timeline
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          {formatDateRange(projectRange)}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Based on the planned start and target close dates of this
          project's original work order's work details. Additional work
          orders don't move this timeline.
        </p>

        {additionalWorkOrdersBeyondDeadline.length > 0 && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-amber-800 text-sm font-medium">
                {additionalWorkOrdersBeyondDeadline.length} additional work
                order
                {additionalWorkOrdersBeyondDeadline.length > 1 ? "s" : ""}{" "}
                {additionalWorkOrdersBeyondDeadline.length > 1
                  ? "extend"
                  : "extends"}{" "}
                beyond the project's target finish date
              </p>
              <p className="text-amber-700 text-sm mt-1">
                {additionalWorkOrdersBeyondDeadline
                  .map((wo) => wo.shipyard_wo_number)
                  .join(", ")}{" "}
                — the project's own deadline is unaffected, but these work
                orders individually run later.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Readiness Form section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-blue-600" /> Vessel Readiness
            Form
          </h2>
          {badge && (
            <span
              className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${badge.className}`}
            >
              {badge.label}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 mt-2">
          FM-OPS-04-11 — checks the vessel's readiness before entering the
          shipyard. The original (non-additional) work order for this project
          can't be created until this form is approved.
        </p>
        <button
          onClick={() => navigate(`/projects/${project.id}/readiness`)}
          className="mt-4 inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <FileText className="w-4 h-4" />
          {project.readiness_form ? "View / Edit Readiness Form" : "Start Readiness Form"}
        </button>
      </div>

      {/* Work orders in this project */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Work Orders in this Project ({workOrders.length})
          </h2>
        </div>
        {workOrders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    WO Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Deadline
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {workOrders.map((wo) => {
                  const woRange = computeDateRange(wo.work_details);
                  const beyondDeadline =
                    !!wo.is_additional_wo && exceedsDeadline(woRange, projectRange);

                  return (
                    <tr key={wo.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {wo.shipyard_wo_number}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(wo.shipyard_wo_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {wo.is_additional_wo ? (
                          <span className="inline-flex px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-700">
                            Additional
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                            Original
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div>{formatDateRange(woRange)}</div>
                        {beyondDeadline && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                            <AlertTriangle className="w-3 h-3" /> Beyond
                            project deadline
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {overallProgress(wo)}%
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <button
                          onClick={() => navigate(`/edit-work-order/${wo.id}`)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">No work orders in this project yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
