import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  supabase,
  type WorkDetails,
  type WorkOrder,
  type Vessel,
} from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { ActivityLogService } from "../../services/activityLogService";
import {
  getLatestVerificationByWorkDetails,
  isApproved,
  isOpenForRework,
  type VerificationRecord,
} from "../../utils/workVerificationStatus";
import { getLatestProgressRecord } from "../../utils/progressPercentage";
import {
  ArrowLeft,
  Wrench,
  MapPin,
  User,
  Clock,
  Ship,
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  History,
  Undo2,
  Lock,
  Ban,
} from "lucide-react";

interface WorkDetailsWithProgress extends WorkDetails {
  current_progress?: number;
  has_progress_data?: boolean;
  latest_progress_date?: string;
  latest_progress_created_at?: string;
  work_order?: WorkOrder & {
    vessel?: Vessel;
    customer_wo_date?: string;
  };
  location?: {
    id: number;
    location: string;
  };
  work_location: string;
  work_progress?: WorkProgressItem[];
}

interface WorkProgressItem {
  id: number;
  progress_percentage: number;
  report_date: string;
  created_at: string;
  evidence_url?: string | null;
  storage_path?: string | null;
  profiles?: {
    id: number;
    name: string;
    email: string;
  };
}

export default function VerifyWorkDetails() {
  const navigate = useNavigate();
  const { workDetailsId } = useParams<{ workDetailsId: string }>();
  const { canAccess, isReadOnly } = useAuth();
  const canReview = canAccess("verification") && !isReadOnly;

  const [workDetails, setWorkDetails] =
    useState<WorkDetailsWithProgress | null>(null);
  const [reviewHistory, setReviewHistory] = useState<VerificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedReason, setBlockedReason] = useState<
    "approved" | "awaitingRework" | "cancelled" | null
  >(null);
  const [verificationDate, setVerificationDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [verificationNotes, setVerificationNotes] = useState("");
  const [expandedSections, setExpandedSections] = useState({
    progress: false,
    history: false,
  });

  const fetchWorkDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setBlockedReason(null);

      if (!workDetailsId) {
        throw new Error("Work Details ID is required");
      }

      const { data: workDetailsData, error: wdError } = await supabase
        .from("work_details")
        .select(
          `
    *,
    work_order (
      id,
      shipyard_wo_number,
      customer_wo_number,
      shipyard_wo_date,
      customer_wo_date,
      vessel (
        id,
        name,
        type,
        company
      )
    ),
    location:location_id (
      id,
      location
    ),
    work_progress (
      id,
      progress_percentage,
      report_date,
      created_at,
      evidence_url,
      storage_path,
      profiles (
        id,
        name,
        email
      )
    )
  `,
        )
        .eq("id", parseInt(workDetailsId))
        .single();

      if (wdError) throw wdError;
      if (!workDetailsData) {
        throw new Error("Work details not found");
      }

      if (workDetailsData.cancelled_at) {
        setBlockedReason("cancelled");
        setWorkDetails({
          ...workDetailsData,
          current_progress: 0,
        });
        setLoading(false);
        return;
      }

      const progressRecords: WorkProgressItem[] =
        workDetailsData.work_progress || [];
      let current_progress = 0;
      let latest_progress_date: string | undefined;
      let latest_progress_created_at: string | undefined;

      if (progressRecords.length > 0) {
        const latestRecord = getLatestProgressRecord(progressRecords);
        current_progress = latestRecord?.progress_percentage || 0;
        latest_progress_date = latestRecord?.report_date;
        latest_progress_created_at = progressRecords.reduce(
          (latest: string | undefined, p) =>
            !latest ||
            new Date(p.created_at).getTime() > new Date(latest).getTime()
              ? p.created_at
              : latest,
          undefined,
        );
      }

      if (current_progress !== 100) {
        throw new Error(
          "Work details is not completed yet (must be 100% progress)",
        );
      }

      // Full review history for this work detail, newest first.
      const { data: historyData, error: historyError } = await supabase
        .from("work_verification")
        .select(
          "id, work_details_id, status, verification_date, verification_notes, created_at, profiles(id, name, email)",
        )
        .eq("work_details_id", parseInt(workDetailsId))
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (historyError) throw historyError;

      const history = (historyData as unknown as VerificationRecord[]) || [];
      setReviewHistory(history);

      const latestMap = getLatestVerificationByWorkDetails(history);
      const latest = latestMap.get(parseInt(workDetailsId));

      if (isOpenForRework(latest, latest_progress_created_at)) {
        setBlockedReason("awaitingRework");
      } else if (isApproved(latest)) {
        setBlockedReason("approved");
      }

      setWorkDetails({
        ...workDetailsData,
        current_progress,
        latest_progress_date,
        latest_progress_created_at,
      });
    } catch (err) {
      console.error("Error fetching work details:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load work details",
      );
    } finally {
      setLoading(false);
    }
  }, [workDetailsId]);

  useEffect(() => {
    if (workDetailsId) {
      fetchWorkDetails();
    }
  }, [workDetailsId, fetchWorkDetails]);

  const handleSubmitReview = async (status: "APPROVED" | "REJECTED") => {
    if (!workDetails || !verificationDate) {
      setError("Please select a review date");
      return;
    }

    if (status === "REJECTED" && !verificationNotes.trim()) {
      setError("Please explain why this work is being sent back for rework");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // Guard against a concurrent review landing while this page was open.
      const { data: raceCheck, error: raceError } = await supabase
        .from("work_verification")
        .select("id, created_at")
        .eq("work_details_id", workDetails.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1);

      if (raceError) throw raceError;

      const currentLatestId = reviewHistory[0]?.id;
      if (
        raceCheck &&
        raceCheck.length > 0 &&
        raceCheck[0].id !== currentLatestId
      ) {
        throw new Error(
          "This work detail was just reviewed by someone else. Please go back and refresh.",
        );
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error("User not authenticated");
      }

      const { data: userProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id, name")
        .eq("auth_user_id", user.id)
        .single();

      if (profileError || !userProfile) {
        console.error("Error fetching user profile:", profileError);
        throw new Error("Failed to fetch user profile");
      }

      const { data: verificationData, error: insertError } = await supabase
        .from("work_verification")
        .insert({
          verification_date: verificationDate,
          work_details_id: workDetails.id,
          user_id: userProfile.id,
          verification_notes: verificationNotes.trim() || null,
          status,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (verificationData) {
        await ActivityLogService.logActivity({
          action: "create",
          tableName: "work_verification",
          recordId: verificationData.id,
          newData: verificationData,
          description: `${status === "APPROVED" ? "Approved" : "Sent back for rework"}: ${workDetails.description.substring(0, 50)}${workDetails.description.length > 50 ? "..." : ""}`,
        });
      }

      const outcomeLine =
        status === "APPROVED"
          ? "✅ Work approved and ready for BASTP!"
          : "↩️ Work sent back to the shipyard for rework.";

      navigate("/work-verification", {
        state: {
          successMessage: `${outcomeLine}\n\nWork: "${workDetails.description.substring(
            0,
            50,
          )}${
            workDetails.description.length > 50 ? "..." : ""
          }"\nReviewed by: ${userProfile.name}\nReview Date: ${new Date(
            verificationDate,
          ).toLocaleDateString()}\nWork Order: ${
            workDetails.work_order?.shipyard_wo_number || "N/A"
          }\nVessel: ${workDetails.work_order?.vessel?.name || "N/A"}${
            verificationNotes.trim()
              ? `\nNotes: ${verificationNotes.substring(0, 100)}${
                  verificationNotes.length > 100 ? "..." : ""
                }`
              : ""
          }`,
        },
      });
    } catch (err) {
      console.error("Error recording work verification:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to record work verification",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 font-medium">
            Loading work details...
          </p>
        </div>
      </div>
    );
  }

  if (error && !workDetails) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-pink-50 to-rose-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-red-200 p-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">
              Cannot Review Work Details
            </h2>
            <p className="text-slate-600 text-sm mb-6 whitespace-pre-line">
              {error}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => navigate("/work-verification")}
                className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 text-sm font-medium shadow-md"
              >
                ← Back
              </button>
              <button
                onClick={fetchWorkDetails}
                className="flex-1 bg-gradient-to-r from-slate-500 to-slate-600 text-white px-4 py-2 rounded-lg hover:from-slate-600 hover:to-slate-700 transition-all duration-200 text-sm font-medium shadow-md"
              >
                🔄 Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!workDetails) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="text-center">
          <span className="text-slate-400 text-4xl mb-4 block">📋</span>
          <p className="text-slate-500 text-lg mb-4">Work details not found</p>
          <button
            onClick={() => navigate("/work-verification")}
            className="text-blue-600 hover:text-blue-800 transition-colors font-medium"
          >
            ← Back to Verification List
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Compact Header */}
      <div className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate("/work-verification")}
                className="text-slate-400 hover:text-slate-600 transition-colors p-2 rounded-lg hover:bg-slate-100"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-semibold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                  Work Verification
                </h1>
                <p className="text-xs text-slate-500">
                  Approve or send back for rework
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-700 px-3 py-1 rounded-full text-sm border border-emerald-200 shadow-sm">
                <div className="w-2 h-2 bg-gradient-to-r from-emerald-400 to-green-500 rounded-full animate-pulse"></div>
                <span className="font-medium">100% Complete</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-4 bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 rounded-lg p-3 shadow-sm">
            <div className="flex items-center text-sm">
              <span className="text-red-600 mr-2">⚠️</span>
              <p className="text-red-700 font-medium">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content - 2/3 */}
          <div className="lg:col-span-2 space-y-4">
            {/* Work Order info */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200/50 overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-blue-50">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <FileText className="w-5 h-5" /> Work Order
                </h3>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Shipyard WO Number
                  </label>
                  <p className="mt-1 text-sm text-slate-700">
                    {workDetails.work_order?.shipyard_wo_number || "-"}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Customer WO Number
                  </label>
                  <p className="mt-1 text-sm text-slate-700">
                    {workDetails.work_order?.customer_wo_number || "-"}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Vessel
                  </label>
                  <p className="mt-1 text-sm text-slate-700 flex items-center gap-1">
                    <Ship className="w-4 h-4" />{" "}
                    {workDetails.work_order?.vessel?.name || "-"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {workDetails.work_order?.vessel?.type || "-"} •{" "}
                    {workDetails.work_order?.vessel?.company || "-"}
                  </p>
                </div>
              </div>
            </div>

            {/* Work Details */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200/50 overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Wrench className="w-5 h-5" /> Work Details
                </h3>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Description
                  </label>
                  <p className="mt-1 text-sm text-slate-700 leading-relaxed">
                    {workDetails.description}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Location
                    </label>
                    <p className="mt-1 text-sm text-slate-700 bg-gradient-to-r from-slate-50 to-slate-100 p-2 rounded-lg border flex items-center gap-1">
                      <MapPin className="w-4 h-4" />{" "}
                      {workDetails.location?.location || "-"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Work Location
                    </label>
                    <div className="mt-1 text-sm text-gray-900">
                      {workDetails.work_location || "N/A"}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      PIC
                    </label>
                    <p className="mt-1 text-sm text-slate-700 bg-gradient-to-r from-slate-50 to-slate-100 p-2 rounded-lg border flex items-center gap-1">
                      <User className="w-4 h-4" /> {workDetails.pic}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Target Period
                    </label>
                    <p className="mt-1 text-sm text-slate-700 bg-gradient-to-r from-slate-50 to-slate-100 p-2 rounded-lg border flex items-center gap-1">
                      <Clock className="w-4 h-4" />{" "}
                      {workDetails.period_close_target}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Review History */}
            {reviewHistory.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200/50 overflow-hidden">
                <button
                  onClick={() => toggleSection("history")}
                  className="w-full p-4 text-left border-b border-slate-100 hover:bg-gradient-to-r hover:from-amber-50 hover:to-orange-50 transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                      <History className="w-5 h-5" /> Review History
                      <span className="bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 px-2 py-1 rounded-full text-xs font-semibold border border-amber-200">
                        {reviewHistory.length}
                      </span>
                    </h3>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${
                        expandedSections.history ? "rotate-180" : "rotate-0"
                      }`}
                    />
                  </div>
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    expandedSections.history
                      ? "max-h-[600px] opacity-100"
                      : "max-h-0 opacity-0"
                  }`}
                >
                  <div className="p-4 space-y-3 bg-gradient-to-r from-amber-50/30 to-orange-50/30">
                    {reviewHistory.map((review) => (
                      <div
                        key={review.id}
                        className="p-3 bg-white rounded-lg shadow-sm border border-slate-200/50"
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                              review.status === "APPROVED"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {review.status === "APPROVED" ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <Undo2 className="w-3 h-3" />
                            )}
                            {review.status === "APPROVED"
                              ? "Approved"
                              : "Sent back for rework"}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatDate(review.verification_date)} by{" "}
                            {review.profiles?.name || "Unknown"}
                          </span>
                        </div>
                        {review.verification_notes && (
                          <p className="text-sm text-slate-600 mt-2">
                            {review.verification_notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Progress History */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200/50 overflow-hidden">
              <button
                onClick={() => toggleSection("progress")}
                className="w-full p-4 text-left border-b border-slate-100 hover:bg-gradient-to-r hover:from-blue-50 hover:to-cyan-50 transition-all duration-200"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" /> Progress History
                    <span className="bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 px-2 py-1 rounded-full text-xs font-semibold border border-blue-200">
                      {workDetails.work_progress?.length || 0}
                    </span>
                  </h3>
                  <div className="flex items-center justify-center w-6 h-6">
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${
                        expandedSections.progress ? "rotate-180" : "rotate-0"
                      }`}
                    />
                  </div>
                </div>
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  expandedSections.progress
                    ? "max-h-[800px] opacity-100 overflow-y-auto"
                    : "max-h-0 opacity-0"
                }`}
              >
                <div className="p-4 bg-gradient-to-r from-blue-50/30 to-cyan-50/30">
                  {workDetails.work_progress &&
                  workDetails.work_progress.length > 0 ? (
                    <div className="space-y-3">
                      {[...workDetails.work_progress]
                        .sort(
                          (a, b) =>
                            new Date(b.report_date).getTime() -
                            new Date(a.report_date).getTime(),
                        )
                        .map((progress, index) => (
                          <div
                            key={progress.id}
                            className="p-3 bg-white rounded-lg shadow-sm border border-slate-200/50"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div
                                  className={`w-12 h-8 rounded-md flex items-center justify-center text-xs font-bold shadow-sm ${
                                    progress.progress_percentage === 100
                                      ? "bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-800 border border-emerald-200"
                                      : progress.progress_percentage >= 75
                                        ? "bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-800 border border-blue-200"
                                        : progress.progress_percentage >= 50
                                          ? "bg-gradient-to-r from-yellow-100 to-amber-100 text-yellow-800 border border-yellow-200"
                                          : "bg-gradient-to-r from-slate-100 to-gray-100 text-slate-700 border border-slate-200"
                                  }`}
                                >
                                  {progress.progress_percentage}%
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">
                                    {formatDate(progress.report_date)}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    by {progress.profiles?.name || "Unknown"}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-slate-500">
                                  {formatDateTime(progress.created_at)}
                                </p>
                                {index === 0 && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-800 mt-1 border border-emerald-200 font-medium">
                                    Latest
                                  </span>
                                )}
                              </div>
                            </div>
                            {progress.evidence_url && (
                              <a
                                href={progress.evidence_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800"
                              >
                                <img
                                  src={progress.evidence_url}
                                  alt="Progress evidence"
                                  className="w-16 h-16 object-cover rounded-md border border-slate-200"
                                />
                                <span className="flex items-center gap-1">
                                  <ImageIcon className="w-3.5 h-3.5" /> View
                                  full photo
                                </span>
                              </a>
                            )}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-4">
                      No progress records found
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar - 1/3 */}
          <div className="lg:col-span-1">
            {blockedReason === "cancelled" ? (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200/50 sticky top-24 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-gray-50">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <Ban className="w-5 h-5 text-slate-500" /> Cancelled
                  </h3>
                </div>
                <div className="p-4 text-sm text-slate-600 space-y-3">
                  <p>
                    This work detail was cancelled by PPIC and no longer
                    needs review.
                  </p>
                  <button
                    onClick={() => navigate("/work-verification")}
                    className="w-full px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-all duration-200 text-sm font-medium"
                  >
                    Back to Verification List
                  </button>
                </div>
              </div>
            ) : blockedReason === "approved" ? (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200/50 sticky top-24 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-green-50 to-emerald-50">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" /> Already
                    Approved
                  </h3>
                </div>
                <div className="p-4 text-sm text-slate-600 space-y-3">
                  <p>
                    This work detail has already been approved and is ready
                    for BASTP. No further action is needed here.
                  </p>
                  <button
                    onClick={() => navigate("/work-verification")}
                    className="w-full px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-all duration-200 text-sm font-medium"
                  >
                    Back to Verification List
                  </button>
                </div>
              </div>
            ) : blockedReason === "awaitingRework" ? (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200/50 sticky top-24 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <Lock className="w-5 h-5 text-amber-600" /> Awaiting Rework
                  </h3>
                </div>
                <div className="p-4 text-sm text-slate-600 space-y-3">
                  <p>
                    This item was sent back to the shipyard for rework and
                    hasn't been resubmitted yet. It'll return to the review
                    queue automatically once a new progress report is logged.
                  </p>
                  <button
                    onClick={() => navigate("/work-verification")}
                    className="w-full px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-all duration-200 text-sm font-medium"
                  >
                    Back to Verification List
                  </button>
                </div>
              </div>
            ) : !canReview ? (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200/50 sticky top-24 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-gray-50">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <Lock className="w-5 h-5 text-slate-500" /> View Only
                  </h3>
                </div>
                <div className="p-4 text-sm text-slate-600 space-y-3">
                  <p>You don't have permission to review work details.</p>
                  <button
                    onClick={() => navigate("/work-verification")}
                    className="w-full px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-all duration-200 text-sm font-medium"
                  >
                    Back to Verification List
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200/50 sticky top-24 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-green-50">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" /> Record Review
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 font-medium">
                    Approve if the work is acceptable, or send it back if it
                    needs more work
                  </p>
                </div>

                <div className="p-4 space-y-4">
                  <div>
                    <label
                      htmlFor="verification-date"
                      className="block text-sm font-semibold text-slate-700 mb-2"
                    >
                      Review Date *
                    </label>
                    <input
                      type="date"
                      id="verification-date"
                      value={verificationDate}
                      onChange={(e) => setVerificationDate(e.target.value)}
                      max={new Date().toISOString().split("T")[0]}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-sm bg-white"
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="verification-notes"
                      className="block text-sm font-semibold text-slate-700 mb-2"
                    >
                      Notes
                      <span className="text-slate-400 font-normal ml-1">
                        (required if sending back)
                      </span>
                    </label>
                    <textarea
                      id="verification-notes"
                      value={verificationNotes}
                      onChange={(e) => setVerificationNotes(e.target.value)}
                      rows={4}
                      maxLength={500}
                      placeholder="If sending back, explain what needs to be fixed. Otherwise, add any observations..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm shadow-sm bg-white resize-none"
                    />
                    <div className="flex items-center justify-end mt-1">
                      <p className="text-xs text-slate-400">
                        {verificationNotes.length}/500
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <button
                      onClick={() => handleSubmitReview("APPROVED")}
                      disabled={submitting || !verificationDate}
                      className="w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white px-4 py-3 rounded-lg hover:from-emerald-600 hover:to-green-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-semibold shadow-lg"
                    >
                      {submitting ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Recording...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" /> Approve
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleSubmitReview("REJECTED")}
                      disabled={submitting || !verificationDate}
                      className="w-full bg-gradient-to-r from-red-500 to-rose-600 text-white px-4 py-3 rounded-lg hover:from-red-600 hover:to-rose-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-semibold shadow-lg"
                    >
                      <XCircle className="w-4 h-4" /> Send Back for Rework
                    </button>

                    <button
                      onClick={() => navigate("/work-verification")}
                      disabled={submitting}
                      className="w-full px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-gradient-to-r hover:from-slate-50 hover:to-gray-50 transition-all duration-200 disabled:opacity-50 text-sm font-medium shadow-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
