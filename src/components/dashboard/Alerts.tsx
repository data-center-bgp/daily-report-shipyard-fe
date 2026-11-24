import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronRight, Receipt } from "lucide-react";
import {
  useDashboardData,
  type DashboardAlert,
} from "../../hooks/useDashboardData";
import LoadingState from "../common/LoadingState";
import { Section } from "./widgets";

const PER_PAGE = 10;

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Each alert names its kind in words and with an icon, so the red and amber
// tint is a second cue, never the only one.
const ALERT_STYLE: Record<
  DashboardAlert["type"],
  { label: string; tag: string; Icon: typeof AlertTriangle }
> = {
  overdue: {
    label: "Overdue",
    tag: "bg-red-50 text-red-800",
    Icon: AlertTriangle,
  },
  ready_for_invoice: {
    label: "Ready to invoice",
    tag: "bg-amber-50 text-amber-900",
    Icon: Receipt,
  },
};

function AlertCard({ alert }: { alert: DashboardAlert }) {
  const { label, tag, Icon } = ALERT_STYLE[alert.type];
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4">
      <span
        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${tag}`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
        {alert.priority === "high" && " · High priority"}
      </span>
      {/* The work item itself: without it, alerts on the same work order
          with the same target date look like duplicates. */}
      <p className="mt-2 text-sm font-semibold text-slate-900">
        {alert.workDetailDescription || "(no description)"}
      </p>
      <p className="mt-0.5 text-sm font-medium text-slate-800">
        {alert.vesselName}
      </p>
      <p className="text-sm text-slate-600">
        {alert.vesselCompany} · {alert.woLabel}
      </p>
      <p className="mt-2 text-sm text-slate-800">{alert.message}</p>
      {alert.targetCloseDate && (
        <p className="mt-1 text-sm text-slate-600">
          Target: {formatDate(alert.targetCloseDate)}
        </p>
      )}
    </li>
  );
}

function Pagination({
  label,
  page,
  totalPages,
  onPageChange,
  totalCount,
}: {
  label: string;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalCount: number;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label={`${label} pages`}
      className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between"
    >
      <p className="text-sm tabular-nums text-slate-600">
        Showing {(page - 1) * PER_PAGE + 1} to{" "}
        {Math.min(page * PER_PAGE, totalCount)} of {totalCount}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          aria-label="Previous page"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white sm:h-10 sm:w-10"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const pageNum = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
          return (
            <button
              key={pageNum}
              type="button"
              onClick={() => onPageChange(pageNum)}
              aria-label={`Page ${pageNum}`}
              aria-current={pageNum === page ? "page" : undefined}
              className={`h-11 min-w-11 rounded-md px-3 text-sm font-medium tabular-nums sm:h-10 sm:min-w-10 ${
                pageNum === page
                  ? "bg-blue-950 text-white"
                  : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              {pageNum}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          aria-label="Next page"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white sm:h-10 sm:w-10"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

function AlertSection({
  id,
  title,
  alerts,
}: {
  id: string;
  title: string;
  alerts: DashboardAlert[];
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(alerts.length / PER_PAGE);
  // Clamp defensively in case the underlying alert count shrinks (e.g. after
  // a refetch) while the user is sitting on a now out-of-range page.
  const currentPage = Math.min(page, totalPages) || 1;
  const pageAlerts = alerts.slice(
    (currentPage - 1) * PER_PAGE,
    currentPage * PER_PAGE,
  );

  if (alerts.length === 0) return null;

  return (
    <Section id={id} title={`${title} (${alerts.length})`}>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {pageAlerts.map((alert) => (
          <AlertCard key={alert.key} alert={alert} />
        ))}
      </ul>
      <Pagination
        label={title}
        page={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        totalCount={alerts.length}
      />
    </Section>
  );
}

export default function Alerts() {
  const { alerts, loading, error, refetch } = useDashboardData();

  if (loading) {
    return <LoadingState label="Loading alerts..." />;
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[96rem] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-red-900">
            <span className="font-semibold">Alerts could not load.</span> {error}
          </p>
          <button
            type="button"
            onClick={refetch}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-red-700 bg-white px-4 text-sm font-medium text-red-800 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const overdueAlerts = alerts.filter((a) => a.type === "overdue");
  const readyForInvoiceAlerts = alerts.filter(
    (a) => a.type === "ready_for_invoice",
  );

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-8 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Alerts</h1>
        <p className="mt-1 text-sm text-slate-600 sm:text-base">
          {alerts.length} active alert{alerts.length === 1 ? "" : "s"}:{" "}
          {overdueAlerts.length} overdue, {readyForInvoiceAlerts.length} ready
          for invoicing.
        </p>
      </header>

      {alerts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
          <p className="text-sm font-medium text-slate-900">
            No active alerts right now
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Work details past their target date, and BASTPs ready to invoice,
            show up here.
          </p>
          <Link
            to="/"
            className="mt-4 inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Back to the dashboard
          </Link>
        </div>
      ) : (
        <>
          <AlertSection id="overdue" title="Overdue" alerts={overdueAlerts} />
          <AlertSection
            id="ready-to-invoice"
            title="Ready for invoicing"
            alerts={readyForInvoiceAlerts}
          />
        </>
      )}
    </div>
  );
}
