import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  supabase,
  type WorkOrderWithDetails,
  type WorkDetailsWithProgress,
} from "../../lib/supabase";

interface VesselData {
  id: number;
  name: string;
  type: string;
  company: string;
}

// Define the work detail type with progress properties (processed)
interface WorkDetailWithProgress extends WorkDetailsWithProgress {
  current_progress: number;
  latest_progress_date?: string;
  progress_count: number;
}

// Define the work order type with progress properties
interface WorkOrderWithProgress
  extends Omit<WorkOrderWithDetails, "work_details"> {
  work_details: WorkDetailWithProgress[];
  overall_progress: number;
  has_progress_data: boolean;
}

export default function VesselWorkOrders() {
  const { vesselId } = useParams<{ vesselId: string }>();
  const navigate = useNavigate();

  const [vessel, setVessel] = useState<VesselData | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrderWithProgress[]>([]);
  const [filteredWorkOrders, setFilteredWorkOrders] = useState<
    WorkOrderWithProgress[]
  >([]);
  const [expandedWorkOrders, setExpandedWorkOrders] = useState<Set<number>>(
    new Set()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<
    "shipyard_wo_date" | "shipyard_wo_number"
  >("shipyard_wo_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const fetchVesselWorkOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (!vesselId) {
        throw new Error("Vessel ID is required");
      }
      // Fetch vessel data and work orders in parallel
      const [vesselResponse, workOrderResponse] = await Promise.all([
        supabase.from("vessel").select("*").eq("id", vesselId).single(),
        supabase
          .from("work_order")
          .select(
            `
            *,
            work_details (
              *,
              work_progress (
                progress_percentage,
                report_date,
                evidence_url,
                storage_path,
                created_at
              )
            ),
            vessel (
              id,
              name,
              type,
              company
            )
          `
          )
          .eq("vessel_id", vesselId)
          .is("deleted_at", null)
          .order(sortField, { ascending: sortDirection === "asc" }),
      ]);

      if (vesselResponse.error) throw vesselResponse.error;
      if (workOrderResponse.error) throw workOrderResponse.error;

      setVessel(vesselResponse.data);

      // Process work orders with progress data
      const workOrdersWithProgress = (workOrderResponse.data || []).map(
        (wo: WorkOrderWithDetails) => {
          const workDetails = wo.work_details || [];

          // Process each work detail to get its latest progress
          const workDetailsWithProgress: WorkDetailWithProgress[] =
            workDetails.map((detail: WorkDetailsWithProgress) => {
              const progressRecords = detail.work_progress || [];

              if (progressRecords.length === 0) {
                return {
                  ...detail,
                  current_progress: 0,
                  latest_progress_date: undefined,
                  progress_count: 0,
                };
              }

              // Sort progress records by date (newest first)
              const sortedProgress = progressRecords.sort(
                (a, b) =>
                  new Date(b.report_date).getTime() -
                  new Date(a.report_date).getTime()
              );

              const latestProgress = sortedProgress[0]?.progress || 0;
              const latestProgressDate = sortedProgress[0]?.report_date;

              return {
                ...detail,
                current_progress: latestProgress,
                latest_progress_date: latestProgressDate,
                progress_count: progressRecords.length,
              };
            });

          // Calculate overall work order progress
          let overallProgress = 0;
          let hasProgressData = false;

          if (workDetailsWithProgress.length > 0) {
            // Average progress across all work details
            const totalProgress = workDetailsWithProgress.reduce(
              (sum: number, detail: WorkDetailWithProgress) =>
                sum + (detail.current_progress || 0),
              0
            );
            overallProgress = Math.round(
              totalProgress / workDetailsWithProgress.length
            );
            hasProgressData = workDetailsWithProgress.some(
              (detail: WorkDetailWithProgress) => detail.current_progress > 0
            );
          }

          return {
            ...wo,
            work_details: workDetailsWithProgress,
            overall_progress: overallProgress,
            has_progress_data: hasProgressData,
          } as WorkOrderWithProgress;
        }
      );

      setWorkOrders(workOrdersWithProgress);
    } catch (err) {
      console.error("Error fetching vessel work orders:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [vesselId, sortField, sortDirection]);

  // Filter work orders based on search term
  useEffect(() => {
    let filtered = workOrders;

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = workOrders.filter((wo) => {
        const safeIncludes = (value: string | null | undefined) => {
          return value?.toLowerCase().includes(searchLower) || false;
        };

        return (
          safeIncludes(wo.customer_wo_number) ||
          safeIncludes(wo.shipyard_wo_number) ||
          wo.work_details.some(
            (detail) =>
              safeIncludes(detail.description) ||
              safeIncludes(detail.location) ||
              safeIncludes(detail.pic)
          )
        );
      });
    }

    setFilteredWorkOrders(filtered);
  }, [workOrders, searchTerm]);

  useEffect(() => {
    if (vesselId) {
      fetchVesselWorkOrders();
    }
  }, [fetchVesselWorkOrders, vesselId]);

  const toggleWorkOrderExpansion = (workOrderId: number) => {
    setExpandedWorkOrders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(workOrderId)) {
        newSet.delete(workOrderId);
      } else {
        newSet.add(workOrderId);
      }
      return newSet;
    });
  };

  const handleSort = (field: "shipyard_wo_date" | "shipyard_wo_number") => {
    const newDirection =
      sortField === field && sortDirection === "asc" ? "desc" : "asc";
    setSortField(field);
    setSortDirection(newDirection);
  };

  const handleAddWorkOrder = () => {
    navigate("/add-work-order", {
      state: { preselectedVesselId: vesselId },
    });
  };

  const handleViewWorkOrder = (workOrder: WorkOrderWithProgress) => {
    navigate(`/work-order/${workOrder.id}`);
  };

  const handleEditWorkOrder = (workOrder: WorkOrderWithProgress) => {
    navigate(`/edit-work-order/${workOrder.id}`);
  };

  const handleDeleteWorkOrder = async (workOrder: WorkOrderWithProgress) => {
    try {
      const { error } = await supabase
        .from("work_order")
        .delete()
        .eq("id", workOrder.id);

      if (error) throw error;

      fetchVesselWorkOrders();
    } catch (err) {
      console.error("Error deleting work order:", err);
      setError(
        err instanceof Error ? err.message : "An error occurred while deleting"
      );
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusColor = (wo: WorkOrderWithProgress) => {
    if (wo.has_progress_data) {
      if (wo.overall_progress === 100) {
        return "bg-green-100 text-green-800 border-green-200";
      } else if (wo.overall_progress > 0) {
        return "bg-blue-100 text-blue-800 border-blue-200";
      }
    }
    return "bg-gray-100 text-gray-800 border-gray-200";
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return "bg-green-500";
    if (progress >= 75) return "bg-blue-500";
    if (progress >= 50) return "bg-yellow-500";
    if (progress >= 25) return "bg-orange-500";
    return "bg-red-500";
  };

  const getProgressIcon = (progress: number) => {
    if (progress >= 100) return "✅";
    if (progress >= 75) return "🔵";
    if (progress >= 50) return "🟡";
    if (progress >= 25) return "🟠";
    return "🔴";
  };

  const getStatus = (wo: WorkOrderWithProgress) => {
    if (wo.has_progress_data) {
      if (wo.overall_progress === 100) {
        return "Completed";
      } else if (wo.overall_progress > 0) {
        return "In Progress";
      }
    }
    return "Not Started";
  };

  const SortIcon = ({
    field,
  }: {
    field: "shipyard_wo_date" | "shipyard_wo_number";
  }) => {
    if (sortField !== field) return <span className="text-gray-400">↕️</span>;
    return sortDirection === "asc" ? (
      <span className="text-blue-600">↑</span>
    ) : (
      <span className="text-blue-600">↓</span>
    );
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">
            Loading vessel work orders...
          </span>
        </div>
      </div>
    );
  }

  if (error || !vessel) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">
            Error Loading Vessel Work Orders
          </h3>
          <p className="text-red-600 mt-1">{error || "Vessel not found"}</p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => navigate("/work-orders")}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              ← Back to Dashboard
            </button>
            <button
              onClick={fetchVesselWorkOrders}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/work-orders")}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2 transition-colors font-medium"
          >
            ← Back to Dashboard
          </button>
        </div>

        <button
          onClick={handleAddWorkOrder}
          className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 font-medium"
        >
          ➕ Add Work Order
        </button>
      </div>

      {/* Vessel Info Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-4">
          <span className="text-3xl">🚢</span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{vessel.name}</h1>
            <p className="text-gray-600">
              {vessel.type} • {vessel.company}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {filteredWorkOrders.length} work order
              {filteredWorkOrders.length !== 1 ? "s" : ""}
              {searchTerm && ` (filtered from ${workOrders.length})`}
            </p>
          </div>
        </div>
      </div>

      {/* Search and Actions */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search work orders, details, or PIC..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchVesselWorkOrders}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Enhanced Work Orders Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredWorkOrders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div className="flex items-center gap-1">Details</div>
                  </th>
                  <th
                    onClick={() => handleSort("shipyard_wo_number")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-1">
                      Work Order <SortIcon field="shipyard_wo_number" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("shipyard_wo_date")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-1">
                      Dates <SortIcon field="shipyard_wo_date" />
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Overall Progress
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
                {filteredWorkOrders.map((wo) => (
                  <>
                    {/* Main Work Order Row */}
                    <tr key={wo.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleWorkOrderExpansion(wo.id)}
                            className="flex items-center gap-2 text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors"
                          >
                            <span
                              className={`transform transition-transform duration-200 ${
                                expandedWorkOrders.has(wo.id) ? "rotate-90" : ""
                              }`}
                            >
                              ▶️
                            </span>
                            <span className="text-lg">📋</span>
                            <div>
                              <div className="font-medium">
                                {wo.work_details.length} Work Detail
                                {wo.work_details.length !== 1 ? "s" : ""}
                              </div>
                              <div className="text-xs text-gray-500">
                                Click to expand
                              </div>
                            </div>
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-gray-900">
                            SY: {wo.shipyard_wo_number}
                          </div>
                          {wo.customer_wo_number && (
                            <div className="text-sm text-gray-500">
                              Customer: {wo.customer_wo_number}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="space-y-1">
                          <div className="text-sm text-gray-900">
                            <span className="font-medium text-gray-600">
                              Shipyard WO:
                            </span>{" "}
                            {formatDate(wo.shipyard_wo_date)}
                          </div>
                          {wo.customer_wo_date && (
                            <div className="text-sm text-gray-500">
                              <span className="font-medium text-gray-600">
                                Customer WO:
                              </span>{" "}
                              {formatDate(wo.customer_wo_date)}
                            </div>
                          )}
                          {wo.wo_document_delivery_date && (
                            <div className="text-xs text-blue-600">
                              <span className="font-medium text-blue-700">
                                Doc Delivery:
                              </span>{" "}
                              {formatDate(wo.wo_document_delivery_date)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {wo.has_progress_data ? (
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-gray-700">
                                  {wo.overall_progress}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(
                                    wo.overall_progress
                                  )}`}
                                  style={{ width: `${wo.overall_progress}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">
                            No progress
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
                            wo
                          )}`}
                        >
                          {getStatus(wo)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleViewWorkOrder(wo)}
                            className="text-blue-600 hover:text-blue-900 transition-colors p-1 rounded hover:bg-blue-50"
                            title="View Details"
                          >
                            👁️
                          </button>
                          <button
                            onClick={() => handleEditWorkOrder(wo)}
                            className="text-green-600 hover:text-green-900 transition-colors p-1 rounded hover:bg-green-50"
                            title="Edit Work Order"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDeleteWorkOrder(wo)}
                            className="text-red-600 hover:text-red-900 transition-colors p-1 rounded hover:bg-red-50"
                            title="Delete Work Order"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expandable Work Details Rows */}
                    {expandedWorkOrders.has(wo.id) && (
                      <tr>
                        <td colSpan={6} className="px-0 py-0">
                          <div className="bg-gray-50 border-l-4 border-blue-400">
                            <div className="px-6 py-4">
                              <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                                🔧 Work Details for {wo.shipyard_wo_number}
                              </h4>

                              {wo.work_details.length > 0 ? (
                                <div className="space-y-3">
                                  {wo.work_details.map((detail) => (
                                    <div
                                      key={detail.id}
                                      className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow"
                                    >
                                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                        {/* Work Detail Info */}
                                        <div className="lg:col-span-2">
                                          <div className="flex items-start gap-3">
                                            <span className="text-lg">
                                              {getProgressIcon(
                                                detail.current_progress
                                              )}
                                            </span>
                                            <div className="flex-1">
                                              <h5 className="font-medium text-gray-900 mb-2">
                                                {detail.description}
                                              </h5>
                                              {/* Enhanced work details with clear labels */}
                                              <div className="space-y-1 text-sm text-gray-600">
                                                {detail.location && (
                                                  <div className="flex items-center gap-1">
                                                    <span>📍</span>
                                                    <span className="font-medium">
                                                      Location:
                                                    </span>
                                                    <span>
                                                      {detail.location}
                                                    </span>
                                                  </div>
                                                )}
                                                {detail.pic && (
                                                  <div className="flex items-center gap-1">
                                                    <span>👤</span>
                                                    <span className="font-medium">
                                                      PIC:
                                                    </span>
                                                    <span>{detail.pic}</span>
                                                  </div>
                                                )}
                                                {detail.planned_start_date && (
                                                  <div className="flex items-center gap-1">
                                                    <span>📅</span>
                                                    <span className="font-medium">
                                                      Planned Start:
                                                    </span>
                                                    <span>
                                                      {formatDate(
                                                        detail.planned_start_date
                                                      )}
                                                    </span>
                                                  </div>
                                                )}
                                                {detail.target_close_date && (
                                                  <div className="flex items-center gap-1">
                                                    <span>🎯</span>
                                                    <span className="font-medium">
                                                      Target Close:
                                                    </span>
                                                    <span>
                                                      {formatDate(
                                                        detail.target_close_date
                                                      )}
                                                    </span>
                                                  </div>
                                                )}
                                                {detail.actual_start_date && (
                                                  <div className="flex items-center gap-1">
                                                    <span>▶️</span>
                                                    <span className="font-medium">
                                                      Actual Start:
                                                    </span>
                                                    <span>
                                                      {formatDate(
                                                        detail.actual_start_date
                                                      )}
                                                    </span>
                                                  </div>
                                                )}
                                                {detail.actual_close_date && (
                                                  <div className="flex items-center gap-1">
                                                    <span>✅</span>
                                                    <span className="font-medium">
                                                      Actual Close:
                                                    </span>
                                                    <span>
                                                      {formatDate(
                                                        detail.actual_close_date
                                                      )}
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Progress Info */}
                                        <div className="lg:col-span-1">
                                          <div className="text-center">
                                            <div className="text-lg font-bold text-gray-900 mb-2">
                                              {detail.current_progress}%
                                            </div>
                                            <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                                              <div
                                                className={`h-3 rounded-full transition-all duration-300 ${getProgressColor(
                                                  detail.current_progress
                                                )}`}
                                                style={{
                                                  width: `${detail.current_progress}%`,
                                                }}
                                              ></div>
                                            </div>
                                            <div className="text-xs text-gray-500">
                                              {detail.progress_count} report
                                              {detail.progress_count !== 1
                                                ? "s"
                                                : ""}
                                            </div>
                                            {detail.latest_progress_date && (
                                              <div className="text-xs text-blue-600 mt-1">
                                                <span className="font-medium">
                                                  Last Progress:
                                                </span>{" "}
                                                {formatDateTime(
                                                  detail.latest_progress_date
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-8 text-gray-500">
                                  <div className="text-4xl mb-2">📝</div>
                                  <p>No work details added yet</p>
                                  <button
                                    onClick={() =>
                                      navigate(`/work-order/${wo.id}`)
                                    }
                                    className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
                                  >
                                    Add work details →
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <span className="text-gray-400 text-4xl mb-4 block">📋</span>
            {searchTerm ? (
              <>
                <p className="text-gray-500 text-lg mb-2">
                  No work orders found matching "{searchTerm}"
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
                  No work orders found
                </p>
                <p className="text-gray-400 text-sm mb-4">
                  This vessel doesn't have any work orders yet.
                </p>
                <button
                  onClick={handleAddWorkOrder}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors inline-flex items-center gap-2"
                >
                  ➕ Add Work Order for {vessel.name}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
