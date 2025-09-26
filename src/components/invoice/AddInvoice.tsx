import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, type WorkOrder } from "../../lib/supabase";
import SelectWorkDetailsForInvoice from "./SelectWorkDetailsForInvoice";

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
  is_invoiced: boolean;
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
  has_available_work_details: boolean;
  total_work_details: number;
  invoiced_work_details: number;
  available_work_details: number;
}

// Type for work detail from Supabase response
interface SupabaseWorkDetail {
  id: number;
  description: string;
  location?: string;
  pic?: string;
  work_progress: Array<{
    progress_percentage: number;
    report_date: string;
    evidence_url?: string;
    storage_path?: string;
    created_at: string;
  }>;
  work_verification: Array<{
    work_verification: boolean;
    verification_date?: string;
  }>;
  invoice_work_details?: Array<{
    id: number;
    invoice_details_id: number;
  }>;
}

// Type for verification record
interface VerificationRecord {
  work_verification: boolean;
  verification_date?: string;
}

// Type for progress record
interface ProgressRecord {
  progress_percentage: number;
  report_date: string;
  evidence_url?: string;
  storage_path?: string;
  created_at: string;
}

export default function AddInvoice() {
  const navigate = useNavigate();

  const [workOrdersWithAvailableDetails, setWorkOrdersWithAvailableDetails] =
    useState<WorkOrderOption[]>([]);
  const [step, setStep] = useState<
    "select-work-order" | "select-work-details" | "invoice-form"
  >("select-work-order");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<number | null>(
    null
  );
  const [selectedWorkDetailsIds, setSelectedWorkDetailsIds] = useState<
    number[]
  >([]);
  const [selectedWorkDetails, setSelectedWorkDetails] = useState<
    WorkDetailsWithProgress[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    fetchWorkOrders();
  }, []);

  const fetchWorkOrders = async () => {
    try {
      setLoading(true);
      setError(null);

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

      const workOrdersWithProgress = (workOrderData || []).map((wo) => {
        const workDetails = wo.work_details || [];

        const workDetailsWithProgress = workDetails.map(
          (detail: SupabaseWorkDetail) => {
            const progressRecords = detail.work_progress || [];
            const verificationRecords = detail.work_verification || [];
            const invoiceRecords = detail.invoice_work_details || [];

            // Check if this work detail is already invoiced
            const isInvoiced = invoiceRecords.length > 0;

            if (progressRecords.length === 0) {
              return {
                ...detail,
                current_progress: 0,
                latest_progress_date: undefined,
                progress_count: 0,
                verification_status: verificationRecords.some(
                  (v: VerificationRecord) => v.work_verification === true
                ),
                verification_date: verificationRecords.find(
                  (v: VerificationRecord) => v.work_verification === true
                )?.verification_date,
                is_invoiced: isInvoiced,
              };
            }

            const sortedProgress = progressRecords.sort(
              (a: ProgressRecord, b: ProgressRecord) =>
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
                (v: VerificationRecord) => v.work_verification === true
              ),
              verification_date: verificationRecords.find(
                (v: VerificationRecord) => v.work_verification === true
              )?.verification_date,
              is_invoiced: isInvoiced,
            };
          }
        );

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

        const verificationStatus = workDetailsWithProgress.some(
          (detail: WorkDetailsWithProgress) => detail.verification_status
        );

        // Calculate invoice statistics
        const totalWorkDetails = workDetailsWithProgress.length;
        const invoicedWorkDetails = workDetailsWithProgress.filter(
          (detail) => detail.is_invoiced
        ).length;
        const availableWorkDetails = workDetailsWithProgress.filter(
          (detail) => detail.current_progress === 100 && !detail.is_invoiced
        ).length;

        const hasAvailableWorkDetails = availableWorkDetails > 0;

        return {
          ...wo,
          work_details: workDetailsWithProgress,
          overall_progress: overallProgress,
          has_progress_data: hasProgressData,
          verification_status: verificationStatus,
          has_available_work_details: hasAvailableWorkDetails,
          total_work_details: totalWorkDetails,
          invoiced_work_details: invoicedWorkDetails,
          available_work_details: availableWorkDetails,
        };
      });

      // Filter work orders that have at least one completed work detail that isn't invoiced yet
      const availableForInvoicing = workOrdersWithProgress.filter(
        (wo) => wo.has_available_work_details
      );

      setWorkOrdersWithAvailableDetails(availableForInvoicing);
    } catch (err) {
      console.error("❌ Error fetching work orders:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load work orders"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleWorkOrderSelect = (workOrderId: number) => {
    setSelectedWorkOrderId(workOrderId);
    setSelectedWorkDetailsIds([]);
    setSelectedWorkDetails([]);
    setStep("select-work-details");
  };

  const handleWorkDetailsSelected = (
    workDetailsIds: number[],
    workDetailsData: WorkDetailsWithProgress[]
  ) => {
    setSelectedWorkDetailsIds(workDetailsIds);
    setSelectedWorkDetails(workDetailsData);
    setStep("invoice-form");
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

  const handleCreateInvoice = async () => {
    if (!selectedWorkOrderId || selectedWorkDetailsIds.length === 0) {
      setError("Please select work details to invoice");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error("User not authenticated");
      }

      const { data: userProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();

      if (profileError || !userProfile) {
        throw new Error("User profile not found");
      }

      const invoiceData = {
        work_order_id: selectedWorkOrderId,
        user_id: userProfile.id,
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
      };

      // Create the invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoice_details")
        .insert(invoiceData)
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Create invoice_work_details entries to link work details to this invoice
      const invoiceWorkDetailsData = selectedWorkDetailsIds.map(
        (workDetailId) => ({
          invoice_details_id: invoice.id,
          work_details_id: workDetailId,
        })
      );

      const { error: junctionError } = await supabase
        .from("invoice_work_details")
        .insert(invoiceWorkDetailsData);

      if (junctionError) throw junctionError;

      navigate("/invoices", {
        state: {
          successMessage: `Invoice ${
            formData.invoice_number || invoice.id
          } created successfully for ${
            selectedWorkDetailsIds.length
          } work details`,
        },
      });
    } catch (err) {
      console.error("Error creating invoice:", err);
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackToWorkOrderSelection = () => {
    setStep("select-work-order");
    setSelectedWorkOrderId(null);
    setSelectedWorkDetailsIds([]);
    setSelectedWorkDetails([]);
  };

  const handleBackToWorkDetailsSelection = () => {
    setStep("select-work-details");
    setSelectedWorkDetailsIds([]);
    setSelectedWorkDetails([]);
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
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Add New Invoice
            </h1>
            <p className="text-gray-600 mt-2">
              Create invoices for completed work details. You can invoice work
              details separately across multiple invoices.
            </p>
          </div>

          <button
            onClick={() => navigate("/invoices")}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2 transition-colors"
          >
            ← Back to Invoices
          </button>
        </div>

        {/* Step Indicator */}
        <div className="mb-8">
          <div className="flex items-center space-x-4">
            <div
              className={`flex items-center space-x-2 ${
                step === "select-work-order"
                  ? "text-blue-600"
                  : step !== "select-work-order"
                  ? "text-green-600"
                  : "text-gray-400"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === "select-work-order"
                    ? "bg-blue-600 text-white"
                    : step !== "select-work-order"
                    ? "bg-green-600 text-white"
                    : "bg-gray-200"
                }`}
              >
                1
              </div>
              <span>Select Work Order</span>
            </div>
            <div className="w-8 h-1 bg-gray-200"></div>
            <div
              className={`flex items-center space-x-2 ${
                step === "select-work-details"
                  ? "text-blue-600"
                  : step === "invoice-form"
                  ? "text-green-600"
                  : "text-gray-400"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === "select-work-details"
                    ? "bg-blue-600 text-white"
                    : step === "invoice-form"
                    ? "bg-green-600 text-white"
                    : "bg-gray-200"
                }`}
              >
                2
              </div>
              <span>Select Work Details</span>
            </div>
            <div className="w-8 h-1 bg-gray-200"></div>
            <div
              className={`flex items-center space-x-2 ${
                step === "invoice-form" ? "text-blue-600" : "text-gray-400"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === "invoice-form"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200"
                }`}
              >
                3
              </div>
              <span>Invoice Details</span>
            </div>
          </div>
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

        {/* Step 1: Select Work Order */}
        {step === "select-work-order" && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4">Select Work Order</h2>

              {workOrdersWithAvailableDetails.length === 0 ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                  <div className="flex items-center mb-4">
                    <span className="text-yellow-600 mr-3 text-2xl">⚠️</span>
                    <h3 className="text-lg font-medium text-yellow-800">
                      No Work Orders Available for Invoicing
                    </h3>
                  </div>
                  <div className="text-yellow-700 space-y-2">
                    <p>
                      To create an invoice, you need work orders with completed
                      work details that haven't been invoiced yet.
                    </p>
                    <ul className="list-disc list-inside ml-4 space-y-1">
                      <li>Work details must be 100% complete</li>
                      <li>Work details must not already be invoiced</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {workOrdersWithAvailableDetails.map((wo) => (
                    <div
                      key={wo.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 cursor-pointer transition-colors"
                      onClick={() => handleWorkOrderSelect(wo.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-gray-900">
                              {wo.customer_wo_number ||
                                wo.shipyard_wo_number ||
                                `WO-${wo.id}`}
                            </h3>
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                              {wo.available_work_details} available
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            <div>
                              <strong>Vessel:</strong> {wo.vessel?.name} (
                              {wo.vessel?.company})
                            </div>
                            <div>
                              <strong>Progress:</strong> {wo.overall_progress}%
                            </div>
                            <div>
                              <strong>Work Details:</strong>{" "}
                              {wo.available_work_details} of{" "}
                              {wo.total_work_details} available for invoicing
                              {wo.invoiced_work_details > 0 && (
                                <span className="text-green-600 ml-2">
                                  ({wo.invoiced_work_details} already invoiced)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                            Select →
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Select Work Details */}
        {step === "select-work-details" && selectedWorkOrderId && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">
                  Select Work Details to Invoice
                </h2>
                <button
                  onClick={handleBackToWorkOrderSelection}
                  className="text-blue-600 hover:text-blue-800"
                >
                  ← Change Work Order
                </button>
              </div>

              <SelectWorkDetailsForInvoice
                workOrderId={selectedWorkOrderId}
                onWorkDetailsSelected={handleWorkDetailsSelected}
              />
            </div>
          </div>
        )}

        {/* Step 3: Invoice Form */}
        {step === "invoice-form" && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Invoice Details</h2>
                <button
                  onClick={handleBackToWorkDetailsSelection}
                  className="text-blue-600 hover:text-blue-800"
                >
                  ← Change Work Details
                </button>
              </div>

              {/* Selected Work Details Summary */}
              <div className="bg-gray-50 p-4 rounded-lg mb-6">
                <h3 className="font-semibold mb-3">
                  Selected Work Details ({selectedWorkDetails.length})
                </h3>
                <div className="space-y-2">
                  {selectedWorkDetails.map((detail) => (
                    <div
                      key={detail.id}
                      className="flex justify-between items-center bg-white rounded p-3 text-sm"
                    >
                      <div>
                        <span className="font-medium">
                          {detail.description}
                        </span>
                        {detail.location && (
                          <span className="text-gray-600 ml-2">
                            📍 {detail.location}
                          </span>
                        )}
                        {detail.pic && (
                          <span className="text-gray-600 ml-2">
                            👤 {detail.pic}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-green-700">100%</span>
                        {detail.verification_status && (
                          <span title="Verified">🔍</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreateInvoice();
                }}
                className="space-y-6"
              >
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
                      htmlFor="wo_document_collection_date"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Work Order Document Collection Date
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
          </div>
        )}
      </div>
    </div>
  );
}
