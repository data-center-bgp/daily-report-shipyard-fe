import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { computeDateRange, formatDateRange } from "../../utils/deadlineUtils";
import {
  RefreshCw,
  Plus,
  CheckCircle2,
  X,
  Ship,
  FolderKanban,
  ChevronRight,
  ClipboardCheck,
  CalendarRange,
} from "lucide-react";

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

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  NONE: { label: "No readiness form yet", className: "bg-gray-100 text-gray-600" },
  DRAFT: { label: "Readiness: Draft", className: "bg-gray-100 text-gray-700" },
  PENDING_APPROVAL: {
    label: "Readiness: Pending approval",
    className: "bg-amber-100 text-amber-700",
  },
  APPROVED: {
    label: "Readiness: Approved",
    className: "bg-green-100 text-green-700",
  },
  REJECTED: {
    label: "Readiness: Rejected",
    className: "bg-red-100 text-red-700",
  },
};

export default function ProjectsList() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { isReadOnly } = useAuth();

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
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setProjects((data as any) || []);
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

  const filteredProjects = projects.filter((p) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      p.project_name?.toLowerCase().includes(searchLower) ||
      p.vessel?.name?.toLowerCase().includes(searchLower) ||
      p.vessel?.company?.toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading projects...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error Loading Projects</h3>
          <p className="text-red-600 mt-1">{error}</p>
          <button
            onClick={fetchProjects}
            className="mt-3 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-600">
            Every docking event, grouped by vessel — work orders live inside a
            project
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchProjects}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          {!isReadOnly && (
            <button
              onClick={() => navigate("/projects/add")}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" /> New Project
            </button>
          )}
        </div>
      </div>

      {showSuccessMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center">
            <CheckCircle2 className="w-5 h-5 text-green-600 mr-2" />
            <p className="text-green-700 font-medium">
              Project created successfully!
            </p>
          </div>
          <button
            onClick={() => setShowSuccessMessage(false)}
            className="text-green-600 hover:text-green-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <input
            type="text"
            placeholder="Search by project name, vessel, or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-96 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="p-6">
          {filteredProjects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((project) => {
                const statusKey = project.readiness_form?.status || "NONE";
                const badge = STATUS_BADGE[statusKey] || STATUS_BADGE.NONE;
                const woCount = project.work_order?.length || 0;
                const originalWorkDetails = (project.work_order || [])
                  .filter((wo) => !wo.is_additional_wo)
                  .flatMap((wo) => wo.work_details);
                const projectRange = computeDateRange(originalWorkDetails);

                return (
                  <div
                    key={project.id}
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className="border border-gray-200 rounded-lg p-6 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center">
                        <FolderKanban className="w-8 h-8 text-blue-600 mr-3 flex-shrink-0" />
                        <div>
                          <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                            {project.project_name}
                          </h3>
                          <p className="text-sm text-gray-600 flex items-center gap-1 mt-0.5">
                            <Ship className="w-3.5 h-3.5" />{" "}
                            {project.vessel?.name || "No vessel"}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-blue-500 group-hover:text-blue-700 transition-colors flex-shrink-0" />
                    </div>

                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-3">
                      <CalendarRange className="w-3.5 h-3.5" />{" "}
                      {formatDateRange(projectRange)}
                    </p>

                    <div className="flex items-center justify-between mt-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${badge.className}`}
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" /> {badge.label}
                      </span>
                      <span className="text-sm text-gray-500">
                        {woCount} WO{woCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <FolderKanban className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 text-lg mb-2">
                {searchTerm ? "No projects match your search" : "No projects yet"}
              </p>
              {!searchTerm && !isReadOnly && (
                <button
                  onClick={() => navigate("/projects/add")}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Create Your First Project
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
