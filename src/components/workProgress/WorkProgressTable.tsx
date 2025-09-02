import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  supabase,
  type Vessel,
  type WorkOrder,
  type WorkDetails,
} from "../../lib/supabase";
import { openProgressEvidence } from "../../utils/progressEvidenceHandler";

interface WorkProgressWithDetails {
  id: number;
  progress_percentage: number;
  report_date: string;
  evidence_url?: string;
  storage_path?: string;
  created_at: string;
  work_details: {
    id: number;
    description: string;
    location?: string;
    work_order: {
      id: number;
      shipyard_wo_number: string;
      vessel: {
        id: number;
        name: string;
        type: string;
      };
    };
  };
  profiles: {
    id: number;
    name: string;
    email: string;
  };
}

interface WorkProgressTableProps {
  workDetailsId?: number;
  embedded?: boolean;
}

export default function WorkProgressTable({
  workDetailsId,
  embedded = false,
}: WorkProgressTableProps) {
  const navigate = useNavigate();

  // Data states
  const [workProgress, setWorkProgress] = useState<WorkProgressWithDetails[]>(
    []
  );
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [workDetailsList, setWorkDetailsList] = useState<WorkDetails[]>([]);

  // Filter states
  const [selectedVesselId, setSelectedVesselId] = useState<number>(0);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<number>(0);
  const [selectedWorkDetailsIdFilter, setSelectedWorkDetailsIdFilter] =
    useState<number>(workDetailsId || 0);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 10;

  // Loading and error states
  const [loading, setLoading] = useState(true);
  const [loadingVessels, setLoadingVessels] = useState(false);
  const [loadingWorkOrders, setLoadingWorkOrders] = useState(false);
  const [loadingWorkDetails, setLoadingWorkDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New state to track maximum progress for each work detail
  const [maxProgressByWorkDetail, setMaxProgressByWorkDetail] = useState<
    Record<number, number>
  >({});

  // Fetch initial data
  useEffect(() => {
    if (!workDetailsId) {
      fetchVessels();
    }
    fetchWorkProgress();
  }, [workDetailsId]);

  // Fetch work orders when vessel changes
  useEffect(() => {
    if (selectedVesselId > 0) {
      fetchWorkOrders(selectedVesselId);
    } else {
      setWorkOrders([]);
      setSelectedWorkOrderId(0);
    }
  }, [selectedVesselId]);

  // Fetch work details when work order changes
  useEffect(() => {
    if (selectedWorkOrderId > 0) {
      fetchWorkDetails(selectedWorkOrderId);
    } else {
      setWorkDetailsList([]);
      if (!workDetailsId) {
        setSelectedWorkDetailsIdFilter(0);
      }
    }
  }, [selectedWorkOrderId, workDetailsId]);

  // Fetch progress when filters or page changes
  useEffect(() => {
    fetchWorkProgress();
    setCurrentPage(1); // Reset to first page when filters change
  }, [selectedVesselId, selectedWorkOrderId, selectedWorkDetailsIdFilter]);

  useEffect(() => {
    fetchWorkProgress();
  }, [currentPage]);

  const fetchVessels = async () => {
    try {
      setLoadingVessels(true);
      const { data, error } = await supabase
        .from("vessel")
        .select("id, name, type, company")
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

  const fetchWorkOrders = async (vesselId: number) => {
    try {
      setLoadingWorkOrders(true);
      const { data, error } = await supabase
        .from("work_order")
        .select("id, shipyard_wo_number, shipyard_wo_date")
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

  const fetchWorkDetails = async (workOrderId: number) => {
    try {
      setLoadingWorkDetails(true);
      const { data, error } = await supabase
        .from("work_details")
        .select("id, description, location, pic")
        .eq("work_order_id", workOrderId)
        .is("deleted_at", null)
        .order("description", { ascending: true });

      if (error) throw error;
      setWorkDetailsList(data || []);
    } catch (err) {
      console.error("Error fetching work details:", err);
    } finally {
      setLoadingWorkDetails(false);
    }
  };

  const fetchWorkProgress = async () => {
    try {
      setLoading(true);
      setError(null);

      // Build the query with filters
      let query = supabase.from("work_progress").select(
        `
          id,
          progress_percentage,
          report_date,
          evidence_url,
          storage_path,
          created_at,
          work_details (
            id,
            description,
            location,
            work_order (
              id,
              shipyard_wo_number,
              vessel (
                id,
                name,
                type
              )
            )
          ),
          profiles (
            id,
            name,
            email
          )
        `,
        { count: "exact" }
      );

      // Apply filters
      if (selectedWorkDetailsIdFilter > 0) {
        query = query.eq("work_details_id", selectedWorkDetailsIdFilter);
      } else if (selectedWorkOrderId > 0) {
        // Filter by work order - need to join through work_details
        const { data: workDetailsInOrder } = await supabase
          .from("work_details")
          .select("id")
          .eq("work_order_id", selectedWorkOrderId);

        if (workDetailsInOrder && workDetailsInOrder.length > 0) {
          const workDetailsIds = workDetailsInOrder.map((wd) => wd.id);
          query = query.in("work_details_id", workDetailsIds);
        } else {
          // No work details found for this work order
          setWorkProgress([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }
      } else if (selectedVesselId > 0) {
        // Filter by vessel - need to join through work_order and work_details
        const { data: workOrdersInVessel } = await supabase
          .from("work_order")
          .select("id")
          .eq("vessel_id", selectedVesselId);

        if (workOrdersInVessel && workOrdersInVessel.length > 0) {
          const workOrderIds = workOrdersInVessel.map((wo) => wo.id);
          const { data: workDetailsInVessel } = await supabase
            .from("work_details")
            .select("id")
            .in("work_order_id", workOrderIds);

          if (workDetailsInVessel && workDetailsInVessel.length > 0) {
            const workDetailsIds = workDetailsInVessel.map((wd) => wd.id);
            query = query.in("work_details_id", workDetailsIds);
          } else {
            // No work details found for this vessel
            setWorkProgress([]);
            setTotalCount(0);
            setLoading(false);
            return;
          }
        } else {
          // No work orders found for this vessel
          setWorkProgress([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }
      }

      // Apply pagination
      const startIndex = (currentPage - 1) * itemsPerPage;
      query = query
        .order("report_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(startIndex, startIndex + itemsPerPage - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      const progressData = data || [];
      setWorkProgress(progressData);
      setTotalCount(count || 0);

      // Calculate maximum progress for each work detail
      await calculateMaxProgress(progressData);
    } catch (err) {
      console.error("Error fetching work progress:", err);
      setError("Failed to load work progress data");
    } finally {
      setLoading(false);
    }
  };

  // New function to calculate maximum progress for each work detail
  const calculateMaxProgress = async (
    currentProgressData: WorkProgressWithDetails[]
  ) => {
    try {
      // Get all unique work detail IDs from current data
      const workDetailIds = [
        ...new Set(currentProgressData.map((item) => item.work_details.id)),
      ];

      if (workDetailIds.length === 0) {
        setMaxProgressByWorkDetail({});
        return;
      }

      // Fetch maximum progress for each work detail
      const { data: maxProgressData, error } = await supabase
        .from("work_progress")
        .select("work_details_id, progress_percentage")
        .in("work_details_id", workDetailIds)
        .order("progress_percentage", { ascending: false });

      if (error) {
        console.error("Error fetching max progress:", error);
        return;
      }

      // Create a map of work_details_id to maximum progress
      const maxProgressMap: Record<number, number> = {};

      if (maxProgressData) {
        // Group by work_details_id and get the maximum progress for each
        workDetailIds.forEach((workDetailId) => {
          const progressReports = maxProgressData.filter(
            (item) => item.work_details_id === workDetailId
          );
          if (progressReports.length > 0) {
            maxProgressMap[workDetailId] = Math.max(
              ...progressReports.map((item) => item.progress_percentage)
            );
          }
        });
      }

      setMaxProgressByWorkDetail(maxProgressMap);
    } catch (err) {
      console.error("Error calculating max progress:", err);
    }
  };

  const handleVesselChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const vesselId = parseInt(e.target.value);
    setSelectedVesselId(vesselId);
    setSelectedWorkOrderId(0);
    setSelectedWorkDetailsIdFilter(0);
  };

  const handleWorkOrderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const workOrderId = parseInt(e.target.value);
    setSelectedWorkOrderId(workOrderId);
    setSelectedWorkDetailsIdFilter(0);
  };

  const handleWorkDetailsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const workDetailsId = parseInt(e.target.value);
    setSelectedWorkDetailsIdFilter(workDetailsId);
  };

  const clearFilters = () => {
    setSelectedVesselId(0);
    setSelectedWorkOrderId(0);
    setSelectedWorkDetailsIdFilter(workDetailsId || 0);
    setCurrentPage(1);
  };

  // Updated function to check if progress can be added
  const canAddProgress = (workDetailsId: number): boolean => {
    const maxProgress = maxProgressByWorkDetail[workDetailsId] || 0;
    return maxProgress < 100;
  };

  // Updated function to handle clicking on progress to add new report
  const handleAddProgressFromCurrent = async (
    progressItem: WorkProgressWithDetails
  ) => {
    const workDetailsId = progressItem.work_details.id;

    // Check if work is already completed
    if (!canAddProgress(workDetailsId)) {
      alert(
        "❌ Cannot add progress report. This work detail has already reached 100% completion."
      );
      return;
    }

    try {
      // Get current work details data for pre-filling
      const { data: workDetailsData, error: workDetailsError } = await supabase
        .from("work_details")
        .select(
          `
          id,
          description,
          location,
          pic,
          work_order (
            id,
            shipyard_wo_number,
            vessel (
              id,
              name,
              type
            )
          )
        `
        )
        .eq("id", workDetailsId)
        .single();

      if (workDetailsError) throw workDetailsError;

      // Navigate to add progress page with pre-filled data
      navigate(`/add-work-progress/${workDetailsId}`, {
        state: {
          workDetails: workDetailsData,
          currentProgress: progressItem.progress_percentage,
          lastReportDate: progressItem.report_date,
          prefillData: {
            vesselName: progressItem.work_details.work_order.vessel.name,
            workOrderNumber:
              progressItem.work_details.work_order.shipyard_wo_number,
            workDescription: progressItem.work_details.description,
            location: progressItem.work_details.location,
            currentProgressPercentage:
              maxProgressByWorkDetail[workDetailsId] ||
              progressItem.progress_percentage,
            suggestedNextProgress: Math.min(
              (maxProgressByWorkDetail[workDetailsId] ||
                progressItem.progress_percentage) + 10,
              100
            ), // Suggest 10% increment from max progress
          },
        },
      });
    } catch (err) {
      console.error("Error fetching work details:", err);
      alert("Failed to load work details. Please try again.");
    }
  };

  const handleAddProgressFromNoResults = async () => {
    // If we have a specific work details selected, get its data and pass it
    if (selectedWorkDetailsIdFilter > 0) {
      try {
        // Fetch the selected work details data
        const { data: workDetailsData, error: workDetailsError } =
          await supabase
            .from("work_details")
            .select(
              `
          id,
          description,
          location,
          pic,
          planned_start_date,
          target_close_date,
          period_close_target,
          work_order (
            id,
            shipyard_wo_number,
            shipyard_wo_date,
            vessel (
              id,
              name,
              type,
              company
            )
          )
        `
            )
            .eq("id", selectedWorkDetailsIdFilter)
            .single();

        if (workDetailsError) throw workDetailsError;

        // Navigate with comprehensive pre-filled data
        navigate(`/add-work-progress/${selectedWorkDetailsIdFilter}`, {
          state: {
            workDetails: workDetailsData,
            currentProgress: 0, // No existing progress
            lastReportDate: null, // No previous reports
            prefillData: {
              // Vessel information
              vesselId: workDetailsData.work_order.vessel.id,
              vesselName: workDetailsData.work_order.vessel.name,
              vesselType: workDetailsData.work_order.vessel.type,
              vesselCompany: workDetailsData.work_order.vessel.company,

              // Work order information
              workOrderId: workDetailsData.work_order.id,
              workOrderNumber: workDetailsData.work_order.shipyard_wo_number,
              workOrderDate: workDetailsData.work_order.shipyard_wo_date,

              // Work details information
              workDetailsId: selectedWorkDetailsIdFilter,
              workDescription: workDetailsData.description,
              location: workDetailsData.location,
              pic: workDetailsData.pic,
              plannedStartDate: workDetailsData.planned_start_date,
              targetCloseDate: workDetailsData.target_close_date,
              periodCloseTarget: workDetailsData.period_close_target,

              // Progress information
              currentProgressPercentage: 0,
              lastProgressPercentage: 0,
              suggestedNextProgress: 10, // Start with 10%

              // Context information
              fromProgressTable: true,
              fromNoResults: true,
              isFirstProgress: true,
            },
          },
        });
      } catch (err) {
        console.error("Error fetching work details:", err);
        alert("Failed to load work details. Please try again.");
      }
    } else if (selectedWorkOrderId > 0) {
      // If work order is selected but no specific work details, go to general add with work order context
      try {
        const { data: workOrderData, error: workOrderError } = await supabase
          .from("work_order")
          .select(
            `
          id,
          shipyard_wo_number,
          shipyard_wo_date,
          vessel (
            id,
            name,
            type,
            company
          )
        `
          )
          .eq("id", selectedWorkOrderId)
          .single();

        if (workOrderError) throw workOrderError;

        navigate("/add-work-progress", {
          state: {
            prefillData: {
              vesselId: workOrderData.vessel.id,
              vesselName: workOrderData.vessel.name,
              vesselType: workOrderData.vessel.type,
              vesselCompany: workOrderData.vessel.company,
              workOrderId: selectedWorkOrderId,
              workOrderNumber: workOrderData.shipyard_wo_number,
              workOrderDate: workOrderData.shipyard_wo_date,
              fromProgressTable: true,
              fromNoResults: true,
              preSelectWorkOrder: true,
            },
          },
        });
      } catch (err) {
        console.error("Error fetching work order:", err);
        alert("Failed to load work order. Please try again.");
      }
    } else if (selectedVesselId > 0) {
      // If vessel is selected, go to general add with vessel context
      const selectedVessel = vessels.find((v) => v.id === selectedVesselId);
      if (selectedVessel) {
        navigate("/add-work-progress", {
          state: {
            prefillData: {
              vesselId: selectedVesselId,
              vesselName: selectedVessel.name,
              vesselType: selectedVessel.type,
              vesselCompany: selectedVessel.company,
              fromProgressTable: true,
              fromNoResults: true,
              preSelectVessel: true,
            },
          },
        });
      } else {
        navigate("/add-work-progress");
      }
    } else {
      // No filters applied, go to general add page
      navigate("/add-work-progress");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return "bg-green-100 text-green-800 border-green-200";
    if (progress >= 75) return "bg-blue-100 text-blue-800 border-blue-200";
    if (progress >= 50)
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    if (progress >= 25)
      return "bg-orange-100 text-orange-800 border-orange-200";
    return "bg-red-100 text-red-800 border-red-200";
  };

  const getProgressIcon = (progress: number) => {
    if (progress >= 100) return "✅";
    if (progress >= 75) return "🔵";
    if (progress >= 50) return "🟡";
    if (progress >= 25) return "🟠";
    return "🔴";
  };

  const handleEvidenceClick = async (storagePath?: string) => {
    if (!storagePath) {
      alert("No evidence file path available");
      return;
    }

    try {
      await openProgressEvidence(storagePath);
    } catch (error) {
      console.error("Error opening evidence:", error);
      alert("Could not open evidence file. Please try again later.");
    }
  };

  // Pagination calculations
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage + 1;
  const endIndex = Math.min(currentPage * itemsPerPage, totalCount);

  // Pagination component
  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-1 justify-between sm:hidden">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            onClick={() =>
              setCurrentPage(Math.min(totalPages, currentPage + 1))
            }
            disabled={currentPage === totalPages}
            className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
        <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-700">
              Showing <span className="font-medium">{startIndex}</span> to{" "}
              <span className="font-medium">{endIndex}</span> of{" "}
              <span className="font-medium">{totalCount}</span> results
            </p>
          </div>
          <div>
            <nav
              className="isolate inline-flex -space-x-px rounded-md shadow-sm"
              aria-label="Pagination"
            >
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="sr-only">Previous</span>←
              </button>
              {pages.map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                    page === currentPage
                      ? "z-10 bg-blue-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      : "text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() =>
                  setCurrentPage(Math.min(totalPages, currentPage + 1))
                }
                disabled={currentPage === totalPages}
                className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="sr-only">Next</span>→
              </button>
            </nav>
          </div>
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <div className={`${embedded ? "" : "p-8"}`}>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error</h3>
          <p className="text-red-600 mt-1">{error}</p>
          <button
            onClick={fetchWorkProgress}
            className="mt-3 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${embedded ? "" : "p-8"}`}>
      {!embedded && (
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Work Progress Reports
              </h1>
              <p className="text-gray-600">
                Track detailed progress reports for work activities
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate("/add-work-progress")}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                ➕ Add Progress Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hierarchical Filters */}
      {!workDetailsId && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              🔍 Filter Progress Reports
            </h3>
            {(selectedVesselId > 0 ||
              selectedWorkOrderId > 0 ||
              selectedWorkDetailsIdFilter > 0) && (
              <button
                onClick={clearFilters}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                🔄 Clear Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Vessel Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🚢 Vessel
              </label>
              <select
                value={selectedVesselId}
                onChange={handleVesselChange}
                disabled={loadingVessels}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={0}>
                  {loadingVessels ? "Loading vessels..." : "All vessels"}
                </option>
                {vessels.map((vessel) => (
                  <option key={vessel.id} value={vessel.id}>
                    {vessel.name} ({vessel.type})
                  </option>
                ))}
              </select>
            </div>

            {/* Work Order Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                📋 Work Order
              </label>
              <select
                value={selectedWorkOrderId}
                onChange={handleWorkOrderChange}
                disabled={!selectedVesselId || loadingWorkOrders}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              >
                <option value={0}>
                  {loadingWorkOrders
                    ? "Loading work orders..."
                    : selectedVesselId
                    ? "All work orders"
                    : "Select vessel first"}
                </option>
                {workOrders.map((workOrder) => (
                  <option key={workOrder.id} value={workOrder.id}>
                    {workOrder.shipyard_wo_number}
                  </option>
                ))}
              </select>
            </div>

            {/* Work Details Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🔧 Work Details
              </label>
              <select
                value={selectedWorkDetailsIdFilter}
                onChange={handleWorkDetailsChange}
                disabled={!selectedWorkOrderId || loadingWorkDetails}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              >
                <option value={0}>
                  {loadingWorkDetails
                    ? "Loading work details..."
                    : selectedWorkOrderId
                    ? "All work details"
                    : "Select work order first"}
                </option>
                {workDetailsList.map((workDetails) => (
                  <option key={workDetails.id} value={workDetails.id}>
                    {workDetails.description.substring(0, 50)}
                    {workDetails.description.length > 50 ? "..." : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Active Filters Display */}
          {(selectedVesselId > 0 ||
            selectedWorkOrderId > 0 ||
            selectedWorkDetailsIdFilter > 0) && (
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-sm text-gray-500">Active filters:</span>
              {selectedVesselId > 0 && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  🚢 {vessels.find((v) => v.id === selectedVesselId)?.name}
                </span>
              )}
              {selectedWorkOrderId > 0 && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  📋{" "}
                  {
                    workOrders.find((wo) => wo.id === selectedWorkOrderId)
                      ?.shipyard_wo_number
                  }
                </span>
              )}
              {selectedWorkDetailsIdFilter > 0 && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  🔧{" "}
                  {workDetailsList
                    .find((wd) => wd.id === selectedWorkDetailsIdFilter)
                    ?.description.substring(0, 30)}
                  ...
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading work progress...</span>
        </div>
      )}

      {/* No Results */}
      {!loading && workProgress.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No Progress Reports Found
          </h3>
          <p className="text-gray-500 mb-4">
            {selectedVesselId > 0 ||
            selectedWorkOrderId > 0 ||
            selectedWorkDetailsIdFilter > 0
              ? "No progress reports match your current filters."
              : "No progress reports have been recorded yet."}
          </p>

          {/* Enhanced context message based on filters */}
          {selectedWorkDetailsIdFilter > 0 && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg max-w-md mx-auto">
              <p className="text-sm text-blue-800">
                <strong>Selected Work Details:</strong>{" "}
                {workDetailsList
                  .find((wd) => wd.id === selectedWorkDetailsIdFilter)
                  ?.description.substring(0, 50)}
                ...
              </p>
              <p className="text-xs text-blue-600 mt-1">
                Click "Add First Progress Report" to create the initial progress
                report for this work item.
              </p>
            </div>
          )}

          {selectedWorkOrderId > 0 && !selectedWorkDetailsIdFilter && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg max-w-md mx-auto">
              <p className="text-sm text-green-800">
                <strong>Selected Work Order:</strong>{" "}
                {
                  workOrders.find((wo) => wo.id === selectedWorkOrderId)
                    ?.shipyard_wo_number
                }
              </p>
              <p className="text-xs text-green-600 mt-1">
                You can add progress for any work details in this work order.
              </p>
            </div>
          )}

          {selectedVesselId > 0 && !selectedWorkOrderId && (
            <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg max-w-md mx-auto">
              <p className="text-sm text-purple-800">
                <strong>Selected Vessel:</strong>{" "}
                {vessels.find((v) => v.id === selectedVesselId)?.name}
              </p>
              <p className="text-xs text-purple-600 mt-1">
                You can add progress for any work details on this vessel.
              </p>
            </div>
          )}

          <div className="flex gap-3 justify-center">
            {(selectedVesselId > 0 ||
              selectedWorkOrderId > 0 ||
              selectedWorkDetailsIdFilter > 0) && (
              <button
                onClick={clearFilters}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Clear Filters
              </button>
            )}
            <button
              onClick={handleAddProgressFromNoResults}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              ➕{" "}
              {selectedWorkDetailsIdFilter > 0
                ? "Add First Progress Report"
                : "Add Progress Report"}
            </button>
          </div>
        </div>
      )}

      {/* Results Table */}
      {!loading && workProgress.length > 0 && (
        <>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Progress
                      <div className="text-xs text-gray-400 font-normal mt-1">
                        (Click to add new)
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Work Details
                    </th>
                    {!selectedWorkDetailsIdFilter && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Vessel & Work Order
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Report Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reported By
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Evidence
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {workProgress.map((item) => {
                    const workDetailsId = item.work_details.id;
                    const isCompleted = !canAddProgress(workDetailsId);
                    const maxProgress =
                      maxProgressByWorkDetail[workDetailsId] ||
                      item.progress_percentage;

                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          {/* Updated Clickable Progress Cell */}
                          {isCompleted ? (
                            // Disabled state for completed work
                            <div
                              className="w-full text-left p-2 rounded-lg bg-gray-50 border border-gray-200 cursor-not-allowed opacity-75"
                              title="Work detail is completed (100%). No more progress can be added."
                            >
                              <div className="flex items-center">
                                <span className="text-lg mr-2">
                                  {getProgressIcon(item.progress_percentage)}
                                </span>
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getProgressColor(
                                    item.progress_percentage
                                  )}`}
                                >
                                  {item.progress_percentage}%
                                </span>
                                <span className="ml-2 text-xs text-gray-400">
                                  ✅ Completed
                                </span>
                              </div>
                              {/* Progress Bar */}
                              <div className="mt-1 w-20">
                                <div className="bg-gray-200 rounded-full h-1.5">
                                  <div
                                    className="bg-green-600 h-1.5 rounded-full"
                                    style={{
                                      width: `${Math.min(
                                        Math.max(item.progress_percentage, 0),
                                        100
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (
                            // Clickable state for non-completed work
                            <button
                              onClick={() => handleAddProgressFromCurrent(item)}
                              className="w-full text-left group cursor-pointer hover:bg-blue-50 rounded-lg p-2 transition-all duration-200 border border-transparent hover:border-blue-200"
                              title={`Click to add new progress report based on this data (Current max: ${maxProgress}%)`}
                            >
                              <div className="flex items-center">
                                <span className="text-lg mr-2">
                                  {getProgressIcon(item.progress_percentage)}
                                </span>
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getProgressColor(
                                    item.progress_percentage
                                  )} group-hover:scale-105 transition-transform`}
                                >
                                  {item.progress_percentage}%
                                </span>
                                {maxProgress > item.progress_percentage && (
                                  <span className="ml-1 text-xs text-orange-600">
                                    (Max: {maxProgress}%)
                                  </span>
                                )}
                                <span className="ml-2 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                  ➕ Add new
                                </span>
                              </div>
                              {/* Progress Bar */}
                              <div className="mt-1 w-20">
                                <div className="bg-gray-200 rounded-full h-1.5">
                                  <div
                                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-300 group-hover:bg-blue-700"
                                    style={{
                                      width: `${Math.min(
                                        Math.max(item.progress_percentage, 0),
                                        100
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="text-sm font-medium text-gray-900">
                              {item.work_details.description}
                            </div>
                            {isCompleted && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                ✅ Complete
                              </span>
                            )}
                          </div>
                          {item.work_details.location && (
                            <div className="text-sm text-gray-500">
                              📍 {item.work_details.location}
                            </div>
                          )}
                        </td>
                        {!selectedWorkDetailsIdFilter && (
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">
                              🚢 {item.work_details.work_order.vessel.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              📋{" "}
                              {item.work_details.work_order.shipyard_wo_number}
                            </div>
                            <div className="text-xs text-gray-400">
                              {item.work_details.work_order.vessel.type}
                            </div>
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          📅 {formatDate(item.report_date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {item.profiles?.name || "Unknown User"}
                          </div>
                          {item.profiles?.email && (
                            <div className="text-xs text-gray-500">
                              {item.profiles.email}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {item.storage_path ? (
                            <button
                              onClick={() =>
                                handleEvidenceClick(item.storage_path)
                              }
                              className="text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer hover:underline"
                            >
                              📷 View Evidence
                            </button>
                          ) : (
                            <span className="text-gray-400">No evidence</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                          {formatDateTime(item.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {renderPagination()}
          </div>

          {/* Summary Stats */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg shadow border">
              <div className="flex items-center">
                <div className="text-2xl mr-3">📊</div>
                <div>
                  <div className="text-lg font-semibold text-gray-900">
                    {totalCount}
                  </div>
                  <div className="text-sm text-gray-500">Total Reports</div>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow border">
              <div className="flex items-center">
                <div className="text-2xl mr-3">📈</div>
                <div>
                  <div className="text-lg font-semibold text-gray-900">
                    {workProgress.length > 0
                      ? Math.round(
                          workProgress.reduce(
                            (sum, item) => sum + item.progress_percentage,
                            0
                          ) / workProgress.length
                        )
                      : 0}
                    %
                  </div>
                  <div className="text-sm text-gray-500">
                    Avg Progress (Current Page)
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow border">
              <div className="flex items-center">
                <div className="text-2xl mr-3">✅</div>
                <div>
                  <div className="text-lg font-semibold text-gray-900">
                    {
                      Object.values(maxProgressByWorkDetail).filter(
                        (maxProgress) => maxProgress >= 100
                      ).length
                    }
                  </div>
                  <div className="text-sm text-gray-500">
                    Completed Work Details
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow border">
              <div className="flex items-center">
                <div className="text-2xl mr-3">📷</div>
                <div>
                  <div className="text-lg font-semibold text-gray-900">
                    {workProgress.filter((item) => item.evidence_url).length}
                  </div>
                  <div className="text-sm text-gray-500">
                    With Evidence (Current Page)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
