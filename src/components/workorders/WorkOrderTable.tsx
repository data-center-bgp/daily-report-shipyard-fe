import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase, type WorkOrder } from "../../lib/supabase";

export default function WorkOrderTable() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] =
    useState<keyof WorkOrder>("customer_wo_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const fetchWorkOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      console.log("Fetching work orders from 'work_order' table...");

      const { data, error } = await supabase
        .from("work_order")
        .select("*")
        .order(sortField, { ascending: sortDirection === "asc" });

      console.log("Work order query result:", { data, error });

      if (error) throw error;

      console.log("Successfully fetched work orders:", data);
      setWorkOrders(data || []);
    } catch (err) {
      console.error("Error fetching work orders:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [sortField, sortDirection]);

  // Handle success message from add work order page
  useEffect(() => {
    if (location.state?.message) {
      setShowSuccessMessage(true);
      console.log(location.state.message);

      // Clear the state from location
      navigate(location.pathname, { replace: true, state: {} });

      // Hide success message after 5 seconds
      const timer = setTimeout(() => {
        setShowSuccessMessage(false);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [location, navigate]);

  useEffect(() => {
    fetchWorkOrders();
  }, [fetchWorkOrders]);

  const handleSort = (field: keyof WorkOrder) => {
    const newDirection =
      sortField === field && sortDirection === "asc" ? "desc" : "asc";
    setSortField(field);
    setSortDirection(newDirection);
  };

  const handleAddWorkOrder = () => {
    navigate("/add-work-order");
  };

  const handleViewWorkOrder = (workOrder: WorkOrder) => {
    // TODO: Implement view functionality
    console.log("View work order:", workOrder);
    // You could navigate to a view page: navigate(`/work-order/${workOrder.id}`)
  };

  const handleEditWorkOrder = (workOrder: WorkOrder) => {
    // TODO: Implement edit functionality
    console.log("Edit work order:", workOrder);
    // You could navigate to an edit page: navigate(`/edit-work-order/${workOrder.id}`)
  };

  const handleDeleteWorkOrder = async (workOrder: WorkOrder) => {
    if (
      !window.confirm(
        `Are you sure you want to delete work order ${workOrder.customer_wo_number}?`
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
      fetchWorkOrders(); // Refresh the list
    } catch (err) {
      console.error("Error deleting work order:", err);
      setError(
        err instanceof Error ? err.message : "An error occurred while deleting"
      );
    }
  };

  const filteredWorkOrders = workOrders.filter(
    (wo) =>
      wo.customer_wo_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.wo_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.wo_location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.pic.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusColor = (wo: WorkOrder) => {
    if (wo.actual_close_date) return "bg-green-100 text-green-800";
    if (wo.actual_start_date) return "bg-blue-100 text-blue-800";
    if (new Date(wo.planned_start_date) <= new Date())
      return "bg-yellow-100 text-yellow-800";
    return "bg-gray-100 text-gray-800";
  };

  const getStatus = (wo: WorkOrder) => {
    if (wo.actual_close_date) return "Completed";
    if (wo.actual_start_date) return "In Progress";
    if (new Date(wo.planned_start_date) <= new Date()) return "Ready to Start";
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading work orders...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-medium">Error Loading Work Orders</h3>
        <p className="text-red-600 mt-1">{error}</p>
        <button
          onClick={fetchWorkOrders}
          className="mt-3 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {showSuccessMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-green-600 mr-2">✅</span>
            <p className="text-green-700 font-medium">
              Work order created successfully!
            </p>
          </div>
          <button
            onClick={() => setShowSuccessMessage(false)}
            className="text-green-600 hover:text-green-800"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search and Actions */}
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
            onClick={fetchWorkOrders}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            🔄 Refresh
          </button>
          <button
            onClick={handleAddWorkOrder}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            ➕ Add Work Order
          </button>
        </div>
      </div>

      {/* Results Count */}
      <div className="text-sm text-gray-600">
        Showing {filteredWorkOrders.length} of {workOrders.length} work orders
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
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
                  onClick={() => handleSort("customer_wo_number")}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center gap-1">
                    Shipyard WO Number <SortIcon field="shipyard_wo_number" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("customer_wo_date")}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center gap-1">
                    Shipyard WO Date <SortIcon field="shipyard_wo_date" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("wo_location")}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center gap-1">
                    Location <SortIcon field="wo_location" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
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
                  onClick={() => handleSort("target_close_date")}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  <div className="flex items-center gap-1">
                    Target Close <SortIcon field="target_close_date" />
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
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredWorkOrders.length > 0 ? (
                filteredWorkOrders.map((wo) => (
                  <tr key={wo.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {wo.customer_wo_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(wo.customer_wo_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {wo.shipyard_wo_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(wo.shipyard_wo_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {wo.wo_location}
                    </td>
                    <td
                      className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate"
                      title={wo.wo_description}
                    >
                      {wo.wo_description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {wo.quantity}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(wo.planned_start_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(wo.target_close_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {wo.pic}
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
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center">
                    <div className="text-gray-500">
                      <p className="text-lg mb-2">No work orders found</p>
                      <p className="text-sm mb-4">
                        {searchTerm
                          ? "Try clearing your search or adjusting the filters"
                          : "Get started by adding your first work order"}
                      </p>
                      {searchTerm ? (
                        <button
                          onClick={() => setSearchTerm("")}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          Clear search
                        </button>
                      ) : (
                        <button
                          onClick={handleAddWorkOrder}
                          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors inline-flex items-center gap-2"
                        >
                          ➕ Add Your First Work Order
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
