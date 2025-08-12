import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, type PermitToWork } from "../../lib/supabase";

interface DashboardStats {
  totalWorkOrders: number;
  inProgress: number;
  completed: number;
  planned: number;
  overdue: number;
  missingPermits: number;
  readyToStart: number;
  upcomingDeadlines: number;
  totalPermits: number;
  uploadedPermits: number;
}

interface WorkOrderAlert {
  id: number;
  customer_wo_number: string;
  shipyard_wo_number: string;
  planned_start_date: string;
  target_close_date: string;
  vessel_name?: string;
  type: "missing_permit" | "overdue" | "upcoming_deadline" | "ready_to_start";
  message: string;
  priority: "high" | "medium" | "low";
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalWorkOrders: 0,
    inProgress: 0,
    completed: 0,
    planned: 0,
    overdue: 0,
    missingPermits: 0,
    readyToStart: 0,
    upcomingDeadlines: 0,
    totalPermits: 0,
    uploadedPermits: 0,
  });
  const [alerts, setAlerts] = useState<WorkOrderAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch work orders with vessel data
      const { data: workOrders, error: woError } = await supabase
        .from("work_order")
        .select(
          `
          *,
          vessel:vessel_id (
            id,
            name,
            type,
            company
          )
        `
        )
        .order("created_at", { ascending: false });

      if (woError) throw woError;

      // Fetch permits
      const { data: permits, error: permitError } = await supabase
        .from("permit_to_work")
        .select("*")
        .is("deleted_at", null);

      if (permitError) throw permitError;

      const now = new Date();
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(now.getDate() + 7);

      // Calculate statistics
      const newStats: DashboardStats = {
        totalWorkOrders: workOrders?.length || 0,
        inProgress: 0,
        completed: 0,
        planned: 0,
        overdue: 0,
        missingPermits: 0,
        readyToStart: 0,
        upcomingDeadlines: 0,
        totalPermits: permits?.length || 0,
        uploadedPermits: permits?.filter((p) => p.is_uploaded).length || 0,
      };

      const newAlerts: WorkOrderAlert[] = [];

      // Create a map of work orders with permits
      const workOrderPermits = new Map();
      permits?.forEach((permit) => {
        if (!workOrderPermits.has(permit.work_order_id)) {
          workOrderPermits.set(permit.work_order_id, []);
        }
        workOrderPermits.get(permit.work_order_id).push(permit);
      });

      workOrders?.forEach((wo) => {
        const plannedStart = new Date(wo.planned_start_date);
        const targetClose = new Date(wo.target_close_date);
        const woPermits = workOrderPermits.get(wo.id) || [];
        const hasUploadedPermit = woPermits.some(
          (p: PermitToWork) => p.is_uploaded
        );

        // Count by status
        if (wo.actual_close_date) {
          newStats.completed++;
        } else if (wo.actual_start_date) {
          newStats.inProgress++;
        } else if (plannedStart <= now) {
          newStats.readyToStart++;
        } else {
          newStats.planned++;
        }

        // Check for missing permits
        if (!hasUploadedPermit && !wo.actual_close_date) {
          newStats.missingPermits++;
          newAlerts.push({
            id: wo.id!,
            customer_wo_number: wo.customer_wo_number,
            shipyard_wo_number: wo.shipyard_wo_number,
            planned_start_date: wo.planned_start_date,
            target_close_date: wo.target_close_date,
            vessel_name: wo.vessel?.name,
            type: "missing_permit",
            message: `Missing permit to work - work cannot proceed`,
            priority: "high",
          });
        }

        // Check for overdue work orders
        if (!wo.actual_close_date && targetClose < now) {
          newStats.overdue++;
          newAlerts.push({
            id: wo.id!,
            customer_wo_number: wo.customer_wo_number,
            shipyard_wo_number: wo.shipyard_wo_number,
            planned_start_date: wo.planned_start_date,
            target_close_date: wo.target_close_date,
            vessel_name: wo.vessel?.name,
            type: "overdue",
            message: `Work order is overdue by ${Math.ceil(
              (now.getTime() - targetClose.getTime()) / (1000 * 60 * 60 * 24)
            )} days`,
            priority: "high",
          });
        }

        // Check for upcoming deadlines
        if (
          !wo.actual_close_date &&
          targetClose > now &&
          targetClose <= sevenDaysFromNow
        ) {
          newStats.upcomingDeadlines++;
          newAlerts.push({
            id: wo.id!,
            customer_wo_number: wo.customer_wo_number,
            shipyard_wo_number: wo.shipyard_wo_number,
            planned_start_date: wo.planned_start_date,
            target_close_date: wo.target_close_date,
            vessel_name: wo.vessel?.name,
            type: "upcoming_deadline",
            message: `Target close date in ${Math.ceil(
              (targetClose.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            )} days`,
            priority: "medium",
          });
        }

        // Check for ready to start (has permit and planned start date is today or before)
        if (hasUploadedPermit && !wo.actual_start_date && plannedStart <= now) {
          newAlerts.push({
            id: wo.id!,
            customer_wo_number: wo.customer_wo_number,
            shipyard_wo_number: wo.shipyard_wo_number,
            planned_start_date: wo.planned_start_date,
            target_close_date: wo.target_close_date,
            vessel_name: wo.vessel?.name,
            type: "ready_to_start",
            message: `Ready to start - all requirements met`,
            priority: "low",
          });
        }
      });

      // Sort alerts by priority
      newAlerts.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });

      setStats(newStats);
      setAlerts(newAlerts);
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getAlertIcon = (type: WorkOrderAlert["type"]) => {
    switch (type) {
      case "missing_permit":
        return "⚠️";
      case "overdue":
        return "🚨";
      case "upcoming_deadline":
        return "⏰";
      case "ready_to_start":
        return "✅";
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
        <p className="text-gray-600">Work Order Management Overview</p>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Work Orders */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                <span className="text-white text-sm font-bold">📋</span>
              </div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Total Work Orders
                </dt>
                <dd className="text-2xl font-bold text-gray-900">
                  {stats.totalWorkOrders}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        {/* In Progress */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                <span className="text-white text-sm font-bold">🔄</span>
              </div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  In Progress
                </dt>
                <dd className="text-2xl font-bold text-blue-600">
                  {stats.inProgress}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        {/* Completed */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                <span className="text-white text-sm font-bold">✅</span>
              </div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Completed
                </dt>
                <dd className="text-2xl font-bold text-green-600">
                  {stats.completed}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        {/* Missing Permits */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-red-500 rounded-md flex items-center justify-center">
                <span className="text-white text-sm font-bold">⚠️</span>
              </div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Missing Permits
                </dt>
                <dd className="text-2xl font-bold text-red-600">
                  {stats.missingPermits}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        {/* Overdue */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-red-500 rounded-md flex items-center justify-center">
                <span className="text-white text-sm font-bold">🚨</span>
              </div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Overdue
                </dt>
                <dd className="text-2xl font-bold text-red-600">
                  {stats.overdue}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        {/* Ready to Start */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-yellow-500 rounded-md flex items-center justify-center">
                <span className="text-white text-sm font-bold">🏁</span>
              </div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Ready to Start
                </dt>
                <dd className="text-2xl font-bold text-yellow-600">
                  {stats.readyToStart}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        {/* Total Permits */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-purple-500 rounded-md flex items-center justify-center">
                <span className="text-white text-sm font-bold">📄</span>
              </div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Total Permits
                </dt>
                <dd className="text-2xl font-bold text-purple-600">
                  {stats.totalPermits}
                </dd>
              </dl>
            </div>
          </div>
        </div>

        {/* Uploaded Permits */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                <span className="text-white text-sm font-bold">📤</span>
              </div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">
                  Uploaded Permits
                </dt>
                <dd className="text-2xl font-bold text-green-600">
                  {stats.uploadedPermits}
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Quick Actions
        </h3>
        <div className="flex flex-wrap gap-4">
          <button
            onClick={() => navigate("/add-work-order")}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            ➕ Add Work Order
          </button>
          <button
            onClick={() => navigate("/work-orders")}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            📋 View All Work Orders
          </button>
          <button
            onClick={() => navigate("/permits")}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
          >
            📄 View Permits
          </button>
          <button
            onClick={() => navigate("/upload-permit")}
            className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2"
          >
            📤 Upload Permit
          </button>
          <button
            onClick={fetchDashboardData}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            🔄 Refresh Data
          </button>
        </div>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Recent Alerts ({alerts.slice(0, 5).length} of {alerts.length})
            </h3>
            {alerts.length > 5 && (
              <button
                onClick={() => navigate("/work-orders")}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                View All →
              </button>
            )}
          </div>
          <div className="space-y-3">
            {alerts.slice(0, 5).map((alert) => (
              <div
                key={`${alert.id}-${alert.type}`}
                className={`p-3 rounded-lg border ${getAlertColor(
                  alert.priority
                )}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <span className="text-lg">{getAlertIcon(alert.type)}</span>
                    <div className="flex-1">
                      <div className="font-medium">
                        {alert.customer_wo_number} - {alert.vessel_name}
                      </div>
                      <div className="text-sm">{alert.message}</div>
                      <div className="text-xs mt-1">
                        Target: {formatDate(alert.target_close_date)}
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
