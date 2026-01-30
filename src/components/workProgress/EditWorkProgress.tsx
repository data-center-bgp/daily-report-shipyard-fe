import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { uploadProgressEvidence } from "../../utils/progressEvidenceHandler";
import { useAuth } from "../../hooks/useAuth";
import { ActivityLogService } from "../../services/activityLogService";
import {
  ArrowLeft,
  FileText,
  Ship,
  Wrench,
  MapPin,
  BarChart3,
  Calendar,
  FileEdit,
  Image,
  Paperclip,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface WorkProgressData {
  id: number;
  progress_percentage: number;
  report_date: string;
  notes?: string;
  evidence_url?: string;
  storage_path?: string;
  work_details_id: number;
  user_id: number;
  work_details: {
    description: string;
    location?: {
      location: string;
    };
    work_order: {
      shipyard_wo_number: string;
      vessel: {
        name: string;
        type: string;
      };
    };
  };
}

interface KaproInfo {
  kapro_name: string;
}

export default function EditWorkProgress() {
  const navigate = useNavigate();
  const { progressId } = useParams<{ progressId: string }>();
  const { isReadOnly } = useAuth();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressData, setProgressData] = useState<WorkProgressData | null>(
    null,
  );

  const [kaproInfo, setKaproInfo] = useState<KaproInfo | null>(null);
  const [formData, setFormData] = useState({
    progress_percentage: "",
    report_date: "",
    notes: "",
    evidence_file: null as File | null,
    keep_existing_evidence: true,
  });

  const fetchProgressData = useCallback(async () => {
    if (!progressId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("work_progress")
        .select(
          `
        id,
        progress_percentage,
        report_date,
        notes,
        evidence_url,
        storage_path,
        work_details_id,
        user_id,
        work_details!inner (
          description,
          location:location_id (
            location
          ),
          work_order!inner (
            shipyard_wo_number,
            vessel!inner (
              name,
              type
            ),
            kapro:kapro_id (
              kapro_name
            )
          )
        )
      `,
        )
        .eq("id", progressId)
        .single();

      if (error) throw error;

      const workDetails = Array.isArray(data.work_details)
        ? data.work_details[0]
        : data.work_details;

      const workOrder = Array.isArray(workDetails.work_order)
        ? workDetails.work_order[0]
        : workDetails.work_order;

      const vessel = Array.isArray(workOrder.vessel)
        ? workOrder.vessel[0]
        : workOrder.vessel;

      const location = workDetails.location
        ? Array.isArray(workDetails.location)
          ? workDetails.location[0]
          : workDetails.location
        : undefined;

      const kapro = workOrder.kapro
        ? Array.isArray(workOrder.kapro)
          ? workOrder.kapro[0]
          : workOrder.kapro
        : null;

      if (kapro) {
        setKaproInfo({
          kapro_name: kapro.kapro_name,
        });
      }

      const transformedData: WorkProgressData = {
        id: data.id,
        progress_percentage: data.progress_percentage,
        report_date: data.report_date,
        notes: data.notes,
        evidence_url: data.evidence_url,
        storage_path: data.storage_path,
        work_details_id: data.work_details_id,
        user_id: data.user_id,
        work_details: {
          description: workDetails.description,
          location: location,
          work_order: {
            shipyard_wo_number: workOrder.shipyard_wo_number,
            vessel: vessel,
          },
        },
      };

      setProgressData(transformedData);
      setFormData({
        progress_percentage: transformedData.progress_percentage
          .toString()
          .replace(".", ","),
        report_date: transformedData.report_date,
        notes: transformedData.notes || "",
        evidence_file: null,
        keep_existing_evidence: true,
      });
    } catch (err) {
      console.error("Error fetching progress data:", err);
      setError("Failed to load progress data");
    } finally {
      setLoading(false);
    }
  }, [progressId]);

  // Also update the useEffect to add logging:
  useEffect(() => {
    if (isReadOnly) {
      navigate("/work-progress");
      return;
    }

    if (progressId) {
      fetchProgressData();
    } else {
      setLoading(false);
    }
  }, [progressId, isReadOnly, navigate, fetchProgressData]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;

    if (name === "progress_percentage") {
      const formattedValue = value.replace(/\./g, ",");
      const numericValue = formattedValue.replace(/[^0-9,]/g, "");

      const commaCount = (numericValue.match(/,/g) || []).length;
      if (commaCount > 1) return;

      const parsedValue =
        numericValue === "" ? 0 : parseFloat(numericValue.replace(",", "."));
      if (
        numericValue === "" ||
        (!isNaN(parsedValue) && parsedValue >= 0 && parsedValue <= 100)
      ) {
        setFormData((prev) => ({ ...prev, progress_percentage: numericValue }));
      }
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = e.target;
    if (files && files[0]) {
      setFormData((prev) => ({
        ...prev,
        evidence_file: files[0],
        keep_existing_evidence: false,
      }));
    }
  };

  const handleRemoveNewEvidence = () => {
    setFormData((prev) => ({
      ...prev,
      evidence_file: null,
      keep_existing_evidence: true,
    }));
  };

  const handleRemoveExistingEvidence = () => {
    setFormData((prev) => ({
      ...prev,
      keep_existing_evidence: false,
    }));
  };

  const handleProgressFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!progressData) return;

    const progressValue = formData.progress_percentage
      ? parseFloat(formData.progress_percentage.replace(",", ".")) || 0
      : 0;

    if (
      formData.progress_percentage === "" ||
      isNaN(progressValue) ||
      progressValue < 0 ||
      progressValue > 100
    ) {
      setError("Please enter a valid progress percentage between 0 and 100");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let evidenceUrl = progressData.evidence_url || "";
      let storagePath = progressData.storage_path || "";

      if (formData.evidence_file) {
        const uploadResult = await uploadProgressEvidence({
          file: formData.evidence_file,
          workDetailsId: progressData.work_details_id,
          reportDate: formData.report_date,
        });

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || "Failed to upload evidence");
        }

        evidenceUrl = uploadResult.publicUrl || "";
        storagePath = uploadResult.storagePath || "";

        if (progressData.storage_path) {
          try {
            await supabase.storage
              .from("work-progress-evidence")
              .remove([progressData.storage_path]);
          } catch (deleteErr) {
            console.error("Error deleting old evidence:", deleteErr);
          }
        }
      } else if (!formData.keep_existing_evidence) {
        if (progressData.storage_path) {
          try {
            await supabase.storage
              .from("work-progress-evidence")
              .remove([progressData.storage_path]);
          } catch (deleteErr) {
            console.error("Error deleting evidence:", deleteErr);
          }
        }
        evidenceUrl = "";
        storagePath = "";
      }

      const { data: updatedData, error: updateError } = await supabase
        .from("work_progress")
        .update({
          progress_percentage: progressValue,
          report_date: formData.report_date,
          notes: formData.notes.trim() || null,
          evidence_url: evidenceUrl || null,
          storage_path: storagePath || null,
        })
        .eq("id", progressData.id)
        .select()
        .single();

      if (updateError) {
        console.error("Update error:", updateError);
        throw new Error(
          `Failed to update progress report: ${updateError.message}`,
        );
      }

      // Log the activity
      if (updatedData) {
        await ActivityLogService.logActivity({
          action: "update",
          tableName: "work_progress",
          recordId: updatedData.id,
          oldData: progressData || undefined,
          newData: updatedData,
          description: `Updated work progress report (${progressValue}%) for work details ID ${progressData.work_details_id}`,
        });
      }

      const returnFilters = location.state?.returnFilters;

      if (returnFilters) {
        navigate("/work-progress", {
          state: { returnFilters },
        });
      } else {
        navigate("/work-progress");
      }
    } catch (err) {
      console.error("Error updating work progress:", err);
      setError(
        err instanceof Error ? err.message : "Failed to update progress report",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading progress data...</span>
      </div>
    );
  }

  if (!progressData) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Progress Not Found</h3>
          <p className="text-red-600 mt-1">
            The requested progress report could not be found.
          </p>
          <button
            onClick={() => navigate("/work-progress")}
            className="mt-3 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
          >
            Back to Work Progress
          </button>
        </div>
      </div>
    );
  }

  const progressValue = formData.progress_percentage
    ? parseFloat(formData.progress_percentage.replace(",", ".")) || 0
    : 0;

  const isFormValid =
    formData.report_date &&
    formData.progress_percentage !== "" &&
    !isNaN(progressValue) &&
    progressValue >= 0 &&
    progressValue <= 100;

  return (
    <div className="p-8">
      <div className="mb-6">
        <button
          onClick={() => {
            const returnFilters = location.state?.returnFilters;
            if (returnFilters) {
              navigate("/work-progress", { state: { returnFilters } });
            } else {
              navigate("/work-progress");
            }
          }}
          className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Work Progress
        </button>
        <h1 className="text-3xl font-bold text-gray-900">
          Edit Progress Report
        </h1>
        <p className="text-gray-600">Update the progress report details</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error</h3>
          <p className="text-red-600 mt-1">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Info Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sticky top-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" /> Work Details
            </h3>

            <div className="space-y-3 text-sm">
              {kaproInfo && (
                <div>
                  <span className="text-gray-500 flex items-center gap-1">
                    <FileText className="w-4 h-4" /> Kapro:
                  </span>
                  <div className="font-medium mt-1">{kaproInfo.kapro_name}</div>
                </div>
              )}
              <div>
                <span className="text-gray-500 flex items-center gap-1">
                  <Ship className="w-4 h-4" /> Vessel:
                </span>
                <div className="font-medium mt-1">
                  {progressData.work_details.work_order.vessel.name}
                </div>
                <div className="text-xs text-gray-500">
                  {progressData.work_details.work_order.vessel.type}
                </div>
              </div>

              <div>
                <span className="text-gray-500 flex items-center gap-1">
                  <FileText className="w-4 h-4" /> Work Order:
                </span>
                <div className="font-medium mt-1">
                  {progressData.work_details.work_order.shipyard_wo_number}
                </div>
              </div>

              <div>
                <span className="text-gray-500 flex items-center gap-1">
                  <Wrench className="w-4 h-4" /> Description:
                </span>
                <div className="font-medium mt-1">
                  {progressData.work_details.description}
                </div>
              </div>

              {progressData.work_details.location && (
                <div>
                  <span className="text-gray-500 flex items-center gap-1">
                    <MapPin className="w-4 h-4" /> Location:
                  </span>
                  <div className="font-medium mt-1">
                    {progressData.work_details.location.location}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" /> Progress Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Progress Percentage */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <BarChart3 className="w-4 h-4" /> Progress Percentage *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="progress_percentage"
                      value={formData.progress_percentage}
                      onChange={handleInputChange}
                      onFocus={handleProgressFocus}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
                      placeholder="Enter percentage (e.g., 10,5 or 100)"
                    />
                    <span className="absolute right-3 top-2 text-gray-500 text-sm">
                      %
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Enter a value between 0 and 100 (use comma for decimals)
                  </p>
                  {formData.progress_percentage !== "" && (
                    <div className="mt-1">
                      {progressValue >= 0 && progressValue <= 100 ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Valid percentage
                        </span>
                      ) : (
                        <span className="text-xs text-red-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Must be between
                          0-100
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Report Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <Calendar className="w-4 h-4" /> Report Date *
                  </label>
                  <input
                    type="date"
                    name="report_date"
                    value={formData.report_date}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Progress Bar Preview */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Progress Preview
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(Math.max(progressValue, 0), 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700 min-w-[3rem]">
                    {formData.progress_percentage || "0"}%
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <FileEdit className="w-4 h-4" /> Notes (Optional)
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Add any additional notes or comments..."
                />
              </div>
            </div>

            {/* Evidence Upload */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <Image className="w-5 h-5" /> Progress Evidence
              </h3>

              {/* Existing Evidence */}
              {progressData.storage_path && formData.keep_existing_evidence && (
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-blue-600" />
                      <span className="text-sm text-blue-800 font-medium">
                        Current Evidence Attached
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveExistingEvidence}
                      className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1"
                    >
                      <X className="w-4 h-4" /> Remove
                    </button>
                  </div>
                </div>
              )}

              {/* New Evidence Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {progressData.storage_path && formData.keep_existing_evidence
                    ? "Replace Evidence Photo"
                    : "Evidence Photo"}
                </label>
                <input
                  type="file"
                  name="evidence_file"
                  onChange={handleFileChange}
                  accept="image/*"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload an image to document the progress (max 10MB)
                </p>
              </div>

              {formData.evidence_file && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-green-600" />
                      <span className="text-sm text-green-800 font-medium">
                        {formData.evidence_file.name}
                      </span>
                      <span className="text-xs text-green-600">
                        (
                        {(formData.evidence_file.size / 1024 / 1024).toFixed(2)}{" "}
                        MB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveNewEvidence}
                      className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1"
                    >
                      <X className="w-4 h-4" /> Remove
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  const returnFilters = location.state?.returnFilters;
                  if (returnFilters) {
                    navigate("/work-progress", { state: { returnFilters } });
                  } else {
                    navigate("/work-progress");
                  }
                }}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={submitting}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={!isFormValid || submitting}
                className="px-8 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Updating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Update Progress Report
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
