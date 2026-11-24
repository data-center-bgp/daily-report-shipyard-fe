import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useDashboardData } from "../../hooks/useDashboardData";
import SearchableSelect from "../common/SearchableSelect";
import { DashboardSkeleton } from "../common/Skeleton";
import VesselSection from "./VesselSection";
import {
  CATEGORICAL,
  PIPELINE_RAMP,
  STATUS,
  formatCurrency,
  pct,
} from "./chartTokens";
import { Donut, Panel, Section, StackedBar } from "./widgets";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type WorkOrderCategory = "DOCKING" | "REPAIR" | "NEW_BUILDING";

const numberCell = "px-3 py-2.5 text-right tabular-nums";

export default function Dashboard() {
  const {
    stats,
    alerts,
    vesselSummaries,
    workOrderRecords,
    workDetailRecords,
    loading,
    error,
    refetch,
  } = useDashboardData();
  const { canAccess } = useAuth();
  const filterId = useId();
  // 0 means "All" for both: matches SearchableSelect's own "cleared" value.
  const [woVesselFilterId, setWoVesselFilterId] = useState<number>(0);
  const [woMonthFilterId, setWoMonthFilterId] = useState<number>(0);

  // Distinct vessels present among work orders, alphabetical: the option
  // list for the vessel filter. `id` doubles as the value SearchableSelect
  // reports (0 is reserved there for "cleared" / "All").
  const woVesselOptions = useMemo(() => {
    const byId = new Map<number, string>();
    workOrderRecords.forEach((wo) => {
      if (!byId.has(wo.vesselId)) byId.set(wo.vesselId, wo.vesselName);
    });
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [workOrderRecords]);

  // Distinct "YYYY-MM" months present among work orders' shipyard WO date,
  // newest first. SearchableSelect needs a numeric id per option, so months
  // get a synthetic 1-based id (0 stays reserved for "All").
  const woMonthOptions = useMemo(() => {
    const months = new Set<string>();
    workOrderRecords.forEach((wo) => {
      if (wo.shipyardWoDate) months.add(wo.shipyardWoDate.slice(0, 7));
    });
    return Array.from(months)
      .sort((a, b) => b.localeCompare(a))
      .map((month, index) => {
        const [year, monthNum] = month.split("-");
        return {
          id: index + 1,
          value: month,
          label: `${MONTH_NAMES[Number(monthNum) - 1]} ${year}`,
        };
      });
  }, [workOrderRecords]);

  const woMonthFilterValue =
    woMonthOptions.find((m) => m.id === woMonthFilterId)?.value ?? null;

  const filteredWorkOrderRecords = useMemo(() => {
    return workOrderRecords.filter((wo) => {
      if (woVesselFilterId !== 0 && wo.vesselId !== woVesselFilterId) {
        return false;
      }
      if (
        woMonthFilterValue &&
        wo.shipyardWoDate?.slice(0, 7) !== woMonthFilterValue
      ) {
        return false;
      }
      return true;
    });
  }, [workOrderRecords, woVesselFilterId, woMonthFilterValue]);

  // Re-derives the "work order" slice of DashboardStats from the filtered
  // records. Projects, the attention band and Vessels keep showing unfiltered
  // totals; only the sections driven by work orders / work details filter.
  const filteredWorkOrderStats = useMemo(() => {
    const inProgress = filteredWorkOrderRecords.filter(
      (wo) => wo.status !== "completed",
    );
    const completed = filteredWorkOrderRecords.filter(
      (wo) => wo.status === "completed",
    );
    const countCategory = (
      list: typeof filteredWorkOrderRecords,
      category: WorkOrderCategory,
    ) => list.filter((wo) => wo.category === category).length;

    return {
      totalWorkOrders: filteredWorkOrderRecords.length,
      inProgressTotal: inProgress.length,
      inProgressDocking: countCategory(inProgress, "DOCKING"),
      inProgressRepair: countCategory(inProgress, "REPAIR"),
      inProgressNewBuilding: countCategory(inProgress, "NEW_BUILDING"),
      completedTotal: completed.length,
      completedDocking: countCategory(completed, "DOCKING"),
      completedRepair: countCategory(completed, "REPAIR"),
      completedNewBuilding: countCategory(completed, "NEW_BUILDING"),
      original: filteredWorkOrderRecords.filter((wo) => !wo.isAdditional)
        .length,
      additional: filteredWorkOrderRecords.filter((wo) => wo.isAdditional)
        .length,
    };
  }, [filteredWorkOrderRecords]);

  // Same vessel/month filter, applied at the work-detail level: drives
  // Work Details and the BASTP-to-payment pipeline.
  const filteredWorkDetailRecords = useMemo(() => {
    return workDetailRecords.filter((wd) => {
      if (woVesselFilterId !== 0 && wd.vesselId !== woVesselFilterId) {
        return false;
      }
      if (
        woMonthFilterValue &&
        wd.shipyardWoDate?.slice(0, 7) !== woMonthFilterValue
      ) {
        return false;
      }
      return true;
    });
  }, [workDetailRecords, woVesselFilterId, woMonthFilterValue]);

  const wd = useMemo(() => {
    const notInvoiced = filteredWorkDetailRecords.filter(
      (r) => r.bastpStatus !== "INVOICED",
    );
    const invoicedPaid = filteredWorkDetailRecords.filter(
      (r) => r.bastpStatus === "INVOICED" && r.isPaid,
    );
    const invoicedUnpaid = filteredWorkDetailRecords.filter(
      (r) => r.bastpStatus === "INVOICED" && !r.isPaid,
    );
    const sumValue = (list: typeof invoicedPaid) =>
      list.reduce((sum, r) => sum + r.invoicedValue, 0);

    return {
      total: filteredWorkDetailRecords.length,
      completed: filteredWorkDetailRecords.filter((r) => r.isCompleted).length,
      inProgress: filteredWorkDetailRecords.filter((r) => r.isInProgress)
        .length,
      noProgress: filteredWorkDetailRecords.filter((r) => r.isNoProgress)
        .length,
      missedDeadline: filteredWorkDetailRecords.filter(
        (r) => r.isMissedDeadline,
      ).length,
      onTimeOrEarly: filteredWorkDetailRecords.filter((r) => r.isOnTimeOrEarly)
        .length,
      notInBastp: notInvoiced.filter((r) => r.bastpStatus === null).length,
      bastpDraft: notInvoiced.filter((r) => r.bastpStatus === "DRAFT").length,
      bastpReady: notInvoiced.filter(
        (r) => r.bastpStatus === "READY_FOR_INVOICE",
      ).length,
      invoicedPaid: invoicedPaid.length,
      invoicedUnpaid: invoicedUnpaid.length,
      invoicedPaidValue: sumValue(invoicedPaid),
      invoicedUnpaidValue: sumValue(invoicedUnpaid),
    };
  }, [filteredWorkDetailRecords]);

  // The attention band is deliberately not filtered: it answers "what needs
  // doing anywhere in the yard", whatever the analysis below is scoped to.
  const attention = useMemo(() => {
    const unpaid = workDetailRecords.filter(
      (r) => r.bastpStatus === "INVOICED" && !r.isPaid,
    );
    return {
      overdue: alerts.filter((a) => a.type === "overdue").length,
      readyToInvoice: alerts.filter((a) => a.type === "ready_for_invoice")
        .length,
      unpaidCount: unpaid.length,
      unpaidValue: unpaid.reduce((sum, r) => sum + r.invoicedValue, 0),
    };
  }, [alerts, workDetailRecords]);

  const isFilterActive = woVesselFilterId !== 0 || woMonthFilterId !== 0;
  const clearFilter = () => {
    setWoVesselFilterId(0);
    setWoMonthFilterId(0);
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  const invoicedTotal = wd.invoicedPaid + wd.invoicedUnpaid;
  const filteredNote = isFilterActive ? " (filtered)" : "";
  const woRows: { label: string; inProgress: number; completed: number }[] = [
    {
      label: "Docking",
      inProgress: filteredWorkOrderStats.inProgressDocking,
      completed: filteredWorkOrderStats.completedDocking,
    },
    {
      label: "Repair",
      inProgress: filteredWorkOrderStats.inProgressRepair,
      completed: filteredWorkOrderStats.completedRepair,
    },
    {
      label: "New Building",
      inProgress: filteredWorkOrderStats.inProgressNewBuilding,
      completed: filteredWorkOrderStats.completedNewBuilding,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-8 px-4 py-5 sm:space-y-10 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600 sm:text-base">
            Work orders, BASTP and invoices across all vessels.
          </p>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {[
            { label: "Projects", value: stats.totalProjects, tone: "text-slate-900" },
            {
              label: "In progress",
              value: stats.projectsInProgressTotal,
              tone: "text-blue-800",
            },
            {
              label: "Completed",
              value: stats.projectsCompletedTotal,
              tone: "text-emerald-800",
            },
          ].map((item) => (
            <div key={item.label} className="px-4 py-2.5 text-center sm:px-6">
              <dt className="text-xs text-slate-600 sm:text-sm">{item.label}</dt>
              <dd
                className={`text-xl font-semibold tabular-nums sm:text-2xl ${item.tone}`}
              >
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      {error && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-red-900">
            <span className="font-semibold">The dashboard could not load.</span>{" "}
            {error}
          </p>
          <button
            type="button"
            onClick={refetch}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-red-700 bg-white px-4 text-sm font-medium text-red-800 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {/* The one thing to look at first: what is waiting on someone. */}
      <Section
        id="attention"
        title="Needs attention"
        description="Across every vessel, whatever the filter below is set to."
      >
        <div className="grid divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Link
            to="/alerts"
            className="block p-4 transition-colors hover:bg-slate-50 sm:p-5"
          >
            <p className="text-sm font-medium text-slate-700">
              Overdue work details
            </p>
            <p
              className={`mt-1 text-4xl font-bold tabular-nums ${
                attention.overdue > 0 ? "text-red-800" : "text-slate-900"
              }`}
            >
              {attention.overdue.toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-slate-600 underline decoration-slate-400 underline-offset-2">
              {attention.overdue > 0 ? "Open the alert list" : "Nothing overdue"}
            </p>
          </Link>
          <Link
            to="/alerts"
            className="block p-4 transition-colors hover:bg-slate-50 sm:p-5"
          >
            <p className="text-sm font-medium text-slate-700">Ready to invoice</p>
            <p
              className={`mt-1 text-4xl font-bold tabular-nums ${
                attention.readyToInvoice > 0 ? "text-amber-900" : "text-slate-900"
              }`}
            >
              {attention.readyToInvoice.toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-slate-600 underline decoration-slate-400 underline-offset-2">
              {attention.readyToInvoice > 0
                ? "Open the alert list"
                : "Nothing waiting for an invoice"}
            </p>
          </Link>
          {(() => {
            const body = (
              <>
                <p className="text-sm font-medium text-slate-700">
                  Invoiced, not yet paid
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">
                  {formatCurrency(attention.unpaidValue)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {attention.unpaidCount.toLocaleString()} work detail
                  {attention.unpaidCount === 1 ? "" : "s"}
                  {canAccess("invoices") && (
                    <span className="underline decoration-slate-400 underline-offset-2">
                      {" "}
                      · Open invoices
                    </span>
                  )}
                </p>
              </>
            );
            return canAccess("invoices") ? (
              <Link
                to="/invoices"
                className="block p-4 transition-colors hover:bg-slate-50 sm:p-5"
              >
                {body}
              </Link>
            ) : (
              <div className="p-4 sm:p-5">{body}</div>
            );
          })()}
        </div>
      </Section>

      {/* Scope for the two sections that follow. */}
      <form
        role="search"
        aria-label="Filter work orders and work details"
        onSubmit={(e) => e.preventDefault()}
        className={`rounded-lg border p-4 ${
          isFilterActive
            ? "border-blue-700 bg-blue-50"
            : "border-slate-200 bg-white"
        }`}
      >
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[auto_16rem_14rem_auto]">
          <p className="text-sm font-semibold text-slate-900 sm:col-span-2 lg:col-span-1 lg:pb-2.5">
            Filter the work and payment sections
          </p>
          <div>
            <label
              htmlFor={`${filterId}-vessel`}
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Vessel
            </label>
            <SearchableSelect
              id={`${filterId}-vessel`}
              value={woVesselFilterId}
              onChange={setWoVesselFilterId}
              options={woVesselOptions}
              placeholder="All vessels"
            />
          </div>
          <div>
            <label
              htmlFor={`${filterId}-month`}
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Month of work order
            </label>
            <SearchableSelect
              id={`${filterId}-month`}
              value={woMonthFilterId}
              onChange={setWoMonthFilterId}
              options={woMonthOptions}
              placeholder="All months"
            />
          </div>
          {isFilterActive && (
            <button
              type="button"
              onClick={clearFilter}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-blue-800 bg-white px-4 text-sm font-medium text-blue-900 hover:bg-blue-100 sm:min-h-10"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Clear filter
            </button>
          )}
        </div>
        <p role="status" className="mt-2 text-sm text-slate-700">
          {isFilterActive
            ? "Showing only the selected vessel and month in Work orders, Work details and Work to payment. Needs attention, Projects and Vessels stay unfiltered."
            : "Showing every vessel and month."}
        </p>
      </form>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-6 xl:gap-8">
        <Section
          id="work-orders"
          title={`Work orders${filteredNote}`}
          description={
            isFilterActive
              ? `${filteredWorkOrderStats.totalWorkOrders.toLocaleString()} of ${stats.totalWorkOrders.toLocaleString()} work orders`
              : `${filteredWorkOrderStats.totalWorkOrders.toLocaleString()} work orders`
          }
        >
          <Panel className="space-y-6">
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[20rem] text-sm">
                <caption className="sr-only">
                  Work orders by type and status
                </caption>
                <thead>
                  <tr className="border-b border-slate-300 text-slate-700">
                    <th scope="col" className="px-3 py-2 text-left font-semibold">
                      Type
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      In progress
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      Completed
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {woRows.map((row) => (
                    <tr key={row.label}>
                      <th
                        scope="row"
                        className="px-3 py-2.5 text-left font-medium text-slate-800"
                      >
                        {row.label}
                      </th>
                      <td className={`${numberCell} text-blue-800`}>
                        {row.inProgress}
                      </td>
                      <td className={`${numberCell} text-emerald-800`}>
                        {row.completed}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-semibold">
                    <th scope="row" className="px-3 py-2.5 text-left text-slate-900">
                      All work types
                    </th>
                    <td className={`${numberCell} text-blue-800`}>
                      {filteredWorkOrderStats.inProgressTotal}
                    </td>
                    <td className={`${numberCell} text-emerald-800`}>
                      {filteredWorkOrderStats.completedTotal}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <StackedBar
              title="Original and additional work orders"
              subtitle={`Share of ${filteredWorkOrderStats.totalWorkOrders.toLocaleString()} work orders`}
              segments={[
                {
                  label: "Original",
                  value: filteredWorkOrderStats.original,
                  color: CATEGORICAL.blue,
                },
                {
                  label: "Additional",
                  value: filteredWorkOrderStats.additional,
                  color: CATEGORICAL.orange,
                },
              ]}
            />
          </Panel>
        </Section>

        <Section
          id="work-details"
          title={`Work details${filteredNote}`}
          description={
            isFilterActive
              ? `${wd.total.toLocaleString()} of ${stats.totalWorkDetails.toLocaleString()} work details`
              : `${wd.total.toLocaleString()} work details`
          }
        >
          <Panel className="space-y-6">
            <Donut
              title="Progress state"
              subtitle={`Share of all ${wd.total.toLocaleString()} work details`}
              segments={[
                {
                  label: "Completed",
                  value: wd.completed,
                  color: CATEGORICAL.blue,
                },
                {
                  label: "In progress",
                  value: wd.inProgress,
                  color: CATEGORICAL.orange,
                },
                {
                  label: "No progress",
                  value: wd.noProgress,
                  color: CATEGORICAL.aqua,
                },
              ]}
            />
            <StackedBar
              title="Deadline performance"
              subtitle={`${(wd.missedDeadline + wd.onTimeOrEarly).toLocaleString()} work details have a judged deadline`}
              segments={[
                {
                  label: "On time or early",
                  value: wd.onTimeOrEarly,
                  color: STATUS.good,
                },
                {
                  label: "Missed deadline",
                  value: wd.missedDeadline,
                  color: STATUS.critical,
                },
              ]}
            />
          </Panel>
        </Section>
      </div>

      <Section
        id="payment"
        title={`Work to payment${filteredNote}`}
        description="Where each work detail stands, from not yet in a BASTP to paid."
      >
        <Panel className="space-y-6">
          <StackedBar
            title="BASTP and invoice stage"
            subtitle={`Every one of ${wd.total.toLocaleString()} work details, in order`}
            segments={[
              {
                label: "Not made into a BASTP yet",
                value: wd.notInBastp,
                color: PIPELINE_RAMP[0],
              },
              {
                label: "In a BASTP, awaiting verification",
                value: wd.bastpDraft,
                color: PIPELINE_RAMP[1],
              },
              {
                label: "Ready for invoice",
                value: wd.bastpReady,
                color: PIPELINE_RAMP[3],
              },
              {
                label: "Invoiced, unpaid",
                value: wd.invoicedUnpaid,
                color: STATUS.warning,
              },
              {
                label: "Invoiced, paid",
                value: wd.invoicedPaid,
                color: STATUS.good,
              },
            ]}
          />
          <dl className="grid gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 sm:grid-cols-2">
            <div className="bg-white p-4">
              <dt className="text-sm font-medium text-slate-700">Paid value</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-emerald-800">
                {formatCurrency(wd.invoicedPaidValue)}
              </dd>
              <dd className="mt-0.5 text-sm text-slate-600">
                {wd.invoicedPaid.toLocaleString()} work details,{" "}
                {pct(wd.invoicedPaid, invoicedTotal)}% of those invoiced
              </dd>
            </div>
            <div className="bg-white p-4">
              <dt className="text-sm font-medium text-slate-700">
                Unpaid value
              </dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                {formatCurrency(wd.invoicedUnpaidValue)}
              </dd>
              <dd className="mt-0.5 text-sm text-slate-600">
                {wd.invoicedUnpaid.toLocaleString()} work details,{" "}
                {pct(wd.invoicedUnpaid, invoicedTotal)}% of those invoiced
              </dd>
            </div>
          </dl>
        </Panel>
      </Section>

      <VesselSection vessels={vesselSummaries} />
    </div>
  );
}
