import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProgress } from "../../hooks/useProgress";
import { supabase, type WorkOrder } from "../../lib/supabase";
import ProgressChart from "./ProgressChart";
import type { ProgressWithDetails } from "../../types/progress";

export default function ProgressDetails() {
  const { workOrderId } = useParams<{ workOrderId: string }>();
  const navigate = useNavigate();
  const { progress, fetchProgress, deleteProgress, loading } = useProgress();

  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [workOrderProgress, setWorkOrderProgress] = useState<
    ProgressWithDetails[]
  >([]);
  const [loadingWorkOrder, setLoadingWorkOrder] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (workOrderId) {
      fetchWorkOrderDetails();
      fetchProgressData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrderId]);

  useEffect(() => {
    // Filter progress for this work order
    if (workOrderId) {
      const filtered = progress.filter(
        (p) => p.work_order_id === parseInt(workOrderId)
      );
      setWorkOrderProgress(filtered);
    }
  }, [progress, workOrderId]);

  const fetchWorkOrderDetails = async () => {
    try {
      setLoadingWorkOrder(true);
      const { data, error } = await supabase
        .from("work_order")
        .select(
          `
          *,
          vessel:vessel_id (
            name,
            type,
            company
          ),
          permit_to_work (
            id,
            is_uploaded,
            created_at
          )
        `
        )
        .eq("id", workOrderId!)
        .single();

      if (error) throw error;
      setWorkOrder(data);
    } catch (err) {
      console.error("Error fetching work order:", err);
      setError("Failed to load work order details");
    } finally {
      setLoadingWorkOrder(false);
    }
  };

  const fetchProgressData = async () => {
    await fetchProgress({ work_order_id: parseInt(workOrderId!) });
  };

  const handleDeleteProgress = async (progressId: number) => {
    if (!confirm("Are you sure you want to delete this progress entry?")) {
      return;
    }

    setDeletingId(progressId);
    try {
      await deleteProgress(progressId);
    } catch {
      setError("Failed to delete progress entry");
    } finally {
      setDeletingId(null);
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return "text-green-600 bg-green-100";
    if (progress >= 75) return "text-blue-600 bg-blue-100";
    if (progress >= 50) return "text-yellow-600 bg-yellow-100";
    if (progress >= 25) return "text-orange-600 bg-orange-100";
    return "text-red-600 bg-red-100";
  };

  const currentProgress =
    workOrderProgress.length > 0 ? workOrderProgress[0].progress : 0;

  const progressChange =
    workOrderProgress.length > 1
      ? workOrderProgress[0].progress - workOrderProgress[1].progress
      : 0;

  if (loadingWorkOrder || loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading details...</span>
        </div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Work Order Not Found
          </h2>
          <button
            onClick={() => navigate("/progress")}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Progress Overview
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => navigate("/progress")}
                className="text-blue-600 hover:text-blue-800 mb-2 flex items-center gap-1"
              >
                ← Back to Progress Overview
              </button>
              <h1 className="text-3xl font-bold text-gray-900">
                Progress Details
              </h1>
              <p className="text-gray-600">
                {workOrder.customer_wo_number} • {workOrder.vessel?.name}
              </p>
            </div>
            <button
              onClick={() =>
                navigate(`/progress/tracker?work_order_id=${workOrderId}`)
              }
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              📝 Add Progress
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Work Order Info */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Work Order Info
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Customer WO
                  </label>
                  <p className="text-sm text-gray-900">
                    {workOrder.customer_wo_number}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Shipyard WO
                  </label>
                  <p className="text-sm text-gray-900">
                    {workOrder.shipyard_wo_number}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Vessel
                  </label>
                  <p className="text-sm text-gray-900">
                    {workOrder.vessel?.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {workOrder.vessel?.type} • {workOrder.vessel?.company}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Location
                  </label>
                  <p className="text-sm text-gray-900">
                    {workOrder.wo_location}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Permit Status
                  </label>
                  <p className="text-sm">
                    {workOrder.permit_to_work?.is_uploaded ? (
                      <span className="text-green-600">✅ Uploaded</span>
                    ) : (
                      <span className="text-red-600">❌ Not Uploaded</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Work Description Card */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Work Description
              </h2>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {workOrder.wo_description || "No description provided"}
                </p>
              </div>
            </div>

            {/* Current Progress Summary */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Current Status
              </h2>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      Progress
                    </span>
                    <span
                      className={`text-lg font-bold px-3 py-1 rounded-full ${getProgressColor(
                        currentProgress
                      )}`}
                    >
                      {currentProgress}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-300 ${
                        currentProgress >= 100
                          ? "bg-green-600"
                          : currentProgress >= 75
                          ? "bg-blue-600"
                          : currentProgress >= 50
                          ? "bg-yellow-600"
                          : currentProgress >= 25
                          ? "bg-orange-600"
                          : "bg-red-600"
                      }`}
                      style={{ width: `${Math.min(currentProgress, 100)}%` }}
                    ></div>
                  </div>
                </div>

                {progressChange !== 0 && (
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">
                      Recent change:
                    </span>
                    <span
                      className={`text-sm font-medium ${
                        progressChange > 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {progressChange > 0 ? "+" : ""}
                      {progressChange.toFixed(1)}%
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-gray-200">
                  <div className="text-sm text-gray-600">
                    <p>
                      <strong>Total Reports:</strong> {workOrderProgress.length}
                    </p>
                    {workOrderProgress.length > 0 && (
                      <p>
                        <strong>Last Updated:</strong>{" "}
                        {new Date(
                          workOrderProgress[0].report_date
                        ).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Chart and Progress History */}
          <div className="lg:col-span-2">
            {/* Progress Chart */}
            {workOrderId && (
              <div className="mb-6">
                <ProgressChart
                  workOrderId={parseInt(workOrderId)}
                  height={400}
                />
              </div>
            )}

            {/* Progress History Table */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  Progress History
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Progress
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Change
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Reported By
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {workOrderProgress.length > 0 ? (
                      workOrderProgress.map((item, index) => {
                        const previousProgress =
                          index < workOrderProgress.length - 1
                            ? workOrderProgress[index + 1].progress
                            : 0;
                        const change = item.progress - previousProgress;

                        return (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {new Date(item.report_date).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getProgressColor(
                                  item.progress
                                )}`}
                              >
                                {item.progress}%
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {index === workOrderProgress.length - 1 ? (
                                <span className="text-gray-400">Initial</span>
                              ) : (
                                <span
                                  className={`font-medium ${
                                    change > 0
                                      ? "text-green-600"
                                      : change < 0
                                      ? "text-red-600"
                                      : "text-gray-600"
                                  }`}
                                >
                                  {change > 0 ? "+" : ""}
                                  {change.toFixed(1)}%
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {item.user?.name || "Unknown"}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <button
                                onClick={() => handleDeleteProgress(item.id)}
                                disabled={deletingId === item.id}
                                className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                title="Delete Progress Entry"
                              >
                                {deletingId === item.id ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                                ) : (
                                  "🗑️ Delete"
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-12 text-center text-gray-500"
                        >
                          <div className="text-4xl mb-2">📊</div>
                          <p>No progress data recorded yet</p>
                          <button
                            onClick={() =>
                              navigate(
                                `/progress/tracker?work_order_id=${workOrderId}`
                              )
                            }
                            className="mt-2 text-blue-600 hover:text-blue-800 underline"
                          >
                            Add first progress entry
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
