import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { getLatestProgressRecord } from "../../utils/progressPercentage";

type BastpStatus = "DRAFT" | "VERIFIED" | "READY_FOR_INVOICE" | "INVOICED";
type WorkTypeCategory = "DOCKING" | "REPAIR";
type WorkOrderStatus = "completed" | "inProgress" | "notStarted";

// Anything not starting with "Docking" (including blank/legacy work orders)
// is bucketed as Repair — matches the two categories the shipyard actually
// distinguishes between (see src/constants/workTypes.ts).
const categoryOf = (workType: string | null | undefined): WorkTypeCategory =>
  workType && workType.startsWith("Docking") ? "DOCKING" : "REPAIR";

// Fixed-order categorical hues (slots 1-3 of the validated 8-hue set) — used
// for nominal breakdowns where the categories don't have an inherent order.
const CATEGORICAL = { blue: "#2a78d6", orange: "#eb6834", aqua: "#1baf7a" };
// Reserved status hues — never reused for a plain "series N".
const STATUS = { good: "#0ca30c", warning: "#fab219", critical: "#d03b3b" };
// One-hue ordinal ramp (light -> dark) for the BASTP pipeline, where the
// stage order carries meaning. Steps 250/350/450/550/650 of the sequential
// blue ramp — the lightest step still clears 2:1 on a light surface.
const PIPELINE_RAMP = [
  "#86b6ef",
  "#5598e7",
  "#2a78d6",
  "#1c5cab",
  "#104281",
];

const pct = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) : 0;

interface RawWorkProgress {
  progress_percentage: number;
  report_date: string;
  created_at: string;
}

interface RawBastpLink {
  id: number;
  deleted_at: string | null;
  bastp: { status: BastpStatus } | null;
}

interface RawInvoiceLink {
  id: number;
  invoice_details: { payment_status: boolean } | null;
}

interface RawWorkDetail {
  id: number;
  cancelled_at: string | null;
  target_close_date: string | null;
  actual_close_date: string | null;
  work_progress: RawWorkProgress[];
  bastp_work_details: RawBastpLink[];
  invoice_work_details: RawInvoiceLink[];
}

interface RawWorkOrder {
  id: number;
  vessel_id: number;
  is_additional_wo: boolean | null;
  work_type: string | null;
  shipyard_wo_number: string | null;
  customer_wo_number: string | null;
  vessel: { id: number; name: string; type: string; company: string } | null;
  work_details: RawWorkDetail[];
}

interface ComputedWorkDetail {
  currentProgress: number;
  isCompleted: boolean;
  isNoProgress: boolean;
  isInProgress: boolean;
  isMissedDeadline: boolean;
  isOnTimeOrEarly: boolean;
  latestActivity?: string;
  bastpStatus: BastpStatus | null;
  isPaid: boolean | null;
}

interface DashboardStats {
  // 1. Vessels with at least one work order still in progress
  vesselsInProgressTotal: number;
  vesselsInProgressDocking: number;
  vesselsInProgressRepair: number;
  totalVessels: number;

  // 3. Work details already completed
  workDetailsCompleted: number;

  // 7. Progress-state and deadline breakdown
  workDetailsNoProgress: number;
  workDetailsInProgress: number;
  workDetailsMissedDeadline: number;
  workDetailsOnTimeOrEarly: number;

  // 5 & 6. BASTP pipeline stage
  workDetailsNotInBastp: number;
  workDetailsBastpDraft: number;
  workDetailsBastpVerified: number;
  workDetailsBastpReadyForInvoice: number;

  // 4. Invoiced, split by payment
  workDetailsInvoicedPaid: number;
  workDetailsInvoicedUnpaid: number;

  // 8. Original vs additional work orders
  workOrdersOriginal: number;
  workOrdersAdditional: number;

  totalWorkDetails: number;
  totalWorkOrders: number;
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
  // null when the vessel has no work order of that category at all.
  dockingProgress: number | null;
  repairProgress: number | null;
  hasOverdue: boolean;
  readyForInvoiceCount: number;
  lastActivity?: string;
}

interface DashboardAlert {
  key: string;
  vesselName?: string;
  vesselCompany?: string;
  woLabel: string;
  type: "overdue" | "ready_for_invoice";
  message: string;
  priority: "high" | "medium";
  targetCloseDate?: string | null;
}

