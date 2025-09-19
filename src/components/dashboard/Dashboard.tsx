import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

interface DashboardStats {
  totalWorkOrders: number;
  inProgress: number;
  completed: number;
  planned: number;
  overdue: number;
  readyToStart: number;
  upcomingDeadlines: number;
  verificationPending: number;
  totalInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  readyForInvoicing: number;
}

interface VesselSummary {
  id: number;
  name: string;
  type: string;
  company: string;
  totalWorkOrders: number;
  inProgress: number;
  completed: number;
  planned: number;
  overallProgress: number;
  hasOverdue: boolean;
  hasUpcoming: boolean;
  readyForInvoicing: number;
  totalInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  lastActivity?: string;
}

interface WorkOrderAlert {
  id: number;
  customer_wo_number?: string;
  shipyard_wo_number?: string;
  planned_start_date?: string;
  target_close_date?: string;
  vessel_name?: string;
  vessel_company?: string;
  type:
    | "overdue"
    | "upcoming_deadline"
    | "ready_to_start"
    | "verification_pending"
    | "ready_for_invoice";
  message: string;
  priority: "high" | "medium" | "low";
  overall_progress: number;
  completion_date?: string;
}

interface WorkDetailsWithProgress {
  id: number;
  description: string;
  current_progress: number;
  verification_status: boolean;
  latest_progress_date?: string;
}

interface ProcessedWorkOrder {
  id: number;
  customer_wo_number?: string;
  shipyard_wo_number?: string;
  planned_start_date?: string;
  target_close_date?: string;
  actual_start_date?: string;
  actual_close_date?: string;
  vessel: {
    id: number;
    name: string;
    type: string;
    company: string;
  };
  work_details: WorkDetailsWithProgress[];
  overall_progress: number;
  has_progress_data: boolean;
  verification_status: boolean;
  is_fully_completed: boolean;
  has_existing_invoice: boolean;
  completion_date?: string;
}

interface DatabaseWorkDetail {
  id: number;
  description: string;
  work_progress: Array<{
    progress_percentage: number;
    report_date: string;
    evidence_url?: string;
    storage_path?: string;
    created_at: string;
  }>;
  work_verification: Array<{
    work_verification: boolean;
    verification_date: string;
  }>;
  [key: string]: unknown;
}

interface DatabaseWorkOrder {
  id: number;
  customer_wo_number?: string;
  shipyard_wo_number?: string;
  planned_start_date?: string;
  target_close_date?: string;
  actual_start_date?: string;
  actual_close_date?: string;
  work_details: DatabaseWorkDetail[];
  vessel: {
    id: number;
    name: string;
    type: string;
    company: string;
  };
  [key: string]: unknown;
}

