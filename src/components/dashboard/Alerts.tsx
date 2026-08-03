import { useState } from "react";
import { useDashboardData, type DashboardAlert } from "../../hooks/useDashboardData";

const PER_PAGE = 10;

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

function AlertCard({ alert }: { alert: DashboardAlert }) {
  return (
    <div className={`p-4 rounded-lg border ${getAlertColor(alert.priority)}`}>
      <div className="flex items-start space-x-3">
        <span className="text-lg">{getAlertIcon(alert.type)}</span>
        <div className="flex-1">
          {/* The work item itself — without this, every alert on the same
              WO with the same target date renders as an identical-looking
              card, which is what made this look like a duplication bug. */}
          <div className="font-medium text-sm text-gray-900">
            {alert.workDetailDescription || "(no description)"}
          </div>
          <div className="text-sm font-semibold text-gray-700 mt-0.5">
            {alert.vesselName}
          </div>
          <div className="text-xs text-gray-600 mb-1">
            {alert.vesselCompany} · {alert.woLabel}
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
  );
}

function Pagination({
  page,
  totalPages,
  onPageChange,
  totalCount,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalCount: number;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-4 flex items-center justify-between">
      <div className="text-sm text-gray-600">
        Showing {(page - 1) * PER_PAGE + 1} to{" "}
        {Math.min(page * PER_PAGE, totalCount)} of {totalCount}
      </div>

      <div className="flex items-center space-x-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-sm"
        >
          ← Previous
        </button>

        <div className="flex space-x-1">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const pageNum =
              Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`px-3 py-2 text-sm rounded-lg ${
                  pageNum === page
                    ? "bg-blue-600 text-white"
                    : "border border-gray-300 hover:bg-gray-50"
                }`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-sm"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

function AlertSection({
  title,
  alerts,
}: {
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
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        {title} ({alerts.length})
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pageAlerts.map((alert) => (
          <AlertCard key={alert.key} alert={alert} />
        ))}
      </div>
      <Pagination
        page={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        totalCount={alerts.length}
      />
    </div>
  );
}

export default function Alerts() {
  const { alerts, loading, error, refetch } = useDashboardData();

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading alerts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">{error}</p>
          <button
            onClick={refetch}
            className="mt-2 text-red-600 hover:text-red-800 underline"
          >
            Retry
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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
        <p className="text-sm text-gray-600 mt-1">
          {alerts.length} active alert{alerts.length === 1 ? "" : "s"} —{" "}
          {overdueAlerts.length} overdue, {readyForInvoiceAlerts.length} ready
          for invoicing
        </p>
      </div>

      {alerts.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No active alerts right now.
        </div>
      ) : (
        <>
          <AlertSection title="Overdue" alerts={overdueAlerts} />
          <AlertSection
            title="Ready for Invoicing"
            alerts={readyForInvoiceAlerts}
          />
        </>
      )}
    </div>
  );
}
