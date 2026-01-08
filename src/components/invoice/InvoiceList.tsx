import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import type { Invoice } from "../../types/invoiceTypes";
import type { BASTPWithDetails } from "../../types/bastp.types";
import { useAuth } from "../../hooks/useAuth";

export default function InvoiceList() {
  const navigate = useNavigate();
  const { isReadOnly } = useAuth();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [readyBASTPs, setReadyBASTPs] = useState<BASTPWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "unpaid">(
    "all"
  );
  const [viewMode, setViewMode] = useState<"invoices" | "ready-bastp">(
    "invoices"
  );

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Document viewer states
  const [viewingDocument, setViewingDocument] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [currentBastpNumber, setCurrentBastpNumber] = useState<string>("");
  const [currentStoragePath, setCurrentStoragePath] = useState<string>("");

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("invoice_details")
        .select(
          `
          *,
          bastp:bastp_id (
            id,
            number,
            date,
            delivery_date,
            status,
            storage_path,
            bastp_upload_date,
            vessel:vessel_id (
              id,
              name,
              type,
              company
            ),
            general_services (
              id,
              service_type_id,
              total_days,
              unit_price,
              payment_price,
              remarks,
              service_type:service_type_id (
                id,
                service_name,
                display_order
              )
            )
          ),
          profiles:user_id (
            id,
            name,
            email
          ),
          invoice_work_details (
            id,
            work_details_id,
            payment_price,
            work_details:work_details_id (
              id,
              description,
              quantity,
              uom
            )
          )
        `
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      setInvoices(data || []);
    } catch (err) {
      console.error("Error fetching invoices:", err);
      setError(err instanceof Error ? err.message : "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReadyBASTPs = useCallback(async () => {
    try {
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
          bastp_work_details (
            id,
            work_details:work_details_id (
              id,
              description,
              quantity,
              uom,
              location:location_id (
                id,
                location
              )
            )
          )
        `
        )
        .eq("status", "READY_FOR_INVOICE")
        .eq("is_invoiced", false)
        .is("deleted_at", null)
        .order("date", { ascending: false });

      if (fetchError) throw fetchError;
      setReadyBASTPs(data || []);
    } catch (err) {
      console.error("Error fetching ready BASTPs:", err);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
    fetchReadyBASTPs();
  }, [fetchInvoices, fetchReadyBASTPs]);

  // Filtering
  const filteredInvoices = useMemo(() => {
    let filtered = invoices;

    // Status filter
    if (statusFilter === "paid") {
      filtered = filtered.filter((inv) => inv.payment_status === true);
    } else if (statusFilter === "unpaid") {
      filtered = filtered.filter((inv) => inv.payment_status === false);
    }

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (inv) =>
          inv.invoice_number?.toLowerCase().includes(searchLower) ||
          inv.faktur_number?.toLowerCase().includes(searchLower) ||
          inv.bastp?.number?.toLowerCase().includes(searchLower) ||
          inv.bastp?.vessel?.name?.toLowerCase().includes(searchLower) ||
          inv.bastp?.vessel?.company?.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [invoices, statusFilter, searchTerm]);

  const filteredBASTPs = useMemo(() => {
    if (!searchTerm) return readyBASTPs;

    const searchLower = searchTerm.toLowerCase();
    return readyBASTPs.filter(
      (bastp) =>
        bastp.number?.toLowerCase().includes(searchLower) ||
        bastp.vessel?.name?.toLowerCase().includes(searchLower) ||
        bastp.vessel?.company?.toLowerCase().includes(searchLower)
    );
  }, [readyBASTPs, searchTerm]);

  // Pagination
  const paginatedInvoices = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredInvoices.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredInvoices, currentPage]);

  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);

  // Stats
  const stats = useMemo(
    () => ({
      total: invoices.length,
      paid: invoices.filter((inv) => inv.payment_status).length,
      unpaid: invoices.filter((inv) => !inv.payment_status).length,
      ready: readyBASTPs.length,
    }),
    [invoices, readyBASTPs]
  );

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // View document with modal
  const handleViewDocument = async (
    storagePath: string | null,
    bastpNumber: string
  ) => {
    if (!storagePath) {
      alert("No document available");
      return;
    }

    try {
      setViewingDocument(true);
      setCurrentBastpNumber(bastpNumber);
      setCurrentStoragePath(storagePath);

      // Generate fresh signed URL (valid for 5 minutes)
      const { data, error } = await supabase.storage
        .from("bastp")
        .createSignedUrl(storagePath, 300);

      if (error) throw error;

      // Set document URL and open modal
      setDocumentUrl(data.signedUrl);
      setShowDocumentModal(true);
    } catch (err) {
      console.error("Error accessing document:", err);
      alert("❌ Failed to view document. Please try again.");
    } finally {
      setViewingDocument(false);
    }
  };

  const handleCloseModal = () => {
    setShowDocumentModal(false);
    setDocumentUrl(null);
    setCurrentBastpNumber("");
    setCurrentStoragePath("");
  };

  // Detect file type
  const getFileType = (storagePath: string | undefined) => {
    if (!storagePath) return "unknown";
    const extension = storagePath.split(".").pop()?.toLowerCase();
    if (["pdf"].includes(extension || "")) return "pdf";
    if (["jpg", "jpeg", "png", "gif"].includes(extension || "")) return "image";
    return "unknown";
  };

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
            {isReadOnly
              ? "View invoices from verified BASTP"
              : "Manage invoices from verified BASTP"}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
          <p className="text-xs font-medium text-gray-600">Total Invoices</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
          <p className="text-xs font-medium text-gray-600">Paid</p>
          <p className="text-2xl font-bold text-gray-900">{stats.paid}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-red-500">
          <p className="text-xs font-medium text-gray-600">Unpaid</p>
          <p className="text-2xl font-bold text-gray-900">{stats.unpaid}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-orange-500">
          <p className="text-xs font-medium text-gray-600">Ready for Invoice</p>
          <p className="text-2xl font-bold text-gray-900">{stats.ready}</p>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setViewMode("invoices")}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                viewMode === "invoices"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              💰 Invoices ({stats.total})
            </button>
            {!isReadOnly && (
              <button
                onClick={() => setViewMode("ready-bastp")}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  viewMode === "ready-bastp"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                📋 Ready for Invoice ({stats.ready})
              </button>
            )}
          </nav>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by invoice number, BASTP, vessel..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {viewMode === "invoices" && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            )}
          </div>
        </div>

        {/* Content */}
        {viewMode === "invoices" ? (
          <div className="overflow-x-auto">
            {paginatedInvoices.length > 0 ? (
              <>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Invoice Info
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        BASTP & Vessel
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Document
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Dates
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Payment
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedInvoices.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <div className="font-medium text-gray-900">
                              {invoice.invoice_number || (
                                <span className="text-gray-400">
                                  No invoice #
                                </span>
                              )}
                            </div>
                            {invoice.faktur_number && (
                              <div className="text-xs text-gray-500">
                                Faktur: {invoice.faktur_number}
                              </div>
                            )}
                            <div className="text-xs text-gray-500 mt-1">
                              {invoice.invoice_work_details?.length || 0} work
                              detail(s)
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <div className="font-medium text-gray-900">
                              {invoice.bastp?.number}
                            </div>
                            <div className="text-xs text-gray-500">
                              {invoice.bastp?.vessel?.name}
                            </div>
                            <div className="text-xs text-gray-400">
                              {invoice.bastp?.vessel?.company}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {invoice.bastp?.storage_path ? (
                            <button
                              onClick={() =>
                                handleViewDocument(
                                  invoice.bastp?.storage_path || null,
                                  invoice.bastp?.number || ""
                                )
                              }
                              disabled={viewingDocument}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              📄 View BASTP
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">
                              No document
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm space-y-1">
                            {invoice.due_date && (
                              <div className="text-xs">
                                <span className="text-gray-500">Due:</span>{" "}
                                <span className="font-medium">
                                  {formatDate(invoice.due_date)}
                                </span>
                              </div>
                            )}
                            {invoice.collection_date && (
                              <div className="text-xs text-gray-500">
                                Collected: {formatDate(invoice.collection_date)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <div className="font-bold text-gray-900">
                              {formatCurrency(invoice.total_price_after || 0)}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              After Tax
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-2">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                invoice.payment_status
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {invoice.payment_status ? "✓ Paid" : "⏳ Unpaid"}
                            </span>
                            {invoice.payment_date && (
                              <div className="text-xs text-gray-500">
                                {formatDate(invoice.payment_date)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => navigate(`/invoices/${invoice.id}`)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            View Details →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                      {Math.min(
                        currentPage * itemsPerPage,
                        filteredInvoices.length
                      )}{" "}
                      of {filteredInvoices.length} results
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setCurrentPage((p) => Math.max(1, p - 1))
                        }
                        disabled={currentPage === 1}
                        className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="px-3 py-1 text-sm text-gray-700">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={() =>
                          setCurrentPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <span className="text-gray-400 text-4xl mb-4 block">💰</span>
                <p className="text-gray-500 text-lg mb-4">No invoices found</p>
              </div>
            )}
          </div>
        ) : (
          /* Ready BASTP Table */
          !isReadOnly && (
            <div className="overflow-x-auto">
              {filteredBASTPs.length > 0 ? (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        BASTP Info
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Vessel
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Document
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Dates
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Work Details
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredBASTPs.map((bastp) => (
                      <tr key={bastp.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <div className="font-medium text-gray-900">
                              {bastp.number}
                            </div>
                            <div className="text-xs text-green-600 font-medium mt-1">
                              ✓ Ready for Invoice
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <div className="font-medium text-gray-900">
                              {bastp.vessel?.name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {bastp.vessel?.type}
                            </div>
                            <div className="text-xs text-gray-400">
                              {bastp.vessel?.company}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {bastp.storage_path ? (
                            <button
                              onClick={() =>
                                handleViewDocument(
                                  bastp.storage_path || null,
                                  bastp.number
                                )
                              }
                              disabled={viewingDocument}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              📄 View BASTP
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">
                              No document
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm space-y-1">
                            <div className="text-xs">
                              <span className="text-gray-500">BASTP:</span>{" "}
                              <span className="font-medium">
                                {formatDate(bastp.date)}
                              </span>
                            </div>
                            {bastp.delivery_date && (
                              <div className="text-xs text-gray-500">
                                Delivery: {formatDate(bastp.delivery_date)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {bastp.bastp_work_details?.length || 0} work
                            detail(s)
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() =>
                              navigate(`/invoices/create/${bastp.id}`)
                            }
                            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                          >
                            ➕ Create Invoice
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12">
                  <span className="text-gray-400 text-4xl mb-4 block">📋</span>
                  <p className="text-gray-500 text-lg mb-4">
                    No BASTP ready for invoicing
                  </p>
                  <p className="text-gray-400 text-sm">
                    BASTPs must be verified and have document uploaded
                  </p>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* Document Viewer Modal */}
      {showDocumentModal && documentUrl && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                📄 BASTP Document - {currentBastpNumber}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-hidden bg-gray-100 p-4">
              {getFileType(currentStoragePath) === "pdf" ? (
                <div className="w-full h-[70vh] bg-white rounded-lg overflow-hidden">
                  <iframe
                    src={`${documentUrl}#view=FitH`}
                    className="w-full h-full border-0"
                    title="BASTP Document Viewer"
                    style={{ minHeight: "70vh" }}
                  />
                </div>
              ) : getFileType(currentStoragePath) === "image" ? (
                <div className="flex items-center justify-center h-full">
                  <img
                    src={documentUrl}
                    alt="BASTP Document"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-gray-600 mb-4 text-lg">
                      📄 Cannot preview this file type in browser
                    </p>
                    <a
                      href={documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 inline-block"
                    >
                      Open in New Tab
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-200 flex justify-between items-center bg-white">
              <p className="text-xs text-gray-500">
                🔒 Secure signed URL - Expires in 5 minutes
              </p>
              <div className="flex gap-2">
                <a
                  href={documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 inline-flex items-center gap-2 text-sm font-medium"
                >
                  🔗 New Tab
                </a>
                <a
                  href={documentUrl}
                  download={`BASTP-${currentBastpNumber}.pdf`}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 inline-flex items-center gap-2 text-sm font-medium"
                >
                  ⬇️ Download
                </a>
                <button
                  onClick={handleCloseModal}
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 text-sm font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
