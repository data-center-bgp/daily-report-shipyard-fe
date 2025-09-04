import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, type WorkOrder } from "../../lib/supabase";

interface WorkDetailsWithProgress {
  id: number;
  description: string;
  location?: string;
  pic?: string;
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

interface WorkOrderOption extends WorkOrder {
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
}

export default function AddInvoice() {
  const navigate = useNavigate();

  const [workOrders, setWorkOrders] = useState<WorkOrderOption[]>([]);
  const [completedWorkOrders, setCompletedWorkOrders] = useState<
    WorkOrderOption[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    work_order_id: "",
    invoice_collection_date: "",
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
    fetchWorkOrders();
  }, []);

  const fetchWorkOrders = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log("🔍 Fetching work orders for invoice creation...");

      // Use EXACT same query as InvoiceList.tsx
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

      // Process work orders with progress data - EXACT same logic as InvoiceList
      const workOrdersWithProgress = (workOrderData || []).map((wo) => {
        const workDetails = wo.work_details || [];

        // Process each work detail to get its latest progress - SAME AS InvoiceList
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

          // Sort progress records by date (newest first) - SAME AS InvoiceList
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

        // Calculate overall work order progress - SAME AS InvoiceList
        let overallProgress = 0;
        let hasProgressData = false;

        if (workDetailsWithProgress.length > 0) {
          // Average progress across all work details
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

        // Check if ALL work details are 100% complete
        const isFullyCompleted =
          workDetailsWithProgress.length > 0 &&
          workDetailsWithProgress.every(
            (detail) => detail.current_progress === 100
          );

        // Check verification status
        const verificationStatus = workDetailsWithProgress.some(
          (detail) => detail.verification_status
        );

        console.log(
          `Work Order ${wo.id}: ${overallProgress}% complete, ${
            isFullyCompleted ? "FULLY COMPLETED" : "not complete"
          }`
        );
        console.log(
          `  - ${workDetailsWithProgress.length} details, ${
            workDetailsWithProgress.filter((d) => d.current_progress === 100)
              .length
          } at 100%`
        );

        return {
          ...wo,
          work_details: workDetailsWithProgress,
          overall_progress: overallProgress,
          has_progress_data: hasProgressData,
          verification_status: verificationStatus,
          is_fully_completed: isFullyCompleted,
        };
      });

      console.log(
        "📊 Total work orders processed:",
        workOrdersWithProgress.length
      );
      console.log(
        "✅ Fully completed work orders:",
        workOrdersWithProgress.filter((wo) => wo.is_fully_completed).length
      );

      // Filter only fully completed work orders (all work details at 100%)
      const fullyCompleted = workOrdersWithProgress.filter(
        (wo) => wo.is_fully_completed
      );

      console.log("🎯 Checking for existing invoices...");

      // Get existing invoices to exclude work orders that already have invoices
      const { data: existingInvoices, error: invoiceError } = await supabase
        .from("invoice_details")
        .select("work_order_id")
        .is("deleted_at", null);

      if (invoiceError) {
        console.error("Error fetching existing invoices:", invoiceError);
      }

      const invoicedWorkOrderIds = (existingInvoices || []).map(
        (inv) => inv.work_order_id
      );
      console.log("📄 Already invoiced work order IDs:", invoicedWorkOrderIds);

      // Filter out work orders that already have invoices
      const availableForInvoicing = fullyCompleted.filter(
        (wo) => !invoicedWorkOrderIds.includes(wo.id)
      );

      console.log("📋 Available for invoicing:", availableForInvoicing.length);

      setWorkOrders(workOrdersWithProgress);
      setCompletedWorkOrders(availableForInvoicing);
    } catch (err) {
      console.error("❌ Error fetching work orders:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load work orders"
      );
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
        // Auto-set payment date if marking as paid
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

    if (!formData.work_order_id) {
      setError("Please select a work order");
      return;
    }

    // Double-check that selected work order is completed
    const selectedWorkOrder = completedWorkOrders.find(
      (wo) => wo.id === parseInt(formData.work_order_id)
    );

    if (!selectedWorkOrder) {
      setError("Selected work order is not available for invoicing");
      return;
    }

    if (!selectedWorkOrder.is_fully_completed) {
      setError(
        "All work details must be 100% complete before creating an invoice"
      );
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // Get current user
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error("User not authenticated");
      }

      // Get user profile for numeric ID
      const { data: userProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();

      if (profileError || !userProfile) {
        throw new Error("User profile not found");
      }

      // Prepare data for insertion
      const invoiceData = {
        work_order_id: parseInt(formData.work_order_id),
        user_id: userProfile.id,
        invoice_collection_date: formData.invoice_collection_date || null,
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
      };

      const { data, error } = await supabase
        .from("invoice_details")
        .insert(invoiceData)
        .select()
        .single();

      if (error) throw error;

      navigate("/invoices", {
        state: {
          successMessage: `Invoice ${
            formData.invoice_number || "created"
          } successfully for completed work order`,
        },
      });
    } catch (err) {
      console.error("Error creating invoice:", err);
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading work orders...</span>
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
            <h1 className="text-3xl font-bold text-gray-900">
              Add New Invoice
            </h1>
            <p className="text-gray-600 mt-2">
              Create a new invoice for a completed work order (all work details
              at 100% progress)
            </p>
          </div>

          <button
            onClick={() => navigate("/invoices")}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2 transition-colors"
          >
            ← Back to Invoices
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <span className="text-red-600 mr-2">⚠️</span>
              <p className="text-red-700 font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* No Available Work Orders Message */}
        {completedWorkOrders.length === 0 && !loading && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
            <div className="flex items-center mb-4">
              <span className="text-yellow-600 mr-3 text-2xl">⚠️</span>
              <h3 className="text-lg font-medium text-yellow-800">
                No Work Orders Available for Invoicing
              </h3>
            </div>
            <div className="text-yellow-700 space-y-2">
              <p>To create an invoice, you need work orders where:</p>
              <ul className="list-disc list-inside ml-4 space-y-1">
                <li>All work details are 100% complete</li>
                <li>Don't already have an existing invoice</li>
                <li>Verification is optional but recommended</li>
              </ul>
              <div className="mt-4">
                <button
                  onClick={() => navigate("/vessels")}
                  className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition-colors mr-3"
                >
                  View Vessels
                </button>
                <button
                  onClick={() => navigate("/progress-tracker")}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Check Progress
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        {completedWorkOrders.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Work Order Selection */}
              <div>
                <label
                  htmlFor="work_order_id"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Completed Work Order <span className="text-red-500">*</span>
                </label>
                <select
                  id="work_order_id"
                  name="work_order_id"
                  value={formData.work_order_id}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select a completed work order</option>
                  {completedWorkOrders.map((wo) => (
                    <option key={wo.id} value={wo.id}>
                      ✅{" "}
                      {wo.customer_wo_number ||
                        wo.shipyard_wo_number ||
                        `WO-${wo.id}`}{" "}
                      - {wo.vessel?.name} ({wo.vessel?.company})
                      {wo.verification_status ? " 🔍 Verified" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Only work orders with all work details at 100% progress are
                  shown
                </p>
              </div>

              {/* Show selected work order details */}
              {formData.work_order_id && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  {(() => {
                    const selectedWO = completedWorkOrders.find(
                      (wo) => wo.id === parseInt(formData.work_order_id)
                    );
                    return selectedWO ? (
                      <div>
                        <h4 className="font-medium text-green-900 mb-3">
                          Selected Work Order Details
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-green-800 mb-4">
                          <div>
                            <strong>Customer WO:</strong>{" "}
                            {selectedWO.customer_wo_number || "-"}
                          </div>
                          <div>
                            <strong>Shipyard WO:</strong>{" "}
                            {selectedWO.shipyard_wo_number || "-"}
                          </div>
                          <div>
                            <strong>Vessel:</strong>{" "}
                            {selectedWO.vessel?.name || "-"}
                          </div>
                          <div>
                            <strong>Company:</strong>{" "}
                            {selectedWO.vessel?.company || "-"}
                          </div>
                          <div>
                            <strong>Overall Progress:</strong> ✅{" "}
                            {selectedWO.overall_progress}% Complete
                          </div>
                          <div>
                            <strong>Verification:</strong>{" "}
                            {selectedWO.verification_status
                              ? "🔍 Verified"
                              : "⏳ Not Verified"}
                          </div>
                        </div>

                        {/* Work Details Summary */}
                        <div>
                          <h5 className="font-medium text-green-900 mb-2">
                            Work Details Status:
                          </h5>
                          <div className="space-y-2">
                            {selectedWO.work_details.map((detail) => (
                              <div
                                key={detail.id}
                                className="flex items-center justify-between bg-white rounded p-2 text-sm"
                              >
                                <div className="flex-1">
                                  <span className="font-medium">
                                    {detail.description}
                                  </span>
                                  {detail.location && (
                                    <span className="text-gray-600 ml-2">
                                      📍 {detail.location}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-green-700">
                                    {detail.current_progress}%
                                  </span>
                                  {detail.verification_status && (
                                    <span title="Verified">🔍</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}

              {/* Rest of the form remains the same... */}
              {/* Invoice Information */}
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

              {/* Dates */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <label
                    htmlFor="invoice_collection_date"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Invoice Collection Date
                  </label>
                  <input
                    type="date"
                    id="invoice_collection_date"
                    name="invoice_collection_date"
                    value={formData.invoice_collection_date}
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

              {/* Payment Information */}
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

              {/* Payment Status */}
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
              <div className="flex justify-end space-x-3">
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
                      Creating...
                    </>
                  ) : (
                    <>💾 Create Invoice</>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
