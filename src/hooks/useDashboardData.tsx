import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import { getLatestProgressRecord } from "../utils/progressPercentage";

export type BastpStatus = "DRAFT" | "VERIFIED" | "READY_FOR_INVOICE" | "INVOICED";
export type WorkTypeCategory = "DOCKING" | "REPAIR";
export type WorkOrderStatus = "completed" | "inProgress" | "notStarted";

// Anything not starting with "Docking" (including blank/legacy work orders)
// is bucketed as Repair — matches the two categories the shipyard actually
// distinguishes between (see src/constants/workTypes.ts).
const categoryOf = (workType: string | null | undefined): WorkTypeCategory =>
  workType && workType.startsWith("Docking") ? "DOCKING" : "REPAIR";

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
  payment_price: number | null;
  invoice_details: { payment_status: boolean } | null;
}

interface RawWorkDetail {
  id: number;
  description: string | null;
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

export interface DashboardStats {
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
  workDetailsInvoicedPaidValue: number;
  workDetailsInvoicedUnpaidValue: number;

  // 8. Original vs additional work orders
  workOrdersOriginal: number;
  workOrdersAdditional: number;

  totalWorkDetails: number;
  totalWorkOrders: number;
}

export interface VesselSummary {
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

export interface DashboardAlert {
  key: string;
  vesselName?: string;
  vesselCompany?: string;
  woLabel: string;
  // The specific work item this alert is about — without this, every
  // overdue alert on the same WO renders as an identical-looking card.
  workDetailDescription: string | null;
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
  workDetailsInvoicedPaidValue: 0,
  workDetailsInvoicedUnpaidValue: 0,
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

// Shared by Dashboard (stats + vessel summaries), the Alerts page, and the
// navbar's alert badge, so the underlying work-order query and its derived
// classifications (overdue, ready-for-invoice, etc.) only run once — behind
// DashboardDataProvider — instead of once per consumer.
function useDashboardDataQuery() {
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [vesselSummaries, setVesselSummaries] = useState<VesselSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
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
            description,
            cancelled_at,
            target_close_date,
            actual_close_date,
            work_progress ( progress_percentage, report_date, created_at ),
            bastp_work_details ( id, deleted_at, bastp:bastp_id ( status ) ),
            invoice_work_details ( id, payment_price, invoice_details:invoice_details_id ( payment_status ) )
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
              const invoicedValue = invoiceLink?.payment_price ?? 0;
              if (isPaid) {
                newStats.workDetailsInvoicedPaid++;
                newStats.workDetailsInvoicedPaidValue += invoicedValue;
              } else {
                newStats.workDetailsInvoicedUnpaid++;
                newStats.workDetailsInvoicedUnpaidValue += invoicedValue;
              }
            }

            if (isMissedDeadline) {
              newAlerts.push({
                key: `overdue-${d.id}`,
                vesselName: wo.vessel?.name,
                vesselCompany: wo.vessel?.company,
                woLabel,
                workDetailDescription: d.description,
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
                workDetailDescription: d.description,
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
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return {
    stats,
    alerts,
    vesselSummaries,
    loading,
    error,
    refetch: fetchDashboardData,
  };
}

type DashboardDataValue = ReturnType<typeof useDashboardDataQuery>;

const DashboardDataContext = createContext<DashboardDataValue | null>(null);

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const value = useDashboardDataQuery();
  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData(): DashboardDataValue {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) {
    throw new Error(
      "useDashboardData must be used within a DashboardDataProvider",
    );
  }
  return ctx;
}
