import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  supabase,
  type WorkDetails,
  type WorkOrder,
  type Vessel,
} from "../../lib/supabase";
import { openPermitFile } from "../../utils/urlHandler";
import { useAuth } from "../../hooks/useAuth";

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
  work_scope?: {
    id: number;
    work_scope: string;
  };
  location?: {
    id: number;
    location: string;
  };
}

interface WorkDetailsTableProps {
  workOrderId?: number;
  onRefresh?: () => void;
  embedded?: boolean;
}

export default function WODetailsTable({
  workOrderId,
  onRefresh,
  embedded = false,
}: WorkDetailsTableProps) {
  const { profile } = useAuth();
  const [workDetails, setWorkDetails] = useState<WorkDetailsWithWorkOrder[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<
    "planned_start_date" | "target_close_date" | "created_at" | "description"
  >("planned_start_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Expandable rows state
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

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

  const [vesselSearchTerm, setVesselSearchTerm] = useState("");
  const [showVesselDropdown, setShowVesselDropdown] = useState(false);
  const vesselDropdownRef = useRef<HTMLDivElement>(null);

  const [workOrderSearchTerm, setWorkOrderSearchTerm] = useState("");
  const [showWorkOrderDropdown, setShowWorkOrderDropdown] = useState(false);
  const workOrderDropdownRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();

  // Calculate pagination
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;

  // Toggle row expansion
  const toggleRowExpansion = (detailId: number) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(detailId)) {
        newSet.delete(detailId);
      } else {
        newSet.add(detailId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        vesselDropdownRef.current &&
        !vesselDropdownRef.current.contains(event.target as Node)
      ) {
        setShowVesselDropdown(false);
      }
      if (
        workOrderDropdownRef.current &&
        !workOrderDropdownRef.current.contains(event.target as Node)
      ) {
        setShowWorkOrderDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Filter vessels for search dropdown
  const filteredVesselsForSearch = vessels.filter((vessel) => {
    const searchLower = vesselSearchTerm.toLowerCase();
    return (
      vessel.name?.toLowerCase().includes(searchLower) ||
      vessel.type?.toLowerCase().includes(searchLower) ||
      vessel.company?.toLowerCase().includes(searchLower)
    );
  });

  // Filter work orders for search dropdown
  const filteredWorkOrdersForSearch = workOrders.filter((wo) => {
    const searchLower = workOrderSearchTerm.toLowerCase();
    return (
      wo.shipyard_wo_number?.toLowerCase().includes(searchLower) ||
      wo.customer_wo_number?.toLowerCase().includes(searchLower)
    );
  });

  const handleVesselSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVesselSearchTerm(e.target.value);
    setShowVesselDropdown(true);
    if (selectedVesselId) {
      setSelectedVesselId(0);
      setSelectedWorkOrderId(0);
      setWorkOrders([]);
    }
  };

  const handleVesselSelectFromDropdown = (vessel: Vessel) => {
    setSelectedVesselId(vessel.id);
    setVesselSearchTerm(`${vessel.name} - ${vessel.type} (${vessel.company})`);
    setShowVesselDropdown(false);
    setSelectedWorkOrderId(0);
    setWorkOrderSearchTerm("");
    setCurrentPage(1);
    fetchWorkOrdersForVessel(vessel.id);
  };

  const handleClearVesselSearch = () => {
    setVesselSearchTerm("");
    setSelectedVesselId(0);
    setShowVesselDropdown(false);
    setSelectedWorkOrderId(0);
    setWorkOrderSearchTerm("");
    setWorkOrders([]);
    setCurrentPage(1);
  };

  const handleWorkOrderSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWorkOrderSearchTerm(e.target.value);
    setShowWorkOrderDropdown(true);
    if (selectedWorkOrderId) {
      setSelectedWorkOrderId(0);
    }
  };

  const handleWorkOrderSelectFromDropdown = (workOrder: WorkOrder) => {
    setSelectedWorkOrderId(workOrder.id);
    setWorkOrderSearchTerm(workOrder.shipyard_wo_number || "");
    setShowWorkOrderDropdown(false);
    setCurrentPage(1);
  };

  const handleClearWorkOrderSearch = () => {
    setWorkOrderSearchTerm("");
    setSelectedWorkOrderId(0);
    setShowWorkOrderDropdown(false);
    setCurrentPage(1);
  };

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
    ),
    location:location_id (
      id,
      location
    ),
    work_scope:work_scope_id (
      id,
      work_scope
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
      navigate(`/work-details/add/${workOrderId}`);
    } else if (selectedWorkOrderId > 0) {
      navigate(`/work-details/add/${selectedWorkOrderId}`);
    } else {
      navigate("/work-details/add");
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

  // Pagination component
  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages = [];
    const maxVisiblePages = 5;

    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

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
          <div className="flex gap-3">
            <button
              onClick={fetchWorkDetails}
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-all duration-200 flex items-center gap-2 shadow-sm"
            >
              🔄 Refresh
            </button>
            {(profile?.role === "PPIC" || profile?.role === "MASTER") && (
              <button
                onClick={() => {
                  if (workOrderId) {
                    navigate(`/work-details/add/${workOrderId}`);
                  } else if (selectedWorkOrderId > 0) {
                    navigate(`/work-details/add/${selectedWorkOrderId}`);
                  } else {
                    navigate("/work-details/add");
                  }
                }}
                className="bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-2 rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 flex items-center gap-2 shadow-md"
              >
                ➕ Add Work Details
              </button>
            )}
          </div>
        </div>
      )}

      {/* Compact Filter Section - Only show when not filtering by specific work order */}
      {!workOrderId && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Vessel Filter with Search */}
            <div className="flex-1 relative" ref={vesselDropdownRef}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Vessel
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={vesselSearchTerm}
                  onChange={handleVesselSearch}
                  onFocus={() => setShowVesselDropdown(true)}
                  placeholder="Search vessel..."
                  disabled={loadingVessels}
                  className="w-full px-3 py-2 pr-8 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {vesselSearchTerm && (
                  <button
                    onClick={handleClearVesselSearch}
                    className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Vessel Dropdown */}
              {showVesselDropdown && filteredVesselsForSearch.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredVesselsForSearch.map((vessel) => (
                    <div
                      key={vessel.id}
                      onClick={() => handleVesselSelectFromDropdown(vessel)}
                      className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                        selectedVesselId === vessel.id ? "bg-blue-100" : ""
                      }`}
                    >
                      <div className="font-medium text-gray-900 text-sm">
                        {vessel.name}
                      </div>
                      <div className="text-xs text-gray-600">
                        {vessel.type} • {vessel.company}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Work Order Filter with Search */}
            <div className="flex-1 relative" ref={workOrderDropdownRef}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Work Order
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={workOrderSearchTerm}
                  onChange={handleWorkOrderSearch}
                  onFocus={() => setShowWorkOrderDropdown(true)}
                  placeholder={
                    selectedVesselId === 0
                      ? "Select vessel first"
                      : "Search work order..."
                  }
                  disabled={loadingWorkOrders || selectedVesselId === 0}
                  className="w-full px-3 py-2 pr-8 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {workOrderSearchTerm && (
                  <button
                    onClick={handleClearWorkOrderSearch}
                    className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Work Order Dropdown */}
              {showWorkOrderDropdown &&
                selectedVesselId > 0 &&
                filteredWorkOrdersForSearch.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredWorkOrdersForSearch.map((workOrder) => (
                      <div
                        key={workOrder.id}
                        onClick={() =>
                          handleWorkOrderSelectFromDropdown(workOrder)
                        }
                        className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                          selectedWorkOrderId === workOrder.id
                            ? "bg-blue-100"
                            : ""
                        }`}
                      >
                        <div className="font-medium text-gray-900 text-sm">
                          {workOrder.shipyard_wo_number}
                        </div>
                        {workOrder.customer_wo_number && (
                          <div className="text-xs text-gray-600">
                            Customer: {workOrder.customer_wo_number}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Work Details Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
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
                <div className="flex gap-2">
                  {(profile?.role === "PPIC" || profile?.role === "MASTER") && (
                    <button
                      onClick={() => {
                        if (workOrderId) {
                          navigate(`/work-details/add/${workOrderId}`);
                        } else {
                          navigate("/work-details/add");
                        }
                      }}
                      className="bg-gradient-to-r from-green-600 to-green-700 text-white px-4 py-2 rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 flex items-center gap-2 shadow-sm text-sm"
                    >
                      ➕ Add Work Details
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {workDetails.length > 0 ? (
            <>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      <div className="flex items-center gap-1">Details</div>
                    </th>
                    {!workOrderId && (
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Work Order / Vessel
                      </th>
                    )}
                    <th
                      onClick={() => handleSort("description")}
                      className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        Description {getSortIcon("description")}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort("target_close_date")}
                      className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        Target Date {getSortIcon("target_close_date")}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Progress
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {workDetails.map((detail) => {
                    const status = getStatus(detail);
                    const isExpanded = expandedRows.has(detail.id);

                    return (
                      <>
                        {/* Main Row */}
                        <tr key={detail.id} className="hover:bg-gray-50">
                          {/* Expand Button */}
                          <td className="px-6 py-4">
                            <button
                              onClick={() => toggleRowExpansion(detail.id)}
                              className="flex items-center gap-2 text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors"
                            >
                              <span
                                className={`transform transition-transform duration-200 ${
                                  isExpanded ? "rotate-90" : ""
                                }`}
                              >
                                ▶️
                              </span>
                              <span className="text-xs text-gray-500">
                                {isExpanded ? "Hide" : "Show"}
                              </span>
                            </button>
                          </td>

                          {/* Work Order & Vessel */}
                          {!workOrderId && (
                            <td className="px-6 py-4 whitespace-nowrap">
                              {detail.work_order && (
                                <div className="space-y-1">
                                  <div className="text-sm font-medium text-gray-900">
                                    {detail.work_order.shipyard_wo_number}
                                  </div>
                                  {detail.work_order.vessel && (
                                    <div className="text-xs text-gray-500">
                                      🚢 {detail.work_order.vessel.name}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          )}

                          {/* Description */}
                          <td className="px-6 py-4">
                            <div className="max-w-md">
                              <div
                                className="text-sm font-medium text-gray-900 mb-1"
                                title={detail.description}
                              >
                                {detail.description.length > 60
                                  ? `${detail.description.substring(0, 60)}...`
                                  : detail.description}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                  👤 {detail.pic}
                                </span>
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${status.color}`}
                                >
                                  {status.icon} {status.text}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Target Date */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              🎯 {formatDate(detail.target_close_date)}
                            </div>
                          </td>

                          {/* Progress */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
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
                              </div>
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="flex justify-center gap-2">
                              <button
                                onClick={() => handleEditWorkDetails(detail.id)}
                                className="text-blue-600 hover:text-blue-900 transition-colors p-1 rounded hover:bg-blue-50"
                                title="Edit"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteWorkDetails(detail)}
                                className="text-red-600 hover:text-red-900 transition-colors p-1 rounded hover:bg-red-50"
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Details Row */}
                        {isExpanded && (
                          <tr>
                            <td
                              colSpan={workOrderId ? 5 : 6}
                              className="px-0 py-0"
                            >
                              <div className="bg-gray-50 border-l-4 border-blue-400">
                                <div className="px-6 py-4">
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Left Column - Work Details */}
                                    <div className="space-y-4">
                                      <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                        🔧 Work Details
                                      </h4>

                                      {/* Work Scope & Type */}
                                      <div className="bg-white rounded-lg border border-gray-200 p-3">
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                          <div>
                                            <span className="text-gray-500 text-xs">
                                              Work Scope:
                                            </span>
                                            <div className="font-medium text-gray-900 mt-0.5">
                                              {detail.work_scope?.work_scope ||
                                                "N/A"}
                                            </div>
                                          </div>
                                          <div>
                                            <span className="text-gray-500 text-xs">
                                              Type:
                                            </span>
                                            <div className="font-medium text-gray-900 mt-0.5">
                                              {detail.work_type || "N/A"}
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Quantity & Location */}
                                      <div className="bg-white rounded-lg border border-gray-200 p-3">
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                          <div>
                                            <span className="text-gray-500 text-xs">
                                              Quantity:
                                            </span>
                                            <div className="font-bold text-blue-900 text-lg mt-0.5">
                                              {detail.quantity || 0}{" "}
                                              <span className="text-sm text-blue-700 font-medium">
                                                {detail.uom || ""}
                                              </span>
                                            </div>
                                          </div>
                                          <div>
                                            <span className="text-gray-500 text-xs">
                                              Location:
                                            </span>
                                            <div className="font-medium text-green-900 mt-0.5">
                                              📍{" "}
                                              {detail.location?.location ||
                                                "N/A"}
                                            </div>
                                            {detail.work_location && (
                                              <div className="text-md text-gray-600 mt-0.5">
                                                {detail.work_location}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* SPK/SPKK Numbers */}
                                      {(detail.spk_number ||
                                        detail.spkk_number) && (
                                        <div className="bg-white rounded-lg border border-gray-200 p-3">
                                          <div className="space-y-2 text-sm">
                                            {detail.spk_number && (
                                              <div>
                                                <span className="text-gray-500 text-xs">
                                                  SPK Number:
                                                </span>
                                                <div className="font-medium text-gray-900 mt-0.5">
                                                  {detail.spk_number}
                                                </div>
                                              </div>
                                            )}
                                            {detail.spkk_number && (
                                              <div>
                                                <span className="text-gray-500 text-xs">
                                                  SPKK Number:
                                                </span>
                                                <div className="font-medium text-gray-900 mt-0.5">
                                                  {detail.spkk_number}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}

                                      {/* Additional Info */}
                                      <div className="bg-white rounded-lg border border-gray-200 p-3">
                                        <div className="space-y-2 text-sm">
                                          <div>
                                            <span className="text-gray-500 text-xs">
                                              Period Close Target:
                                            </span>
                                            <div className="font-medium text-gray-900 mt-0.5">
                                              {detail.period_close_target}
                                            </div>
                                          </div>
                                          {detail.is_additional_wo_details && (
                                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800">
                                              ➕ Additional Work
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Notes */}
                                      {detail.notes && (
                                        <div className="bg-white rounded-lg border border-gray-200 p-3">
                                          <span className="text-gray-500 text-xs">
                                            📝 Notes:
                                          </span>
                                          <div className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">
                                            {detail.notes}
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Right Column - Timeline & Progress */}
                                    <div className="space-y-4">
                                      <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                        📊 Timeline & Progress
                                      </h4>

                                      {/* Timeline */}
                                      <div className="bg-white rounded-lg border border-gray-200 p-3">
                                        <div className="space-y-3">
                                          {/* Planned */}
                                          <div className="bg-gray-50 p-2 rounded">
                                            <div className="font-semibold text-gray-700 text-xs mb-1.5">
                                              📋 Planned
                                            </div>
                                            <div className="space-y-1 text-sm">
                                              <div className="flex justify-between">
                                                <span className="text-gray-500">
                                                  Start:
                                                </span>
                                                <span className="font-medium text-gray-900">
                                                  {formatDate(
                                                    detail.planned_start_date
                                                  )}
                                                </span>
                                              </div>
                                              <div className="flex justify-between">
                                                <span className="text-gray-500">
                                                  Target:
                                                </span>
                                                <span className="font-medium text-gray-900">
                                                  {formatDate(
                                                    detail.target_close_date
                                                  )}
                                                </span>
                                              </div>
                                            </div>
                                          </div>

                                          {/* Actual */}
                                          <div className="bg-blue-50 p-2 rounded border border-blue-200">
                                            <div className="font-semibold text-blue-700 text-xs mb-1.5">
                                              ✅ Actual
                                            </div>
                                            <div className="space-y-1 text-sm">
                                              <div className="flex justify-between">
                                                <span className="text-blue-600">
                                                  Started:
                                                </span>
                                                <span className="font-medium text-blue-900">
                                                  {formatDate(
                                                    detail.actual_start_date ||
                                                      null
                                                  )}
                                                </span>
                                              </div>
                                              <div className="flex justify-between">
                                                <span className="text-green-600">
                                                  Closed:
                                                </span>
                                                <span className="font-medium text-green-900">
                                                  {formatDate(
                                                    detail.actual_close_date ||
                                                      null
                                                  )}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Work Permit Status */}
                                      <div className="bg-white rounded-lg border border-gray-200 p-3">
                                        <div className="text-xs text-gray-500 mb-2">
                                          Work Permit Status
                                        </div>
                                        {detail.storage_path ? (
                                          <button
                                            onClick={() =>
                                              handleViewPermit(detail)
                                            }
                                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                                          >
                                            📄 View Work Permit
                                          </button>
                                        ) : (
                                          <div className="text-center py-2 px-3 bg-red-50 text-red-700 text-sm font-medium rounded-lg border border-red-200">
                                            ❌ No permit uploaded
                                          </div>
                                        )}
                                      </div>

                                      {/* Progress Section */}
                                      <div className="bg-white rounded-lg border border-gray-200 p-3">
                                        <div className="flex items-center justify-between mb-3">
                                          <span className="text-xs text-gray-500">
                                            Work Progress
                                          </span>
                                          <span className="text-2xl">
                                            {getProgressIcon(
                                              detail.current_progress || 0
                                            )}
                                          </span>
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="relative mb-3">
                                          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                                            <div
                                              className={`h-4 rounded-full transition-all duration-500 ${getProgressColor(
                                                detail.current_progress || 0
                                              )} flex items-center justify-center`}
                                              style={{
                                                width: `${Math.max(
                                                  detail.current_progress || 0,
                                                  10
                                                )}%`,
                                              }}
                                            >
                                              <span className="text-white text-xs font-bold drop-shadow">
                                                {detail.current_progress || 0}%
                                              </span>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Progress Info */}
                                        <div className="flex items-center justify-between mb-3 text-xs text-gray-600">
                                          <span>
                                            {detail.progress_count || 0} report
                                            {(detail.progress_count || 0) !== 1
                                              ? "s"
                                              : ""}
                                          </span>
                                          {detail.latest_progress_date && (
                                            <span>
                                              Last:{" "}
                                              {formatDate(
                                                detail.latest_progress_date
                                              )}
                                            </span>
                                          )}
                                        </div>

                                        {/* Progress Actions */}
                                        <div className="grid grid-cols-2 gap-2">
                                          <button
                                            onClick={() =>
                                              handleViewProgress(detail.id)
                                            }
                                            className="px-3 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors font-medium"
                                          >
                                            📊 View Progress
                                          </button>
                                          <button
                                            onClick={() =>
                                              handleAddProgress(detail.id)
                                            }
                                            className="px-3 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 transition-colors font-medium"
                                          >
                                            ➕ Add Progress
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
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