const emptyStats: DashboardStats = {
  vesselsInProgressTotal: 0,
  vesselsInProgressDocking: 0,
  vesselsInProgressRepair: 0,
  totalVessels: 0,
  workDetailsCompleted: 0,
  workDetailsNoProgress: 0,
  workDetailsInProgress: 0,
  workDetailsMissedDeadline: 0,
  workDetailsOnTimeOrEarly: 0,
  workDetailsNotInBastp: 0,
  workDetailsBastpDraft: 0,
  workDetailsBastpVerified: 0,
  workDetailsBastpReadyForInvoice: 0,
  workDetailsInvoicedPaid: 0,
  workDetailsInvoicedUnpaid: 0,
  workOrdersOriginal: 0,
  workOrdersAdditional: 0,
  totalWorkDetails: 0,
  totalWorkOrders: 0,
};

interface VesselWorkOrderAccumulator {
  category: WorkTypeCategory;
  overallProgress: number;
  status: WorkOrderStatus;
  hasOverdue: boolean;
  readyForInvoiceCount: number;
  lastActivity?: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
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

  const filteredVessels = useMemo(() => {
    let filtered = vesselSummaries;

    if (vesselSearchTerm) {
      const searchLower = vesselSearchTerm.toLowerCase();
      filtered = filtered.filter(
        (vessel) =>
          (vessel.name?.toLowerCase() || "").includes(searchLower) ||
          (vessel.type?.toLowerCase() || "").includes(searchLower) ||
          (vessel.company?.toLowerCase() || "").includes(searchLower),
      );
    }

    switch (vesselFilter) {
      case "active":
        filtered = filtered.filter(
          (vessel) =>
            vessel.inProgress > 0 ||
            vessel.planned > 0 ||
            vessel.readyForInvoiceCount > 0,
        );
        break;
      case "completed":
        filtered = filtered.filter((vessel) => vessel.completed > 0);
        break;
      case "alerts":
        filtered = filtered.filter(
          (vessel) => vessel.hasOverdue || vessel.readyForInvoiceCount > 0,
        );
        break;
      default:
        break;
    }

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

  const paginationValues = useMemo(() => {
    const totalPages = Math.ceil(filteredVessels.length / vesselsPerPage);
    const startIndex = (vesselPage - 1) * vesselsPerPage;
    const currentVessels = filteredVessels.slice(
      startIndex,
      startIndex + vesselsPerPage,
    );
    return { totalPages, startIndex, currentVessels };
  }, [filteredVessels, vesselPage, vesselsPerPage]);

  const vesselFilterCounts = useMemo(
    () => ({
      all: vesselSummaries.length,
      active: vesselSummaries.filter(
        (v) => v.inProgress > 0 || v.planned > 0,
      ).length,
      completed: vesselSummaries.filter((v) => v.completed > 0).length,
      alerts: vesselSummaries.filter(
        (v) => v.hasOverdue || v.readyForInvoiceCount > 0,
      ).length,
    }),
    [vesselSummaries],
  );

  const vesselQuickStats = useMemo(() => {
    if (vesselSummaries.length === 0) {
      return { overdue: 0, readyToInvoice: 0, avgProgress: 0 };
    }
    return {
      overdue: vesselSummaries.filter((v) => v.hasOverdue).length,
      readyToInvoice: vesselSummaries.filter((v) => v.readyForInvoiceCount > 0)
        .length,
      avgProgress: Math.round(
        vesselSummaries.reduce((sum, v) => sum + v.overallProgress, 0) /
          vesselSummaries.length,
      ),
    };
  }, [vesselSummaries]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("work_order")
        .select(
          `
          id,
          vessel_id,
          is_additional_wo,
          work_type,
          shipyard_wo_number,
          customer_wo_number,
          vessel:vessel_id ( id, name, type, company ),
          work_details (
            id,
            cancelled_at,
            target_close_date,
            actual_close_date,
            work_progress ( progress_percentage, report_date, created_at ),
            bastp_work_details ( id, deleted_at, bastp:bastp_id ( status ) ),
            invoice_work_details ( id, invoice_details:invoice_details_id ( payment_status ) )
          )
        `,
        )
        .is("deleted_at", null);

      if (fetchError) throw fetchError;

      const rawOrders = (data || []) as unknown as RawWorkOrder[];
      const now = new Date();

      const newStats: DashboardStats = { ...emptyStats };
      const newAlerts: DashboardAlert[] = [];
      const vesselAccumulators = new Map<
        number,
        {
          name: string;
          type: string;
          company: string;
          workOrders: VesselWorkOrderAccumulator[];
        }
      >();

      rawOrders.forEach((wo) => {
        if (!wo.vessel) return;

        newStats.totalWorkOrders++;
        if (wo.is_additional_wo) newStats.workOrdersAdditional++;
        else newStats.workOrdersOriginal++;

        const category = categoryOf(wo.work_type);
        const activeDetails = (wo.work_details || []).filter(
          (d) => !d.cancelled_at,
        );
        const woLabel =
          wo.customer_wo_number || wo.shipyard_wo_number || `WO-${wo.id}`;

        const computedDetails: ComputedWorkDetail[] = activeDetails.map(
          (d) => {
            newStats.totalWorkDetails++;

            const progressRecords = d.work_progress || [];
            const latest = getLatestProgressRecord(progressRecords);
            const progress = latest?.progress_percentage ?? 0;
            const isCompleted = progress === 100;
            const isNoProgress = progress === 0;
            const isInProgress = progress > 0 && progress < 100;

            if (isCompleted) newStats.workDetailsCompleted++;
            if (isNoProgress) newStats.workDetailsNoProgress++;
            if (isInProgress) newStats.workDetailsInProgress++;

            // Deadline classification: incomplete work is judged against
            // today; completed work is judged by when it actually finished.
            const targetClose = d.target_close_date
              ? new Date(d.target_close_date)
              : null;
            let isMissedDeadline = false;
            let isOnTimeOrEarly = false;
            if (targetClose) {
              if (!isCompleted) {
                if (targetClose < now) isMissedDeadline = true;
              } else {
                const completionBasisStr =
                  d.actual_close_date || latest?.report_date;
                if (completionBasisStr) {
                  const completionBasis = new Date(completionBasisStr);
                  if (completionBasis > targetClose) isMissedDeadline = true;
                  else isOnTimeOrEarly = true;
                }
              }
            }
            if (isMissedDeadline) newStats.workDetailsMissedDeadline++;
            if (isOnTimeOrEarly) newStats.workDetailsOnTimeOrEarly++;

            // BASTP pipeline stage
            const bastpLink = (d.bastp_work_details || []).find(
              (b) => !b.deleted_at,
            );
            const bastpStatus = bastpLink?.bastp?.status ?? null;

            if (!bastpLink) {
              newStats.workDetailsNotInBastp++;
            } else if (bastpStatus === "DRAFT") {
              newStats.workDetailsBastpDraft++;
            } else if (bastpStatus === "VERIFIED") {
              newStats.workDetailsBastpVerified++;
            } else if (bastpStatus === "READY_FOR_INVOICE") {
              newStats.workDetailsBastpReadyForInvoice++;
            }

            // Payment status (only meaningful once actually invoiced)
            const invoiceLink = (d.invoice_work_details || []).find(
              (i) => i.invoice_details,
            );
            const isPaid = invoiceLink?.invoice_details?.payment_status ?? null;
            if (bastpStatus === "INVOICED") {
              if (isPaid) newStats.workDetailsInvoicedPaid++;
              else newStats.workDetailsInvoicedUnpaid++;
            }

            if (isMissedDeadline) {
              newAlerts.push({
                key: `overdue-${d.id}`,
                vesselName: wo.vessel?.name,
                vesselCompany: wo.vessel?.company,
                woLabel,
                type: "overdue",
                message: !isCompleted
                  ? `Overdue by ${Math.ceil(
                      (now.getTime() - targetClose!.getTime()) /
                        (1000 * 60 * 60 * 24),
                    )} days`
                  : "Completed past its planned close date",
                priority: "high",
                targetCloseDate: d.target_close_date,
              });
            }
            if (bastpStatus === "READY_FOR_INVOICE") {
              newAlerts.push({
                key: `ready-${d.id}`,
                vesselName: wo.vessel?.name,
                vesselCompany: wo.vessel?.company,
                woLabel,
                type: "ready_for_invoice",
                message: "Ready for invoicing",
                priority: "medium",
                targetCloseDate: d.target_close_date,
              });
            }

            return {
              currentProgress: progress,
              isCompleted,
              isNoProgress,
              isInProgress,
              isMissedDeadline,
              isOnTimeOrEarly,
              latestActivity: latest?.report_date,
              bastpStatus,
              isPaid,
            };
          },
        );

        const overallProgress =
          computedDetails.length > 0
            ? Math.round(
                computedDetails.reduce((s, d) => s + d.currentProgress, 0) /
                  computedDetails.length,
              )
            : 0;
        const status: WorkOrderStatus =
          computedDetails.length > 0 &&
          computedDetails.every((d) => d.isCompleted)
            ? "completed"
            : overallProgress > 0
              ? "inProgress"
              : "notStarted";
        const hasOverdue = computedDetails.some((d) => d.isMissedDeadline);
        const readyForInvoiceCount = computedDetails.filter(
          (d) => d.bastpStatus === "READY_FOR_INVOICE",
        ).length;
        const lastActivity = computedDetails
          .map((d) => d.latestActivity)
          .filter((v): v is string => !!v)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

        if (!vesselAccumulators.has(wo.vessel_id)) {
          vesselAccumulators.set(wo.vessel_id, {
            name: wo.vessel.name,
            type: wo.vessel.type,
            company: wo.vessel.company,
            workOrders: [],
          });
        }
        vesselAccumulators.get(wo.vessel_id)!.workOrders.push({
          category,
          overallProgress,
          status,
          hasOverdue,
          readyForInvoiceCount,
          lastActivity,
        });
      });

      newStats.totalVessels = vesselAccumulators.size;

      const inProgressVesselIds = new Set<number>();
      const inProgressDockingVesselIds = new Set<number>();
      const inProgressRepairVesselIds = new Set<number>();

      const newVesselSummaries: VesselSummary[] = Array.from(
        vesselAccumulators.entries(),
      ).map(([vesselId, acc]) => {
        const { workOrders } = acc;
        const avg = (nums: number[]) =>
          nums.length > 0
            ? Math.round(nums.reduce((s, n) => s + n, 0) / nums.length)
            : null;

        const dockingWOs = workOrders.filter((w) => w.category === "DOCKING");
        const repairWOs = workOrders.filter((w) => w.category === "REPAIR");

        if (workOrders.some((w) => w.status === "inProgress")) {
          inProgressVesselIds.add(vesselId);
        }
        if (dockingWOs.some((w) => w.status === "inProgress")) {
          inProgressDockingVesselIds.add(vesselId);
        }
        if (repairWOs.some((w) => w.status === "inProgress")) {
          inProgressRepairVesselIds.add(vesselId);
        }

        const lastActivity = workOrders
          .map((w) => w.lastActivity)
          .filter((v): v is string => !!v)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

        return {
          id: vesselId,
          name: acc.name,
          type: acc.type,
          company: acc.company,
          totalWorkOrders: workOrders.length,
          inProgress: workOrders.filter((w) => w.status === "inProgress")
            .length,
          completed: workOrders.filter((w) => w.status === "completed")
            .length,
          planned: workOrders.filter((w) => w.status === "notStarted").length,
          overallProgress: avg(workOrders.map((w) => w.overallProgress)) ?? 0,
          dockingProgress: avg(dockingWOs.map((w) => w.overallProgress)),
          repairProgress: avg(repairWOs.map((w) => w.overallProgress)),
          hasOverdue: workOrders.some((w) => w.hasOverdue),
          readyForInvoiceCount: workOrders.reduce(
            (sum, w) => sum + w.readyForInvoiceCount,
            0,
          ),
          lastActivity,
        };
      });

      newStats.vesselsInProgressTotal = inProgressVesselIds.size;
      newStats.vesselsInProgressDocking = inProgressDockingVesselIds.size;
      newStats.vesselsInProgressRepair = inProgressRepairVesselIds.size;

      newAlerts.sort((a, b) => {
        const priorityOrder = { high: 2, medium: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });

      newVesselSummaries.sort((a, b) => {
        if (a.lastActivity && !b.lastActivity) return -1;
        if (!a.lastActivity && b.lastActivity) return 1;
        if (a.lastActivity && b.lastActivity) {
          return (
            new Date(b.lastActivity).getTime() -
            new Date(a.lastActivity).getTime()
          );
        }
        return a.name.localeCompare(b.name);
      });

      setStats(newStats);
      setAlerts(newAlerts);
      setVesselSummaries(newVesselSummaries);
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

  const getAlertIcon = (type: DashboardAlert["type"]) =>
    type === "overdue" ? "🚨" : "💰";

  const getAlertColor = (priority: DashboardAlert["priority"]) =>
    priority === "high"
      ? "bg-red-50 border-red-200 text-red-800"
      : "bg-yellow-50 border-yellow-200 text-yellow-800";

  const getVesselStatusColor = (summary: VesselSummary) => {
    if (summary.hasOverdue) return "border-red-500";
    if (summary.readyForInvoiceCount > 0) return "border-yellow-500";
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

  const StatCard = ({
    label,
    value,
    color,
    borderColor,
    percentOf,
  }: {
    label: string;
    value: string | number;
    color?: string;
    borderColor: string;
    // When set, shows "N% of <percentOf.total>" underneath the value.
    percentOf?: { total: number; ofLabel: string };
  }) => (
    <div
      className={`bg-white rounded-lg shadow p-6 border-l-4 ${borderColor}`}
    >
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className={`text-2xl font-bold ${color || "text-gray-900"}`}>
        {value}
      </p>
      {percentOf && (
        <p className="text-xs text-gray-400 mt-1">
          {pct(Number(value), percentOf.total)}% of {percentOf.ofLabel}
        </p>
      )}
    </div>
  );

  // A horizontal part-to-whole bar: thin segments separated by a 2px surface
  // gap, rounded at the two outer ends, with a legend row underneath (a
  // legend is always shown for 2+ series — color alone is never the only
  // way to tell segments apart).
  const StackedBar = ({
    title,
    subtitle,
    segments,
  }: {
    title: string;
    subtitle?: string;
    segments: { label: string; value: number; color: string }[];
  }) => {
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && (
          <p className="text-xs text-gray-500 mb-3">{subtitle}</p>
        )}
        <div
          className={`w-full h-6 rounded-full bg-gray-100 flex gap-[2px] overflow-hidden ${subtitle ? "" : "mt-3"}`}
        >
          {segments.map(
            (s) =>
              s.value > 0 && (
                <div
                  key={s.label}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{
                    width: `${(s.value / total) * 100}%`,
                    backgroundColor: s.color,
                  }}
                  title={`${s.label}: ${s.value.toLocaleString()} (${pct(s.value, total)}%)`}
                />
              ),
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          {segments.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-gray-600">{s.label}</span>
              <span className="font-semibold text-gray-900">
                {s.value.toLocaleString()}
              </span>
              <span className="text-gray-400">({pct(s.value, total)}%)</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // A donut — reserved for genuine part-to-whole among 3+ non-ordinal
  // categories. A 2-slice pie reads no better than the stat tile's own
  // percentage, so binary splits (Paid/Unpaid, Original/Additional, deadline
  // performance) stay bar-only; the 5-stage BASTP pipeline is an ordinal
  // sequence, where a pie would flatten the stage order a bar preserves.
  const DonutChart = ({
    title,
    subtitle,
    segments,
    size = 168,
  }: {
    title: string;
    subtitle?: string;
    segments: { label: string; value: number; color: string }[];
    size?: number;
  }) => {
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    const strokeWidth = 24;
    const radius = size / 2 - strokeWidth / 2;
    const circumference = 2 * Math.PI * radius;
    let cumulative = 0;

    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mb-3">{subtitle}</p>}
        <div className="flex items-center gap-6 flex-wrap">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="flex-shrink-0"
          >
            <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="#f3f4f6"
                strokeWidth={strokeWidth}
              />
              {segments.map((s) => {
                if (s.value <= 0) return null;
                const fraction = s.value / total;
                // A 2px surface gap between segments, matching the bar chart.
                const dash = Math.max(fraction * circumference - 2, 0);
                const dashOffset = -cumulative;
                cumulative += fraction * circumference;
                return (
                  <circle
                    key={s.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={dashOffset}
                  >
                    <title>{`${s.label}: ${s.value.toLocaleString()} (${pct(s.value, total)}%)`}</title>
                  </circle>
                );
              })}
            </g>
            <text
              x={size / 2}
              y={size / 2 - 3}
              textAnchor="middle"
              fontSize={22}
              fontWeight={700}
              fill="#111827"
            >
              {total.toLocaleString()}
            </text>
            <text
              x={size / 2}
              y={size / 2 + 15}
              textAnchor="middle"
              fontSize={11}
              fill="#9ca3af"
            >
              total
            </text>
          </svg>
          <div className="flex-1 min-w-[140px] space-y-1.5">
            {segments.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5 text-xs">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-gray-600">{s.label}</span>
                <span className="font-semibold text-gray-900 ml-auto">
                  {s.value.toLocaleString()}
                </span>
                <span className="text-gray-400">
                  ({pct(s.value, total)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

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

      {/* 1. Vessels still in progress */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Vessels In Progress ({stats.totalVessels} total)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            label="All Work Types"
            value={stats.vesselsInProgressTotal}
            color="text-blue-600"
            borderColor="border-blue-500"
            percentOf={{ total: stats.totalVessels, ofLabel: "vessels" }}
          />
          <StatCard
            label="Docking Work"
            value={stats.vesselsInProgressDocking}
            color="text-indigo-600"
            borderColor="border-indigo-500"
            percentOf={{ total: stats.totalVessels, ofLabel: "vessels" }}
          />
          <StatCard
            label="Repair Work"
            value={stats.vesselsInProgressRepair}
            color="text-teal-600"
            borderColor="border-teal-500"
            percentOf={{ total: stats.totalVessels, ofLabel: "vessels" }}
          />
        </div>
      </div>

      {/* 3 & 7. Work detail progress */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Work Detail Progress ({stats.totalWorkDetails} total)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-6">
          <StatCard
            label="Completed"
            value={stats.workDetailsCompleted}
            color="text-green-600"
            borderColor="border-green-500"
            percentOf={{
              total: stats.totalWorkDetails,
              ofLabel: "work details",
            }}
          />
          <StatCard
            label="In Progress"
            value={stats.workDetailsInProgress}
            color="text-blue-600"
            borderColor="border-blue-500"
            percentOf={{
              total: stats.totalWorkDetails,
              ofLabel: "work details",
            }}
          />
          <StatCard
            label="No Progress At All"
            value={stats.workDetailsNoProgress}
            color="text-gray-600"
            borderColor="border-gray-400"
            percentOf={{
              total: stats.totalWorkDetails,
              ofLabel: "work details",
            }}
          />
          <StatCard
            label="Missed Deadline"
            value={stats.workDetailsMissedDeadline}
            color="text-red-600"
            borderColor="border-red-500"
            percentOf={{
              total:
                stats.workDetailsMissedDeadline +
                stats.workDetailsOnTimeOrEarly,
              ofLabel: "judged deadlines",
            }}
          />
          <StatCard
            label="On Time / Early"
            value={stats.workDetailsOnTimeOrEarly}
            color="text-emerald-600"
            borderColor="border-emerald-500"
            percentOf={{
              total:
                stats.workDetailsMissedDeadline +
                stats.workDetailsOnTimeOrEarly,
              ofLabel: "judged deadlines",
            }}
          />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <StackedBar
            title="Progress State"
            subtitle={`Share of all ${stats.totalWorkDetails.toLocaleString()} work details`}
            segments={[
              {
                label: "Completed",
                value: stats.workDetailsCompleted,
                color: CATEGORICAL.blue,
              },
              {
                label: "In Progress",
                value: stats.workDetailsInProgress,
                color: CATEGORICAL.orange,
              },
              {
                label: "No Progress",
                value: stats.workDetailsNoProgress,
                color: CATEGORICAL.aqua,
              },
            ]}
          />
          <DonutChart
            title="Progress State"
            subtitle="Same breakdown, as a donut"
            segments={[
              {
                label: "Completed",
                value: stats.workDetailsCompleted,
                color: CATEGORICAL.blue,
              },
              {
                label: "In Progress",
                value: stats.workDetailsInProgress,
                color: CATEGORICAL.orange,
              },
              {
                label: "No Progress",
                value: stats.workDetailsNoProgress,
                color: CATEGORICAL.aqua,
              },
            ]}
          />
          <StackedBar
            title="Deadline Performance"
            subtitle={`Of ${(
              stats.workDetailsMissedDeadline + stats.workDetailsOnTimeOrEarly
            ).toLocaleString()} work details with a judged deadline`}
            segments={[
              {
                label: "On Time / Early",
                value: stats.workDetailsOnTimeOrEarly,
                color: STATUS.good,
              },
              {
                label: "Missed Deadline",
                value: stats.workDetailsMissedDeadline,
                color: STATUS.critical,
              },
            ]}
          />
        </div>
      </div>

      {/* 5 & 6. BASTP pipeline */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          BASTP Pipeline
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            label="Not Made Into BASTP Yet"
            value={stats.workDetailsNotInBastp}
            color="text-gray-600"
            borderColor="border-gray-400"
            percentOf={{
              total: stats.totalWorkDetails,
              ofLabel: "work details",
            }}
          />
          <StatCard
            label="In BASTP — Awaiting Verification"
            value={stats.workDetailsBastpDraft}
            color="text-orange-600"
            borderColor="border-orange-500"
            percentOf={{
              total: stats.totalWorkDetails,
              ofLabel: "work details",
            }}
          />
          <StatCard
            label="Verified — Awaiting Materials"
            value={stats.workDetailsBastpVerified}
            color="text-amber-600"
            borderColor="border-amber-500"
            percentOf={{
              total: stats.totalWorkDetails,
              ofLabel: "work details",
            }}
          />
          <StatCard
            label="Ready For Invoice"
            value={stats.workDetailsBastpReadyForInvoice}
            color="text-purple-600"
            borderColor="border-purple-500"
            percentOf={{
              total: stats.totalWorkDetails,
              ofLabel: "work details",
            }}
          />
        </div>
      </div>

      {/* 4. Invoiced */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Invoiced Work Details
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <StatCard
            label="Paid"
            value={stats.workDetailsInvoicedPaid}
            color="text-green-600"
            borderColor="border-green-500"
            percentOf={{
              total:
                stats.workDetailsInvoicedPaid +
                stats.workDetailsInvoicedUnpaid,
              ofLabel: "invoiced work details",
            }}
          />
          <StatCard
            label="Unpaid"
            value={stats.workDetailsInvoicedUnpaid}
            color="text-red-600"
            borderColor="border-red-500"
            percentOf={{
              total:
                stats.workDetailsInvoicedPaid +
                stats.workDetailsInvoicedUnpaid,
              ofLabel: "invoiced work details",
            }}
          />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StackedBar
            title="BASTP Pipeline Stage"
            subtitle={`Every one of ${stats.totalWorkDetails.toLocaleString()} work details, from not-yet-BASTP to invoiced`}
            segments={[
              {
                label: "Not in BASTP",
                value: stats.workDetailsNotInBastp,
                color: PIPELINE_RAMP[0],
              },
              {
                label: "Awaiting Verification",
                value: stats.workDetailsBastpDraft,
                color: PIPELINE_RAMP[1],
              },
              {
                label: "Awaiting Materials",
                value: stats.workDetailsBastpVerified,
                color: PIPELINE_RAMP[2],
              },
              {
                label: "Ready For Invoice",
                value: stats.workDetailsBastpReadyForInvoice,
                color: PIPELINE_RAMP[3],
              },
              {
                label: "Invoiced",
                value:
                  stats.workDetailsInvoicedPaid +
                  stats.workDetailsInvoicedUnpaid,
                color: PIPELINE_RAMP[4],
              },
            ]}
          />
          <StackedBar
            title="Invoiced — Paid vs Unpaid"
            subtitle={`Of ${(
              stats.workDetailsInvoicedPaid + stats.workDetailsInvoicedUnpaid
            ).toLocaleString()} invoiced work details`}
            segments={[
              {
                label: "Paid",
                value: stats.workDetailsInvoicedPaid,
                color: STATUS.good,
              },
              {
                label: "Unpaid",
                value: stats.workDetailsInvoicedUnpaid,
                color: STATUS.warning,
              },
            ]}
          />
        </div>
      </div>

      {/* 8. Work order composition */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Work Orders ({stats.totalWorkOrders} total)
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="grid grid-cols-2 gap-6">
            <StatCard
              label="Original"
              value={stats.workOrdersOriginal}
              color="text-blue-600"
              borderColor="border-blue-500"
              percentOf={{
                total: stats.totalWorkOrders,
                ofLabel: "work orders",
              }}
            />
            <StatCard
              label="Additional"
              value={stats.workOrdersAdditional}
              color="text-purple-600"
              borderColor="border-purple-500"
              percentOf={{
                total: stats.totalWorkOrders,
                ofLabel: "work orders",
              }}
            />
          </div>
          <StackedBar
            title="Original vs Additional"
            subtitle={`Share of all ${stats.totalWorkOrders.toLocaleString()} work orders`}
            segments={[
              {
                label: "Original",
                value: stats.workOrdersOriginal,
                color: CATEGORICAL.blue,
              },
              {
                label: "Additional",
                value: stats.workOrdersAdditional,
                color: CATEGORICAL.orange,
              },
            ]}
          />
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
                Track work progress across all vessels — combined, and split
                between Docking and Repair
              </p>
            </div>

            <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setVesselViewMode("grid")}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  vesselViewMode === "grid"
                    ? "bg-white text-gray-900 shadow"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Grid
              </button>
              <button
                onClick={() => setVesselViewMode("list")}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  vesselViewMode === "list"
                    ? "bg-white text-gray-900 shadow"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                List
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="flex flex-col sm:flex-row gap-4">
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

            <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600">
              <span>Overdue: {vesselQuickStats.overdue}</span>
              <span>Ready to Invoice: {vesselQuickStats.readyToInvoice}</span>
              <span>Avg Progress: {vesselQuickStats.avgProgress}%</span>
            </div>
          </div>

          {vesselViewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginationValues.currentVessels.map((vessel) => (
                <div
                  key={vessel.id}
                  className={`bg-white rounded-lg shadow p-4 border-l-4 cursor-pointer hover:shadow-lg transition-all ${getVesselStatusColor(
                    vessel,
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
                      {vessel.readyForInvoiceCount > 0 && (
                        <span className="text-orange-500">💰</span>
                      )}
                    </div>
                  </div>

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

                  {/* Combined progress */}
                  <div className="flex items-center mb-1">
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

                  {/* Docking / Repair split */}
                  <div className="space-y-1 mb-2">
                    {vessel.dockingProgress !== null && (
                      <div className="flex items-center">
                        <span className="text-[10px] text-gray-400 w-12 flex-shrink-0">
                          Docking
                        </span>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-indigo-500 h-1.5 rounded-full"
                            style={{ width: `${vessel.dockingProgress}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] text-gray-400 ml-2 min-w-max">
                          {vessel.dockingProgress}%
                        </span>
                      </div>
                    )}
                    {vessel.repairProgress !== null && (
                      <div className="flex items-center">
                        <span className="text-[10px] text-gray-400 w-12 flex-shrink-0">
                          Repair
                        </span>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className="bg-teal-500 h-1.5 rounded-full"
                            style={{ width: `${vessel.repairProgress}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] text-gray-400 ml-2 min-w-max">
                          {vessel.repairProgress}%
                        </span>
                      </div>
                    )}
                  </div>

                  {vessel.lastActivity && (
                    <div className="text-xs text-gray-400 truncate">
                      Last: {formatDate(vessel.lastActivity)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
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
                        Progress (Combined / Docking / Repair)
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
                          <div className="text-sm text-gray-600">
                            {vessel.overallProgress}%{" "}
                            <span className="text-gray-400">
                              (
                              {vessel.dockingProgress !== null
                                ? `${vessel.dockingProgress}%`
                                : "—"}{" "}
                              /{" "}
                              {vessel.repairProgress !== null
                                ? `${vessel.repairProgress}%`
                                : "—"}
                              )
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
                            {vessel.readyForInvoiceCount > 0 && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                💰 Ready
                              </span>
                            )}
                            {!vessel.hasOverdue &&
                              vessel.readyForInvoiceCount === 0 && (
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

          {paginationValues.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing {paginationValues.startIndex + 1} to{" "}
                {Math.min(
                  paginationValues.startIndex + vesselsPerPage,
                  filteredVessels.length,
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
                            vesselPage - 2,
                          ),
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
                    },
                  )}
                </div>

                <button
                  onClick={() =>
                    setVesselPage(
                      Math.min(paginationValues.totalPages, vesselPage + 1),
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
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {alerts.slice(0, 8).map((alert) => (
              <div
                key={alert.key}
                className={`p-4 rounded-lg border ${getAlertColor(
                  alert.priority,
                )}`}
              >
                <div className="flex items-start space-x-3">
                  <span className="text-lg">{getAlertIcon(alert.type)}</span>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{alert.woLabel}</div>
                    <div className="text-sm font-semibold text-gray-700">
                      {alert.vesselName}
                    </div>
                    <div className="text-xs text-gray-600 mb-1">
                      {alert.vesselCompany}
                    </div>
                    <div className="text-sm">{alert.message}</div>
                    {alert.targetCloseDate && (
                      <div className="text-xs mt-2">
                        Target: {formatDate(alert.targetCloseDate)}
                      </div>
                    )}
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
