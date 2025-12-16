import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import type { BASTPWithDetails, BASTPStatus } from "../../types/bastp.types";

export default function BASTP() {
  const navigate = useNavigate();
  const [bastps, setBastps] = useState<BASTPWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<BASTPStatus | "ALL">("ALL");

  const fetchBASTPs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("bastp")
        .select(
          `
          *,
          vessel:vessel_id (
            id,
            name,
            type,
            company
          ),
          profiles:user_id (
            id,
            name,
            email
          ),
          bastp_work_details (
            id,
            work_details (
              id,
              description,
              quantity,
              uom,
              work_order (
                id,
                shipyard_wo_number,
                customer_wo_number
              )
            )
          )
        `
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setBastps(data || []);
    } catch (err) {
      console.error("Error fetching BASTPs:", err);
      setError(err instanceof Error ? err.message : "Failed to load BASTPs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBASTPs();
  }, [fetchBASTPs]);

  // --- AUTO UPDATE STATUS ---
  useEffect(() => {
    if (!loading && bastps.length > 0) {
      bastps.forEach(async (bastp) => {
        // 1. Check if all work details are verified -> VERIFIED
        if (
          bastp.status === "DRAFT" &&
          bastp.bastp_work_details &&
          bastp.bastp_work_details.length > 0
        ) {
          const workDetailIds = (bastp.bastp_work_details ?? [])
            .map((bwd: any) => bwd.work_details?.id)
            .filter(Boolean);

          if (workDetailIds.length === 0) return;

          const { data: verifications, error } = await supabase
            .from("work_verification")
            .select("work_details_id")
            .in("work_details_id", workDetailIds);

          if (!error) {
            const verifiedIds = (verifications || []).map(
              (v) => v.work_details_id
            );
            const allVerified = workDetailIds.every((id) =>
              verifiedIds.includes(id)
            );
            if (allVerified) {
              await supabase
                .from("bastp")
                .update({ status: "VERIFIED" })
                .eq("id", bastp.id);
              fetchBASTPs();
              return;
            }
          }
        }

        // 2. If document uploaded and status is VERIFIED -> READY_FOR_INVOICE
        if (bastp.storage_path && bastp.status === "VERIFIED") {
          // ✅ Check storage_path instead
          await supabase
            .from("bastp")
            .update({ status: "READY_FOR_INVOICE" })
            .eq("id", bastp.id);
          fetchBASTPs();
        }

        // 3. If invoice created for this BASTP -> INVOICED
        // Check if there's an invoice with this bastp_id
        if (bastp.status === "READY_FOR_INVOICE") {
          const { data: invoices, error: invoiceError } = await supabase
            .from("invoice")
            .select("id")
            .eq("bastp_id", bastp.id)
            .limit(1);

          if (!invoiceError && invoices && invoices.length > 0) {
            await supabase
              .from("bastp")
              .update({ status: "INVOICED" })
              .eq("id", bastp.id);
            fetchBASTPs();
          }
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bastps, loading]);
  // --- END AUTO UPDATE ---

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: BASTPStatus) => {
    const statusConfig = {
      DRAFT: { bg: "bg-gray-100", text: "text-gray-700", icon: "📝" },
      VERIFIED: { bg: "bg-blue-100", text: "text-blue-700", icon: "✅" },
      READY_FOR_INVOICE: {
        bg: "bg-green-100",
        text: "text-green-700",
        icon: "💰",
      },
      INVOICED: { bg: "bg-emerald-100", text: "text-emerald-700", icon: "✓" },
    };

    const config = statusConfig[status];
    return (
      <span
        className={`px-3 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}
      >
        {config.icon} {status.replace(/_/g, " ")}
      </span>
    );
  };

  const filteredBASTPs = bastps.filter((bastp) => {
    const statusMatch = statusFilter === "ALL" || bastp.status === statusFilter;
    if (!statusMatch) return false;

    if (!searchTerm) return true;

    const searchLower = searchTerm.toLowerCase();
    return (
      bastp.number?.toLowerCase().includes(searchLower) ||
      bastp.vessel?.name?.toLowerCase().includes(searchLower) ||
      bastp.vessel?.company?.toLowerCase().includes(searchLower)
    );
  });

  const statusCounts = {
    ALL: bastps.length,
    DRAFT: bastps.filter((b) => b.status === "DRAFT").length,
    VERIFIED: bastps.filter((b) => b.status === "VERIFIED").length,
    READY_FOR_INVOICE: bastps.filter((b) => b.status === "READY_FOR_INVOICE")
      .length,
    INVOICED: bastps.filter((b) => b.status === "INVOICED").length,
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading BASTPs...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">BASTP Management</h1>
          <p className="text-gray-600 mt-2">
            Berita Acara Serah Terima Pekerjaan (Work Handover Minutes)
          </p>
        </div>

        <button
          onClick={() => navigate("/bastp/create")}
          className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-6 py-3 rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all duration-200 flex items-center gap-2 shadow-lg"
        >
          ➕ Create BASTP
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <span className="text-red-600 mr-2">⚠️</span>
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-gray-500">
          <p className="text-xs font-medium text-gray-600">Total</p>
          <p className="text-2xl font-bold text-gray-900">{statusCounts.ALL}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-gray-400">
          <p className="text-xs font-medium text-gray-600">Draft</p>
          <p className="text-2xl font-bold text-gray-900">
            {statusCounts.DRAFT}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
          <p className="text-xs font-medium text-gray-600">Verified</p>
          <p className="text-2xl font-bold text-gray-900">
            {statusCounts.VERIFIED}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
          <p className="text-xs font-medium text-gray-600">Ready for Invoice</p>
          <p className="text-2xl font-bold text-gray-900">
            {statusCounts.READY_FOR_INVOICE}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              🔍 Search
            </label>
            <input
              type="text"
              placeholder="Search by BASTP number, vessel name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              📊 Status Filter
            </label>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as BASTPStatus | "ALL")
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="ALL">All Status</option>
              <option value="DRAFT">Draft</option>
              <option value="VERIFIED">Verified</option>
              <option value="READY_FOR_INVOICE">Ready for Invoice</option>
              <option value="INVOICED">Invoiced</option>
            </select>
          </div>
        </div>
      </div>

      {/* BASTP Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredBASTPs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    BASTP Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vessel
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Delivery Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Work Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredBASTPs.map((bastp) => (
                  <tr key={bastp.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {bastp.number}
                      </div>
                      {bastp.storage_path && (
                        <div className="text-xs text-green-600">
                          📄 Document
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {bastp.vessel?.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {bastp.vessel?.type} • {bastp.vessel?.company}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(bastp.date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(bastp.delivery_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                        {bastp.total_work_details} items
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(bastp.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {bastp.profiles?.name || "Unknown"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => navigate(`/bastp/${bastp.id}`)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View
                      </button>
                      <button
                        onClick={() => navigate(`/bastp/edit/${bastp.id}`)}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <span className="text-gray-400 text-4xl mb-4 block">📋</span>
            <p className="text-gray-500 text-lg">No BASTPs found</p>
            <button
              onClick={() => navigate("/bastp/create")}
              className="mt-4 text-blue-600 hover:text-blue-800"
            >
              Create your first BASTP
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
