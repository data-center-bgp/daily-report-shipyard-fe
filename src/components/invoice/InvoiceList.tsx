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

interface WorkDetailsWithProgress {
  id: number;
  description: string;
  location?: string;
  pic?: string;
  planned_start_date?: string;
  target_close_date?: string;
  actual_start_date?: string;
  actual_close_date?: string;
  current_progress: number;
  latest_progress_date?: string;
  progress_count: number;
  verification_status: boolean;
  verification_date?: string;
  work_progress: Array<{
    progress_percentage: number;
    report_date: string;
    evidence_url?: string;
    storage_path?: string;
    created_at: string;
  }>;
}

interface CompletedWorkOrder extends WorkOrder {
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
  invoice_details?: InvoiceDetails;
}

export default function InvoiceList() {
  const navigate = useNavigate();

  const [workOrders, setWorkOrders] = useState<CompletedWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "ready" | "invoiced" | "paid" | "unpaid"
  >("all");
  const [submittingPayment, setSubmittingPayment] = useState<number | null>(
    null
  );

  const fetchCompletedWorkOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      console.log("🔍 Fetching completed work orders with invoice details...");

      // Fetch all work orders with details
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

      console.log("📋 Work orders fetched:", workOrderData?.length || 0);

      // Get existing invoices with full details
      const { data: existingInvoices, error: invoiceError } = await supabase
        .from("invoice_details")
        .select("*")
        .is("deleted_at", null);

      if (invoiceError) {
        console.error("Error fetching existing invoices:", invoiceError);
      }

      const invoiceMap = new Map<number, InvoiceDetails>();
      (existingInvoices || []).forEach((invoice) => {
        invoiceMap.set(invoice.work_order_id, invoice);
      });

      console.log("📄 Invoices fetched:", existingInvoices?.length || 0);

      // Process work orders with progress data
      const processedWorkOrders = (workOrderData || []).map((wo) => {
        const workDetails = wo.work_details || [];

        const workDetailsWithProgress = workDetails.map((detail) => {
          const progressRecords = detail.work_progress || [];
          const verificationRecords = detail.work_verification || [];

          if (progressRecords.length === 0) {
            return {
              ...detail,
              current_progress: 0,
              latest_progress_date: undefined,
              progress_count: 0,
              verification_status: verificationRecords.some(
                (v) => v.work_verification === true
              ),
              verification_date: verificationRecords.find(
                (v) => v.work_verification === true
              )?.verification_date,
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
            progress_count: progressRecords.length,
            verification_status: verificationRecords.some(
              (v) => v.work_verification === true
            ),
            verification_date: verificationRecords.find(
              (v) => v.work_verification === true
            )?.verification_date,
          };
        });

        let overallProgress = 0;
        let hasProgressData = false;

        if (workDetailsWithProgress.length > 0) {
          const totalProgress = workDetailsWithProgress.reduce(
            (sum, detail) => sum + (detail.current_progress || 0),
            0
          );
          overallProgress = Math.round(
            totalProgress / workDetailsWithProgress.length
          );
          hasProgressData = workDetailsWithProgress.some(
            (detail) => detail.current_progress > 0
          );
        }

        const isFullyCompleted =
          workDetailsWithProgress.length > 0 &&
          workDetailsWithProgress.every(
            (detail) => detail.current_progress === 100
          );

        const verificationStatus = workDetailsWithProgress.some(
          (detail) => detail.verification_status
        );

        const invoiceDetails = invoiceMap.get(wo.id);
        const hasExistingInvoice = !!invoiceDetails;

        let completionDate: string | undefined;
        if (isFullyCompleted) {
          const completedDetails = workDetailsWithProgress.filter(
            (d) => d.current_progress === 100
          );
          const latestCompletionDates = completedDetails
            .filter((d) => d.latest_progress_date)
            .map((d) => d.latest_progress_date!)
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

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
          invoice_details: invoiceDetails,
        };
      });

      // Filter to only show completed work orders
      const completedWorkOrders = processedWorkOrders.filter(
        (wo) => wo.is_fully_completed
      );

      setWorkOrders(completedWorkOrders);
    } catch (err) {
      console.error("❌ Error fetching completed work orders:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load completed work orders"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompletedWorkOrders();
  }, [fetchCompletedWorkOrders]);

  const handleCreateInvoice = (workOrderId: number) => {
    navigate(`/invoices/add?work_order_id=${workOrderId}`);
  };

  const handleMarkAsPaid = async (invoice: InvoiceDetails) => {
    try {
      setSubmittingPayment(invoice.id);
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

      setSuccess("Payment marked as completed successfully!");
      await fetchCompletedWorkOrders();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Error updating payment status:", err);
      setError(
        err instanceof Error ? err.message : "Failed to update payment status"
      );
    } finally {
      setSubmittingPayment(null);
    }
  };

  const handleMarkAsUnpaid = async (invoice: InvoiceDetails) => {
    try {
      setSubmittingPayment(invoice.id);
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

      setSuccess("Payment status updated to unpaid");
      await fetchCompletedWorkOrders();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Error updating payment status:", err);
      setError(
        err instanceof Error ? err.message : "Failed to update payment status"
      );
    } finally {
      setSubmittingPayment(null);
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

  const getDaysUntilDue = (dueDate: string | null | undefined) => {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    const today = new Date();
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getDueDateStatus = (
    dueDate: string | null | undefined,
    isPaid: boolean
  ) => {
    if (isPaid)
      return { status: "paid", color: "text-green-600", text: "Paid" };

    const days = getDaysUntilDue(dueDate);
    if (days === null)
      return { status: "unknown", color: "text-gray-500", text: "No due date" };

    if (days < 0)
      return {
        status: "overdue",
        color: "text-red-600",
        text: `${Math.abs(days)} days overdue`,
      };
    if (days === 0)
      return {
        status: "due-today",
        color: "text-orange-600",
        text: "Due today",
      };
    if (days <= 7)
      return {
        status: "due-soon",
        color: "text-yellow-600",
        text: `Due in ${days} days`,
      };
    return {
      status: "normal",
      color: "text-gray-600",
      text: `Due in ${days} days`,
    };
  };

  // Filter work orders
  const filteredWorkOrders = workOrders.filter((wo) => {
    const matchesSearch =
      searchTerm === "" ||
      wo.customer_wo_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.shipyard_wo_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.vessel?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.vessel?.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.invoice_details?.invoice_number
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      wo.invoice_details?.faktur_number
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      wo.invoice_details?.receiver_name
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "ready" && !wo.has_existing_invoice) ||
      (statusFilter === "invoiced" && wo.has_existing_invoice) ||
      (statusFilter === "paid" && wo.invoice_details?.payment_status) ||
      (statusFilter === "unpaid" &&
        wo.invoice_details &&
        !wo.invoice_details.payment_status);

    return matchesSearch && matchesStatus;
  });

  // Calculate stats
  const totalCompleted = workOrders.length;
  const readyForInvoicing = workOrders.filter(
    (wo) => !wo.has_existing_invoice
  ).length;
  const alreadyInvoiced = workOrders.filter(
    (wo) => wo.has_existing_invoice
  ).length;
  const paidInvoices = workOrders.filter(
    (wo) => wo.invoice_details?.payment_status
  ).length;
  const unpaidInvoices = workOrders.filter(
    (wo) => wo.invoice_details && !wo.invoice_details.payment_status
  ).length;
  const totalInvoiceValue = workOrders.reduce(
    (sum, wo) => sum + (wo.invoice_details?.payment_price || 0),
    0
  );
  const paidValue = workOrders
    .filter((wo) => wo.invoice_details?.payment_status)
    .reduce((sum, wo) => sum + (wo.invoice_details?.payment_price || 0), 0);
  const overdueInvoices = workOrders.filter((wo) => {
    if (!wo.invoice_details || wo.invoice_details.payment_status) return false;
    const days = getDaysUntilDue(wo.invoice_details.due_date);
    return days !== null && days < 0;
  }).length;

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading invoice data...</span>
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
            Finance Dashboard
          </h1>
          <p className="text-gray-600 mt-2">
            Manage invoice payments and track financial status
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => navigate("/invoices/add")}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            ➕ Create Invoice
          </button>
          <button
            onClick={() => navigate("/work-orders")}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2 transition-colors"
          >
            📋 Work Orders
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

      {/* Finance Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Total Invoices
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {alreadyInvoiced}
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

        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Ready for Invoice
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {readyForInvoicing}
              </p>
            </div>
            <span className="text-orange-500 text-2xl">🏁</span>
          </div>
        </div>
      </div>

      {/* Finance Table */}
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
                All ({totalCompleted})
              </button>
              <button
                onClick={() => setStatusFilter("ready")}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  statusFilter === "ready"
                    ? "bg-green-100 text-green-700"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Ready ({readyForInvoicing})
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
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Search invoices, vessels, companies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
            </div>
          </div>
        </div>

        <div className="p-6">
          {filteredWorkOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice & Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount & Payment
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Due Date & Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quick Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredWorkOrders.map((wo) => (
                    <tr key={wo.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {wo.invoice_details ? (
                            <>
                              <div className="text-sm font-medium text-gray-900">
                                Invoice:{" "}
                                {wo.invoice_details.invoice_number || "-"}
                              </div>
                              <div className="text-sm text-gray-500">
                                Faktur:{" "}
                                {wo.invoice_details.faktur_number || "-"}
                              </div>
                            </>
                          ) : (
                            <div className="text-sm font-medium text-blue-600">
                              Ready for invoicing
                            </div>
                          )}
                          <div className="text-sm font-medium text-gray-900">
                            {wo.vessel?.name || "-"}
                          </div>
                          <div className="text-sm text-gray-500">
                            {wo.vessel?.company || "-"}
                          </div>
                          {wo.invoice_details?.receiver_name && (
                            <div className="text-xs text-gray-400">
                              Receiver: {wo.invoice_details.receiver_name}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {wo.invoice_details ? (
                          <div className="space-y-1">
                            <div className="text-lg font-bold text-gray-900">
                              {formatCurrency(wo.invoice_details.payment_price)}
                            </div>
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                wo.invoice_details.payment_status
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {wo.invoice_details.payment_status
                                ? "✅ Paid"
                                : "⏳ Unpaid"}
                            </span>
                            {wo.invoice_details.payment_date && (
                              <div className="text-xs text-gray-500">
                                Paid:{" "}
                                {formatDate(wo.invoice_details.payment_date)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500 italic">
                            Create invoice first
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {wo.invoice_details ? (
                          <div className="space-y-1">
                            <div className="text-sm text-gray-900">
                              {formatDate(wo.invoice_details.due_date)}
                            </div>
                            <div
                              className={`text-xs font-medium ${
                                getDueDateStatus(
                                  wo.invoice_details.due_date,
                                  wo.invoice_details.payment_status
                                ).color
                              }`}
                            >
                              {
                                getDueDateStatus(
                                  wo.invoice_details.due_date,
                                  wo.invoice_details.payment_status
                                ).text
                              }
                            </div>
                            <div className="text-xs text-gray-400">
                              Created:{" "}
                              {formatDate(wo.invoice_details.created_at)}
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            🏁 Work Complete
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2">
                          {!wo.has_existing_invoice ? (
                            <>
                              <button
                                onClick={() => handleCreateInvoice(wo.id)}
                                className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 transition-colors"
                                title="Create Invoice"
                              >
                                📄 Create Invoice
                              </button>
                              <button
                                onClick={() =>
                                  navigate(`/work-orders/${wo.id}`)
                                }
                                className="text-blue-600 hover:text-blue-900 transition-colors text-xs"
                                title="View Work Details"
                              >
                                📋 View Work
                              </button>
                            </>
                          ) : (
                            <>
                              {!wo.invoice_details?.payment_status ? (
                                <button
                                  onClick={() =>
                                    handleMarkAsPaid(wo.invoice_details!)
                                  }
                                  disabled={
                                    submittingPayment === wo.invoice_details?.id
                                  }
                                  className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                                  title="Mark as Paid"
                                >
                                  {submittingPayment ===
                                  wo.invoice_details?.id ? (
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                  ) : (
                                    "💰 Mark Paid"
                                  )}
                                </button>
                              ) : (
                                <button
                                  onClick={() =>
                                    handleMarkAsUnpaid(wo.invoice_details!)
                                  }
                                  disabled={
                                    submittingPayment === wo.invoice_details?.id
                                  }
                                  className="bg-orange-600 text-white px-3 py-1 rounded text-xs hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                                  title="Mark as Unpaid"
                                >
                                  {submittingPayment ===
                                  wo.invoice_details?.id ? (
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                  ) : (
                                    "↩️ Mark Unpaid"
                                  )}
                                </button>
                              )}
                              <button
                                onClick={() =>
                                  navigate(
                                    `/invoices/${wo.invoice_details?.id}/edit`
                                  )
                                }
                                className="text-blue-600 hover:text-blue-900 transition-colors text-xs"
                                title="Edit Invoice"
                              >
                                ✏️ Edit
                              </button>
                              <button
                                onClick={() =>
                                  navigate(
                                    `/vessel/${wo.vessel?.id}/work-orders`
                                  )
                                }
                                className="text-gray-600 hover:text-gray-900 transition-colors text-xs"
                                title="View Work Details"
                              >
                                📋 Work
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <span className="text-gray-400 text-4xl mb-4 block">💰</span>
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
                  <p className="text-gray-500 text-lg mb-2">
                    No invoices to manage yet
                  </p>
                  <p className="text-gray-400 text-sm mb-4">
                    Complete work orders will appear here for invoicing and
                    payment tracking.
                  </p>
                  <div className="space-x-3">
                    <button
                      onClick={() => navigate("/work-orders")}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      📋 View Work Orders
                    </button>
                    <button
                      onClick={() => navigate("/invoices/add")}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                    >
                      📄 Create Invoice
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
