import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import type { Invoice } from "../../types/invoiceTypes";
import { useReactToPrint } from "react-to-print";
import InvoicePrint from "./InvoicePrint";

export default function InvoiceDetails() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Document viewer states
  const [viewingDocument, setViewingDocument] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  useEffect(() => {
    if (invoiceId) {
      fetchInvoiceDetails();
    }
  }, [invoiceId]);

  const fetchInvoiceDetails = async () => {
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
            unit_price,
            payment_price,
            work_details:work_details_id (
              id,
              description,
              quantity,
              uom,
              pic,
              planned_start_date,
              target_close_date,
              actual_start_date,
              actual_close_date,
              location:location_id (
                id,
                location
              ),
              work_scope:work_scope_id (
                id,
                work_scope
              ),
              work_order:work_order_id (
                id,
                shipyard_wo_number,
                customer_wo_number
              )
            )
          )
        `
        )
        .eq("id", invoiceId)
        .single();

      if (fetchError) throw fetchError;

      // Calculate total amount (work details + general services)
      const workTotal =
        data.invoice_work_details?.reduce(
          (sum: number, item: any) => sum + (item.payment_price || 0),
          0
        ) || 0;

      const servicesTotal =
        data.bastp?.general_services?.reduce(
          (sum: number, service: any) => sum + (service.payment_price || 0),
          0
        ) || 0;

      const total = workTotal + servicesTotal;

      setInvoice({ ...data, total_amount: total });
    } catch (err) {
      console.error("Error fetching invoice:", err);
      setError(err instanceof Error ? err.message : "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
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

  // Calculate subtotals
  const calculateWorkDetailsTotal = () => {
    return (
      invoice?.invoice_work_details?.reduce(
        (sum: number, item: any) => sum + (item.payment_price || 0),
        0
      ) || 0
    );
  };

  const calculateGeneralServicesTotal = () => {
    return (
      invoice?.bastp?.general_services?.reduce(
        (sum: number, service: any) => sum + (service.payment_price || 0),
        0
      ) || 0
    );
  };

  // Print handler
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Invoice-${invoice?.invoice_number || invoiceId}`,
    pageStyle: `
    @page {
      size: A4;
      margin: 0;
    }
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .no-print {
        display: none !important;
      }
    }
  `,
  });

  // View document with modal
  const handleViewDocument = async () => {
    if (!invoice?.bastp?.storage_path) {
      alert("No BASTP document available");
      return;
    }

    try {
      setViewingDocument(true);

      const { data, error: signedUrlError } = await supabase.storage
        .from("bastp")
        .createSignedUrl(invoice.bastp.storage_path, 300); // 5 minutes

      if (signedUrlError) throw signedUrlError;

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
  };

  const getFileType = (storagePath: string | null | undefined) => {
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
          <span className="ml-3 text-gray-600">Loading invoice...</span>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-red-800 font-medium text-lg">Error</h3>
          <p className="text-red-600 mt-2">{error || "Invoice not found"}</p>
          <button
            onClick={() => navigate("/invoices")}
            className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
          >
            Back to Invoices
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate("/invoices")}
            className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-2"
          >
            ← Back to Invoices
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Invoice Details</h1>
          <p className="text-gray-600 mt-2">
            {invoice.invoice_number || "Draft Invoice"}
          </p>
        </div>
        <div className="flex gap-3">
          {invoice.bastp?.storage_path && (
            <button
              onClick={handleViewDocument}
              disabled={viewingDocument}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              📄 View BASTP
            </button>
          )}
          <button
            onClick={() => setShowPrintPreview(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            🖨️ Print Invoice
          </button>
          <button
            onClick={() => navigate(`/invoices/edit/${invoice.id}`)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            ✏️ Edit Invoice
          </button>
        </div>
      </div>

      {/* Payment Status Banner */}
      <div
        className={`rounded-lg p-4 mb-6 ${
          invoice.payment_status
            ? "bg-green-50 border border-green-200"
            : "bg-yellow-50 border border-yellow-200"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">
              {invoice.payment_status ? "✅" : "⏳"}
            </span>
            <div>
              <h3
                className={`font-semibold ${
                  invoice.payment_status ? "text-green-900" : "text-yellow-900"
                }`}
              >
                {invoice.payment_status
                  ? "Payment Received"
                  : "Payment Pending"}
              </h3>
              {invoice.payment_date && (
                <p
                  className={`text-sm ${
                    invoice.payment_status
                      ? "text-green-700"
                      : "text-yellow-700"
                  }`}
                >
                  {invoice.payment_status
                    ? `Paid on ${formatDate(invoice.payment_date)}`
                    : `Expected payment by ${formatDate(invoice.due_date)}`}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Total Amount</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency(invoice.total_amount || 0)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* BASTP Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                BASTP Information
              </h2>
              {invoice.bastp?.storage_path && (
                <span className="text-xs text-green-600 font-medium">
                  ✓ Document Available
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">BASTP Number</p>
                <p className="font-medium text-gray-900">
                  {invoice.bastp?.number}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">BASTP Date</p>
                <p className="font-medium text-gray-900">
                  {formatDate(invoice.bastp?.date)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {invoice.bastp?.status?.replace(/_/g, " ")}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-600">Delivery Date</p>
                <p className="font-medium text-gray-900">
                  {formatDate(invoice.bastp?.delivery_date)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Vessel Name</p>
                <p className="font-medium text-gray-900">
                  {invoice.bastp?.vessel?.name}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Vessel Type</p>
                <p className="font-medium text-gray-900">
                  {invoice.bastp?.vessel?.type}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-gray-600">Company</p>
                <p className="font-medium text-gray-900">
                  {invoice.bastp?.vessel?.company}
                </p>
              </div>
            </div>
          </div>

          {/* Work Details & Pricing */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Work Details & Pricing
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Work Order & Details
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Location & Scope
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Schedule
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      Quantity
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                      UOM
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Unit Price
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invoice.invoice_work_details?.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="text-sm">
                          {/* Work Order Info */}
                          {item.work_details?.work_order && (
                            <div className="mb-2 pb-2 border-b border-gray-200">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold text-blue-600">
                                  WORK ORDER
                                </span>
                              </div>
                              <div className="text-xs text-gray-600 space-y-1">
                                <div>
                                  <span className="font-medium">
                                    Shipyard WO:
                                  </span>{" "}
                                  {item.work_details.work_order
                                    .shipyard_wo_number || "-"}
                                </div>
                                <div>
                                  <span className="font-medium">
                                    Customer WO:
                                  </span>{" "}
                                  {item.work_details.work_order
                                    .customer_wo_number || "-"}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Work Details Description */}
                          <div className="font-medium text-gray-900 mb-1">
                            {item.work_details?.description}
                          </div>
                          {item.work_details?.pic && (
                            <div className="text-xs text-gray-500">
                              👤 PIC: {item.work_details.pic}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm space-y-1">
                          <div className="text-gray-900">
                            📍 {item.work_details?.location?.location || "N/A"}
                          </div>
                          {item.work_details?.work_scope && (
                            <div className="text-xs text-gray-600">
                              🔧 {item.work_details.work_scope.work_scope}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-xs space-y-1">
                          {/* Planned Schedule */}
                          {(item.work_details?.planned_start_date ||
                            item.work_details?.target_close_date) && (
                            <div className="text-gray-600">
                              <div className="font-medium text-gray-700 mb-1">
                                📅 Planned:
                              </div>
                              <div>
                                Start:{" "}
                                {formatDate(
                                  item.work_details.planned_start_date
                                )}
                              </div>
                              <div>
                                Target:{" "}
                                {formatDate(
                                  item.work_details.target_close_date
                                )}
                              </div>
                            </div>
                          )}
                          {/* Actual Schedule */}
                          {(item.work_details?.actual_start_date ||
                            item.work_details?.actual_close_date) && (
                            <div className="text-green-600 mt-2">
                              <div className="font-medium mb-1">✓ Actual:</div>
                              <div>
                                Start:{" "}
                                {formatDate(
                                  item.work_details.actual_start_date
                                )}
                              </div>
                              <div>
                                Close:{" "}
                                {formatDate(
                                  item.work_details.actual_close_date
                                )}
                              </div>
                            </div>
                          )}
                          {/* If no dates available */}
                          {!item.work_details?.planned_start_date &&
                            !item.work_details?.target_close_date &&
                            !item.work_details?.actual_start_date &&
                            !item.work_details?.actual_close_date && (
                              <div className="text-gray-400 text-center">-</div>
                            )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="text-sm font-medium text-gray-900">
                          {item.work_details?.quantity}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="text-sm text-gray-600">
                          {item.work_details?.uom || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="text-sm text-gray-900">
                          {formatCurrency(item.unit_price)}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="text-sm font-bold text-blue-900">
                          {formatCurrency(item.payment_price)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {formatCurrency(item.unit_price)} ×{" "}
                          {item.work_details?.quantity}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-4 text-right font-semibold text-gray-900"
                    >
                      Subtotal (Work Details):
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="text-base font-bold text-blue-900">
                        {formatCurrency(calculateWorkDetailsTotal())}
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* General Services Pricing */}
          {invoice.bastp?.general_services &&
            invoice.bastp.general_services.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  🛠️ General Services & Pricing
                </h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Service Name
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                          Total Days
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Unit Price (per day)
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Remarks
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {invoice.bastp.general_services
                        .sort(
                          (a: any, b: any) =>
                            (a.service_type?.display_order || 0) -
                            (b.service_type?.display_order || 0)
                        )
                        .map((service: any) => (
                          <tr key={service.id} className="hover:bg-gray-50">
                            <td className="px-4 py-4">
                              <div className="text-sm font-medium text-gray-900">
                                {service.service_type?.service_name}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                                {service.total_days} day
                                {service.total_days !== 1 ? "s" : ""}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <div className="text-sm text-gray-900">
                                {formatCurrency(service.unit_price)}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <div className="text-sm font-bold text-green-900">
                                {formatCurrency(service.payment_price)}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {formatCurrency(service.unit_price)} ×{" "}
                                {service.total_days}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="text-sm text-gray-600">
                                {service.remarks || "-"}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-4 text-right font-semibold text-gray-900"
                        >
                          Subtotal (General Services):
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="text-base font-bold text-green-900">
                            {formatCurrency(calculateGeneralServicesTotal())}
                          </div>
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

          {/* Grand Total */}
          <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Grand Total Invoice Amount
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Work Details + General Services
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-blue-900">
                  {formatCurrency(invoice.total_amount || 0)}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  <span className="text-blue-700">
                    Work: {formatCurrency(calculateWorkDetailsTotal())}
                  </span>
                  {" + "}
                  <span className="text-green-700">
                    Services: {formatCurrency(calculateGeneralServicesTotal())}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar - 1 column */}
        <div className="space-y-6">
          {/* Invoice Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Invoice Information
            </h2>
            <div className="space-y-3">
              {invoice.invoice_number && (
                <div>
                  <p className="text-sm text-gray-600">Invoice Number</p>
                  <p className="font-medium text-gray-900">
                    {invoice.invoice_number}
                  </p>
                </div>
              )}
              {invoice.faktur_number && (
                <div>
                  <p className="text-sm text-gray-600">Faktur Number</p>
                  <p className="font-medium text-gray-900">
                    {invoice.faktur_number}
                  </p>
                </div>
              )}
              {invoice.company && (
                <div>
                  <p className="text-sm text-gray-600">Company</p>
                  <p className="font-medium text-gray-900">{invoice.company}</p>
                </div>
              )}
              {invoice.receiver_name && (
                <div>
                  <p className="text-sm text-gray-600">Receiver</p>
                  <p className="font-medium text-gray-900">
                    {invoice.receiver_name}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Important Dates */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Important Dates
            </h2>
            <div className="space-y-3">
              {invoice.bastp_collection_date && (
                <div>
                  <p className="text-sm text-gray-600">BASTP Collection</p>
                  <p className="font-medium text-gray-900">
                    {formatDate(invoice.bastp_collection_date)}
                  </p>
                </div>
              )}
              {invoice.delivery_date && (
                <div>
                  <p className="text-sm text-gray-600">Delivery Date</p>
                  <p className="font-medium text-gray-900">
                    {formatDate(invoice.delivery_date)}
                  </p>
                </div>
              )}
              {invoice.due_date && (
                <div>
                  <p className="text-sm text-gray-600">Due Date</p>
                  <p className="font-medium text-gray-900">
                    {formatDate(invoice.due_date)}
                  </p>
                </div>
              )}
              {invoice.collection_date && (
                <div>
                  <p className="text-sm text-gray-600">Collection Date</p>
                  <p className="font-medium text-gray-900">
                    {formatDate(invoice.collection_date)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Remarks */}
          {invoice.remarks && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Remarks / Notes
              </h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {invoice.remarks}
              </p>
            </div>
          )}

          {/* Created By */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Created By
            </h2>
            <div className="space-y-1">
              <p className="font-medium text-gray-900">
                {invoice.profiles?.name}
              </p>
              <p className="text-sm text-gray-600">{invoice.profiles?.email}</p>
              <p className="text-xs text-gray-500 mt-2">
                {formatDate(invoice.created_at)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Print Preview Modal */}
      {showPrintPreview && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg max-w-5xl w-full my-8 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-lg no-print z-10">
              <h3 className="text-lg font-semibold text-gray-900">
                📄 Invoice Print Preview
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={handlePrint}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  🖨️ Print
                </button>
                <button
                  onClick={() => setShowPrintPreview(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl font-bold px-2"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Printable Content */}
            <div className="overflow-y-auto max-h-[80vh]">
              <InvoicePrint ref={printRef} invoice={invoice} />
            </div>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {showDocumentModal && documentUrl && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                📄 BASTP Document - {invoice.bastp?.number}
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
              {getFileType(invoice.bastp?.storage_path) === "pdf" ? (
                <div className="w-full h-[70vh] bg-white rounded-lg overflow-hidden">
                  <iframe
                    src={`${documentUrl}#view=FitH`}
                    className="w-full h-full border-0"
                    title="BASTP Document Viewer"
                    style={{ minHeight: "70vh" }}
                  />
                </div>
              ) : getFileType(invoice.bastp?.storage_path) === "image" ? (
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
                  download={`BASTP-${invoice.bastp?.number}.pdf`}
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
