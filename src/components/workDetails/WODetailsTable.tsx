import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  supabase,
  type WorkDetails,
  type WorkOrder,
  type Vessel,
} from "../../lib/supabase";
import { openPermitFile } from "../../utils/urlHandler";

interface WorkDetailsWithWorkOrder extends WorkDetails {
  work_order?: WorkOrder & {
    vessel?: Vessel;
  };
  profiles?: {
    id: number;
    name: string;
    email: string;
  };
  work_progress?: Array<{
    id: number;
    progress_percentage: number;
    report_date: string;
    created_at: string;
  }>;
  current_progress?: number;
  latest_progress_date?: string;
  progress_count?: number;
}

interface WorkDetailsTableProps {
  workOrderId?: number; // Optional - if provided, filter by work order
  onRefresh?: () => void;
  embedded?: boolean; // If true, shows simplified header for embedding
}

export default function WODetailsTable({
  workOrderId,
  onRefresh,
  embedded = false,
}: WorkDetailsTableProps) {
  const [workDetails, setWorkDetails] = useState<WorkDetailsWithWorkOrder[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<
    "planned_start_date" | "target_close_date" | "created_at" | "description"
  >("planned_start_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 10;

  // Filter states
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [selectedVesselId, setSelectedVesselId] = useState<number>(0);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<number>(
    workOrderId || 0
  );
  const [loadingVessels, setLoadingVessels] = useState(false);
  const [loadingWorkOrders, setLoadingWorkOrders] = useState(false);

  const navigate = useNavigate();

  // Calculate pagination
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;

  // Fetch vessels for filter dropdown
  const fetchVessels = async () => {
    try {
      setLoadingVessels(true);
      const { data, error } = await supabase
        .from("vessel")
        .select("*")
        .is("deleted_at", null)
        .order("name", { ascending: true });

      if (error) throw error;
      setVessels(data || []);
    } catch (err) {
      console.error("Error fetching vessels:", err);
    } finally {
      setLoadingVessels(false);
    }
  };

  // Fetch work orders for selected vessel
  const fetchWorkOrdersForVessel = async (vesselId: number) => {
    try {
      setLoadingWorkOrders(true);
      const { data, error } = await supabase
        .from("work_order")
        .select("*")
        .eq("vessel_id", vesselId)
        .is("deleted_at", null)
        .order("shipyard_wo_number", { ascending: true });

      if (error) throw error;
      setWorkOrders(data || []);
    } catch (err) {
      console.error("Error fetching work orders:", err);
    } finally {
      setLoadingWorkOrders(false);
    }
  };

  // Handle vessel selection
  const handleVesselChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const vesselId = parseInt(e.target.value);
    setSelectedVesselId(vesselId);
    setSelectedWorkOrderId(0); // Reset work order selection
    setWorkOrders([]); // Clear work orders
    setCurrentPage(1); // Reset to first page

    if (vesselId > 0) {
      fetchWorkOrdersForVessel(vesselId);
    }
  };

  // Handle work order selection
  const handleWorkOrderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const workOrderId = parseInt(e.target.value);
    setSelectedWorkOrderId(workOrderId);
    setCurrentPage(1); // Reset to first page
  };

  const fetchWorkDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let baseQuery = supabase
        .from("work_details")
        .select(
          `
          *,
          work_order (
            id,
            shipyard_wo_number,
            vessel (
              id,
              name,
              type,
              company
            )
          ),
          profiles (
            id,
            name,
            email
          ),
          work_progress (
            id,
            progress_percentage,
            report_date,
            created_at
          )
        `,
          { count: "exact" }
        )
        .is("deleted_at", null);

      // Apply filters
      if (workOrderId) {
        // Prop-based filter (takes precedence)
        baseQuery = baseQuery.eq("work_order_id", workOrderId);
      } else if (selectedWorkOrderId > 0) {
        // UI filter for specific work order
        baseQuery = baseQuery.eq("work_order_id", selectedWorkOrderId);
      } else if (selectedVesselId > 0) {
        // UI filter for vessel (need to join through work_order)
        const { data: vesselWorkOrders } = await supabase
          .from("work_order")
          .select("id")
          .eq("vessel_id", selectedVesselId)
          .is("deleted_at", null);

        if (vesselWorkOrders && vesselWorkOrders.length > 0) {
          const workOrderIds = vesselWorkOrders.map((wo) => wo.id);
          baseQuery = baseQuery.in("work_order_id", workOrderIds);
        } else {
          // No work orders for this vessel, return empty result
          setWorkDetails([]);
          setTotalItems(0);
          return;
        }
      }

      // Add sorting and pagination
      const query = baseQuery
        .order(sortField, { ascending: sortDirection === "asc" })
        .range(startIndex, endIndex - 1);

      const { data, error: queryError, count } = await query;

      if (queryError) {
        console.error("Query error:", queryError);
        throw queryError;
      }

      // Process work details with progress data
      const workDetailsWithProgress = (data || []).map((detail) => {
        const progressRecords = detail.work_progress || [];

        if (progressRecords.length === 0) {
          return {
            ...detail,
            current_progress: 0,
            latest_progress_date: undefined,
            progress_count: 0,
          };
        }

        // Sort progress records by date (newest first) - Fixed type annotations
        const sortedProgress = progressRecords.sort(
          (a: { report_date: string }, b: { report_date: string }) =>
            new Date(b.report_date).getTime() -
            new Date(a.report_date).getTime()
        );

        const latestProgress = sortedProgress[0]?.progress_percentage || 0;
        const latestProgressDate = sortedProgress[0]?.report_date;

        return {
          ...detail,
          current_progress: latestProgress,
          latest_progress_date: latestProgressDate,
          progress_count: progressRecords.length,
        };
      });

      setWorkDetails(workDetailsWithProgress);
      setTotalItems(count || 0);
    } catch (err) {
      console.error("Error in fetchWorkDetails:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [
    selectedVesselId,
    selectedWorkOrderId,
    workOrderId,
    sortField,
    sortDirection,
    startIndex,
    endIndex,
  ]);

  useEffect(() => {
    if (!workOrderId) {
      fetchVessels();
    }
  }, [workOrderId]);

  useEffect(() => {
    fetchWorkDetails();
  }, [fetchWorkDetails]);

  // Initialize filters if workOrderId is provided
  useEffect(() => {
    if (workOrderId && workDetails.length > 0) {
      const workDetail = workDetails[0];
      if (workDetail.work_order?.vessel) {
        setSelectedVesselId(workDetail.work_order.vessel.id);
        setSelectedWorkOrderId(workOrderId);
      }
    }
  }, [workOrderId, workDetails]);

  const handleSort = (field: typeof sortField) => {
    const newDirection =
      sortField === field && sortDirection === "asc" ? "desc" : "asc";
    setSortField(field);
    setSortDirection(newDirection);
    setCurrentPage(1); // Reset to first page when sorting
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleAddWorkDetails = () => {
    if (workOrderId) {
      navigate(`/work-order/${workOrderId}/add-work-details`);
    } else if (selectedWorkOrderId > 0) {
      navigate(`/work-order/${selectedWorkOrderId}/add-work-details`);
    } else {
      navigate("/add-work-details");
    }
  };

  const handleEditWorkDetails = (workDetailsId: number) => {
    navigate(`/edit-work-details/${workDetailsId}`);
  };

  const handleDeleteWorkDetails = async (detail: WorkDetailsWithWorkOrder) => {
    if (
      !window.confirm(
        `Are you sure you want to delete work details "${detail.description.substring(
          0,
          50
        )}${detail.description.length > 50 ? "..." : ""}"?`
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from("work_details")
        .delete()
        .eq("id", detail.id);

      if (error) throw error;
      const newTotalItems = totalItems - 1;
      const newTotalPages = Math.ceil(newTotalItems / itemsPerPage);
      if (currentPage > newTotalPages && newTotalPages > 0) {
        setCurrentPage(newTotalPages);
      }

      fetchWorkDetails();
      onRefresh?.();
    } catch (err) {
      console.error("Error deleting work details:", err);
      setError(
        err instanceof Error ? err.message : "An error occurred while deleting"
      );
    }
  };

  const handleViewPermit = async (detail: WorkDetailsWithWorkOrder) => {
    if (!detail.storage_path) return;

    try {
      await openPermitFile(detail.storage_path);
    } catch (err) {
      console.error("Error opening permit file:", err);
      alert("Failed to open permit file");
    }
  };

  const handleViewProgress = (workDetailsId: number) => {
    navigate(`/work-details/${workDetailsId}/progress`);
  };

  const handleAddProgress = (workDetailsId: number) => {
    navigate(`/add-work-progress/${workDetailsId}`);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatus = (detail: WorkDetailsWithWorkOrder) => {
    if (detail.actual_close_date) {
      return {
        text: "Completed",
        color: "bg-green-100 text-green-800 border-green-200",
        icon: "✅",
      };
    } else if (detail.actual_start_date) {
      return {
        text: "In Progress",
        color: "bg-blue-100 text-blue-800 border-blue-200",
        icon: "⏳",
      };
    } else if (detail.storage_path) {
      // Has work permit, ready to start
      return {
        text: "Ready",
        color: "bg-yellow-100 text-yellow-800 border-yellow-200",
        icon: "🟡",
      };
    } else {
      // No work permit, not ready
      return {
        text: "Not Ready",
        color: "bg-red-100 text-red-600 border-red-200",
        icon: "🔴",
      };
    }
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

  const getSortIcon = (field: string) => {
    if (sortField !== field) return "↕️";
    return sortDirection === "asc" ? "↑" : "↓";
  };

  const getHeaderTitle = () => {
    if (workOrderId) return "Work Details";
    return "All Work Details";
  };

  const getHeaderDescription = () => {
    const itemText = totalItems !== 1 ? "items" : "item";

    if (workOrderId) {
      return `${totalItems} work ${itemText} for work order #${workOrderId}`;
    }
    return `${totalItems} work ${itemText} across all work orders`;
  };

  const selectedVessel = vessels.find((v) => v.id === selectedVesselId);
  const selectedWorkOrder = workOrders.find(
    (wo) => wo.id === selectedWorkOrderId
  );

  // Pagination component
  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages = [];
    const maxVisiblePages = 5;

    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1); // Fixed: use const instead of let

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div className="flex items-center justify-between px-6 py-3 bg-white border-t border-gray-200">
        <div className="flex-1 flex justify-between sm:hidden">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>

        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-700">
              Showing <span className="font-medium">{startIndex + 1}</span> to{" "}
              <span className="font-medium">
                {Math.min(endIndex, totalItems)}
              </span>{" "}
              of <span className="font-medium">{totalItems}</span> results
            </p>
          </div>

          <div>
            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
              {/* Previous button */}
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ←
              </button>

              {/* First page */}
              {startPage > 1 && (
                <>
                  <button
                    onClick={() => handlePageChange(1)}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    1
                  </button>
                  {startPage > 2 && (
                    <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                      ...
                    </span>
                  )}
                </>
              )}

              {/* Page numbers */}
              {pages.map((page) => (
                <button
                  key={page}
                  onClick={() => handlePageChange(page)}
                  className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                    page === currentPage
                      ? "z-10 bg-blue-50 border-blue-500 text-blue-600"
                      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {page}
                </button>
              ))}

              {/* Last page */}
              {endPage < totalPages && (
                <>
                  {endPage < totalPages - 1 && (
                    <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                      ...
                    </span>
                  )}
                  <button
                    onClick={() => handlePageChange(totalPages)}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {totalPages}
                  </button>
                </>
              )}

              {/* Next button */}
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                →
              </button>
            </nav>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading work details...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-medium">Error Loading Work Details</h3>
        <p className="text-red-600 mt-1">{error}</p>
        <button
          onClick={fetchWorkDetails}
          className="mt-3 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-4" : "space-y-6"}>
      {/* Page Header - Only show if not embedded */}
      {!embedded && (
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {getHeaderTitle()}
            </h2>
            <p className="text-gray-600 text-sm mt-1">
              {getHeaderDescription()}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={fetchWorkDetails}
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-all duration-200 flex items-center gap-2 shadow-sm"
            >
              🔄 Refresh
            </button>
            <button
              onClick={handleAddWorkDetails}
              className="bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-2 rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 flex items-center gap-2 shadow-md"
            >
              ➕ Add Work Details
            </button>
          </div>
        </div>
      )}

      {/* Compact Filter Section - Only show when not filtering by specific work order */}
      {!workOrderId && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Vessel Filter */}
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                🚢 Vessel
              </label>
              <select
                value={selectedVesselId}
                onChange={handleVesselChange}
                disabled={loadingVessels}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={0}>
                  {loadingVessels ? "Loading..." : "All Vessels"}
                </option>
                {vessels.map((vessel) => (
                  <option key={vessel.id} value={vessel.id}>
                    {vessel.name} ({vessel.type})
                  </option>
                ))}
              </select>
            </div>

            {/* Work Order Filter */}
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                🏗️ Work Order
              </label>
              <select
                value={selectedWorkOrderId}
                onChange={handleWorkOrderChange}
                disabled={loadingWorkOrders || selectedVesselId === 0}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={0}>
                  {selectedVesselId === 0
                    ? "Select vessel first"
                    : loadingWorkOrders
                    ? "Loading..."
                    : "All Work Orders"}
                </option>
                {workOrders.map((workOrder) => (
                  <option key={workOrder.id} value={workOrder.id}>
                    {workOrder.shipyard_wo_number}
                  </option>
                ))}
              </select>
            </div>

            {/* Active Filter Display */}
            <div className="flex items-end">
              <div className="flex flex-wrap gap-1">
                {selectedVessel && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                    🚢 {selectedVessel.name}
                  </span>
                )}
                {selectedWorkOrder && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                    🏗️ {selectedWorkOrder.shipyard_wo_number}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Work Details Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {embedded ? getHeaderTitle() : "Work Details"}
              </h3>
              <p className="text-gray-600 text-sm">
                {embedded
                  ? getHeaderDescription()
                  : "Track and manage work breakdown items"}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {/* Sort Control */}
              <select
                value={`${sortField}-${sortDirection}`}
                onChange={(e) => {
                  const [field, direction] = e.target.value.split("-");
                  setSortField(field as typeof sortField);
                  setSortDirection(direction as "asc" | "desc");
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
              >
                <option value="planned_start_date-asc">
                  📅 Start Date (Earliest)
                </option>
                <option value="planned_start_date-desc">
                  📅 Start Date (Latest)
                </option>
                <option value="target_close_date-asc">
                  🎯 Target Date (Earliest)
                </option>
                <option value="target_close_date-desc">
                  🎯 Target Date (Latest)
                </option>
                <option value="description-asc">📝 Description (A-Z)</option>
                <option value="description-desc">📝 Description (Z-A)</option>
                <option value="created_at-desc">🆕 Recently Added</option>
                <option value="created_at-asc">📅 Oldest First</option>
              </select>

              {/* Add button for embedded view */}
              {embedded && (
                <button
                  onClick={handleAddWorkDetails}
                  className="bg-gradient-to-r from-green-600 to-green-700 text-white px-4 py-2 rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 flex items-center gap-2 shadow-sm"
                >
                  ➕ Add
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {workDetails.length > 0 ? (
            <>
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {!workOrderId && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Work Order
                      </th>
                    )}
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort("description")}
                    >
                      Description {getSortIcon("description")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Location & PIC
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort("planned_start_date")}
                    >
                      Dates {getSortIcon("planned_start_date")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status & Permit
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Progress
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {workDetails.map((detail) => {
                    const status = getStatus(detail);

                    return (
                      <tr
                        key={detail.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        {/* Work Order Column - Only show when not filtering by specific work order */}
                        {!workOrderId && (
                          <td className="px-4 py-4 whitespace-nowrap">
                            {detail.work_order && (
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {detail.work_order.shipyard_wo_number}
                                </div>
                                {detail.work_order.vessel && (
                                  <div className="text-xs text-gray-500">
                                    {detail.work_order.vessel.name}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        )}

                        {/* Description */}
                        <td className="px-4 py-4">
                          <div className="text-sm text-gray-900 max-w-xs">
                            <div
                              className="font-medium"
                              title={detail.description}
                            >
                              {detail.description.length > 60
                                ? `${detail.description.substring(0, 60)}...`
                                : detail.description}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Target: {detail.period_close_target}
                            </div>
                          </div>
                        </td>

                        {/* Location & PIC */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-sm">
                            <div className="text-gray-900 font-medium">
                              📍 {detail.location}
                            </div>
                            <div className="text-gray-600 text-xs">
                              👤 {detail.pic}
                            </div>
                          </div>
                        </td>

                        {/* Dates */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-xs space-y-1">
                            <div>
                              <span className="text-gray-500">Plan:</span>{" "}
                              {formatDate(detail.planned_start_date)} →{" "}
                              {formatDate(detail.target_close_date)}
                            </div>
                            {detail.actual_start_date && (
                              <div className="text-blue-600">
                                <span className="text-gray-500">Start:</span>{" "}
                                {formatDate(detail.actual_start_date)}
                              </div>
                            )}
                            {detail.actual_close_date && (
                              <div className="text-green-600">
                                <span className="text-gray-500">Done:</span>{" "}
                                {formatDate(detail.actual_close_date)}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Status & Permit */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="space-y-2">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${status.color}`}
                            >
                              {status.icon} {status.text}
                            </span>
                            {detail.storage_path ? (
                              <div>
                                <button
                                  onClick={() => handleViewPermit(detail)}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded hover:bg-blue-100 transition-colors"
                                  title="View Work Permit"
                                >
                                  📄 Permit
                                </button>
                              </div>
                            ) : (
                              <div>
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 text-xs rounded">
                                  ❌ No Permit
                                </span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Progress Column */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-gray-900">
                                  {getProgressIcon(
                                    detail.current_progress || 0
                                  )}
                                </span>
                                <span className="text-xs font-medium text-gray-700">
                                  {detail.current_progress || 0}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(
                                    detail.current_progress || 0
                                  )}`}
                                  style={{
                                    width: `${detail.current_progress || 0}%`,
                                  }}
                                ></div>
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-xs text-gray-500">
                                  {detail.progress_count || 0} report
                                  {(detail.progress_count || 0) !== 1
                                    ? "s"
                                    : ""}
                                </span>
                                {detail.latest_progress_date && (
                                  <span className="text-xs text-blue-600">
                                    {formatDate(detail.latest_progress_date)}
                                  </span>
                                )}
                              </div>
                              {/* Quick Progress Actions */}
                              <div className="flex gap-1 mt-2">
                                <button
                                  onClick={() => handleViewProgress(detail.id)}
                                  className="text-xs px-2 py-1 bg-purple-50 text-purple-600 rounded hover:bg-purple-100 transition-colors"
                                  title="View Progress"
                                >
                                  📊 View
                                </button>
                                <button
                                  onClick={() => handleAddProgress(detail.id)}
                                  className="text-xs px-2 py-1 bg-orange-50 text-orange-600 rounded hover:bg-orange-100 transition-colors"
                                  title="Add Progress"
                                >
                                  ➕ Add
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Actions - Simplified to just Edit and Delete */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEditWorkDetails(detail.id)}
                              className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-md hover:bg-blue-100 transition-colors border border-blue-200"
                              title="Edit Work Details"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => handleDeleteWorkDetails(detail)}
                              className="inline-flex items-center px-3 py-1 bg-red-50 text-red-700 text-sm rounded-md hover:bg-red-100 transition-colors border border-red-200"
                              title="Delete Work Details"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              {renderPagination()}
            </>
          ) : (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">🔧</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No work details found
              </h3>
              <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto leading-relaxed">
                {workOrderId
                  ? "Add work details to break down this work order into manageable tasks with specific timelines and responsibilities."
                  : selectedWorkOrderId > 0
                  ? "No work details found for the selected work order."
                  : selectedVesselId > 0
                  ? "No work details found for the selected vessel."
                  : "Create work details to track and manage work tasks across your projects."}
              </p>
              <button
                onClick={handleAddWorkDetails}
                className="bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-3 rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 inline-flex items-center gap-2 shadow-md"
              >
                ➕ Add{" "}
                {workOrderId || selectedWorkOrderId > 0 ? "Your First" : ""}{" "}
                Work Details
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
