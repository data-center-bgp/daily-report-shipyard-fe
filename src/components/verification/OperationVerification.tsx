import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, type WorkOrder } from "../../lib/supabase";

interface WorkOrderWithProgress extends WorkOrder {
  current_progress?: number;
  has_progress_data?: boolean;
  latest_progress_date?: string;
}

interface OperationVerification {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  progress_verification: boolean;
  verification_date: string;
  work_order_id: number;
  user_id: string;
}

interface VerificationWithDetails extends OperationVerification {
  work_order: WorkOrder & {
    vessel: {
      name: string;
      type: string;
      company: string;
    };
  };
}

export default function OperationVerification() {
  const navigate = useNavigate();

  const [completedWorkOrders, setCompletedWorkOrders] = useState<
    WorkOrderWithProgress[]
  >([]);
  const [verifications, setVerifications] = useState<VerificationWithDetails[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"pending" | "verified">("pending");

  // Modal states for verification
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] =
    useState<WorkOrderWithProgress | null>(null);
  const [verificationDate, setVerificationDate] = useState("");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch completed work orders with progress data
      const { data: workOrderData, error: woError } = await supabase
        .from("work_order")
        .select(
          `
          *,
          project_progress (
            progress,
            report_date
          ),
          vessel (
            id,
            name,
            type,
            company
          )
        `
        )
        .order("created_at", { ascending: false });

      if (woError) throw woError;

      // Process work orders to find completed ones (100% progress)
      const workOrdersWithProgress = (workOrderData || []).map((wo) => {
        const progressRecords = wo.project_progress || [];

        if (progressRecords.length === 0) {
          return {
            ...wo,
            current_progress: 0,
            has_progress_data: false,
          };
        }

        const sortedProgress = progressRecords.sort(
          (a, b) =>
            new Date(b.report_date).getTime() -
            new Date(a.report_date).getTime()
        );

        const latestProgress = sortedProgress[0]?.progress || 0;
        const latestProgressDate = sortedProgress[0]?.report_date;

        return {
          ...wo,
          current_progress: latestProgress,
          has_progress_data: true,
          latest_progress_date: latestProgressDate,
        };
      });

      // Filter only completed work orders (100% progress)
      const completed = workOrdersWithProgress.filter(
        (wo) => wo.current_progress === 100
      );

      setCompletedWorkOrders(completed);

      // Fetch existing verifications from operation_verification table
      const { data: verificationData, error: verError } = await supabase
        .from("operation_verification")
        .select(
          `
          *,
          work_order (
            *,
            vessel (
              name,
              type,
              company
            )
          )
        `
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (verError) throw verError;

      setVerifications(verificationData || []);
    } catch (err) {
      console.error("Error fetching verification data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openVerificationModal = (workOrder: WorkOrderWithProgress) => {
    setSelectedWorkOrder(workOrder);
    // Set default verification date to today
    setVerificationDate(new Date().toISOString().split("T")[0]);
    setShowVerificationModal(true);
  };

  const closeVerificationModal = () => {
    setShowVerificationModal(false);
    setSelectedWorkOrder(null);
    setVerificationDate("");
    setError(null);
  };

  const handleVerifyOperation = async () => {
    if (!selectedWorkOrder || !verificationDate) {
      setError("Please select a verification date");
      return;
    }

    try {
      setSubmittingId(selectedWorkOrder.id);
      setError(null);
      setSuccess(null);

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
          work_order_id: selectedWorkOrder.id,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      setSuccess(
        `Operation verified successfully for work order ${
          selectedWorkOrder.customer_wo_number ||
          selectedWorkOrder.shipyard_wo_number
        } on ${new Date(verificationDate).toLocaleDateString()}`
      );

      // Close modal and refresh data
      closeVerificationModal();
      await fetchData();

      // Hide success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      console.error("Error verifying operation:", err);
      setError(
        err instanceof Error ? err.message : "Failed to verify operation"
      );
    } finally {
      setSubmittingId(null);
    }
  };

  const handleRemoveVerification = async (
    verification: VerificationWithDetails
  ) => {
    if (!window.confirm("Are you sure you want to remove this verification?")) {
      return;
    }

    try {
      setSubmittingId(verification.work_order_id);
      setError(null);
      setSuccess(null);

      // Soft delete by setting deleted_at in operation_verification table
      const { error } = await supabase
        .from("operation_verification")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", verification.id);

      if (error) throw error;

      setSuccess("Verification removed successfully");

      // Refresh data
      await fetchData();

      // Hide success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Error removing verification:", err);
      setError(
        err instanceof Error ? err.message : "Failed to remove verification"
      );
    } finally {
      setSubmittingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Get pending work orders (completed but not yet verified)
  const verifiedWorkOrderIds = verifications.map((v) => v.work_order_id);
  const pendingWorkOrders = completedWorkOrders.filter(
    (wo) => !verifiedWorkOrderIds.includes(wo.id)
  );

  // Filter based on search term
  const filteredPending = pendingWorkOrders.filter((wo) => {
    const searchLower = searchTerm.toLowerCase();
    const safeIncludes = (value: string | null | undefined) => {
      return value?.toLowerCase().includes(searchLower) || false;
    };

    return (
      safeIncludes(wo.customer_wo_number) ||
      safeIncludes(wo.shipyard_wo_number) ||
      safeIncludes(wo.vessel?.name) ||
      safeIncludes(wo.vessel?.company) ||
      safeIncludes(wo.wo_location)
    );
  });

  const filteredVerified = verifications.filter((verification) => {
    const searchLower = searchTerm.toLowerCase();
    const safeIncludes = (value: string | null | undefined) => {
      return value?.toLowerCase().includes(searchLower) || false;
    };

    return (
      safeIncludes(verification.work_order.customer_wo_number) ||
      safeIncludes(verification.work_order.shipyard_wo_number) ||
      safeIncludes(verification.work_order.vessel?.name) ||
      safeIncludes(verification.work_order.vessel?.company) ||
      safeIncludes(verification.work_order.wo_location)
    );
  });

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">
            Loading operation verification data...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Operation Verification
          </h1>
          <p className="text-gray-600 mt-2">
            Verify completed work orders (100% progress)
          </p>
        </div>

        <button
          onClick={() => navigate("/work-orders")}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-2 transition-colors"
        >
          ← Back to Dashboard
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <span className="text-red-600 mr-2">⚠️</span>
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <span className="text-green-600 mr-2">✅</span>
            <p className="text-green-700 font-medium">{success}</p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Total Completed
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {completedWorkOrders.length}
              </p>
            </div>
            <span className="text-blue-500 text-2xl">✅</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Pending Verification
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {pendingWorkOrders.length}
              </p>
            </div>
            <span className="text-yellow-500 text-2xl">⏳</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Verified</p>
              <p className="text-2xl font-bold text-gray-900">
                {verifications.length}
              </p>
            </div>
            <span className="text-green-500 text-2xl">🔍</span>
          </div>
        </div>
      </div>

      {/* Tabs and Search */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-6">
            <div className="flex space-x-8">
              <button
                onClick={() => setActiveTab("pending")}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "pending"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Pending Verification ({pendingWorkOrders.length})
              </button>
              <button
                onClick={() => setActiveTab("verified")}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "verified"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Verified ({verifications.length})
              </button>
            </div>

            <div className="mt-4 sm:mt-0 relative">
              <input
                type="text"
                placeholder="Search work orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === "pending" ? (
            // Pending Verification Tab
            filteredPending.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Work Order
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Vessel
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Location
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Completion Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Progress
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredPending.map((wo) => (
                      <tr key={wo.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {wo.customer_wo_number || "-"}
                            </div>
                            <div className="text-sm text-gray-500">
                              {wo.shipyard_wo_number || "-"}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {wo.vessel?.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {wo.vessel?.type} • {wo.vessel?.company}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {wo.wo_location}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {wo.latest_progress_date
                            ? formatDate(wo.latest_progress_date)
                            : "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                              <div className="bg-green-600 h-2 rounded-full w-full"></div>
                            </div>
                            <span className="text-sm font-medium text-green-600">
                              100%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => openVerificationModal(wo)}
                            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                          >
                            🔍 Verify Operation
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <span className="text-gray-400 text-4xl mb-4 block">🔍</span>
                {searchTerm ? (
                  <>
                    <p className="text-gray-500 text-lg mb-2">
                      No pending verifications found matching "{searchTerm}"
                    </p>
                    <button
                      onClick={() => setSearchTerm("")}
                      className="text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      Clear search
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-gray-500 text-lg mb-2">
                      No work orders pending verification
                    </p>
                    <p className="text-gray-400 text-sm">
                      All completed work orders have been verified.
                    </p>
                  </>
                )}
              </div>
            )
          ) : // Verified Tab
          filteredVerified.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Work Order
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vessel
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Verification Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredVerified.map((verification) => (
                    <tr key={verification.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {verification.work_order.customer_wo_number || "-"}
                          </div>
                          <div className="text-sm text-gray-500">
                            {verification.work_order.shipyard_wo_number || "-"}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {verification.work_order.vessel?.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {verification.work_order.vessel?.type} •{" "}
                            {verification.work_order.vessel?.company}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {verification.work_order.wo_location}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(verification.verification_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          ✅ Verified
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleRemoveVerification(verification)}
                          disabled={submittingId === verification.work_order_id}
                          className="text-red-600 hover:text-red-900 transition-colors disabled:opacity-50"
                          title="Remove Verification"
                        >
                          {submittingId === verification.work_order_id ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                          ) : (
                            "🗑️ Remove"
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <span className="text-gray-400 text-4xl mb-4 block">✅</span>
              {searchTerm ? (
                <>
                  <p className="text-gray-500 text-lg mb-2">
                    No verified operations found matching "{searchTerm}"
                  </p>
                  <button
                    onClick={() => setSearchTerm("")}
                    className="text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    Clear search
                  </button>
                </>
              ) : (
                <>
                  <p className="text-gray-500 text-lg mb-2">
                    No verified operations yet
                  </p>
                  <p className="text-gray-400 text-sm">
                    Verified operations will appear here.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Verification Modal */}
      {showVerificationModal && selectedWorkOrder && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Verify Operation
                </h3>
                <button
                  onClick={closeVerificationModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <span className="text-xl">✕</span>
                </button>
              </div>

              {/* Work Order Info */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-gray-900 mb-2">
                  Work Order Details
                </h4>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="font-medium">Customer WO:</span>{" "}
                    {selectedWorkOrder.customer_wo_number || "-"}
                  </p>
                  <p>
                    <span className="font-medium">Shipyard WO:</span>{" "}
                    {selectedWorkOrder.shipyard_wo_number || "-"}
                  </p>
                  <p>
                    <span className="font-medium">Vessel:</span>{" "}
                    {selectedWorkOrder.vessel?.name}
                  </p>
                  <p>
                    <span className="font-medium">Location:</span>{" "}
                    {selectedWorkOrder.wo_location}
                  </p>
                  <p>
                    <span className="font-medium">Progress:</span>{" "}
                    <span className="text-green-600 font-medium">100%</span>
                  </p>
                </div>
              </div>

              {/* Date Input */}
              <div className="mb-4">
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
                  max={new Date().toISOString().split("T")[0]} // Don't allow future dates
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Select the actual date when the operation was verified (cannot
                  be in the future)
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center">
                    <span className="text-red-600 mr-2">⚠️</span>
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleVerifyOperation}
                  disabled={
                    submittingId === selectedWorkOrder.id || !verificationDate
                  }
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submittingId === selectedWorkOrder.id ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Verifying...
                    </>
                  ) : (
                    <>✅ Confirm Verification</>
                  )}
                </button>
                <button
                  onClick={closeVerificationModal}
                  disabled={submittingId === selectedWorkOrder.id}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
