import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase, type WorkOrder } from "../../lib/supabase";

interface WorkOrderWithProgress extends WorkOrder {
  current_progress?: number;
  has_progress_data?: boolean;
}

interface VesselData {
  id: number;
  name: string;
  type: string;
  company: string;
}

export default function VesselWorkOrders() {
  const { vesselId } = useParams<{ vesselId: string }>();
  const navigate = useNavigate();

  const [vessel, setVessel] = useState<VesselData | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrderWithProgress[]>([]);
  const [filteredWorkOrders, setFilteredWorkOrders] = useState<
    WorkOrderWithProgress[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] =
    useState<keyof WorkOrder>("customer_wo_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const fetchVesselWorkOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (!vesselId) {
        throw new Error("Vessel ID is required");
      }

      console.log(`Fetching work orders for vessel ${vesselId}...`);

      // Fetch vessel data and work orders in parallel
      const [vesselResponse, workOrderResponse] = await Promise.all([
        supabase.from("vessel").select("*").eq("id", vesselId).single(),
        supabase
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
          .eq("vessel_id", vesselId)
          .order(sortField, { ascending: sortDirection === "asc" }),
      ]);

      if (vesselResponse.error) throw vesselResponse.error;
      if (workOrderResponse.error) throw workOrderResponse.error;

      setVessel(vesselResponse.data);

      // Process work orders with progress data
      const workOrdersWithProgress = (workOrderResponse.data || []).map(
        (wo) => {
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

          return {
            ...wo,
            current_progress: latestProgress,
            has_progress_data: true,
          };
        }
      );

      console.log("Vessel work orders:", workOrdersWithProgress);
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
          safeIncludes(wo.wo_description) ||
          safeIncludes(wo.wo_location) ||
          safeIncludes(wo.pic)
        );
      });
    }

    setFilteredWorkOrders(filtered);
  }, [workOrders, searchTerm]);

  useEffect(() => {
    if (vesselId) {
      fetchVesselWorkOrders();
    }
  }, [fetchVesselWorkOrders]);

  const handleSort = (field: keyof WorkOrder) => {
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

  const handleViewWorkOrder = (workOrder: WorkOrder) => {
    // Navigate to work order details page
    navigate(`/work-order/${workOrder.id}`);
  };

  const handleEditWorkOrder = (workOrder: WorkOrder) => {
    // Navigate to edit work order page
    navigate(`/edit-work-order/${workOrder.id}`);
  };

  const handleDeleteWorkOrder = async (workOrder: WorkOrder) => {
    if (
      !window.confirm(
        `Are you sure you want to delete work order ${
          workOrder.customer_wo_number ||
          workOrder.shipyard_wo_number ||
          "this work order"
        }?`
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from("work_order")
        .delete()
        .eq("id", workOrder.id);

      if (error) throw error;

      console.log("Work order deleted successfully");
      fetchVesselWorkOrders(); // Refresh the list
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

  const getStatusColor = (wo: WorkOrderWithProgress) => {
    const today = new Date();
    const targetDate = new Date(wo.target_close_date);

    if (wo.has_progress_data) {
      if (wo.current_progress === 100) {
        return "bg-green-100 text-green-800"; // Completed
      } else if (wo.current_progress > 0) {
        return targetDate < today
          ? "bg-red-100 text-red-800"
          : "bg-blue-100 text-blue-800"; // Overdue or In Progress
      }
    }

    if (wo.actual_close_date) return "bg-green-100 text-green-800"; // Completed
    if (wo.actual_start_date) {
      return targetDate < today
        ? "bg-red-100 text-red-800"
        : "bg-blue-100 text-blue-800"; // Overdue or In Progress
    }
    if (new Date(wo.planned_start_date) <= today) {
      return "bg-yellow-100 text-yellow-800"; // Ready to Start
    }
    return "bg-gray-100 text-gray-800"; // Planned
  };

  const getStatus = (wo: WorkOrderWithProgress) => {
    const today = new Date();
    const targetDate = new Date(wo.target_close_date);

    if (wo.has_progress_data) {
      if (wo.current_progress === 100) {
        return "Completed";
      } else if (wo.current_progress > 0) {
        return targetDate < today ? "Overdue" : "In Progress";
      }
    }

    if (wo.actual_close_date) return "Completed";
    if (wo.actual_start_date) {
      return targetDate < today ? "Overdue" : "In Progress";
    }
    if (new Date(wo.planned_start_date) <= today) return "Ready to Start";
    return "Planned";
  };

  const SortIcon = ({ field }: { field: keyof WorkOrder }) => {
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

  // ...existing code...

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
              placeholder="Search work orders..."
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

      {/* Work Orders Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredWorkOrders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    onClick={() => handleSort("customer_wo_number")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-1">
                      Customer WO Number <SortIcon field="customer_wo_number" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("customer_wo_date")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-1">
                      Customer WO Date <SortIcon field="customer_wo_date" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("shipyard_wo_number")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-1">
                      Shipyard WO Number <SortIcon field="shipyard_wo_number" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("shipyard_wo_date")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-1">
                      Shipyard WO Date <SortIcon field="shipyard_wo_date" />
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th
                    onClick={() => handleSort("wo_location")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-1">
                      Location <SortIcon field="wo_location" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("quantity")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-1">
                      Quantity <SortIcon field="quantity" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("planned_start_date")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-1">
                      Planned Start <SortIcon field="planned_start_date" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("actual_start_date")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-1">
                      Actual Start <SortIcon field="actual_start_date" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("target_close_date")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-1">
                      Target Close <SortIcon field="target_close_date" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("actual_close_date")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-1">
                      Actual Close <SortIcon field="actual_close_date" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("invoice_delivery_date")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-1">
                      Invoice Delivery{" "}
                      <SortIcon field="invoice_delivery_date" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("pic")}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-1">
                      PIC <SortIcon field="pic" />
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    WO Doc Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredWorkOrders.map((wo) => (
                  <tr key={wo.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {wo.customer_wo_number || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(wo.customer_wo_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {wo.shipyard_wo_number || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(wo.shipyard_wo_date)}
                    </td>
                    <td
                      className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate"
                      title={wo.wo_description}
                    >
                      {wo.wo_description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {wo.wo_location}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {wo.quantity}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(wo.planned_start_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(wo.actual_start_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(wo.target_close_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(wo.actual_close_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(wo.invoice_delivery_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {wo.pic}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {wo.has_progress_data ? (
                        <div className="flex items-center">
                          <div className="w-12 bg-gray-200 rounded-full h-2 mr-2">
                            <div
                              className={`h-2 rounded-full ${
                                wo.current_progress === 100
                                  ? "bg-green-500"
                                  : wo.current_progress >= 75
                                  ? "bg-blue-500"
                                  : wo.current_progress >= 50
                                  ? "bg-yellow-500"
                                  : wo.current_progress >= 25
                                  ? "bg-orange-500"
                                  : "bg-red-500"
                              }`}
                              style={{ width: `${wo.current_progress}%` }}
                            ></div>
                          </div>
                          <span className="text-xs font-medium">
                            {wo.current_progress}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">
                          No progress
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                          wo
                        )}`}
                      >
                        {getStatus(wo)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          wo.wo_document_status
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {wo.wo_document_status ? "✅ Complete" : "📄 Pending"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleViewWorkOrder(wo)}
                          className="text-blue-600 hover:text-blue-900 transition-colors"
                          title="View Details"
                        >
                          👁️
                        </button>
                        <button
                          onClick={() => handleEditWorkOrder(wo)}
                          className="text-green-600 hover:text-green-900 transition-colors"
                          title="Edit Work Order"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteWorkOrder(wo)}
                          className="text-red-600 hover:text-red-900 transition-colors"
                          title="Delete Work Order"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          // ...existing empty state code...
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

  // ...existing code...
}
