import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { ActivityLogService } from "../../services/activityLogService";
import { useAuth } from "../../hooks/useAuth";
import type {
  AdditionalWoRequestStatus,
  AdditionalWoRequestWithDetails,
} from "../../types/additionalWoRequest.types";
import {
  ClipboardList,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Ship,
  FolderKanban,
  Clock,
} from "lucide-react";

const STATUS_BADGE: Record<
  AdditionalWoRequestStatus,
  { label: string; className: string }
> = {
  PENDING: { label: "Pending", className: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Approved", className: "bg-green-100 text-green-700" },
  REJECTED: { label: "Rejected", className: "bg-red-100 text-red-700" },
};

export default function AdditionalWoApprovals() {
  const navigate = useNavigate();
  const { isReadOnly, canAccess } = useAuth();

  const [requests, setRequests] = useState<AdditionalWoRequestWithDetails[]>(
    [],
  );
  const [statusFilter, setStatusFilter] = useState<
    AdditionalWoRequestStatus | "ALL"
  >("PENDING");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [submittingDecision, setSubmittingDecision] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("additional_wo_requests")
        .select(
          `
          *,
          project:project_id ( id, project_name ),
          vessel:vessel_id ( id, name, type, company ),
          requester:profiles!requested_by ( id, name, email ),
          decider:profiles!decided_by ( id, name, email )
        `,
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setRequests((data as any) || []);
    } catch (err) {
      console.error("Error fetching additional WO requests:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load requests",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canAccess("additionalWoApprovals")) {
      navigate("/");
    }
  }, [canAccess, navigate]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const filteredRequests = requests.filter(
    (r) => statusFilter === "ALL" || r.status === statusFilter,
  );

  const startDeciding = (id: number) => {
    setDecidingId(id);
    setDecisionNotes("");
  };

  const cancelDeciding = () => {
    setDecidingId(null);
    setDecisionNotes("");
  };

  const submitDecision = async (
    request: AdditionalWoRequestWithDetails,
    decision: "APPROVED" | "REJECTED",
  ) => {
    if (decision === "REJECTED" && !decisionNotes.trim()) {
      alert("Please explain why this request is being rejected.");
      return;
    }

    setSubmittingDecision(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      if (!profile) throw new Error("User profile not found");

      const updatePayload = {
        status: decision,
        decided_by: profile.id,
        decided_at: new Date().toISOString(),
        decision_notes: decisionNotes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from("additional_wo_requests")
        .update(updatePayload)
        .eq("id", request.id);
      if (updateError) throw updateError;

      await ActivityLogService.logActivity({
        action: "update",
        tableName: "additional_wo_requests",
        recordId: request.id,
        oldData: request,
        newData: { ...request, ...updatePayload },
        description: `${decision === "APPROVED" ? "Approved" : "Rejected"} additional WO request for project ${request.project?.project_name}`,
      });

      setDecidingId(null);
      setDecisionNotes("");
      await fetchRequests();
    } catch (err) {
      console.error("Error submitting decision:", err);
      alert(
        `Failed to save decision: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setSubmittingDecision(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading requests...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-7 h-7 text-blue-600" /> Additional Work
            Order Requests
          </h1>
          <p className="text-gray-600 mt-1">
            An additional work order can't be created until the Operation
            Head approves a request for it — unless it's a Chairman
            Directive, which is self-approved immediately and shown here for
            monitoring.
          </p>
        </div>
        <button
          onClick={fetchRequests}
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
        {(["PENDING", "APPROVED", "REJECTED", "ALL"] as const).map((s) => (
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
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow">
        {filteredRequests.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {filteredRequests.map((request) => {
              const badge = STATUS_BADGE[request.status];
              const isDeciding = decidingId === request.id;

              return (
                <div key={request.id} className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <FolderKanban className="w-4 h-4 text-blue-600" />
                        <span className="font-medium text-gray-900">
                          {request.project?.project_name || "Unknown project"}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        {request.is_chairman_directive && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                            Chairman Directive
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 flex items-center gap-1">
                        <Ship className="w-3.5 h-3.5" /> {request.vessel?.name}{" "}
                        — {request.vessel?.type} ({request.vessel?.company})
                      </p>
                      <p className="text-sm text-gray-500 mt-2">
                        Requested by{" "}
                        <span className="font-medium">
                          {request.requester?.name || "Unknown"}
                        </span>{" "}
                        on {new Date(request.created_at).toLocaleDateString()}
                      </p>
                      <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                          Reason
                        </p>
                        <p className="text-sm text-gray-800">
                          {request.reason}
                        </p>
                      </div>

                      {request.is_chairman_directive ? (
                        <p className="text-sm text-purple-700 mt-3 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Auto-approved as a Chairman Directive on{" "}
                          {new Date(request.created_at).toLocaleDateString()}{" "}
                          — no Operation Head review was performed.
                        </p>
                      ) : (
                        request.status !== "PENDING" && (
                          <p className="text-sm text-gray-500 mt-3 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {request.status === "APPROVED"
                              ? "Approved"
                              : "Rejected"}{" "}
                            by{" "}
                            <span className="font-medium">
                              {request.decider?.name || "Unknown"}
                            </span>{" "}
                            on{" "}
                            {request.decided_at
                              ? new Date(
                                  request.decided_at,
                                ).toLocaleDateString()
                              : ""}
                            {request.decision_notes && (
                              <span className="italic">
                                {" "}
                                — "{request.decision_notes}"
                              </span>
                            )}
                          </p>
                        )
                      )}

                      {request.status === "APPROVED" && (
                        <p className="text-sm mt-1">
                          {request.work_order_id ? (
                            <span className="text-gray-500">
                              Work order already created from this approval.
                            </span>
                          ) : (
                            <span className="text-green-700 font-medium">
                              Ready — the requester can now create this
                              additional work order.
                            </span>
                          )}
                        </p>
                      )}
                    </div>

                    {request.status === "PENDING" &&
                      !isReadOnly &&
                      !isDeciding && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => startDeciding(request.id)}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                          >
                            Review
                          </button>
                        </div>
                      )}
                  </div>

                  {isDeciding && (
                    <div className="mt-4 border-t pt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Decision notes{" "}
                        <span className="text-gray-500">
                          (required if rejecting)
                        </span>
                      </label>
                      <textarea
                        value={decisionNotes}
                        onChange={(e) => setDecisionNotes(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Optional notes for the requester..."
                      />
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => submitDecision(request, "APPROVED")}
                          disabled={submittingDecision}
                          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Approve
                        </button>
                        <button
                          onClick={() => submitDecision(request, "REJECTED")}
                          disabled={submittingDecision}
                          className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
                        >
                          <XCircle className="w-4 h-4" /> Reject
                        </button>
                        <button
                          onClick={cancelDeciding}
                          disabled={submittingDecision}
                          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <ClipboardList className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">
              No {statusFilter === "ALL" ? "" : statusFilter.toLowerCase()}{" "}
              requests
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
