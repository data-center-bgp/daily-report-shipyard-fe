import { useState, useEffect, useCallback, Fragment } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  supabase,
  type WorkOrderWithDetails,
  type WorkDetailsWithProgress,
} from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { ActivityLogService } from "../../services/activityLogService";
import { getLatestProgressRecord } from "../../utils/progressPercentage";
import { isWorkOrderFullyCompleted } from "../../utils/workOrderCompletion";
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
  X,
  Ban,
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
  const location = useLocation();
  const { isOperationsReadOnly, isShippingCreateOnly, profile } = useAuth();
  // ADMIN_SHIPPING can create work orders/details here but never edit/delete
  // one, and has no Progress access at all.
  const canEditHere = !isOperationsReadOnly && !isShippingCreateOnly;
  // Adding a progress report is PRODUCTION's job specifically (MASTER keeps
  // the usual superuser override) — narrower than canEditHere, which also
  // covers PPIC editing its own work-detail planning fields.
  const canWriteProgress =
    profile?.role === "MASTER" || profile?.role === "PRODUCTION";

  const [vessel, setVessel] = useState<VesselData | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrderWithProgress[]>([]);
  const [filteredWorkOrders, setFilteredWorkOrders] = useState<
    WorkOrderWithProgress[]
  >([]);
  // Set (and scrolled to) when arriving here from a work-order-number search
  // elsewhere, so the target work order is easy to spot in the full list.
  const [highlightedWorkOrderId, setHighlightedWorkOrderId] = useState<
    number | null
  >(null);
  const [expandedWorkOrders, setExpandedWorkOrders] = useState<Set<number>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  // Hides work orders whose work details are all 100% complete by default —
  // this page is mainly used to track work still in progress. Toggled back
  // on to look up finished work orders (e.g. for BASTP/invoice history).
  const [showCompleted, setShowCompleted] = useState(false);
  // Per-work-order search term for filtering the work details shown inside
  // its expanded section, keyed by work order id.
  const [detailSearchTerms, setDetailSearchTerms] = useState<
    Record<number, string>
  >({});
  // Per-work-order "Additional Work" filter for the same expanded section —
  // "" = all, "yes" = additional work details only, "no" = original only.
  const [detailAdditionalWoFilters, setDetailAdditionalWoFilters] = useState<
    Record<number, string>
  >({});
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
            ),
            kapro:kapro_id (
              id,
              kapro_name
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

              // Latest by report_date, tie-broken by created_at — sorting on
              // report_date alone left same-day entries in whatever order
              // the query happened to return them, which could show an
              // earlier same-day report (e.g. 10%) instead of a later one
              // (e.g. 100%) for the same work detail.
              const latest = getLatestProgressRecord(progressRecords);

              const latestProgress = latest?.progress_percentage || 0;
              const latestProgressDate = latest?.report_date;

              return {
                ...detail,
                current_progress: latestProgress,
                latest_progress_date: latestProgressDate,
                progress_count: progressRecords.length,
              };
            });

          // Calculate overall work order progress — cancelled work details
          // are excluded from the average (they're still shown in the list
          // below, just don't count toward completion).
          let overallProgress = 0;
          let hasProgressData = false;

          const activeForAverage = workDetailsWithProgress.filter(
            (detail: WorkDetailWithProgress) => !detail.cancelled_at,
          );

          if (activeForAverage.length > 0) {
            // Average progress across all active (non-cancelled) work details
            const totalProgress = activeForAverage.reduce(
              (sum: number, detail: WorkDetailWithProgress) =>
                sum + (detail.current_progress || 0),
              0,
            );
            overallProgress = Math.round(
              totalProgress / activeForAverage.length,
            );
            hasProgressData = activeForAverage.some(
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

  // Filter work orders based on search term — scoped to work order level
  // information only. Searching within a work order's own work details is
  // handled by the per-work-order filter inside its expanded section.
  useEffect(() => {
    let filtered = workOrders;

    if (!showCompleted) {
      filtered = filtered.filter((wo) => !isWorkOrderFullyCompleted(wo.work_details));
    }

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = workOrders.filter((wo) => {
        const safeIncludes = (value: string | null | undefined) => {
          return value?.toLowerCase().includes(searchLower) || false;
        };

        return (
          safeIncludes(wo.shipyard_wo_number) ||
          safeIncludes(wo.customer_wo_number) ||
          safeIncludes(wo.work_type) ||
          safeIncludes(wo.work_location) ||
          safeIncludes(wo.kapro?.kapro_name)
        );
      });
    }

    setFilteredWorkOrders(filtered);
  }, [workOrders, searchTerm, showCompleted]);

  useEffect(() => {
    if (vesselId) {
      fetchVesselWorkOrders();
    }
  }, [fetchVesselWorkOrders, vesselId]);

  // Arriving here from a work-order-number search elsewhere: expand and
  // scroll to the specific work order that was searched for, then clear the
  // nav state so a later refresh doesn't keep re-triggering it.
  useEffect(() => {
    const targetId = (location.state as { highlightWorkOrderId?: number })
      ?.highlightWorkOrderId;
    if (!targetId || workOrders.length === 0) return;
    const targetWo = workOrders.find((wo) => wo.id === targetId);
    if (!targetWo) return;

    // The target might be hidden behind the "hide completed" default —
    // reveal it so the deep link actually lands on the work order.
    if (isWorkOrderFullyCompleted(targetWo.work_details)) {
      setShowCompleted(true);
    }

    setExpandedWorkOrders((prev) => new Set(prev).add(targetId));
    setHighlightedWorkOrderId(targetId);

    const timer = setTimeout(() => {
      document
        .getElementById(`work-order-row-${targetId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);

    navigate(location.pathname, {
      replace: true,
      state: { vesselName: (location.state as { vesselName?: string })?.vesselName },
    });

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrders]);

  const completedCount = workOrders.filter((wo) =>
    isWorkOrderFullyCompleted(wo.work_details),
  ).length;

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
    if (isOperationsReadOnly) {
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
    if (!canEditHere) {
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
          {isOperationsReadOnly && (
            <span className="px-3 py-1.5 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-full border border-yellow-200 flex items-center gap-1.5">
              <Lock className="w-4 h-4" /> Read Only Access
            </span>
          )}
          {isShippingCreateOnly && (
            <span className="px-3 py-1.5 bg-blue-100 text-blue-800 text-sm font-medium rounded-full border border-blue-200 flex items-center gap-1.5">
              <Lock className="w-4 h-4" /> Create Only
            </span>
          )}

          {/* Add Work Order Button - Hide for MANAGER */}
          {!isOperationsReadOnly && (
            <button
              onClick={handleAddWorkOrder}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 font-medium shadow-md"
            >
              <Plus className="w-5 h-5" /> Add Work Order
            </button>
          )}
        </div>

        {/* Read-Only Info Banner */}
        {isOperationsReadOnly && (
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

        {/* Create-Only Info Banner (ADMIN_SHIPPING) */}
        {isShippingCreateOnly && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-blue-900">Create-Only Mode</p>
                <p className="text-sm text-blue-700 mt-1">
                  You can create work orders and work details, but cannot
                  edit or delete them once created.
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
              {isOperationsReadOnly && " • Viewing only"}
            </p>
          </div>
        </div>
      </div>

      {/* Progress Summary — always reflects every work order on this vessel,
          regardless of the "hide completed" filter below. */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                In Progress
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {workOrders.length - completedCount}
              </p>
            </div>
            <Play className="w-8 h-8 text-yellow-500" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-gray-900">
                {completedCount}
              </p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
        </div>
      </div>

      {/* Search and Actions */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by WO number, work type, location, or Kapro..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              Show completed work orders
              {completedCount > 0 && ` (${completedCount})`}
            </label>
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
                {filteredWorkOrders.map((wo) => {
                  const isExpanded = expandedWorkOrders.has(wo.id);

                  // Filter this work order's own work details list by its
                  // own scoped search box (independent of the page-level
                  // search above).
                  const detailSearchTerm = (
                    detailSearchTerms[wo.id] || ""
                  ).toLowerCase();
                  const detailAdditionalWoFilter =
                    detailAdditionalWoFilters[wo.id] || "";
                  const visibleDetails = wo.work_details
                    .filter((detail) => {
                      if (!detailSearchTerm) return true;
                      const safeIncludes = (
                        value: string | null | undefined,
                      ) => value?.toLowerCase().includes(detailSearchTerm) || false;
                      return (
                        safeIncludes(detail.description) ||
                        safeIncludes(detail.location?.location) ||
                        safeIncludes(detail.work_scope?.work_scope) ||
                        safeIncludes(detail.pic)
                      );
                    })
                    .filter((detail) => {
                      if (detailAdditionalWoFilter === "yes") {
                        return detail.is_additional_wo_details;
                      }
                      if (detailAdditionalWoFilter === "no") {
                        return !detail.is_additional_wo_details;
                      }
                      return true;
                    });

                  return (
                  <Fragment key={wo.id}>
                    {/* Main Work Order Row */}
                    <tr
                      id={`work-order-row-${wo.id}`}
                      className={`hover:bg-gray-50 ${
                        highlightedWorkOrderId === wo.id
                          ? "bg-yellow-50 ring-2 ring-inset ring-yellow-400"
                          : ""
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleWorkOrderExpansion(wo.id)}
                            className="flex items-center gap-2 text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors"
                          >
                            <span
                              className={`transform transition-transform duration-200 ${
                                isExpanded ? "rotate-90" : ""
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
                              <User className="w-3 h-3" /> Kapro:{" "}
                              {wo.kapro?.kapro_name ?? wo.kapro_id}
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
                              !canEditHere
                                ? "text-blue-600 hover:text-blue-900"
                                : "text-green-600 hover:text-green-900"
                            } transition-colors p-1 rounded hover:bg-gray-50`}
                            title={
                              !canEditHere ? "View Work Order" : "Edit Work Order"
                            }
                          >
                            {!canEditHere ? (
                              <Eye className="w-4 h-4" />
                            ) : (
                              <Edit className="w-4 h-4" />
                            )}
                          </button>

                          {/* Hide Delete button for MANAGER/HSSE/OP_HEAD/ADMIN_SHIPPING */}
                          {canEditHere && (
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
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="px-0 py-0">
                          <div className="bg-gray-50 border-l-4 border-blue-400">
                            <div className="px-6 py-4">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                                  <Wrench className="w-4 h-4" /> Work Details
                                  for {wo.shipyard_wo_number}
                                </h4>
                                {!isOperationsReadOnly && (
                                  <button
                                    onClick={() =>
                                      navigate(`/work-details/add/${wo.id}`)
                                    }
                                    className="bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 text-sm font-medium"
                                  >
                                    <Plus className="w-3.5 h-3.5" /> Add Work
                                    Detail
                                  </button>
                                )}
                              </div>

                              {wo.work_details.length > 0 && (
                                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                                  <div className="relative max-w-sm flex-1">
                                    <input
                                      type="text"
                                      value={detailSearchTerms[wo.id] || ""}
                                      onChange={(e) =>
                                        setDetailSearchTerms((prev) => ({
                                          ...prev,
                                          [wo.id]: e.target.value,
                                        }))
                                      }
                                      placeholder="Filter these work details by description, scope, location, or PIC..."
                                      className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                    <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-gray-400" />
                                    {detailSearchTerms[wo.id] && (
                                      <button
                                        onClick={() =>
                                          setDetailSearchTerms((prev) => ({
                                            ...prev,
                                            [wo.id]: "",
                                          }))
                                        }
                                        className="absolute right-2 top-1.5 text-gray-400 hover:text-gray-600"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                  <select
                                    value={detailAdditionalWoFilters[wo.id] || ""}
                                    onChange={(e) =>
                                      setDetailAdditionalWoFilters((prev) => ({
                                        ...prev,
                                        [wo.id]: e.target.value,
                                      }))
                                    }
                                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                  >
                                    <option value="">All work details</option>
                                    <option value="yes">Additional only</option>
                                    <option value="no">Original only</option>
                                  </select>
                                </div>
                              )}

                              {visibleDetails.length > 0 ? (
                                <div className="space-y-3">
                                  {visibleDetails.map((detail) => (
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
                                              <h5 className="font-medium text-gray-900 mb-2 flex items-center gap-2 flex-wrap">
                                                {detail.description}
                                                {detail.is_additional_wo_details && (
                                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                                                    <AlertTriangle className="w-3 h-3" />{" "}
                                                    Additional Work
                                                  </span>
                                                )}
                                                {detail.cancelled_at && (
                                                  <span
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-600"
                                                    title={
                                                      detail.cancellation_reason
                                                        ? `Reason: ${detail.cancellation_reason}`
                                                        : undefined
                                                    }
                                                  >
                                                    <Ban className="w-3 h-3" />{" "}
                                                    Cancelled
                                                  </span>
                                                )}
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

                                      {/* Work Detail Actions */}
                                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                                        {canEditHere && (
                                          <button
                                            onClick={() =>
                                              navigate(
                                                `/edit-work-details/${detail.id}`,
                                                {
                                                  state: {
                                                    returnTo: `/vessel/${vesselId}/work-orders`,
                                                  },
                                                },
                                              )
                                            }
                                            className="text-xs font-medium text-green-700 hover:text-green-900 bg-green-50 hover:bg-green-100 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                          >
                                            <Edit className="w-3.5 h-3.5" />{" "}
                                            Edit Details
                                          </button>
                                        )}
                                        {canWriteProgress &&
                                          !detail.cancelled_at && (
                                          <button
                                            onClick={() =>
                                              navigate(
                                                `/add-work-progress/${detail.id}`,
                                                {
                                                  state: {
                                                    returnTo: `/vessel/${vesselId}/work-orders`,
                                                  },
                                                },
                                              )
                                            }
                                            className="text-xs font-medium text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                          >
                                            <Plus className="w-3.5 h-3.5" />{" "}
                                            Add Progress
                                          </button>
                                        )}
                                        <button
                                          onClick={() =>
                                            navigate(
                                              `/work-details/${detail.id}/progress`,
                                              {
                                                state: {
                                                  returnTo: `/vessel/${vesselId}/work-orders`,
                                                },
                                              },
                                            )
                                          }
                                          className="text-xs font-medium text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                        >
                                          <Eye className="w-3.5 h-3.5" />{" "}
                                          {canWriteProgress
                                            ? "View / Edit Progress"
                                            : "View Progress"}
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : wo.work_details.length > 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                  <ClipboardList className="w-16 h-16 text-gray-400 mx-auto mb-2" />
                                  <p>
                                    {detailSearchTerms[wo.id]
                                      ? `No work details match "${detailSearchTerms[wo.id]}"`
                                      : "No work details match this filter"}
                                  </p>
                                  <button
                                    onClick={() => {
                                      setDetailSearchTerms((prev) => ({
                                        ...prev,
                                        [wo.id]: "",
                                      }));
                                      setDetailAdditionalWoFilters((prev) => ({
                                        ...prev,
                                        [wo.id]: "",
                                      }));
                                    }}
                                    className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
                                  >
                                    Clear filter
                                  </button>
                                </div>
                              ) : (
                                <div className="text-center py-8 text-gray-500">
                                  <ClipboardList className="w-16 h-16 text-gray-400 mx-auto mb-2" />
                                  <p>No work details added yet</p>
                                  {!isOperationsReadOnly && (
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
                  </Fragment>
                  );
                })}
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
            ) : !showCompleted && completedCount > 0 ? (
              <>
                <p className="text-gray-500 text-lg mb-2">
                  All {completedCount} work order
                  {completedCount !== 1 ? "s are" : " is"} fully completed
                </p>
                <p className="text-gray-400 text-sm mb-4">
                  They're hidden by default — nothing left in progress here.
                </p>
                <button
                  onClick={() => setShowCompleted(true)}
                  className="text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Show completed work orders
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
                {!isOperationsReadOnly && (
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
