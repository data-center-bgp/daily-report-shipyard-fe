import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase, type WorkOrder } from "../../lib/supabase";

interface WorkOrderWithProgress extends WorkOrder {
  current_progress?: number;
  has_progress_data?: boolean;
  latest_progress_date?: string;
}

export default function VerifyOperation() {
  const navigate = useNavigate();
  const { workOrderId } = useParams<{ workOrderId: string }>();

  const [workOrder, setWorkOrder] = useState<WorkOrderWithProgress | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationDate, setVerificationDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  useEffect(() => {
    if (workOrderId) {
      fetchWorkOrder();
    }
  }, [workOrderId]);

  const fetchWorkOrder = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!workOrderId) {
        throw new Error("Work Order ID is required");
      }

      // Fetch the specific work order with only existing vessel columns
      const { data: workOrderData, error: woError } = await supabase
        .from("work_order")
        .select(
          `
          *,
          project_progress (
            progress,
            report_date
          ),
          vessel:vessel_id (
            id,
            name,
            type,
            company
          )
        `
        )
        .eq("id", parseInt(workOrderId))
        .single();

      if (woError) throw woError;

      if (!workOrderData) {
        throw new Error("Work order not found");
      }

      // Process progress data
      const progressRecords = workOrderData.project_progress || [];
      let current_progress = 0;
      let has_progress_data = false;
      let latest_progress_date = null;

      if (progressRecords.length > 0) {
        has_progress_data = true;
        const sortedProgress = progressRecords.sort(
          (a, b) =>
            new Date(b.report_date).getTime() -
            new Date(a.report_date).getTime()
        );

        current_progress = sortedProgress[0]?.progress || 0;
        latest_progress_date = sortedProgress[0]?.report_date;
      }

      // Check if work order is completed (100%)
      if (current_progress !== 100) {
        throw new Error(
          "Work order is not completed yet (must be 100% progress)"
        );
      }

      // Check if already verified
      const { data: existingVerification, error: verError } = await supabase
        .from("operation_verification")
        .select("id")
        .eq("work_order_id", parseInt(workOrderId))
        .is("deleted_at", null)
        .single();

      if (existingVerification) {
        throw new Error("Work order has already been verified");
      }

      const processedWorkOrder = {
        ...workOrderData,
        current_progress,
        has_progress_data,
        latest_progress_date,
      };

      setWorkOrder(processedWorkOrder);
    } catch (err) {
      console.error("Error fetching work order:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load work order"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOperation = async () => {
    if (!workOrder || !verificationDate) {
      setError("Please select a verification date");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // Get current user
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error("User not authenticated");
      }

      // Insert verification record into operation_verification table
      const { data, error } = await supabase
        .from("operation_verification")
        .insert({
          progress_verification: true,
          verification_date: verificationDate,
          work_order_id: workOrder.id,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Navigate back with success message
      navigate("/operation-verification", {
        state: {
          successMessage: `Operation verified successfully for work order ${
            workOrder.customer_wo_number || workOrder.shipyard_wo_number
          } on ${new Date(verificationDate).toLocaleDateString()}`,
        },
      });
    } catch (err) {
      console.error("Error verifying operation:", err);
      setError(
        err instanceof Error ? err.message : "Failed to verify operation"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading work order...</span>
        </div>
      </div>
    );
  }

  if (error && !workOrder) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-center mb-4">
              <span className="text-red-600 mr-3 text-2xl">⚠️</span>
              <h2 className="text-lg font-medium text-red-800">Error</h2>
            </div>
            <p className="text-red-700 mb-4">{error}</p>
            <button
              onClick={() => navigate("/operation-verification")}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              ← Back to Verification List
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <span className="text-gray-400 text-4xl mb-4 block">📋</span>
          <p className="text-gray-500 text-lg mb-2">Work order not found</p>
          <button
            onClick={() => navigate("/operation-verification")}
            className="text-blue-600 hover:text-blue-800 transition-colors"
          >
            ← Back to Verification List
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Verify Operation
            </h1>
            <p className="text-gray-600 mt-2">
              Verify completed work order and set verification date
            </p>
          </div>

          <button
            onClick={() => navigate("/operation-verification")}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2 transition-colors"
          >
            ← Back to Verification List
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <span className="text-red-600 mr-2">⚠️</span>
              <p className="text-red-700 font-medium">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Work Order Details - Left Side (2/3) */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-medium text-gray-900 mb-4">
                  Complete Work Order Details
                </h2>
              </div>

              <div className="p-6 max-h-96 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  {/* Work Order Information */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-800 border-b pb-2">
                      Work Order Information
                    </h3>
                    <div>
                      <span className="font-medium text-gray-700">
                        Customer WO Number:
                      </span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.customer_wo_number || "-"}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">
                        Shipyard WO Number:
                      </span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.shipyard_wo_number || "-"}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">
                        Customer WO Date:
                      </span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.customer_wo_date
                          ? formatDate(workOrder.customer_wo_date)
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">
                        Shipyard WO Date:
                      </span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.shipyard_wo_date
                          ? formatDate(workOrder.shipyard_wo_date)
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">PIC:</span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.pic || "-"}
                      </p>
                    </div>
                  </div>

                  {/* Vessel Information - Only existing columns */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-800 border-b pb-2">
                      Vessel Information
                    </h3>
                    <div>
                      <span className="font-medium text-gray-700">
                        Vessel Name:
                      </span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.vessel?.name || "-"}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">
                        Vessel Type:
                      </span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.vessel?.type || "-"}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">
                        Company:
                      </span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.vessel?.company || "-"}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">
                        Vessel ID:
                      </span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.vessel?.id || "-"}
                      </p>
                    </div>
                  </div>

                  {/* Work Details */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-800 border-b pb-2">
                      Work Details
                    </h3>
                    <div>
                      <span className="font-medium text-gray-700">
                        Location:
                      </span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.wo_location || "-"}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">
                        Quantity:
                      </span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.quantity || "-"}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">
                        Document Status:
                      </span>
                      <div className="mt-1">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            workOrder.wo_document_status
                              ? "bg-green-100 text-green-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {workOrder.wo_document_status
                            ? "✅ Complete"
                            : "📄 Pending"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Schedule Information */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-800 border-b pb-2">
                      Schedule Information
                    </h3>
                    <div>
                      <span className="font-medium text-gray-700">
                        Planned Start:
                      </span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.planned_start_date
                          ? formatDate(workOrder.planned_start_date)
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">
                        Target Close:
                      </span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.target_close_date
                          ? formatDate(workOrder.target_close_date)
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">
                        Actual Start:
                      </span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.actual_start_date
                          ? formatDate(workOrder.actual_start_date)
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">
                        Actual Close:
                      </span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.actual_close_date
                          ? formatDate(workOrder.actual_close_date)
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">
                        Invoice Delivery:
                      </span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.invoice_delivery_date
                          ? formatDate(workOrder.invoice_delivery_date)
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">
                        Completion Date:
                      </span>
                      <p className="text-green-600 font-medium mt-1">
                        {workOrder.latest_progress_date
                          ? formatDate(workOrder.latest_progress_date)
                          : "-"}
                      </p>
                    </div>
                  </div>

                  {/* Additional Work Order Fields */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-800 border-b pb-2">
                      Additional Information
                    </h3>
                    <div>
                      <span className="font-medium text-gray-700">
                        Created:
                      </span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.created_at
                          ? formatDate(workOrder.created_at)
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">
                        Last Updated:
                      </span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.updated_at
                          ? formatDate(workOrder.updated_at)
                          : "-"}
                      </p>
                    </div>
                  </div>

                  {/* Progress Status */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-800 border-b pb-2">
                      Progress Status
                    </h3>
                    <div className="flex items-center">
                      <div className="w-32 bg-gray-200 rounded-full h-3 mr-4">
                        <div className="bg-green-600 h-3 rounded-full w-full"></div>
                      </div>
                      <span className="text-lg font-medium text-green-600">
                        100% Complete
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">
                        Current Progress:
                      </span>
                      <p className="text-green-600 font-medium mt-1">
                        {workOrder.current_progress}%
                      </p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">
                        Has Progress Data:
                      </span>
                      <p className="text-gray-900 mt-1">
                        {workOrder.has_progress_data ? "Yes" : "No"}
                      </p>
                    </div>
                  </div>

                  {/* Description - Full width */}
                  <div className="md:col-span-2 space-y-4">
                    <h3 className="font-semibold text-gray-800 border-b pb-2">
                      Work Description
                    </h3>
                    <div className="bg-gray-50 p-4 rounded border">
                      <p className="text-gray-900 text-sm whitespace-pre-wrap break-words">
                        {workOrder.wo_description || "No description provided"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Verification Form - Right Side (1/3) */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">
                  Verification Details
                </h2>
              </div>

              <div className="p-6 space-y-6">
                {/* Verification Summary */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-medium text-green-900 mb-2">
                    Ready for Verification
                  </h4>
                  <div className="text-sm text-green-800 space-y-1">
                    <p>✅ Work order is 100% complete</p>
                    <p>✅ All progress data available</p>
                    <p>✅ Ready for verification</p>
                  </div>
                </div>

                {/* Work Order Summary */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">
                    Work Order Summary
                  </h4>
                  <div className="text-sm text-blue-800 space-y-1">
                    <p>
                      <strong>Customer WO:</strong>{" "}
                      {workOrder.customer_wo_number || "-"}
                    </p>
                    <p>
                      <strong>Shipyard WO:</strong>{" "}
                      {workOrder.shipyard_wo_number || "-"}
                    </p>
                    <p>
                      <strong>Vessel:</strong> {workOrder.vessel?.name || "-"}
                    </p>
                    <p>
                      <strong>Company:</strong>{" "}
                      {workOrder.vessel?.company || "-"}
                    </p>
                    <p>
                      <strong>Location:</strong> {workOrder.wo_location || "-"}
                    </p>
                  </div>
                </div>

                {/* Date Input */}
                <div>
                  <label
                    htmlFor="verification-date"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Verification Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    id="verification-date"
                    value={verificationDate}
                    onChange={(e) => setVerificationDate(e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Select the actual date when the operation was verified
                    (cannot be in the future)
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  <button
                    onClick={handleVerifyOperation}
                    disabled={submitting || !verificationDate}
                    className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Verifying...
                      </>
                    ) : (
                      <>✅ Confirm Verification</>
                    )}
                  </button>

                  <button
                    onClick={() => navigate("/operation-verification")}
                    disabled={submitting}
                    className="w-full px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
