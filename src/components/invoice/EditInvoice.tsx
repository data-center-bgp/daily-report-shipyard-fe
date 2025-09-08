import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";

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
    vessel: {
      id: number;
      name: string;
      type: string;
      company: string;
    };
  };
}

export default function EditInvoice() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [invoice, setInvoice] = useState<InvoiceDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    wo_document_collection_date: "",
    invoice_number: "",
    faktur_number: "",
    due_date: "",
    delivery_date: "",
    collection_date: "",
    receiver_name: "",
    payment_price: "",
    payment_status: false,
    payment_date: "",
    remarks: "",
  });

  useEffect(() => {
    if (id) {
      fetchInvoice();
    }
  }, [id]);

  const fetchInvoice = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: invoiceData, error: invoiceError } = await supabase
        .from("invoice_details")
        .select(
          `
          *,
          work_order (
            id,
            customer_wo_number,
            shipyard_wo_number,
            vessel (
              id,
              name,
              type,
              company
            )
          )
        `
        )
        .eq("id", id)
        .is("deleted_at", null)
        .single();

      if (invoiceError) throw invoiceError;

      if (!invoiceData) {
        setError("Invoice not found");
        return;
      }

      setInvoice(invoiceData);

      // Populate form data
      setFormData({
        wo_document_collection_date:
          invoiceData.wo_document_collection_date || "",
        invoice_number: invoiceData.invoice_number || "",
        faktur_number: invoiceData.faktur_number || "",
        due_date: invoiceData.due_date || "",
        delivery_date: invoiceData.delivery_date || "",
        collection_date: invoiceData.collection_date || "",
        receiver_name: invoiceData.receiver_name || "",
        payment_price: invoiceData.payment_price?.toString() || "",
        payment_status: invoiceData.payment_status,
        payment_date: invoiceData.payment_date || "",
        remarks: invoiceData.remarks || "",
      });
    } catch (err) {
      console.error("Error fetching invoice:", err);
      setError(err instanceof Error ? err.message : "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value, type } = e.target;

    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({
        ...prev,
        [name]: checked,
        // Auto-set payment date if marking as paid, clear if marking as unpaid
        payment_date:
          checked && !prev.payment_date
            ? new Date().toISOString().split("T")[0]
            : checked
            ? prev.payment_date
            : "",
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!invoice) {
      setError("Invoice data not loaded");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // Prepare data for update
      const updateData = {
        wo_document_collection_date:
          formData.wo_document_collection_date || null,
        invoice_number: formData.invoice_number || null,
        faktur_number: formData.faktur_number || null,
        due_date: formData.due_date || null,
        delivery_date: formData.delivery_date || null,
        collection_date: formData.collection_date || null,
        receiver_name: formData.receiver_name || null,
        payment_price: formData.payment_price
          ? parseFloat(formData.payment_price)
          : null,
        payment_status: formData.payment_status,
        payment_date:
          formData.payment_status && formData.payment_date
            ? formData.payment_date
            : null,
        remarks: formData.remarks || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("invoice_details")
        .update(updateData)
        .eq("id", invoice.id)
        .select()
        .single();

      if (error) throw error;

      setSuccess("Invoice updated successfully!");

      // Update local state
      setInvoice({ ...invoice, ...data });

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Error updating invoice:", err);
      setError(err instanceof Error ? err.message : "Failed to update invoice");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!invoice) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this invoice? This action cannot be undone."
    );

    if (!confirmed) return;

    try {
      setSubmitting(true);
      setError(null);

      const { error } = await supabase
        .from("invoice_details")
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);

      if (error) throw error;

      navigate("/invoices", {
        state: {
          successMessage: `Invoice ${
            invoice.invoice_number || invoice.id
          } deleted successfully`,
        },
      });
    } catch (err) {
      console.error("Error deleting invoice:", err);
      setError(err instanceof Error ? err.message : "Failed to delete invoice");
    } finally {
      setSubmitting(false);
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

  if (!invoice) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <span className="text-gray-400 text-4xl mb-4 block">📄</span>
          <p className="text-gray-500 text-lg mb-4">Invoice not found</p>
          <button
            onClick={() => navigate("/invoices")}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Invoices
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Edit Invoice</h1>
            <p className="text-gray-600 mt-2">
              Update invoice details and payment status
            </p>
          </div>

          <button
            onClick={() => navigate("/invoices")}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2 transition-colors"
          >
            ← Back to Invoices
          </button>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <span className="text-red-600 mr-2">⚠️</span>
              <p className="text-red-700 font-medium">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <span className="text-green-600 mr-2">✅</span>
              <p className="text-green-700 font-medium">{success}</p>
            </div>
          </div>
        )}

        {/* Invoice Overview */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Invoice Overview
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Invoice ID</p>
                <p className="font-medium">{invoice.id}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Work Order</p>
                <p className="font-medium">
                  {invoice.work_order?.customer_wo_number ||
                    invoice.work_order?.shipyard_wo_number ||
                    `WO-${invoice.work_order_id}`}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Vessel</p>
                <p className="font-medium">
                  {invoice.work_order?.vessel?.name}
                </p>
                <p className="text-sm text-gray-500">
                  {invoice.work_order?.vessel?.company}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Current Status</p>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    invoice.payment_status
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {invoice.payment_status ? "✅ Paid" : "⏳ Unpaid"}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-600">Amount</p>
                <p className="font-medium">
                  {formatCurrency(invoice.payment_price)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Created</p>
                <p className="font-medium">{formatDate(invoice.created_at)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <div className="bg-white rounded-lg shadow">
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Invoice Information */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Invoice Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label
                    htmlFor="invoice_number"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Invoice Number
                  </label>
                  <input
                    type="text"
                    id="invoice_number"
                    name="invoice_number"
                    value={formData.invoice_number}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="INV-2024-001"
                  />
                </div>

                <div>
                  <label
                    htmlFor="faktur_number"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Faktur Number
                  </label>
                  <input
                    type="text"
                    id="faktur_number"
                    name="faktur_number"
                    value={formData.faktur_number}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="FKT-2024-001"
                  />
                </div>
              </div>
            </div>

            {/* Dates */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Important Dates
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <label
                    htmlFor="wo_document_collection_date"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    WO Document Collection Date
                  </label>
                  <input
                    type="date"
                    id="wo_document_collection_date"
                    name="wo_document_collection_date"
                    value={formData.wo_document_collection_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label
                    htmlFor="due_date"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Due Date
                  </label>
                  <input
                    type="date"
                    id="due_date"
                    name="due_date"
                    value={formData.due_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label
                    htmlFor="delivery_date"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Delivery Date
                  </label>
                  <input
                    type="date"
                    id="delivery_date"
                    name="delivery_date"
                    value={formData.delivery_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label
                    htmlFor="collection_date"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Collection Date
                  </label>
                  <input
                    type="date"
                    id="collection_date"
                    name="collection_date"
                    value={formData.collection_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Payment Information */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Payment Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label
                    htmlFor="receiver_name"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Receiver Name
                  </label>
                  <input
                    type="text"
                    id="receiver_name"
                    name="receiver_name"
                    value={formData.receiver_name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label
                    htmlFor="payment_price"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Payment Amount (IDR)
                  </label>
                  <input
                    type="number"
                    id="payment_price"
                    name="payment_price"
                    value={formData.payment_price}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="1000000"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            </div>

            {/* Payment Status */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Payment Status
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="payment_status"
                    name="payment_status"
                    checked={formData.payment_status}
                    onChange={handleInputChange}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label
                    htmlFor="payment_status"
                    className="ml-2 block text-sm text-gray-700"
                  >
                    Mark as paid
                  </label>
                </div>

                {formData.payment_status && (
                  <div>
                    <label
                      htmlFor="payment_date"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Payment Date
                    </label>
                    <input
                      type="date"
                      id="payment_date"
                      name="payment_date"
                      value={formData.payment_date}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label
                htmlFor="remarks"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Remarks
              </label>
              <textarea
                id="remarks"
                name="remarks"
                value={formData.remarks}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Additional notes or comments..."
              />
            </div>

            {/* Actions */}
            <div className="flex justify-between">
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                🗑️ Delete Invoice
              </button>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => navigate("/invoices")}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Updating...
                    </>
                  ) : (
                    <>💾 Update Invoice</>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
