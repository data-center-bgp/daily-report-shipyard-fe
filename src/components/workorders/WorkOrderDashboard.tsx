// src/components/workorders/WorkOrderTable.tsx

import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase, type WorkOrder } from "../../lib/supabase";

// Add interface for progress data
interface WorkOrderWithProgress extends WorkOrder {
  current_progress?: number;
  has_progress_data?: boolean;
}

interface WorkOrderStats {
  totalWorkOrders: number;
  inProgress: number;
  completed: number;
  pendingDocuments: number;
  overdueWorkOrders: number;
  readyToStart: number;
  planned: number;
}

interface VesselSummary {
  id: number;
  name: string;
  type: string;
  company: string;
  totalWorkOrders: number;
  activeWorkOrders: number;
  completedWorkOrders: number;
  pendingDocuments: number;
  overdueWorkOrders: number;
}

export default function WorkOrderTable() {
  const [workOrders, setWorkOrders] = useState<WorkOrderWithProgress[]>([]);
  const [vessels, setVessels] = useState<VesselSummary[]>([]);
  const [filteredVessels, setFilteredVessels] = useState<VesselSummary[]>([]);
  const [stats, setStats] = useState<WorkOrderStats>({
    totalWorkOrders: 0,
    inProgress: 0,
    completed: 0,
    pendingDocuments: 0,
    overdueWorkOrders: 0,
    readyToStart: 0,
    planned: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  // Vessel search and pagination
  const [vesselSearchTerm, setVesselSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [vesselsPerPage] = useState(12); // Show 12 vessels per page
  const [sortBy, setSortBy] = useState<
    "name" | "totalWorkOrders" | "activeWorkOrders" | "overdueWorkOrders"
  >("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const navigate = useNavigate();
  const location = useLocation();

  const fetchWorkOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      console.log("Fetching work orders with progress and vessel data...");

      // Fetch work orders with their latest progress AND vessel data
      const { data, error } = await supabase.from("work_order").select(`
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
        `);

      if (error) throw error;

      // Process the data to get latest progress for each work order
      const workOrdersWithProgress = (data || []).map((wo) => {
        const progressRecords = wo.project_progress || [];

        if (progressRecords.length === 0) {
          return {
            ...wo,
            current_progress: 0,
            has_progress_data: false,
          };
        }

        // Sort progress records by date (newest first) and get the latest progress
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
      });

      console.log("Work orders with progress:", workOrdersWithProgress);
      setWorkOrders(workOrdersWithProgress);

      // Calculate statistics
      calculateStats(workOrdersWithProgress);

      // Group by vessels
      groupWorkOrdersByVessel(workOrdersWithProgress);
    } catch (err) {
      console.error("Error fetching work orders:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  const calculateStats = (workOrders: WorkOrderWithProgress[]) => {
    const totalWorkOrders = workOrders.length;

    let inProgress = 0;
    let completed = 0;
    let readyToStart = 0;
    let planned = 0;
    let overdueWorkOrders = 0;

    const pendingDocuments = workOrders.filter(
      (wo) => !wo.wo_document_status
    ).length;
    const today = new Date();

    workOrders.forEach((wo) => {
      // Check if overdue
      const targetDate = new Date(wo.target_close_date);
      if (targetDate < today && wo.current_progress < 100) {
        overdueWorkOrders++;
      }

      // Determine status
      if (wo.has_progress_data) {
        if (wo.current_progress === 100) {
          completed++;
        } else if (wo.current_progress > 0) {
          inProgress++;
        } else {
          // No progress yet, check dates
          if (new Date(wo.planned_start_date) <= today) {
            readyToStart++;
          } else {
            planned++;
          }
        }
      } else {
        // No progress data, check actual dates
        if (wo.actual_close_date) {
          completed++;
        } else if (wo.actual_start_date) {
          inProgress++;
        } else if (new Date(wo.planned_start_date) <= today) {
          readyToStart++;
        } else {
          planned++;
        }
      }
    });

    setStats({
      totalWorkOrders,
      inProgress,
      completed,
      pendingDocuments,
      overdueWorkOrders,
      readyToStart,
      planned,
    });
  };

  const groupWorkOrdersByVessel = (workOrders: WorkOrderWithProgress[]) => {
    // Group work orders by vessel
    const vesselMap = new Map();

    workOrders.forEach((wo) => {
      const vesselId = wo.vessel?.id;
      if (!vesselId) return;

      if (!vesselMap.has(vesselId)) {
        vesselMap.set(vesselId, {
          id: vesselId,
          name: wo.vessel.name,
          type: wo.vessel.type,
          company: wo.vessel.company,
          workOrders: [],
        });
      }
      vesselMap.get(vesselId).workOrders.push(wo);
    });

    // Calculate vessel summaries
    const vesselSummaries = Array.from(vesselMap.values()).map((vessel) => {
      const workOrders = vessel.workOrders;
      const today = new Date();

      return {
        id: vessel.id,
        name: vessel.name,
        type: vessel.type,
        company: vessel.company,
        totalWorkOrders: workOrders.length,
        activeWorkOrders: workOrders.filter(
          (wo) =>
            (wo.has_progress_data &&
              wo.current_progress > 0 &&
              wo.current_progress < 100) ||
            (!wo.has_progress_data &&
              wo.actual_start_date &&
              !wo.actual_close_date)
        ).length,
        completedWorkOrders: workOrders.filter(
          (wo) =>
            (wo.has_progress_data && wo.current_progress === 100) ||
            (!wo.has_progress_data && wo.actual_close_date)
        ).length,
        pendingDocuments: workOrders.filter((wo) => !wo.wo_document_status)
          .length,
        overdueWorkOrders: workOrders.filter((wo) => {
          const targetDate = new Date(wo.target_close_date);
          return targetDate < today && wo.current_progress < 100;
        }).length,
      };
    });

    setVessels(vesselSummaries);
  };

  // Filter and sort vessels
  useEffect(() => {
    let filtered = vessels;

    // Apply search filter
    if (vesselSearchTerm) {
      const searchLower = vesselSearchTerm.toLowerCase();
      filtered = vessels.filter(
        (vessel) =>
          vessel.name.toLowerCase().includes(searchLower) ||
          vessel.type.toLowerCase().includes(searchLower) ||
          vessel.company.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortBy) {
        case "name":
          aValue = a.name;
          bValue = b.name;
          break;
        case "totalWorkOrders":
          aValue = a.totalWorkOrders;
          bValue = b.totalWorkOrders;
          break;
        case "activeWorkOrders":
          aValue = a.activeWorkOrders;
          bValue = b.activeWorkOrders;
          break;
        case "overdueWorkOrders":
          aValue = a.overdueWorkOrders;
          bValue = b.overdueWorkOrders;
          break;
        default:
          aValue = a.name;
          bValue = b.name;
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortDirection === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        return sortDirection === "asc"
          ? (aValue as number) - (bValue as number)
          : (bValue as number) - (aValue as number);
      }
    });

    setFilteredVessels(filtered);
    setCurrentPage(1); // Reset to first page when search/sort changes
  }, [vessels, vesselSearchTerm, sortBy, sortDirection]);

  // Pagination logic
  const totalPages = Math.ceil(filteredVessels.length / vesselsPerPage);
  const startIndex = (currentPage - 1) * vesselsPerPage;
  const endIndex = startIndex + vesselsPerPage;
  const currentVessels = filteredVessels.slice(startIndex, endIndex);

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDirection("asc");
    }
  };

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

  const handleAddWorkOrder = () => {
    navigate("/add-work-order");
  };

  const handleVesselClick = (vesselId: number, vesselName: string) => {
    navigate(`/vessel/${vesselId}/work-orders`, {
      state: { vesselName },
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-medium">Error Loading Dashboard</h3>
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
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div className="flex gap-3">
          <button
            onClick={fetchWorkOrders}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            🔄 Refresh
          </button>
          <button
            onClick={handleAddWorkOrder}
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            ➕ Add Work Order
          </button>
        </div>
      </div>

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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.totalWorkOrders}
              </p>
            </div>
            <span className="text-blue-500 text-xl">📋</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">In Progress</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.inProgress}
              </p>
            </div>
            <span className="text-yellow-500 text-xl">🔧</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.completed}
              </p>
            </div>
            <span className="text-green-500 text-xl">✅</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Ready to Start
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.readyToStart}
              </p>
            </div>
            <span className="text-purple-500 text-xl">🚀</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-gray-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Planned</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.planned}
              </p>
            </div>
            <span className="text-gray-500 text-xl">📅</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Docs</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.pendingDocuments}
              </p>
            </div>
            <span className="text-orange-500 text-xl">📄</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Overdue</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.overdueWorkOrders}
              </p>
            </div>
            <span className="text-red-500 text-xl">⚠️</span>
          </div>
        </div>
      </div>

      {/* Vessels List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Vessels</h2>
              <p className="text-gray-600 text-sm">
                Click on a vessel to view its work orders (
                {filteredVessels.length} of {vessels.length} vessels)
              </p>
            </div>

            {/* Search and Sort Controls */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search vessels..."
                  value={vesselSearchTerm}
                  onChange={(e) => setVesselSearchTerm(e.target.value)}
                  className="w-full sm:w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span className="absolute left-3 top-2.5 text-gray-400">
                  🔍
                </span>
              </div>

              <select
                value={`${sortBy}-${sortDirection}`}
                onChange={(e) => {
                  const [field, direction] = e.target.value.split("-");
                  setSortBy(field as typeof sortBy);
                  setSortDirection(direction as "asc" | "desc");
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
                <option value="totalWorkOrders-desc">Most Work Orders</option>
                <option value="totalWorkOrders-asc">Least Work Orders</option>
                <option value="activeWorkOrders-desc">Most Active</option>
                <option value="overdueWorkOrders-desc">Most Overdue</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-6">
          {currentVessels.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {currentVessels.map((vessel) => (
                  <div
                    key={vessel.id}
                    onClick={() => handleVesselClick(vessel.id, vessel.name)}
                    className="border border-gray-200 rounded-lg p-6 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center">
                        <span className="text-2xl mr-3">🚢</span>
                        <div>
                          <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                            {vessel.name}
                          </h3>
                          <p className="text-sm text-gray-600">{vessel.type}</p>
                          <p className="text-sm text-gray-500">
                            {vessel.company}
                          </p>
                        </div>
                      </div>
                      <span className="text-blue-500 text-lg group-hover:text-blue-700 transition-colors">
                        →
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center">
                        <p className="text-lg font-bold text-gray-900">
                          {vessel.totalWorkOrders}
                        </p>
                        <p className="text-xs text-gray-600">Total WOs</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-yellow-600">
                          {vessel.activeWorkOrders}
                        </p>
                        <p className="text-xs text-gray-600">Active</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-green-600">
                          {vessel.completedWorkOrders}
                        </p>
                        <p className="text-xs text-gray-600">Completed</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-orange-600">
                          {vessel.pendingDocuments}
                        </p>
                        <p className="text-xs text-gray-600">Pending Docs</p>
                      </div>
                    </div>

                    {vessel.overdueWorkOrders > 0 && (
                      <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-2">
                        <p className="text-red-700 text-sm font-medium flex items-center gap-1">
                          ⚠️ {vessel.overdueWorkOrders} overdue work order
                          {vessel.overdueWorkOrders !== 1 ? "s" : ""}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Showing {startIndex + 1} to{" "}
                    {Math.min(endIndex, filteredVessels.length)} of{" "}
                    {filteredVessels.length} vessels
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setCurrentPage(Math.max(1, currentPage - 1))
                      }
                      disabled={currentPage === 1}
                      className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      ← Previous
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from(
                        { length: Math.min(5, totalPages) },
                        (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }

                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`px-3 py-2 rounded-lg ${
                                currentPage === pageNum
                                  ? "bg-blue-600 text-white"
                                  : "border border-gray-300 hover:bg-gray-50"
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        }
                      )}
                    </div>

                    <button
                      onClick={() =>
                        setCurrentPage(Math.min(totalPages, currentPage + 1))
                      }
                      disabled={currentPage === totalPages}
                      className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <span className="text-gray-400 text-4xl mb-4 block">🚢</span>
              {vesselSearchTerm ? (
                <>
                  <p className="text-gray-500 text-lg mb-2">
                    No vessels found matching "{vesselSearchTerm}"
                  </p>
                  <button
                    onClick={() => setVesselSearchTerm("")}
                    className="text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    Clear search
                  </button>
                </>
              ) : (
                <>
                  <p className="text-gray-500 text-lg mb-2">
                    No vessels with work orders found
                  </p>
                  <p className="text-gray-400 text-sm mb-4">
                    Add some work orders to get started
                  </p>
                  <button
                    onClick={handleAddWorkOrder}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors inline-flex items-center gap-2"
                  >
                    ➕ Add Your First Work Order
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
