import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import type { ReadinessFormStatus } from "../../types/readiness.types";
import {
  ClipboardCheck,
  RefreshCw,
  Ship,
  FolderKanban,
  Clock,
} from "lucide-react";

interface ReadinessQueueRow {
  id: number;
  project_id: number;
  status: ReadinessFormStatus;
  created_at: string;
  updated_at: string;
  project: { id: number; project_name: string } | null;
  vessel: { id: number; name: string; type: string; company: string } | null;
}

const STATUS_BADGE: Record<
  ReadinessFormStatus,
  { label: string; className: string }
> = {
  DRAFT: { label: "Draft", className: "bg-gray-100 text-gray-700" },
  SUBMITTED: {
    label: "Awaiting your review",
    className: "bg-amber-100 text-amber-700",
  },
  NEEDS_CLARIFICATION: {
    label: "With vessel owner",
    className: "bg-orange-100 text-orange-700",
  },
  APPROVED: { label: "Approved", className: "bg-green-100 text-green-700" },
};

const EMPTY_MESSAGE: Record<ReadinessFormStatus | "ALL", string> = {
  DRAFT: "No draft forms",
  SUBMITTED: "No forms awaiting your review",
  NEEDS_CLARIFICATION: "No forms currently with the vessel owner",
  APPROVED: "No approved forms yet",
  ALL: "No readiness forms yet",
};

const FILTERS: (ReadinessFormStatus | "ALL")[] = [
  "SUBMITTED",
  "NEEDS_CLARIFICATION",
  "APPROVED",
  "ALL",
];

function daysSince(dateStr: string): number {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export default function ReadinessQueue() {
  const navigate = useNavigate();
  const { canAccess } = useAuth();

  const [forms, setForms] = useState<ReadinessQueueRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReadinessFormStatus | "ALL">(
    "SUBMITTED",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchForms = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("vessel_readiness_forms")
        .select(
          `
          id,
          project_id,
          status,
          created_at,
          updated_at,
          project:project_id ( id, project_name ),
          vessel:vessel_id ( id, name, type, company )
        `,
        )
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });

      if (fetchError) throw fetchError;
      setForms((data as any) || []);
    } catch (err) {
      console.error("Error fetching readiness queue:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load readiness forms",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canAccess("readinessQueue")) {
      navigate("/");
    }
  }, [canAccess, navigate]);

  useEffect(() => {
    fetchForms();
  }, [fetchForms]);

  const filteredForms = forms.filter(
    (f) => statusFilter === "ALL" || f.status === statusFilter,
  );

  const pendingCount = forms.filter((f) => f.status === "SUBMITTED").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading readiness forms...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="w-7 h-7 text-blue-600" /> Readiness
            Review Queue
          </h1>
          <p className="text-gray-600 mt-1">
            FM-OPS-04-11 readiness forms across every project, sorted by most
            recently updated.
          </p>
        </div>
        <button
          onClick={fetchForms}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <div className="flex gap-2">
        {FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {s === "ALL" ? "All" : STATUS_BADGE[s].label}
            {s === "SUBMITTED" && pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow">
        {filteredForms.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {filteredForms.map((form) => {
              const badge = STATUS_BADGE[form.status];

              return (
                <div
                  key={form.id}
                  onClick={() => navigate(`/projects/${form.project_id}/readiness`)}
                  className="p-6 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <FolderKanban className="w-4 h-4 text-blue-600" />
                        <span className="font-medium text-gray-900">
                          {form.project?.project_name || "Unknown project"}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 flex items-center gap-1">
                        <Ship className="w-3.5 h-3.5" /> {form.vessel?.name} —{" "}
                        {form.vessel?.type} ({form.vessel?.company})
                      </p>
                      <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {form.status === "SUBMITTED"
                          ? `Submitted ${daysSince(form.updated_at)}d ago`
                          : `Last updated ${daysSince(form.updated_at)}d ago`}
                      </p>
                    </div>
                    {form.status === "SUBMITTED" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/projects/${form.project_id}/readiness`);
                        }}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex-shrink-0"
                      >
                        Review
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <ClipboardCheck className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">{EMPTY_MESSAGE[statusFilter]}</p>
          </div>
        )}
      </div>
    </div>
  );
}
