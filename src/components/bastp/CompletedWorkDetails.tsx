import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { getLatestProgressRecord } from "../../utils/progressPercentage";
import SearchableSelect from "../common/SearchableSelect";
import Pagination from "../common/Pagination";
import {
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

interface CompletedWorkDetailRow {
  id: number;
  description: string;
  quantity: number;
  uom: string;
  vesselId: number;
  vesselName: string;
  vesselCompany: string;
  shipyardWoNumber: string | null;
  customerWoNumber: string | null;
  completedOn: string | null;
  inBastp: boolean;
  bastpId: number | null;
  bastpNumber: string | null;
  bastpStatus: string | null;
}

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

type BastpFilter = "ALL" | "IN_BASTP" | "NOT_IN_BASTP";

const PAGE_SIZE = 25;

export default function CompletedWorkDetails() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CompletedWorkDetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [vesselFilterId, setVesselFilterId] = useState(0);
  const [monthFilterId, setMonthFilterId] = useState(0);
  const [bastpFilter, setBastpFilter] = useState<BastpFilter>("ALL");
  const [page, setPage] = useState(1);

  const fetchCompletedWorkDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Queried from work_order (a few hundred rows) rather than work_details
      // directly (thousands of rows) — Supabase/PostgREST caps a single
      // request at 1000 rows, and a work_details-rooted query would silently
      // truncate well before covering every vessel. Matches the same shape
      // useDashboardData.tsx uses for exactly this reason.
      const { data, error: fetchError } = await supabase
        .from("work_order")
        .select(
          `
          vessel:vessel_id ( id, name, company ),
          shipyard_wo_number,
          customer_wo_number,
          work_details (
            id,
            description,
            quantity,
            uom,
            cancelled_at,
            work_progress ( progress_percentage, report_date, created_at ),
            bastp_work_details ( id, deleted_at, bastp:bastp_id ( id, number, status ) )
          )
        `,
        )
        .is("deleted_at", null);

      if (fetchError) throw fetchError;

      const completed: CompletedWorkDetailRow[] = [];

      (data || []).forEach((wo: any) => {
        if (!wo.vessel) return;

        (wo.work_details || [])
          .filter((wd: any) => !wd.cancelled_at)
          .forEach((wd: any) => {
            const progressRecords: {
              progress_percentage: number;
              report_date: string;
              created_at: string;
            }[] = wd.work_progress || [];
            const latest = getLatestProgressRecord(progressRecords);
            const progress = latest?.progress_percentage ?? 0;
            if (progress !== 100) return;

            const bastpLink = (wd.bastp_work_details || []).find(
              (bwd: any) => !bwd.deleted_at,
            );

            completed.push({
              id: wd.id,
              description: wd.description,
              quantity: wd.quantity,
              uom: wd.uom,
              vesselId: wo.vessel.id,
              vesselName: wo.vessel.name ?? "Unknown",
              vesselCompany: wo.vessel.company ?? "",
              shipyardWoNumber: wo.shipyard_wo_number ?? null,
              customerWoNumber: wo.customer_wo_number ?? null,
              completedOn: latest?.report_date ?? null,
              inBastp: !!bastpLink,
              bastpId: bastpLink?.bastp?.id ?? null,
              bastpNumber: bastpLink?.bastp?.number ?? null,
              bastpStatus: bastpLink?.bastp?.status ?? null,
            });
          });
      });

      setRows(completed);
    } catch (err) {
      console.error("Error fetching completed work details:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load completed work details",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompletedWorkDetails();
  }, [fetchCompletedWorkDetails]);

  const vesselOptions = useMemo(() => {
    const byId = new Map<number, string>();
    rows.forEach((r) => {
      if (!byId.has(r.vesselId)) byId.set(r.vesselId, r.vesselName);
    });
    return Array.from(byId.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    rows.forEach((r) => {
      if (r.completedOn) months.add(r.completedOn.slice(0, 7));
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
  }, [rows]);

  const monthFilterValue =
    monthOptions.find((m) => m.id === monthFilterId)?.value ?? null;

  const bastpCounts = useMemo(
    () => ({
      ALL: rows.length,
      IN_BASTP: rows.filter((r) => r.inBastp).length,
      NOT_IN_BASTP: rows.filter((r) => !r.inBastp).length,
    }),
    [rows],
  );

  const filteredRows = rows.filter((r) => {
    if (vesselFilterId !== 0 && r.vesselId !== vesselFilterId) return false;
    if (monthFilterValue && r.completedOn?.slice(0, 7) !== monthFilterValue) {
      return false;
    }
    if (bastpFilter === "IN_BASTP" && !r.inBastp) return false;
    if (bastpFilter === "NOT_IN_BASTP" && r.inBastp) return false;

    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      r.description?.toLowerCase().includes(q) ||
      r.vesselName?.toLowerCase().includes(q) ||
      r.shipyardWoNumber?.toLowerCase().includes(q) ||
      r.customerWoNumber?.toLowerCase().includes(q)
    );
  });

  // Any filter change can shrink the result set below the current page —
  // reset to page 1 whenever the filters themselves change, not on every
  // render (a page 1 -> effect -> page 1 loop would be harmless but wasteful).
  useEffect(() => {
    setPage(1);
  }, [searchTerm, vesselFilterId, monthFilterId, bastpFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = filteredRows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">
          Loading completed work details...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
              <p className="text-red-700 font-medium">{error}</p>
            </div>
            <button
              onClick={fetchCompletedWorkDetails}
              className="flex items-center gap-1 text-red-700 hover:text-red-900 text-sm"
            >
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-gray-500">
          <p className="text-xs font-medium text-gray-600">
            Completed Work Details
          </p>
          <p className="text-2xl font-bold text-gray-900">
            {bastpCounts.ALL}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-amber-500">
          <p className="text-xs font-medium text-gray-600">
            Not Yet In a BASTP
          </p>
          <p className="text-2xl font-bold text-gray-900">
            {bastpCounts.NOT_IN_BASTP}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
          <p className="text-xs font-medium text-gray-600">Already In a BASTP</p>
          <p className="text-2xl font-bold text-gray-900">
            {bastpCounts.IN_BASTP}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Search className="w-4 h-4" /> Search
            </label>
            <input
              type="text"
              placeholder="Search description, vessel, WO number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Vessel
            </label>
            <SearchableSelect
              value={vesselFilterId}
              onChange={setVesselFilterId}
              options={vesselOptions}
              placeholder="All Vessels"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Completed Month
            </label>
            <SearchableSelect
              value={monthFilterId}
              onChange={setMonthFilterId}
              options={monthOptions}
              placeholder="All Months"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: "ALL", label: "All" },
              { key: "NOT_IN_BASTP", label: "Not in BASTP" },
              { key: "IN_BASTP", label: "In BASTP" },
            ] as { key: BastpFilter; label: string }[]
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => setBastpFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                bastpFilter === f.key
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {f.label} ({bastpCounts[f.key]})
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Work Detail
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vessel
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Work Order
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Completed On
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    BASTP Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedRows.map((wd) => (
                  <tr key={wd.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 max-w-xs">
                        {wd.description}
                      </div>
                      <div className="text-xs text-gray-500">
                        {wd.quantity} {wd.uom}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {wd.vesselName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {wd.vesselCompany}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {wd.shipyardWoNumber || wd.customerWoNumber || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(wd.completedOn)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {wd.inBastp ? (
                        <button
                          onClick={() => navigate(`/bastp/${wd.bastpId}`)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200 transition-colors"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {wd.bastpNumber || "In BASTP"}
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          <XCircle className="w-3 h-3" /> Not in BASTP
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <CheckCircle2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">
              No completed work details match your filters
            </p>
          </div>
        )}
      </div>

      <Pagination
        page={currentPage}
        totalItems={filteredRows.length}
        onPageChange={setPage}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
