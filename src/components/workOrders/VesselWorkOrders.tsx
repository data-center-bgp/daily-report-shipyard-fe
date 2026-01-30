import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  supabase,
  type WorkOrderWithDetails,
  type WorkDetailsWithProgress,
} from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { ActivityLogService } from "../../services/activityLogService";
import {
  AlertTriangle,
  ArrowLeft,
  Lock,
  Info,
  Plus,
  Ship,
  Search,
  RefreshCw,
  FileText,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Circle,
  ChevronRight,
  Settings,
  Eye,
  Edit,
  Trash2,
  User,
  Wrench,
  Package,
  Calendar,
  Target,
  Play,
  MapPin,
  ClipboardList,
} from "lucide-react";

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
  location?: {
    id: number;
    location: string;
  };
  work_scope?: {
    id: number;
    work_scope: string;
  };
}

// Define the work order type with progress properties
interface WorkOrderWithProgress extends Omit<
  WorkOrderWithDetails,
  "work_details"
> {
  work_details: WorkDetailWithProgress[];
  overall_progress: number;
  has_progress_data: boolean;
}

export default function VesselWorkOrders() {
  const { vesselId } = useParams<{ vesselId: string }>();
  const navigate = useNavigate();
  const { isReadOnly } = useAuth();

  const [vessel, setVessel] = useState<VesselData | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrderWithProgress[]>([]);
  const [filteredWorkOrders, setFilteredWorkOrders] = useState<
    WorkOrderWithProgress[]
  >([]);
  const [expandedWorkOrders, setExpandedWorkOrders] = useState<Set<number>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<
    "shipyard_wo_date" | "shipyard_wo_number"
  >("shipyard_wo_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [workOrderToDelete, setWorkOrderToDelete] =
    useState<WorkOrderWithProgress | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
              ),
              location:location_id (
                id,
                location
              ),
              work_scope:work_scope_id (
                id,
                work_scope
              )
            ),
            vessel (
              id,
              name,
              type,
              company
            )
          `,
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
                  new Date(a.report_date).getTime(),
              );

              const latestProgress =
                sortedProgress[0]?.progress_percentage || 0;
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
              0,
            );
            overallProgress = Math.round(
              totalProgress / workDetailsWithProgress.length,
            );
            hasProgressData = workDetailsWithProgress.some(
              (detail: WorkDetailWithProgress) => detail.current_progress > 0,
            );
          }

          return {
            ...wo,
            work_details: workDetailsWithProgress,
            overall_progress: overallProgress,
            has_progress_data: hasProgressData,
          } as WorkOrderWithProgress;
        },
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
              safeIncludes(detail.location?.location) ||
              safeIncludes(detail.pic),
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
    if (isReadOnly) {
      alert("You don't have permission to add work orders");
      return;
    }
    navigate("/add-work-order", {
      state: { preselectedVesselId: vesselId },
    });
  };

  const handleEditWorkOrder = (workOrder: WorkOrderWithProgress) => {
    navigate(`/edit-work-order/${workOrder.id}`);
  };

  const handleDeleteWorkOrder = (workOrder: WorkOrderWithProgress) => {
    if (isReadOnly) {
      alert("You don't have permission to delete work orders");
      return;
    }
    setWorkOrderToDelete(workOrder);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!workOrderToDelete) return;

    try {
      setIsDeleting(true);

      // First, soft delete all associated work details
      const { data: workDetailsData, error: detailsError } = await supabase
        .from("work_details")
        .update({ deleted_at: new Date().toISOString() })
        .eq("work_order_id", workOrderToDelete.id)
        .select();

      if (detailsError) throw detailsError;

      // Log activity for each deleted work detail
      if (workDetailsData && workDetailsData.length > 0) {
        for (const detail of workDetailsData) {
          await ActivityLogService.logActivity({
            action: "delete",
            tableName: "work_details",
            recordId: detail.id,
            oldData: detail,
            description: `Soft deleted work detail: ${detail.description} (via work order deletion)`,
          });
        }
      }

      // Then, soft delete the work order
      const { data: workOrderData, error: workOrderError } = await supabase
        .from("work_order")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", workOrderToDelete.id)
        .select()
        .single();

      if (workOrderError) throw workOrderError;

      // Log activity for work order deletion
      if (workOrderData) {
        await ActivityLogService.logActivity({
          action: "delete",
          tableName: "work_order",
          recordId: workOrderData.id,
          oldData: workOrderData,
          description: `Soft deleted work order ${workOrderToDelete.shipyard_wo_number}`,
        });
      }

      // Refresh the list
      fetchVesselWorkOrders();

      // Close modal and reset state
      setShowDeleteModal(false);
      setWorkOrderToDelete(null);
    } catch (err) {
      console.error("Error deleting work order:", err);
      setError(
        err instanceof Error ? err.message : "An error occurred while deleting",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setWorkOrderToDelete(null);
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
    if (progress >= 100)
      return <CheckCircle2 className="w-4 h-4 text-green-600" />;
    if (progress >= 75)
      return <Circle className="w-4 h-4 text-blue-600 fill-blue-600" />;
    if (progress >= 50)
      return <Circle className="w-4 h-4 text-yellow-600 fill-yellow-600" />;
    if (progress >= 25)
      return <Circle className="w-4 h-4 text-orange-600 fill-orange-600" />;
    return <Circle className="w-4 h-4 text-red-600 fill-red-600" />;
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
    if (sortField !== field)
      return <ArrowUpDown className="w-4 h-4 text-gray-400" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="w-4 h-4 text-blue-600" />
    ) : (
      <ArrowDown className="w-4 h-4 text-blue-600" />
    );
  };

  const renderDeleteModal = () => {
    if (!showDeleteModal || !workOrderToDelete) return null;

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity"
          onClick={cancelDelete}
        ></div>

        {/* Modal */}
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full transform transition-all">
            {/* Header */}
            <div className="bg-red-600 px-6 py-4 rounded-t-lg">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-white" />
                <h3 className="text-xl font-bold text-white">Confirm Delete</h3>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-6">
              <p className="text-gray-700 text-base mb-4">
                Are you sure you want to delete work order{" "}
                <strong>"{workOrderToDelete.shipyard_wo_number}"</strong>?
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800">
                  <strong>Warning:</strong> This will also soft delete all
                  associated work details (
                  {workOrderToDelete.work_details.length} item
                  {workOrderToDelete.work_details.length !== 1 ? "s" : ""}).
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 rounded-b-lg flex gap-3 justify-end">
              <button
                onClick={cancelDelete}
                disabled={isDeleting}
                className="px-5 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" /> Delete Work Order
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
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
      {/* Delete Modal */}
      {renderDeleteModal()}

      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/work-orders")}
              className="text-blue-600 hover:text-blue-800 flex items-center gap-2 transition-colors font-medium"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </button>
          </div>

          {/* Read-Only Badge */}
          {isReadOnly && (
            <span className="px-3 py-1.5 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-full border border-yellow-200 flex items-center gap-1.5">
              <Lock className="w-4 h-4" /> Read Only Access
            </span>
          )}

          {/* Add Work Order Button - Hide for MANAGER */}
          {!isReadOnly && (
            <button
              onClick={handleAddWorkOrder}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 font-medium shadow-md"
            >
              <Plus className="w-5 h-5" /> Add Work Order
            </button>
          )}
        </div>

        {/* Read-Only Info Banner */}
        {isReadOnly && (
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-yellow-900">Read-Only Mode</p>
                <p className="text-sm text-yellow-700 mt-1">
                  You can view work orders but cannot create, edit, or delete
                  them.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Vessel Info Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-4">
          <Ship className="w-10 h-10 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{vessel.name}</h1>
            <p className="text-gray-600">
              {vessel.type} • {vessel.company}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {filteredWorkOrders.length} work order
              {filteredWorkOrders.length !== 1 ? "s" : ""}
              {searchTerm && ` (filtered from ${workOrders.length})`}
              {isReadOnly && " • Viewing only"}
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
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchVesselWorkOrders}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Work Info
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
                    Additional Info
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
                              <ChevronRight className="w-4 h-4" />
                            </span>
                            <FileText className="w-5 h-5 text-blue-600" />
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

                      {/* Work Order Numbers */}
                      <td className="px-6 py-4">
                        <div className="space-y-2">
                          <div>
                            <div className="text-xs text-gray-500 font-medium">
                              Shipyard WO
                            </div>
                            <div className="text-sm font-semibold text-gray-900">
                              {wo.shipyard_wo_number}
                            </div>
                          </div>
                          {wo.customer_wo_number && (
                            <div>
                              <div className="text-xs text-gray-500 font-medium">
                                Customer WO
                              </div>
                              <div className="text-sm text-gray-700">
                                {wo.customer_wo_number}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Work Info */}
                      <td className="px-6 py-4">
                        <div className="space-y-2">
                          {wo.work_type && (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Settings className="w-3 h-3" /> Type:
                              </span>
                              <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                {wo.work_type}
                              </span>
                            </div>
                          )}
                          {wo.work_location && (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> Location:
                              </span>
                              <span className="text-xs text-gray-700">
                                {wo.work_location}
                              </span>
                            </div>
                          )}
                          {!wo.work_type && !wo.work_location && (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </div>
                      </td>

                      {/* Dates */}
                      <td className="px-6 py-4">
                        <div className="space-y-2">
                          <div>
                            <div className="text-xs text-gray-500">
                              Shipyard WO Date
                            </div>
                            <div className="text-sm font-medium text-gray-900">
                              {formatDate(wo.shipyard_wo_date)}
                            </div>
                          </div>
                          {wo.customer_wo_date && (
                            <div>
                              <div className="text-xs text-gray-500">
                                Customer WO Date
                              </div>
                              <div className="text-sm text-gray-700">
                                {formatDate(wo.customer_wo_date)}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Additional Info */}
                      <td className="px-6 py-4">
                        <div className="space-y-2">
                          {wo.is_additional_wo && (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                                <AlertTriangle className="w-3 h-3" /> Additional
                                WO
                              </span>
                            </div>
                          )}
                          {wo.kapro_id && (
                            <div className="text-xs text-gray-600 flex items-center gap-1">
                              <User className="w-3 h-3" /> Kapro ID:{" "}
                              {wo.kapro_id}
                            </div>
                          )}
                          <div className="text-xs text-gray-400">
                            Created: {formatDate(wo.created_at)}
                          </div>
                          {wo.updated_at && wo.updated_at !== wo.created_at && (
                            <div className="text-xs text-gray-400">
                              Updated: {formatDate(wo.updated_at)}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Overall Progress */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {wo.has_progress_data ? (
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-[100px]">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-gray-700">
                                  {wo.overall_progress}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(
                                    wo.overall_progress,
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

                      {/* Status */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
                            wo,
                          )}`}
                        >
                          {getStatus(wo)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEditWorkOrder(wo)}
                            className={`${
                              isReadOnly
                                ? "text-blue-600 hover:text-blue-900"
                                : "text-green-600 hover:text-green-900"
                            } transition-colors p-1 rounded hover:bg-gray-50`}
                            title={
                              isReadOnly ? "View Work Order" : "Edit Work Order"
                            }
                          >
                            {isReadOnly ? (
                              <Eye className="w-4 h-4" />
                            ) : (
                              <Edit className="w-4 h-4" />
                            )}
                          </button>

                          {/* Hide Delete button for MANAGER */}
                          {!isReadOnly && (
                            <button
                              onClick={() => handleDeleteWorkOrder(wo)}
                              className="text-red-600 hover:text-red-900 transition-colors p-1 rounded hover:bg-red-50"
                              title="Delete Work Order"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expandable Work Details Rows */}
                    {expandedWorkOrders.has(wo.id) && (
                      <tr>
                        <td colSpan={8} className="px-0 py-0">
                          <div className="bg-gray-50 border-l-4 border-blue-400">
                            <div className="px-6 py-4">
                              <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                                <Wrench className="w-4 h-4" /> Work Details for{" "}
                                {wo.shipyard_wo_number}
                              </h4>

                              {wo.work_details.length > 0 ? (
                                <div className="space-y-3">
                                  {wo.work_details.map((detail) => (
                                    <div
                                      key={detail.id}
                                      className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow"
                                    >
                                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                        <div className="lg:col-span-2">
                                          <div className="flex items-start gap-3">
                                            <span className="text-lg">
                                              {getProgressIcon(
                                                detail.current_progress,
                                              )}
                                            </span>
                                            <div className="flex-1">
                                              <h5 className="font-medium text-gray-900 mb-2">
                                                {detail.description}
                                              </h5>
                                              <div className="space-y-1 text-sm text-gray-600">
                                                {detail.location && (
                                                  <div className="flex items-center gap-1">
                                                    <MapPin className="w-4 h-4 text-gray-600" />
                                                    <span className="font-medium">
                                                      Location:
                                                    </span>
                                                    <span>
                                                      {detail.location.location}
                                                    </span>
                                                  </div>
                                                )}
                                                {detail.work_scope && (
                                                  <div className="flex items-center gap-1">
                                                    <Wrench className="w-4 h-4 text-gray-600" />
                                                    <span className="font-medium">
                                                      Work Scope:
                                                    </span>
                                                    <span>
                                                      {
                                                        detail.work_scope
                                                          .work_scope
                                                      }
                                                    </span>
                                                  </div>
                                                )}
                                                {detail.quantity && (
                                                  <div className="flex items-center gap-1">
                                                    <Package className="w-4 h-4 text-gray-600" />
                                                    <span className="font-medium">
                                                      Quantity:
                                                    </span>
                                                    <span>
                                                      {detail.quantity}{" "}
                                                      {detail.uom || ""}
                                                    </span>
                                                  </div>
                                                )}
                                                {detail.pic && (
                                                  <div className="flex items-center gap-1">
                                                    <User className="w-4 h-4 text-gray-600" />
                                                    <span className="font-medium">
                                                      PIC:
                                                    </span>
                                                    <span>{detail.pic}</span>
                                                  </div>
                                                )}
                                                {detail.planned_start_date && (
                                                  <div className="flex items-center gap-1">
                                                    <Calendar className="w-4 h-4 text-gray-600" />
                                                    <span className="font-medium">
                                                      Planned Start:
                                                    </span>
                                                    <span>
                                                      {formatDate(
                                                        detail.planned_start_date,
                                                      )}
                                                    </span>
                                                  </div>
                                                )}
                                                {detail.target_close_date && (
                                                  <div className="flex items-center gap-1">
                                                    <Target className="w-4 h-4 text-gray-600" />
                                                    <span className="font-medium">
                                                      Target Close:
                                                    </span>
                                                    <span>
                                                      {formatDate(
                                                        detail.target_close_date,
                                                      )}
                                                    </span>
                                                  </div>
                                                )}
                                                {detail.actual_start_date && (
                                                  <div className="flex items-center gap-1">
                                                    <Play className="w-4 h-4 text-gray-600" />
                                                    <span className="font-medium">
                                                      Actual Start:
                                                    </span>
                                                    <span>
                                                      {formatDate(
                                                        detail.actual_start_date,
                                                      )}
                                                    </span>
                                                  </div>
                                                )}
                                                {detail.actual_close_date && (
                                                  <div className="flex items-center gap-1">
                                                    <CheckCircle2 className="w-4 h-4 text-gray-600" />
                                                    <span className="font-medium">
                                                      Actual Close:
                                                    </span>
                                                    <span>
                                                      {formatDate(
                                                        detail.actual_close_date,
                                                      )}
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </div>

                                        <div className="lg:col-span-1">
                                          <div className="text-center">
                                            <div className="text-lg font-bold text-gray-900 mb-2">
                                              {detail.current_progress}%
                                            </div>
                                            <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                                              <div
                                                className={`h-3 rounded-full transition-all duration-300 ${getProgressColor(
                                                  detail.current_progress,
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
                                                  detail.latest_progress_date,
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
                                  <ClipboardList className="w-16 h-16 text-gray-400 mx-auto mb-2" />
                                  <p>No work details added yet</p>
                                  {!isReadOnly && (
                                    <button
                                      onClick={() =>
                                        navigate(`/work-order/${wo.id}`)
                                      }
                                      className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
                                    >
                                      Add work details →
                                    </button>
                                  )}
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
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
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
                {!isReadOnly && (
                  <button
                    onClick={handleAddWorkOrder}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Add Work Order for{" "}
                    {vessel.name}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
