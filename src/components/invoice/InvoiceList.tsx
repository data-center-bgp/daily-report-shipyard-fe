import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, type WorkOrder } from "../../lib/supabase";

interface InvoiceDetails {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  wo_document_collection_date?: string;
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
  work_order?: {
    id: number;
    customer_wo_number?: string;
    shipyard_wo_number?: string;
    vessel?: {
      id: number;
      name: string;
      type: string;
      company: string;
    };
  };
  invoice_work_details?: Array<{
    id: number;
    work_details_id: number;
    work_details: {
      id: number;
      description: string;
      location?: string;
      pic?: string;
    };
  }>;
}

// Add interface for work progress items
interface WorkProgressItem {
  progress_percentage: number;
  report_date: string;
  evidence_url?: string;
  storage_path?: string;
  created_at: string;
}

// Add interface for work verification items
interface WorkVerificationItem {
  work_verification: boolean;
  verification_date?: string;
}

// Add interface for raw work details from Supabase
interface RawWorkDetail {
  id: number;
  description: string;
  location?: string;
  pic?: string;
  planned_start_date?: string;
  target_close_date?: string;
  actual_start_date?: string;
  actual_close_date?: string;
  work_progress: WorkProgressItem[];
  work_verification: WorkVerificationItem[];
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
  work_progress: WorkProgressItem[];
  is_invoiced: boolean;
}

interface WorkOrderWithInvoices extends WorkOrder {
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
  completion_date?: string;
  invoices: InvoiceDetails[]; // Changed from single invoice to array
  has_invoices: boolean;
  total_invoiced_amount: number;
  total_work_details: number;
  invoiced_work_details: number;
  available_work_details: number;
}