interface DatabaseInvoice {
  work_order_id: number;
  payment_status: boolean;
  [key: string]: unknown;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalWorkOrders: 0,
    inProgress: 0,
    completed: 0,
    planned: 0,
    overdue: 0,
    readyToStart: 0,
    upcomingDeadlines: 0,
    verificationPending: 0,
    totalInvoices: 0,
    paidInvoices: 0,
    unpaidInvoices: 0,
    readyForInvoicing: 0,
  });
  const [alerts, setAlerts] = useState<WorkOrderAlert[]>([]);
  const [vesselSummaries, setVesselSummaries] = useState<VesselSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vesselViewMode, setVesselViewMode] = useState<"grid" | "list">("grid");
  const [vesselFilter, setVesselFilter] = useState<
    "all" | "active" | "completed" | "alerts"
  >("active");
  const [vesselSearchTerm, setVesselSearchTerm] = useState("");
  const [vesselSortBy, setVesselSortBy] = useState<
    "name" | "activity" | "progress" | "workOrders"
  >("activity");
  const [vesselPage, setVesselPage] = useState(1);
  const [vesselsPerPage] = useState(12);

  const navigate = useNavigate();

  // Memoized filtered vessels
  const filteredVessels = useMemo(() => {
    let filtered = vesselSummaries;

    // Apply search filter
    if (vesselSearchTerm) {
      const searchLower = vesselSearchTerm.toLowerCase();
      filtered = filtered.filter(
        (vessel) =>
          vessel.name.toLowerCase().includes(searchLower) ||
          vessel.type.toLowerCase().includes(searchLower) ||
          vessel.company.toLowerCase().includes(searchLower)
      );
    }

    // Apply status filter
    switch (vesselFilter) {
      case "active":
        filtered = filtered.filter(
          (vessel) =>
            vessel.inProgress > 0 ||
            vessel.planned > 0 ||
            vessel.readyForInvoicing > 0
        );
        break;
      case "completed":
        filtered = filtered.filter((vessel) => vessel.completed > 0);
        break;
      case "alerts":
        filtered = filtered.filter(
          (vessel) =>
            vessel.hasOverdue ||
            vessel.hasUpcoming ||
            vessel.readyForInvoicing > 0
        );
        break;
      default:
        // 'all' - no additional filtering
        break;
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (vesselSortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "progress":
          return b.overallProgress - a.overallProgress;
        case "workOrders":
          return b.totalWorkOrders - a.totalWorkOrders;
        case "activity":
        default:
          // Sort by last activity (most recent first), then by name
          if (a.lastActivity && !b.lastActivity) return -1;
          if (!a.lastActivity && b.lastActivity) return 1;
          if (a.lastActivity && b.lastActivity) {
            return (
              new Date(b.lastActivity).getTime() -
              new Date(a.lastActivity).getTime()
            );
          }
          return a.name.localeCompare(b.name);
      }
    });

    return filtered;
  }, [vesselSummaries, vesselSearchTerm, vesselFilter, vesselSortBy]);

  // Memoized pagination values
  const paginationValues = useMemo(() => {
    const totalPages = Math.ceil(filteredVessels.length / vesselsPerPage);
    const startIndex = (vesselPage - 1) * vesselsPerPage;
    const currentVessels = filteredVessels.slice(
      startIndex,
      startIndex + vesselsPerPage
    );

    return {
      totalPages,
      startIndex,
      currentVessels,
    };
  }, [filteredVessels, vesselPage, vesselsPerPage]);

  // Memoized vessel filter counts for the dropdown options
  const vesselFilterCounts = useMemo(() => {
    return {
      all: vesselSummaries.length,
      active: vesselSummaries.filter(
        (v: VesselSummary) => v.inProgress > 0 || v.planned > 0
      ).length,
      completed: vesselSummaries.filter((v: VesselSummary) => v.completed > 0)
        .length,
      alerts: vesselSummaries.filter(
        (v: VesselSummary) =>
          v.hasOverdue || v.hasUpcoming || v.readyForInvoicing > 0
      ).length,
    };
  }, [vesselSummaries]);

  // Memoized quick stats for the vessel summary section
  const vesselQuickStats = useMemo(() => {
    if (vesselSummaries.length === 0) {
      return {
        overdue: 0,
        dueSoon: 0,
        readyToInvoice: 0,
        avgProgress: 0,
      };
    }

    return {
      overdue: vesselSummaries.filter((v: VesselSummary) => v.hasOverdue)
        .length,
      dueSoon: vesselSummaries.filter((v: VesselSummary) => v.hasUpcoming)
        .length,
      readyToInvoice: vesselSummaries.filter(
        (v: VesselSummary) => v.readyForInvoicing > 0
      ).length,
      avgProgress: Math.round(
        vesselSummaries.reduce(
          (sum: number, v: VesselSummary) => sum + v.overallProgress,
          0
        ) / vesselSummaries.length
      ),
    };
  }, [vesselSummaries]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch work orders with all related data
      const { data: workOrderData, error: woError } = await supabase
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
            work_verification (
              work_verification,
              verification_date
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
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (woError) throw woError;

      // Fetch existing invoices
      const { data: existingInvoices, error: invoiceError } = await supabase
        .from("invoice_details")
        .select("*")
        .is("deleted_at", null);

      if (invoiceError) throw invoiceError;

      const invoiceMap = new Map<number, DatabaseInvoice>();
      (existingInvoices || []).forEach((invoice: DatabaseInvoice) => {
        invoiceMap.set(invoice.work_order_id, invoice);
      });

      // Process work orders with progress data
      const processedWorkOrders: ProcessedWorkOrder[] = (
        workOrderData || []
      ).map((wo: DatabaseWorkOrder) => {
        const workDetails = wo.work_details || [];

        const workDetailsWithProgress = workDetails.map(
          (detail: DatabaseWorkDetail) => {
            const progressRecords = detail.work_progress || [];
            const verificationRecords = detail.work_verification || [];

            if (progressRecords.length === 0) {
              return {
                ...detail,
                current_progress: 0,
                latest_progress_date: undefined,
                verification_status: verificationRecords.some(
                  (v) => v.work_verification === true
                ),
              };
            }

            const sortedProgress = progressRecords.sort(
              (a, b) =>
                new Date(b.report_date).getTime() -
                new Date(a.report_date).getTime()
            );

            const latestProgress = sortedProgress[0]?.progress_percentage || 0;
            const latestProgressDate = sortedProgress[0]?.report_date;

            return {
              ...detail,
              current_progress: latestProgress,
              latest_progress_date: latestProgressDate,
              verification_status: verificationRecords.some(
                (v) => v.work_verification === true
              ),
            };
          }
        );

        let overallProgress = 0;
        let hasProgressData = false;

        if (workDetailsWithProgress.length > 0) {
          const totalProgress = workDetailsWithProgress.reduce(
            (sum: number, detail: WorkDetailsWithProgress) =>
              sum + (detail.current_progress || 0),
            0
          );
          overallProgress = Math.round(
            totalProgress / workDetailsWithProgress.length
          );
          hasProgressData = workDetailsWithProgress.some(
            (detail: WorkDetailsWithProgress) => detail.current_progress > 0
          );
        }

        const isFullyCompleted =
          workDetailsWithProgress.length > 0 &&
          workDetailsWithProgress.every(
            (detail: WorkDetailsWithProgress) => detail.current_progress === 100
          );

        const verificationStatus = workDetailsWithProgress.some(
          (detail: WorkDetailsWithProgress) => detail.verification_status
        );

        const invoiceDetails = invoiceMap.get(wo.id);
        const hasExistingInvoice = !!invoiceDetails;

        let completionDate: string | undefined;
        if (isFullyCompleted) {
          const completedDetails = workDetailsWithProgress.filter(
            (d: WorkDetailsWithProgress) => d.current_progress === 100
          );
          const latestCompletionDates = completedDetails
            .filter((d: WorkDetailsWithProgress) => d.latest_progress_date)
            .map((d: WorkDetailsWithProgress) => d.latest_progress_date!)
            .sort(
              (a: string, b: string) =>
                new Date(b).getTime() - new Date(a).getTime()
            );

          completionDate = latestCompletionDates[0];
        }

        return {
          ...wo,
          work_details: workDetailsWithProgress,
          overall_progress: overallProgress,
          has_progress_data: hasProgressData,
          verification_status: verificationStatus,
          is_fully_completed: isFullyCompleted,
          has_existing_invoice: hasExistingInvoice,
          completion_date: completionDate,
        };
      });

      const now = new Date();
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(now.getDate() + 7);

      // Calculate statistics
      const newStats: DashboardStats = {
        totalWorkOrders: processedWorkOrders.length,
        inProgress: 0,
        completed: 0,
        planned: 0,
        overdue: 0,
        readyToStart: 0,
        upcomingDeadlines: 0,
        verificationPending: 0,
        totalInvoices: existingInvoices?.length || 0,
        paidInvoices:
          existingInvoices?.filter(
            (inv: DatabaseInvoice) => inv.payment_status === true
          ).length || 0,
        unpaidInvoices:
          existingInvoices?.filter(
            (inv: DatabaseInvoice) => inv.payment_status === false
          ).length || 0,
        readyForInvoicing: 0,
      };

      const newAlerts: WorkOrderAlert[] = [];

      // Calculate vessel summaries
      const vesselMap = new Map<number, VesselSummary>();

      processedWorkOrders.forEach((wo) => {
        const targetClose = wo.target_close_date
          ? new Date(wo.target_close_date)
          : null;

        // Initialize vessel summary if not exists
        if (!vesselMap.has(wo.vessel.id)) {
          vesselMap.set(wo.vessel.id, {
            id: wo.vessel.id,
            name: wo.vessel.name,
            type: wo.vessel.type,
            company: wo.vessel.company,
            totalWorkOrders: 0,
            inProgress: 0,
            completed: 0,
            planned: 0,
            overallProgress: 0,
            hasOverdue: false,
            hasUpcoming: false,
            readyForInvoicing: 0,
            totalInvoices: 0,
            paidInvoices: 0,
            unpaidInvoices: 0,
            lastActivity: undefined,
          });
        }

        const vesselSummary = vesselMap.get(wo.vessel.id)!;
        vesselSummary.totalWorkOrders++;

        // Count by status
        if (wo.is_fully_completed) {
          newStats.completed++;
          vesselSummary.completed++;

          // Check if ready for invoicing
          if (!wo.has_existing_invoice) {
            newStats.readyForInvoicing++;
            vesselSummary.readyForInvoicing++;
            newAlerts.push({
              id: wo.id,
              customer_wo_number: wo.customer_wo_number,
              shipyard_wo_number: wo.shipyard_wo_number,
              planned_start_date: wo.planned_start_date,
              target_close_date: wo.target_close_date,
              vessel_name: wo.vessel?.name,
              vessel_company: wo.vessel?.company,
              type: "ready_for_invoice",
              message: `Work completed - ready for invoicing`,
              priority: "medium",
              overall_progress: wo.overall_progress,
              completion_date: wo.completion_date,
            });
          }

          // Count invoices for this vessel
          if (wo.has_existing_invoice) {
            vesselSummary.totalInvoices++;
            const invoice = invoiceMap.get(wo.id);
            if (invoice?.payment_status === true) {
              vesselSummary.paidInvoices++;
            } else {
              vesselSummary.unpaidInvoices++;
            }
          }
        } else if (wo.has_progress_data && wo.overall_progress > 0) {
          newStats.inProgress++;
          vesselSummary.inProgress++;

          // Check if work is completed but needs verification
          if (wo.overall_progress === 100 && !wo.verification_status) {
            newStats.verificationPending++;
            newAlerts.push({
              id: wo.id,
              customer_wo_number: wo.customer_wo_number,
              shipyard_wo_number: wo.shipyard_wo_number,
              planned_start_date: wo.planned_start_date,
              target_close_date: wo.target_close_date,
              vessel_name: wo.vessel?.name,
              vessel_company: wo.vessel?.company,
              type: "verification_pending",
              message: `Work completed - pending verification`,
              priority: "high",
              overall_progress: wo.overall_progress,
            });
          }
        } else {
          newStats.planned++;
          vesselSummary.planned++;

          // Check if ready to start (planned start date is today or before)
          const plannedStart = wo.planned_start_date
            ? new Date(wo.planned_start_date)
            : null;
          if (
            plannedStart &&
            plannedStart <= now &&
            wo.overall_progress === 0
          ) {
            newStats.readyToStart++;
            newAlerts.push({
              id: wo.id,
              customer_wo_number: wo.customer_wo_number,
              shipyard_wo_number: wo.shipyard_wo_number,
              planned_start_date: wo.planned_start_date,
              target_close_date: wo.target_close_date,
              vessel_name: wo.vessel?.name,
              vessel_company: wo.vessel?.company,
              type: "ready_to_start",
              message: `Scheduled to start - ready to begin work`,
              priority: "low",
              overall_progress: wo.overall_progress,
            });
          }
        }

        // Check for overdue work orders
        if (!wo.is_fully_completed && targetClose && targetClose < now) {
          newStats.overdue++;
          vesselSummary.hasOverdue = true;
          newAlerts.push({
            id: wo.id,
            customer_wo_number: wo.customer_wo_number,
            shipyard_wo_number: wo.shipyard_wo_number,
            planned_start_date: wo.planned_start_date,
            target_close_date: wo.target_close_date,
            vessel_name: wo.vessel?.name,
            vessel_company: wo.vessel?.company,
            type: "overdue",
            message: `Work order is overdue by ${Math.ceil(
              (now.getTime() - targetClose.getTime()) / (1000 * 60 * 60 * 24)
            )} days`,
            priority: "high",
            overall_progress: wo.overall_progress,
          });
        }

        // Check for upcoming deadlines
        if (
          !wo.is_fully_completed &&
          targetClose &&
          targetClose > now &&
          targetClose <= sevenDaysFromNow
        ) {
          newStats.upcomingDeadlines++;
          vesselSummary.hasUpcoming = true;
          newAlerts.push({
            id: wo.id,
            customer_wo_number: wo.customer_wo_number,
            shipyard_wo_number: wo.shipyard_wo_number,
            planned_start_date: wo.planned_start_date,
            target_close_date: wo.target_close_date,
            vessel_name: wo.vessel?.name,
            vessel_company: wo.vessel?.company,
            type: "upcoming_deadline",
            message: `Target close date in ${Math.ceil(
              (targetClose.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            )} days`,
            priority: "medium",
            overall_progress: wo.overall_progress,
          });
        }

        // Update last activity date for vessel
        const activityDates = [
          wo.completion_date,
          ...(wo.work_details
            ?.map((d: WorkDetailsWithProgress) => d.latest_progress_date)
            .filter(Boolean) || []),
        ].filter(Boolean);

        if (activityDates.length > 0) {
          const latestActivity = activityDates.sort(
            (a: string | undefined, b: string | undefined) =>
              new Date(b!).getTime() - new Date(a!).getTime()
          )[0];

          if (
            !vesselSummary.lastActivity ||
            new Date(latestActivity!) > new Date(vesselSummary.lastActivity)
          ) {
            vesselSummary.lastActivity = latestActivity;
          }
        }
      });

      // Calculate overall progress for each vessel
      vesselMap.forEach((summary, vesselId) => {
        const vesselWorkOrders = processedWorkOrders.filter(
          (wo) => wo.vessel.id === vesselId
        );
        if (vesselWorkOrders.length > 0) {
          const totalProgress = vesselWorkOrders.reduce(
            (sum, wo) => sum + wo.overall_progress,
            0
          );
          summary.overallProgress = Math.round(
            totalProgress / vesselWorkOrders.length
          );
        }
      });

      // Sort alerts by priority
      newAlerts.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });

      // Sort vessels by activity (most recent first), then by name
      const sortedVesselSummaries = Array.from(vesselMap.values()).sort(
        (a, b) => {
          // First sort by whether they have recent activity
          if (a.lastActivity && !b.lastActivity) return -1;
          if (!a.lastActivity && b.lastActivity) return 1;

          // If both have activity, sort by most recent
          if (a.lastActivity && b.lastActivity) {
            return (
              new Date(b.lastActivity).getTime() -
              new Date(a.lastActivity).getTime()
            );
          }

          // If neither has activity, sort by name
          return a.name.localeCompare(b.name);
        }
      );

      setStats(newStats);
      setAlerts(newAlerts);
      setVesselSummaries(sortedVesselSummaries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getAlertIcon = (type: WorkOrderAlert["type"]) => {
    switch (type) {
      case "verification_pending":
        return "🔍";
      case "overdue":
        return "🚨";
      case "upcoming_deadline":
        return "⏰";
      case "ready_to_start":
        return "🏁";
      case "ready_for_invoice":
        return "💰";
      default:
        return "ℹ️";
    }
  };

  const getAlertColor = (priority: WorkOrderAlert["priority"]) => {
    switch (priority) {
      case "high":
        return "bg-red-50 border-red-200 text-red-800";
      case "medium":
        return "bg-yellow-50 border-yellow-200 text-yellow-800";
      case "low":
        return "bg-green-50 border-green-200 text-green-800";
      default:
        return "bg-gray-50 border-gray-200 text-gray-800";
    }
  };

  const getVesselStatusColor = (summary: VesselSummary) => {
    if (summary.hasOverdue) return "border-red-500";
    if (summary.hasUpcoming || summary.readyForInvoicing > 0)
      return "border-yellow-500";
    if (summary.completed > 0) return "border-green-500";
    if (summary.inProgress > 0) return "border-blue-500";
    return "border-gray-300";
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">
          Work Order Management & Financial Overview
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchDashboardData}
            className="mt-2 text-red-600 hover:text-red-800 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Work Order Stats */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Work Order Status
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Work Orders */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Total Work Orders
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.totalWorkOrders}
                </p>
              </div>
              <span className="text-blue-500 text-2xl">📋</span>
            </div>
          </div>

          {/* In Progress */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">In Progress</p>
                <p className="text-2xl font-bold text-blue-600">
                  {stats.inProgress}
                </p>
              </div>
              <span className="text-blue-500 text-2xl">🔄</span>
            </div>
          </div>

          {/* Completed */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Completed</p>
                <p className="text-2xl font-bold text-green-600">
                  {stats.completed}
                </p>
              </div>
              <span className="text-green-500 text-2xl">✅</span>
            </div>
          </div>

          {/* Planned */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-gray-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Planned</p>
                <p className="text-2xl font-bold text-gray-600">
                  {stats.planned}
                </p>
              </div>
              <span className="text-gray-500 text-2xl">📅</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alert Stats */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Alerts & Actions Required
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Overdue */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Overdue</p>
                <p className="text-2xl font-bold text-red-600">
                  {stats.overdue}
                </p>
              </div>
              <span className="text-red-500 text-2xl">🚨</span>
            </div>
          </div>

          {/* Verification Pending */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-orange-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Verification Pending
                </p>
                <p className="text-2xl font-bold text-orange-600">
                  {stats.verificationPending}
                </p>
              </div>
              <span className="text-orange-500 text-2xl">🔍</span>
            </div>
          </div>

          {/* Ready to Start */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Ready to Start
                </p>
                <p className="text-2xl font-bold text-yellow-600">
                  {stats.readyToStart}
                </p>
              </div>
              <span className="text-yellow-500 text-2xl">🏁</span>
            </div>
          </div>

          {/* Upcoming Deadlines */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Upcoming Deadlines
                </p>
                <p className="text-2xl font-bold text-purple-600">
                  {stats.upcomingDeadlines}
                </p>
              </div>
              <span className="text-purple-500 text-2xl">⏰</span>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Stats */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Financial Overview
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Invoices */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Total Invoices
                </p>
                <p className="text-2xl font-bold text-blue-600">
                  {stats.totalInvoices}
                </p>
              </div>
              <span className="text-blue-500 text-2xl">📄</span>
            </div>
          </div>

          {/* Paid Invoices */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Paid Invoices
                </p>
                <p className="text-2xl font-bold text-green-600">
                  {stats.paidInvoices}
                </p>
              </div>
              <span className="text-green-500 text-2xl">✅</span>
            </div>
          </div>

          {/* Unpaid Invoices */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Unpaid Invoices
                </p>
                <p className="text-2xl font-bold text-red-600">
                  {stats.unpaidInvoices}
                </p>
              </div>
              <span className="text-red-500 text-2xl">⏳</span>
            </div>
          </div>

          {/* Ready for Invoicing */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-orange-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Ready for Invoicing
                </p>
                <p className="text-2xl font-bold text-orange-600">
                  {stats.readyForInvoicing}
                </p>
              </div>
              <span className="text-orange-500 text-2xl">💰</span>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Vessel Summary */}
      {vesselSummaries.length > 0 && (
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Vessel Summary ({filteredVessels.length} of{" "}
                {vesselSummaries.length} vessels)
              </h2>
              <p className="text-sm text-gray-600">
                Track work progress across all vessels
              </p>
            </div>

            {/* View Toggle */}
            <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setVesselViewMode("grid")}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  vesselViewMode === "grid"
                    ? "bg-white text-gray-900 shadow"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                📋 Grid
              </button>
              <button
                onClick={() => setVesselViewMode("list")}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  vesselViewMode === "list"
                    ? "bg-white text-gray-900 shadow"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                📄 List
              </button>
            </div>
          </div>

          {/* Filters and Search */}
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Search vessels..."
                  value={vesselSearchTerm}
                  onChange={(e) => {
                    setVesselSearchTerm(e.target.value);
                    setVesselPage(1);
                  }}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span className="absolute left-3 top-2.5 text-gray-400">
                  🔍
                </span>
              </div>

              {/* Status Filter */}
              <select
                value={vesselFilter}
                onChange={(e) => {
                  setVesselFilter(e.target.value as typeof vesselFilter);
                  setVesselPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">
                  All Vessels ({vesselFilterCounts.all})
                </option>
                <option value="active">
                  Active Work ({vesselFilterCounts.active})
                </option>
                <option value="completed">
                  Has Completed ({vesselFilterCounts.completed})
                </option>
                <option value="alerts">
                  Needs Attention ({vesselFilterCounts.alerts})
                </option>
              </select>

              {/* Sort */}
              <select
                value={vesselSortBy}
                onChange={(e) =>
                  setVesselSortBy(e.target.value as typeof vesselSortBy)
                }
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="activity">Recent Activity</option>
                <option value="name">Name (A-Z)</option>
                <option value="progress">Progress %</option>
                <option value="workOrders">Work Orders Count</option>
              </select>
            </div>

            {/* Quick Stats */}
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600">
              <span>🚨 Overdue: {vesselQuickStats.overdue}</span>
              <span>⏰ Due Soon: {vesselQuickStats.dueSoon}</span>
              <span>
                💰 Ready to Invoice: {vesselQuickStats.readyToInvoice}
              </span>
              <span>✅ Avg Progress: {vesselQuickStats.avgProgress}%</span>
            </div>
          </div>

          {/* Vessel Display */}
          {vesselViewMode === "grid" ? (
            /* Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginationValues.currentVessels.map((vessel) => (
                <div
                  key={vessel.id}
                  className={`bg-white rounded-lg shadow p-4 border-l-4 cursor-pointer hover:shadow-lg transition-all ${getVesselStatusColor(
                    vessel
                  )}`}
                  onClick={() => navigate(`/vessel/${vessel.id}/work-orders`)}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 min-w-0">
                      <h3
                        className="font-semibold text-gray-900 text-sm truncate"
                        title={vessel.name}
                      >
                        {vessel.name}
                      </h3>
                      <p
                        className="text-xs text-gray-600 truncate"
                        title={`${vessel.type} • ${vessel.company}`}
                      >
                        {vessel.type} • {vessel.company}
                      </p>
                    </div>
                    <div className="flex items-center space-x-1 ml-2">
                      {vessel.hasOverdue && (
                        <span className="text-red-500">🚨</span>
                      )}
                      {vessel.hasUpcoming && (
                        <span className="text-yellow-500">⏰</span>
                      )}
                      {vessel.readyForInvoicing > 0 && (
                        <span className="text-orange-500">💰</span>
                      )}
                    </div>
                  </div>

                  {/* Compact Stats */}
                  <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                    <div className="text-center">
                      <div className="font-bold text-blue-600">
                        {vessel.totalWorkOrders}
                      </div>
                      <div className="text-gray-500">Total WO</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-green-600">
                        {vessel.completed}
                      </div>
                      <div className="text-gray-500">Done</div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="flex items-center mb-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${vessel.overallProgress}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-500 ml-2 min-w-max">
                      {vessel.overallProgress}%
                    </span>
                  </div>

                  {/* Last Activity */}
                  {vessel.lastActivity && (
                    <div className="text-xs text-gray-400 truncate">
                      Last: {formatDate(vessel.lastActivity)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* List View */
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Vessel
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Work Orders
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Progress
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Last Activity
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginationValues.currentVessels.map((vessel) => (
                      <tr
                        key={vessel.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() =>
                          navigate(`/vessel/${vessel.id}/work-orders`)
                        }
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {vessel.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {vessel.type} • {vessel.company}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex space-x-4 text-sm">
                            <span className="text-blue-600 font-medium">
                              {vessel.totalWorkOrders} Total
                            </span>
                            <span className="text-yellow-600">
                              {vessel.inProgress} Progress
                            </span>
                            <span className="text-green-600">
                              {vessel.completed} Done
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${vessel.overallProgress}%` }}
                              ></div>
                            </div>
                            <span className="text-sm text-gray-600">
                              {vessel.overallProgress}%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex space-x-1">
                            {vessel.hasOverdue && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                🚨 Overdue
                              </span>
                            )}
                            {vessel.hasUpcoming && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                ⏰ Due Soon
                              </span>
                            )}
                            {vessel.readyForInvoicing > 0 && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                💰 Ready
                              </span>
                            )}
                            {!vessel.hasOverdue &&
                              !vessel.hasUpcoming &&
                              vessel.readyForInvoicing === 0 && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                  ✅ Normal
                                </span>
                              )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {vessel.lastActivity
                            ? formatDate(vessel.lastActivity)
                            : "No activity"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {paginationValues.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing {paginationValues.startIndex + 1} to{" "}
                {Math.min(
                  paginationValues.startIndex + vesselsPerPage,
                  filteredVessels.length
                )}{" "}
                of {filteredVessels.length} vessels
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setVesselPage(Math.max(1, vesselPage - 1))}
                  disabled={vesselPage === 1}
                  className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-sm"
                >
                  ← Previous
                </button>

                <div className="flex space-x-1">
                  {Array.from(
                    { length: Math.min(5, paginationValues.totalPages) },
                    (_, i) => {
                      const pageNum =
                        Math.max(
                          1,
                          Math.min(
                            paginationValues.totalPages - 4,
                            vesselPage - 2
                          )
                        ) + i;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setVesselPage(pageNum)}
                          className={`px-3 py-2 text-sm rounded-lg ${
                            pageNum === vesselPage
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
                    setVesselPage(
                      Math.min(paginationValues.totalPages, vesselPage + 1)
                    )
                  }
                  disabled={vesselPage === paginationValues.totalPages}
                  className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-sm"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Quick Actions for Vessels */}
          <div className="mt-4 text-center">
            <button
              onClick={() => navigate("/work-orders")}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              View Detailed Vessel Dashboard →
            </button>
          </div>
        </div>
      )}

      {/* Recent Alerts */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Recent Alerts ({alerts.slice(0, 8).length} of {alerts.length})
            </h3>
            {alerts.length > 8 && (
              <button
                onClick={() => navigate("/work-orders")}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                View All →
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {alerts.slice(0, 8).map((alert, index) => (
              <div
                key={`${alert.id}-${alert.type}-${index}`}
                className={`p-4 rounded-lg border ${getAlertColor(
                  alert.priority
                )}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <span className="text-lg">{getAlertIcon(alert.type)}</span>
                    <div className="flex-1">
                      <div className="font-medium text-sm">
                        {alert.customer_wo_number ||
                          alert.shipyard_wo_number ||
                          `WO-${alert.id}`}
                      </div>
                      <div className="text-sm font-semibold text-gray-700">
                        {alert.vessel_name}
                      </div>
                      <div className="text-xs text-gray-600 mb-1">
                        {alert.vessel_company}
                      </div>
                      <div className="text-sm">{alert.message}</div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="text-xs">
                          {alert.target_close_date && (
                            <>Target: {formatDate(alert.target_close_date)}</>
                          )}
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-12 bg-gray-200 rounded-full h-1">
                            <div
                              className="bg-blue-600 h-1 rounded-full"
                              style={{ width: `${alert.overall_progress}%` }}
                            ></div>
                          </div>
                          <span className="text-xs text-gray-500">
                            {alert.overall_progress}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
