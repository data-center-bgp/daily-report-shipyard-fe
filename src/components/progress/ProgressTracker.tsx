// src/components/progress/ProgressTracker.tsx

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useProgress } from "../../hooks/useProgress";
import { supabase, type WorkOrder } from "../../lib/supabase";
import type { ProgressFormData } from "../../types/progress";

export default function ProgressTracker() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedWorkOrderId = searchParams.get("work_order_id");

  const {
    addProgress,
    loading: progressLoading,
    error: progressError,
  } = useProgress();

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(
    null
  );
  const [loadingWorkOrders, setLoadingWorkOrders] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState<ProgressFormData>({
    progress: 0,
    report_date: new Date().toISOString().split("T")[0], // Today's date
    work_order_id: 0,
  });

  useEffect(() => {
    fetchWorkOrders();
  }, []);

  useEffect(() => {
    if (preselectedWorkOrderId && workOrders.length > 0) {
      const preselected = workOrders.find(
        (wo) => wo.id?.toString() === preselectedWorkOrderId
      );
      if (preselected) {
        setSelectedWorkOrder(preselected);
        setFormData((prev) => ({ ...prev, work_order_id: preselected.id! }));
      }
    }
  }, [preselectedWorkOrderId, workOrders]);

  const fetchWorkOrders = async () => {
    try {
      setLoadingWorkOrders(true);

      // Only fetch work orders that have permits uploaded (ready for work)
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
            is_uploaded
          )
        `
        )
        .eq("permit_to_work.is_uploaded", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setWorkOrders(data || []);
    } catch (err) {
      console.error("Error fetching work orders:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch work orders"
      );
    } finally {
      setLoadingWorkOrders(false);
    }
  };

  const validateForm = () => {
    if (!selectedWorkOrder) {
      setError("Please select a work order");
      return false;
    }
    if (formData.progress < 0 || formData.progress > 100) {
      setError("Progress must be between 0 and 100");
      return false;
    }
    if (!formData.report_date) {
      setError("Please select a report date");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await addProgress(formData);

      setSuccess("Progress recorded successfully!");

      // Reset form
      setFormData({
        progress: 0,
        report_date: new Date().toISOString().split("T")[0],
        work_order_id: 0,
      });
      setSelectedWorkOrder(null);

      // Navigate back after delay
      setTimeout(() => {
        navigate("/progress");
      }, 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to record progress"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const filteredWorkOrders = workOrders.filter((wo) => {
    const searchLower = searchTerm.toLowerCase();

    // Helper function to safely check if a value includes the search term
    const safeIncludes = (value: string | null | undefined) => {
      return value?.toLowerCase().includes(searchLower) || false;
    };

    return (
      safeIncludes(wo.customer_wo_number) ||
      safeIncludes(wo.shipyard_wo_number) ||
      safeIncludes(wo.vessel?.name) ||
      safeIncludes(wo.vessel?.company) ||
      safeIncludes(wo.wo_location) ||
      safeIncludes(wo.wo_description)
    );
  });

  const currentError = error || progressError;

  if (loadingWorkOrders) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading work orders...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Daily Progress Tracker
          </h1>
          <p className="text-gray-600">Record daily progress for work orders</p>
        </div>

        {currentError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-red-400 text-xl">⚠️</span>
              </div>
              <div className="ml-3">
                <p className="text-red-600 font-medium">Error</p>
                <p className="text-red-600 text-sm">{currentError}</p>
              </div>
            </div>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-green-400 text-xl">✅</span>
              </div>
              <div className="ml-3">
                <p className="text-green-600 font-medium">Success!</p>
                <p className="text-green-600 text-sm">{success}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Work Order Selection */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Select Work Order
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                Only work orders with uploaded permits are available for
                progress tracking.
              </p>

              {/* Search Bar */}
              <div className="relative mb-4">
                <input
                  type="text"
                  placeholder="Search work orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="absolute left-3 top-2.5 text-gray-400">🔍</div>
              </div>
            </div>

            {/* Work Orders List */}
            <div className="max-h-96 overflow-y-auto">
              {filteredWorkOrders.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  {searchTerm
                    ? "No work orders match your search."
                    : "No work orders with permits available."}
                  {!searchTerm && (
                    <p className="text-sm mt-2">
                      Work orders need uploaded permits before progress can be
                      tracked.
                    </p>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {filteredWorkOrders.map((wo) => (
                    <button
                      key={wo.id}
                      onClick={() => {
                        setSelectedWorkOrder(wo);
                        setFormData((prev) => ({
                          ...prev,
                          work_order_id: wo.id!,
                        }));
                      }}
                      className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                        selectedWorkOrder?.id === wo.id
                          ? "bg-blue-50 border-r-4 border-blue-500"
                          : ""
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="text-sm font-medium text-blue-600">
                              {wo.customer_wo_number}
                            </span>
                            <span className="text-sm text-gray-500">•</span>
                            <span className="text-sm text-gray-600">
                              {wo.shipyard_wo_number}
                            </span>
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                              ✅ Permit Ready
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {wo.vessel?.name}
                          </p>
                          <div className="flex items-center space-x-4 mt-1">
                            <span className="text-xs text-gray-500">
                              {wo.vessel?.type}
                            </span>
                            <span className="text-xs text-gray-500">
                              {wo.vessel?.company}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            📍 {wo.wo_location}
                          </p>
                        </div>
                        {selectedWorkOrder?.id === wo.id && (
                          <div className="flex-shrink-0 ml-2">
                            <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs">✓</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Progress Form */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-6">
                Record Progress
              </h2>

              {selectedWorkOrder ? (
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Selected Work Order Info */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-2">
                      Selected Work Order
                    </h4>
                    <div className="text-sm text-blue-800 space-y-1">
                      <div>
                        <strong>Customer WO:</strong>{" "}
                        {selectedWorkOrder.customer_wo_number}
                      </div>
                      <div>
                        <strong>Shipyard WO:</strong>{" "}
                        {selectedWorkOrder.shipyard_wo_number}
                      </div>
                      <div>
                        <strong>Vessel:</strong>{" "}
                        {selectedWorkOrder.vessel?.name} (
                        {selectedWorkOrder.vessel?.type})
                      </div>
                      <div>
                        <strong>Location:</strong>{" "}
                        {selectedWorkOrder.wo_location}
                      </div>
                      {selectedWorkOrder.wo_description && (
                        <div>
                          <strong>Description:</strong>
                          <p className="mt-1 text-xs bg-blue-100 p-2 rounded border max-h-20 overflow-y-auto">
                            {selectedWorkOrder.wo_description}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Report Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Report Date *
                    </label>
                    <input
                      type="date"
                      value={formData.report_date}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          report_date: e.target.value,
                        }))
                      }
                      max={new Date().toISOString().split("T")[0]} // Can't select future dates
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Select the date for this progress report (cannot be in the
                      future)
                    </p>
                  </div>

                  {/* Progress */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Progress Percentage *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={formData.progress}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            progress: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter progress percentage (0-100)"
                        required
                      />
                      <div className="absolute right-3 top-2.5 text-gray-400">
                        %
                      </div>
                    </div>

                    {/* Progress Bar Preview */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500">
                          Progress Preview
                        </span>
                        <span className="text-xs font-medium text-gray-700">
                          {formData.progress}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            formData.progress >= 100
                              ? "bg-green-600"
                              : formData.progress >= 75
                              ? "bg-blue-600"
                              : formData.progress >= 50
                              ? "bg-yellow-600"
                              : formData.progress >= 25
                              ? "bg-orange-600"
                              : "bg-red-600"
                          }`}
                          style={{
                            width: `${Math.min(formData.progress, 100)}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end space-x-4">
                    <button
                      type="button"
                      onClick={() => navigate("/progress")}
                      disabled={submitting}
                      className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || progressLoading}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {submitting || progressLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Recording...
                        </>
                      ) : (
                        <>📝 Record Progress</>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📝</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No Work Order Selected
                  </h3>
                  <p className="text-gray-500">
                    Please select a work order from the list to record progress.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