export default function InvoiceList() {
  const navigate = useNavigate();

  const [workOrders, setWorkOrders] = useState<WorkOrderWithInvoices[]>([]);
  const [allInvoices, setAllInvoices] = useState<InvoiceDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "ready" | "invoiced" | "paid" | "unpaid"
  >("all");
  const [viewMode, setViewMode] = useState<"work-orders" | "invoices">(
    "invoices"
  );

  const fetchInvoiceData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all invoices with their work details
      const { data: invoiceData, error: invoiceError } = await supabase
        .from("invoice_details")
        .select(
          `
          *,
          invoice_work_details (
            id,
            work_details_id,
            work_details (
              id,
              description,
              location,
              pic
            )
          ),
          work_order (
            *,
            vessel (
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

      // Fetch all work orders with details (for partial invoicing tracking)
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
            ),
            invoice_work_details (
              id,
              invoice_details_id
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

      setAllInvoices(invoiceData || []);

      // Process work orders with invoice information
      const processedWorkOrders = (workOrderData || []).map((wo) => {
        const workDetails: RawWorkDetail[] = wo.work_details || [];

        // Get invoices for this work order
        const workOrderInvoices = (invoiceData || []).filter(
          (invoice: InvoiceDetails) => invoice.work_order_id === wo.id
        );

        // Get invoiced work detail IDs
        const invoicedWorkDetailIds = new Set<number>();
        workOrderInvoices.forEach((invoice: InvoiceDetails) => {
          invoice.invoice_work_details?.forEach((iwd) => {
            invoicedWorkDetailIds.add(iwd.work_details_id);
          });
        });

        const workDetailsWithProgress: WorkDetailsWithProgress[] =
          workDetails.map((detail: RawWorkDetail) => {
            const progressRecords: WorkProgressItem[] =
              detail.work_progress || [];
            const verificationRecords: WorkVerificationItem[] =
              detail.work_verification || [];

            if (progressRecords.length === 0) {
              return {
                ...detail,
                current_progress: 0,
                latest_progress_date: undefined,
                progress_count: 0,
                verification_status: verificationRecords.some(
                  (v: WorkVerificationItem) => v.work_verification === true
                ),
                verification_date: verificationRecords.find(
                  (v: WorkVerificationItem) => v.work_verification === true
                )?.verification_date,
                is_invoiced: invoicedWorkDetailIds.has(detail.id),
              };
            }

            const sortedProgress = progressRecords.sort(
              (a: WorkProgressItem, b: WorkProgressItem) =>
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
                (v: WorkVerificationItem) => v.work_verification === true
              ),
              verification_date: verificationRecords.find(
                (v: WorkVerificationItem) => v.work_verification === true
              )?.verification_date,
              is_invoiced: invoicedWorkDetailIds.has(detail.id),
            };
          });

        let overallProgress = 0;
        let hasProgressData = false;

        if (workDetailsWithProgress.length > 0) {
          const totalProgress = workDetailsWithProgress.reduce(
            (sum: number, detail: WorkDetailsWithProgress) =>
              sum + (detail.current_progress || 0),
            0
          );
          overallProgress = Math.round(
            totalProgress / workDetailsWithProgress.length
          );
          hasProgressData = workDetailsWithProgress.some(
            (detail: WorkDetailsWithProgress) => detail.current_progress > 0
          );
        }

        const isFullyCompleted =
          workDetailsWithProgress.length > 0 &&
          workDetailsWithProgress.every(
            (detail: WorkDetailsWithProgress) => detail.current_progress === 100
          );

        const verificationStatus = workDetailsWithProgress.some(
          (detail: WorkDetailsWithProgress) => detail.verification_status
        );

        let completionDate: string | undefined;
        if (isFullyCompleted) {
          const completedDetails = workDetailsWithProgress.filter(
            (d: WorkDetailsWithProgress) => d.current_progress === 100
          );
          const latestCompletionDates = completedDetails
            .filter((d: WorkDetailsWithProgress) => d.latest_progress_date)
            .map((d: WorkDetailsWithProgress) => d.latest_progress_date!)
            .sort(
              (a: string, b: string) =>
                new Date(b).getTime() - new Date(a).getTime()
            );

          completionDate = latestCompletionDates[0];
        }

        // Calculate invoice statistics
        const totalInvoicedAmount = workOrderInvoices.reduce(
          (sum, invoice) => sum + (invoice.payment_price || 0),
          0
        );

        const totalWorkDetails = workDetailsWithProgress.length;
        const invoicedWorkDetails = workDetailsWithProgress.filter(
          (detail) => detail.is_invoiced
        ).length;
        const availableWorkDetails = workDetailsWithProgress.filter(
          (detail) => detail.current_progress === 100 && !detail.is_invoiced
        ).length;

        return {
          ...wo,
          work_details: workDetailsWithProgress,
          overall_progress: overallProgress,
          has_progress_data: hasProgressData,
          verification_status: verificationStatus,
          is_fully_completed: isFullyCompleted,
          completion_date: completionDate,
          invoices: workOrderInvoices,
          has_invoices: workOrderInvoices.length > 0,
          total_invoiced_amount: totalInvoicedAmount,
          total_work_details: totalWorkDetails,
          invoiced_work_details: invoicedWorkDetails,
          available_work_details: availableWorkDetails,
        };
      });

      // Filter to show work orders with some progress or invoices
      const relevantWorkOrders = processedWorkOrders.filter(
        (wo) => wo.has_progress_data || wo.has_invoices
      );

      setWorkOrders(relevantWorkOrders);
    } catch (err) {
      console.error("Error fetching invoice data:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load invoice data"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoiceData();
  }, [fetchInvoiceData]);

  const handleCreateInvoice = (workOrderId: number) => {
    navigate(`/invoices/add?work_order_id=${workOrderId}`);
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

  // Filtering logic for invoices view
  const filteredInvoices = allInvoices.filter((invoice) => {
    // Search filter
    const matchesSearch =
      searchTerm === "" ||
      invoice.invoice_number
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      invoice.faktur_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.receiver_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.work_order?.customer_wo_number
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      invoice.work_order?.shipyard_wo_number
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      invoice.work_order?.vessel?.name
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      invoice.work_order?.vessel?.company
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase());

    // Status filter
    let matchesStatus = false;
    switch (statusFilter) {
      case "all":
        matchesStatus = true;
        break;
      case "paid":
        matchesStatus = invoice.payment_status === true;
        break;
      case "unpaid":
        matchesStatus = invoice.payment_status === false;
        break;
      case "invoiced":
        matchesStatus = true; // All items in this view are invoiced
        break;
      default:
        matchesStatus = true;
    }

    return matchesSearch && matchesStatus;
  });

  // Filtering logic for work orders view
  const filteredWorkOrders = workOrders.filter((wo) => {
    // Search filter
    const matchesSearch =
      searchTerm === "" ||
      wo.customer_wo_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.shipyard_wo_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.vessel?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.vessel?.company?.toLowerCase().includes(searchTerm.toLowerCase());

    // Status filter
    let matchesStatus = false;
    switch (statusFilter) {
      case "all":
        matchesStatus = true;
        break;
      case "ready":
        matchesStatus = wo.available_work_details > 0;
        break;
      case "invoiced":
        matchesStatus = wo.has_invoices;
        break;
      case "paid":
        matchesStatus = wo.invoices.some(
          (invoice) => invoice.payment_status === true
        );
        break;
      case "unpaid":
        matchesStatus = wo.invoices.some(
          (invoice) => invoice.payment_status === false
        );
        break;
      default:
        matchesStatus = true;
    }

    return matchesSearch && matchesStatus;
  });

  // Calculate stats
  const totalInvoices = allInvoices.length;
  const paidInvoices = allInvoices.filter(
    (invoice) => invoice.payment_status === true
  ).length;
  const unpaidInvoices = allInvoices.filter(
    (invoice) => invoice.payment_status === false
  ).length;
  const readyForInvoicing = workOrders.filter(
    (wo) => wo.available_work_details > 0
  ).length;

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
            Invoice Management
          </h1>
          <p className="text-gray-600 mt-2">
            Manage invoices and track financial status with partial invoicing
            support
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={fetchInvoiceData}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
            disabled={loading}
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              "🔄"
            )}
            Refresh
          </button>
          <button
            onClick={() => navigate("/invoices/add")}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            ➕ Create Invoice
          </button>
        </div>
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
              <p className="text-sm font-medium text-gray-600">Paid Invoices</p>
              <p className="text-2xl font-bold text-gray-900">{paidInvoices}</p>
            </div>
            <span className="text-green-500 text-2xl">✅</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Unpaid Invoices
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {unpaidInvoices}
              </p>
            </div>
            <span className="text-red-500 text-2xl">⏳</span>
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

      {/* View Mode Toggle and Filters */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          {/* View Mode Toggle */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode("invoices")}
                className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${
                  viewMode === "invoices"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                📄 All Invoices ({totalInvoices})
              </button>
              <button
                onClick={() => setViewMode("work-orders")}
                className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${
                  viewMode === "work-orders"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                🚢 By Work Order ({workOrders.length})
              </button>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
            </div>
          </div>

          {/* Status Filters */}
          <div className="flex space-x-4">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                statusFilter === "all"
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              All
            </button>
            {viewMode === "work-orders" && (
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
            )}
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
        </div>

        {/* Content */}
        <div className="p-6">
          {viewMode === "invoices" ? (
            // Individual Invoices View
            <div className="overflow-x-auto">
              {filteredInvoices.length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Invoice Details
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Work Order & Vessel
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Work Details Covered
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Payment Info
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status & Due
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredInvoices.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-gray-50">
                        {/* Invoice Details */}
                        <td className="px-4 py-4">
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-gray-900">
                              {invoice.invoice_number || `INV-${invoice.id}`}
                            </div>
                            <div className="text-sm text-gray-600">
                              Faktur: {invoice.faktur_number || "-"}
                            </div>
                            {invoice.receiver_name && (
                              <div className="text-xs text-gray-500">
                                To: {invoice.receiver_name}
                              </div>
                            )}
                            <div className="text-xs text-gray-400">
                              Created: {formatDate(invoice.created_at)}
                            </div>
                          </div>
                        </td>

                        {/* Work Order & Vessel */}
                        <td className="px-4 py-4">
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-gray-900">
                              WO:{" "}
                              {invoice.work_order?.customer_wo_number ||
                                invoice.work_order?.shipyard_wo_number ||
                                `WO-${invoice.work_order_id}`}
                            </div>
                            <div className="text-sm font-semibold text-blue-900">
                              {invoice.work_order?.vessel?.name || "-"}
                            </div>
                            <div className="text-xs text-gray-500">
                              {invoice.work_order?.vessel?.type} •{" "}
                              {invoice.work_order?.vessel?.company}
                            </div>
                          </div>
                        </td>

                        {/* Work Details Covered */}
                        <td className="px-4 py-4">
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-gray-900">
                              {invoice.invoice_work_details?.length || 0} work
                              details
                            </div>
                            {invoice.invoice_work_details &&
                              invoice.invoice_work_details.length > 0 && (
                                <div className="text-xs text-gray-600 space-y-1">
                                  {invoice.invoice_work_details
                                    .slice(0, 2)
                                    .map((iwd) => (
                                      <div
                                        key={iwd.id}
                                        className="truncate max-w-48"
                                      >
                                        • {iwd.work_details?.description}
                                      </div>
                                    ))}
                                  {invoice.invoice_work_details.length > 2 && (
                                    <div className="text-xs text-gray-500">
                                      +{invoice.invoice_work_details.length - 2}{" "}
                                      more...
                                    </div>
                                  )}
                                </div>
                              )}
                          </div>
                        </td>

                        {/* Payment Info */}
                        <td className="px-4 py-4">
                          <div className="space-y-2">
                            <div className="text-base font-bold text-gray-900">
                              {formatCurrency(invoice.payment_price)}
                            </div>
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                invoice.payment_status === true
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {invoice.payment_status === true
                                ? "✅ Paid"
                                : "⏳ Unpaid"}
                            </span>
                            {invoice.payment_date && (
                              <div className="text-xs text-green-600">
                                💰 Paid: {formatDate(invoice.payment_date)}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Status & Due */}
                        <td className="px-4 py-4">
                          <div className="space-y-2">
                            <div className="text-sm font-medium text-gray-900">
                              Due: {formatDate(invoice.due_date)}
                            </div>
                            <div
                              className={`text-xs font-medium ${
                                getDueDateStatus(
                                  invoice.due_date,
                                  invoice.payment_status === true
                                ).color
                              }`}
                            >
                              {
                                getDueDateStatus(
                                  invoice.due_date,
                                  invoice.payment_status === true
                                ).text
                              }
                            </div>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() =>
                                navigate(`/invoices/${invoice.id}/edit`)
                              }
                              className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700 transition-colors text-center"
                              title="Edit Invoice"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() =>
                                navigate(
                                  `/vessel/${invoice.work_order?.vessel?.id}/work-orders`
                                )
                              }
                              className="text-gray-600 hover:text-gray-900 transition-colors text-xs text-center"
                              title="View Work Details"
                            >
                              📋 View Work
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12">
                  <span className="text-gray-400 text-4xl mb-4 block">📄</span>
                  <p className="text-gray-500 text-lg mb-2">
                    No invoices found
                  </p>
                  <p className="text-gray-400 text-sm mb-4">
                    {searchTerm || statusFilter !== "all"
                      ? "Try adjusting your search or filters."
                      : "Create your first invoice to get started."}
                  </p>
                  <button
                    onClick={() => navigate("/invoices/add")}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    📄 Create Invoice
                  </button>
                </div>
              )}
            </div>
          ) : (
            // Work Orders View (existing logic but updated)
            <div className="space-y-4">
              {filteredWorkOrders.length > 0 ? (
                filteredWorkOrders.map((wo) => (
                  <div key={wo.id} className="bg-gray-50 rounded-lg p-6">
                    {/* Work Order Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            WO:{" "}
                            {wo.customer_wo_number ||
                              wo.shipyard_wo_number ||
                              `WO-${wo.id}`}
                          </h3>
                          <span className="text-sm font-medium text-blue-900">
                            {wo.vessel?.name} ({wo.vessel?.company})
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          Progress: {wo.overall_progress}% • Total Work Details:{" "}
                          {wo.total_work_details} • Invoiced:{" "}
                          {wo.invoiced_work_details} • Available:{" "}
                          {wo.available_work_details}
                        </div>
                      </div>

                      {wo.available_work_details > 0 && (
                        <button
                          onClick={() => handleCreateInvoice(wo.id)}
                          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                        >
                          ➕ Create Invoice
                        </button>
                      )}
                    </div>

                    {/* Invoices for this Work Order */}
                    {wo.invoices.length > 0 ? (
                      <div className="space-y-3">
                        <h4 className="font-medium text-gray-900">
                          Invoices ({wo.invoices.length}):
                        </h4>
                        <div className="grid gap-3">
                          {wo.invoices.map((invoice) => (
                            <div
                              key={invoice.id}
                              className="bg-white rounded-lg p-4 border"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-4 mb-2">
                                    <span className="font-medium text-gray-900">
                                      {invoice.invoice_number ||
                                        `INV-${invoice.id}`}
                                    </span>
                                    <span className="text-lg font-bold text-gray-900">
                                      {formatCurrency(invoice.payment_price)}
                                    </span>
                                    <span
                                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        invoice.payment_status === true
                                          ? "bg-green-100 text-green-800"
                                          : "bg-red-100 text-red-800"
                                      }`}
                                    >
                                      {invoice.payment_status === true
                                        ? "✅ Paid"
                                        : "⏳ Unpaid"}
                                    </span>
                                  </div>
                                  <div className="text-sm text-gray-600">
                                    Created: {formatDate(invoice.created_at)} •
                                    Due: {formatDate(invoice.due_date)} • Work
                                    Details:{" "}
                                    {invoice.invoice_work_details?.length || 0}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() =>
                                      navigate(`/invoices/${invoice.id}/edit`)
                                    }
                                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors"
                                  >
                                    ✏️ Edit
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-500">
                        <p>No invoices created for this work order yet.</p>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <span className="text-gray-400 text-4xl mb-4 block">🚢</span>
                  <p className="text-gray-500 text-lg mb-2">
                    No work orders found
                  </p>
                  <p className="text-gray-400 text-sm mb-4">
                    {searchTerm || statusFilter !== "all"
                      ? "Try adjusting your search or filters."
                      : "Work orders with progress will appear here."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
