import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, type WorkOrder } from "../../lib/supabase";

interface InvoiceDetails {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  invoice_collection_date?: string;
  invoice_number?: string;
  faktur_number?: string;
  due_date?: string;
  delivery_date?: string;
  collection_date?: string;
  receiver_name?: string;
  payment_price?: number;
  payment_status: boolean;
  payment_date?: string;
  remarks?: string;
  work_order_id: number;
  user_id: number;
}

interface InvoiceWithWorkOrder extends InvoiceDetails {
  work_order: WorkOrder & {
    vessel: {
      id: number;
      name: string;
      type: string;
      company: string;
    };
    current_progress?: number;
    latest_progress_date?: string;
  };
}

export default function InvoiceList() {
  const navigate = useNavigate();

  const [invoices, setInvoices] = useState<InvoiceWithWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "unpaid">(
    "all"
  );
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: invoiceData, error: invoiceError } = await supabase
        .from("invoice_details")
        .select(
          `
          *,
          work_order:work_order_id (
            *,
            project_progress (
              progress,
              report_date
            ),
            vessel:vessel_id (
              id,
              name,
              type,
              company
            )
          )
        `
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (invoiceError) throw invoiceError;

      // Process the invoices to add progress information
      const processedInvoices = (invoiceData || []).map((invoice) => {
        const progressRecords = invoice.work_order.project_progress || [];

        if (progressRecords.length > 0) {
          const sortedProgress = progressRecords.sort(
            (a, b) =>
              new Date(b.report_date).getTime() -
              new Date(a.report_date).getTime()
          );

          const latestProgress = sortedProgress[0]?.progress || 0;
          const latestProgressDate = sortedProgress[0]?.report_date;

          return {
            ...invoice,
            work_order: {
              ...invoice.work_order,
              current_progress: latestProgress,
              latest_progress_date: latestProgressDate,
            },
          };
        }

        return {
          ...invoice,
          work_order: {
            ...invoice.work_order,
            current_progress: 0,
            latest_progress_date: null,
          },
        };
      });

      setInvoices(processedInvoices);
    } catch (err) {
      console.error("Error fetching invoices:", err);
      setError(err instanceof Error ? err.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleMarkAsPaid = async (invoice: InvoiceWithWorkOrder) => {
    if (!window.confirm("Mark this invoice as paid?")) {
      return;
    }

    try {
      setSubmittingId(invoice.id);
      setError(null);

      const { error } = await supabase
        .from("invoice_details")
        .update({
          payment_status: true,
          payment_date: new Date().toISOString().split("T")[0],
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);

      if (error) throw error;

      setSuccess("Invoice marked as paid successfully");
      await fetchInvoices();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Error updating payment status:", err);
      setError(
        err instanceof Error ? err.message : "Failed to update payment status"
      );
    } finally {
      setSubmittingId(null);
    }
  };

  const handleMarkAsUnpaid = async (invoice: InvoiceWithWorkOrder) => {
    if (!window.confirm("Mark this invoice as unpaid?")) {
      return;
    }

    try {
      setSubmittingId(invoice.id);
      setError(null);

      const { error } = await supabase
        .from("invoice_details")
        .update({
          payment_status: false,
          payment_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);

      if (error) throw error;

      setSuccess("Invoice marked as unpaid successfully");
      await fetchInvoices();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Error updating payment status:", err);
      setError(
        err instanceof Error ? err.message : "Failed to update payment status"
      );
    } finally {
      setSubmittingId(null);
    }
  };

  const handleDeleteInvoice = async (invoice: InvoiceWithWorkOrder) => {
    if (!window.confirm("Are you sure you want to delete this invoice?")) {
      return;
    }

    try {
      setSubmittingId(invoice.id);
      setError(null);

      const { error } = await supabase
        .from("invoice_details")
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);

      if (error) throw error;

      setSuccess("Invoice deleted successfully");
      await fetchInvoices();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Error deleting invoice:", err);
      setError(err instanceof Error ? err.message : "Failed to delete invoice");
    } finally {
      setSubmittingId(null);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (!amount) return "-";
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
    }).format(amount);
  };

  // Filter invoices
  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch =
      searchTerm === "" ||
      invoice.invoice_number
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      invoice.faktur_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.work_order.customer_wo_number
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      invoice.work_order.shipyard_wo_number
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      invoice.work_order.vessel?.name
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      invoice.work_order.vessel?.company
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      invoice.receiver_name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "paid" && invoice.payment_status) ||
      (statusFilter === "unpaid" && !invoice.payment_status);

    return matchesSearch && matchesStatus;
  });

  // Calculate stats
  const totalInvoices = invoices.length;
  const paidInvoices = invoices.filter((inv) => inv.payment_status).length;
  const unpaidInvoices = totalInvoices - paidInvoices;
  const totalAmount = invoices.reduce(
    (sum, inv) => sum + (inv.payment_price || 0),
    0
  );
  const paidAmount = invoices
    .filter((inv) => inv.payment_status)
    .reduce((sum, inv) => sum + (inv.payment_price || 0), 0);

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading invoices...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Invoice Management
          </h1>
          <p className="text-gray-600 mt-2">
            Manage invoice payments and track payment status
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => navigate("/invoices/add")}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            ➕ Add Invoice
          </button>
          <button
            onClick={() => navigate("/work-orders")}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2 transition-colors"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <span className="text-red-600 mr-2">⚠️</span>
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <span className="text-green-600 mr-2">✅</span>
            <p className="text-green-700 font-medium">{success}</p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Total Invoices
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {totalInvoices}
              </p>
            </div>
            <span className="text-blue-500 text-2xl">📄</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Paid</p>
              <p className="text-2xl font-bold text-gray-900">{paidInvoices}</p>
            </div>
            <span className="text-green-500 text-2xl">✅</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Unpaid</p>
              <p className="text-2xl font-bold text-gray-900">
                {unpaidInvoices}
              </p>
            </div>
            <span className="text-red-500 text-2xl">⏳</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Value</p>
              <p className="text-lg font-bold text-gray-900">
                {formatCurrency(totalAmount)}
              </p>
            </div>
            <span className="text-purple-500 text-2xl">💰</span>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow border-l-4 border-orange-500">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Completed WOs</p>
            <p className="text-2xl font-bold text-gray-900">
              {
                invoices.filter(
                  (inv) => inv.work_order.current_progress === 100
                ).length
              }
            </p>
          </div>
          <span className="text-orange-500 text-2xl">🎯</span>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex space-x-4">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  statusFilter === "all"
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                All ({totalInvoices})
              </button>
              <button
                onClick={() => setStatusFilter("paid")}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  statusFilter === "paid"
                    ? "bg-green-100 text-green-700"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Paid ({paidInvoices})
              </button>
              <button
                onClick={() => setStatusFilter("unpaid")}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  statusFilter === "unpaid"
                    ? "bg-red-100 text-red-700"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Unpaid ({unpaidInvoices})
              </button>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Search invoices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
            </div>
          </div>
        </div>

        {/* Invoice Table */}
        <div className="p-6">
          {filteredInvoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice Details
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Work Order
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vessel
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Completion Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment Info
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
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-gray-900">
                            Invoice: {invoice.invoice_number || "-"}
                          </div>
                          <div className="text-sm text-gray-500">
                            Faktur: {invoice.faktur_number || "-"}
                          </div>
                          <div className="text-xs text-gray-400">
                            Due: {formatDate(invoice.due_date)}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-gray-900">
                            {invoice.work_order.customer_wo_number || "-"}
                          </div>
                          <div className="text-sm text-gray-500">
                            {invoice.work_order.shipyard_wo_number || "-"}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-gray-900">
                            {invoice.work_order.vessel?.name || "-"}
                          </div>
                          <div className="text-sm text-gray-500">
                            {invoice.work_order.vessel?.company || "-"}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-gray-900">
                            {formatCurrency(invoice.payment_price)}
                          </div>
                          <div className="text-sm text-gray-500">
                            Receiver: {invoice.receiver_name || "-"}
                          </div>
                          {invoice.payment_date && (
                            <div className="text-xs text-gray-400">
                              Paid: {formatDate(invoice.payment_date)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            invoice.payment_status
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {invoice.payment_status ? "✅ Paid" : "⏳ Unpaid"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/invoices/${invoice.id}`)}
                            className="text-blue-600 hover:text-blue-900 transition-colors"
                            title="View Details"
                          >
                            👁️
                          </button>
                          <button
                            onClick={() =>
                              navigate(`/invoices/${invoice.id}/edit`)
                            }
                            className="text-yellow-600 hover:text-yellow-900 transition-colors"
                            title="Edit Invoice"
                          >
                            ✏️
                          </button>
                          {invoice.payment_status ? (
                            <button
                              onClick={() => handleMarkAsUnpaid(invoice)}
                              disabled={submittingId === invoice.id}
                              className="text-orange-600 hover:text-orange-900 transition-colors disabled:opacity-50"
                              title="Mark as Unpaid"
                            >
                              {submittingId === invoice.id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600"></div>
                              ) : (
                                "↩️"
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleMarkAsPaid(invoice)}
                              disabled={submittingId === invoice.id}
                              className="text-green-600 hover:text-green-900 transition-colors disabled:opacity-50"
                              title="Mark as Paid"
                            >
                              {submittingId === invoice.id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                              ) : (
                                "💰"
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteInvoice(invoice)}
                            disabled={submittingId === invoice.id}
                            className="text-red-600 hover:text-red-900 transition-colors disabled:opacity-50"
                            title="Delete Invoice"
                          >
                            {submittingId === invoice.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                            ) : (
                              "🗑️"
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <span className="text-gray-400 text-4xl mb-4 block">📄</span>
              {searchTerm || statusFilter !== "all" ? (
                <>
                  <p className="text-gray-500 text-lg mb-2">
                    No invoices found matching your filters
                  </p>
                  <button
                    onClick={() => {
                      setSearchTerm("");
                      setStatusFilter("all");
                    }}
                    className="text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <p className="text-gray-500 text-lg mb-2">No invoices yet</p>
                  <p className="text-gray-400 text-sm mb-4">
                    Create your first invoice to get started.
                  </p>
                  <button
                    onClick={() => navigate("/invoices/add")}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    ➕ Add Invoice
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
