import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import type { BASTPWithDetails } from "../../types/bastp.types";
import type { Invoice } from "../../types/invoiceTypes";

interface WorkDetailPrice {
  work_details_id: number;
  unit_price: number;
  quantity: number;
  uom: string;
  payment_price: number;
}

interface GeneralServicePrice {
  service_type_id: number;
  total_days: number;
  unit_price: number;
  payment_price: number;
  remarks: string;
}

export default function ManageInvoice() {
  const { bastpId, invoiceId } = useParams<{
    bastpId?: string;
    invoiceId?: string;
  }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const isEditMode = !!invoiceId;
  const isCreateMode = !!bastpId;

  const [bastp, setBastp] = useState<BASTPWithDetails | null>(null);
  const [existingInvoice, setExistingInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Document viewer states
  const [viewingDocument, setViewingDocument] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    bastp_collection_date: "",
    company: "",
    invoice_number: "",
    faktur_number: "",
    due_date: "",
    delivery_date: "",
    collection_date: "",
    receiver_name: "",
    payment_status: false,
    payment_date: "",
    remarks: "",
  });

  const [workDetailPrices, setWorkDetailPrices] = useState<WorkDetailPrice[]>(
    []
  );

  const [generalServicePrices, setGeneralServicePrices] = useState<
    GeneralServicePrice[]
  >([]);

  useEffect(() => {
    if (isEditMode && invoiceId) {
      fetchExistingInvoice();
    } else if (isCreateMode && bastpId) {
      fetchBASTPreferenceDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bastpId, invoiceId]);

  // Fetch existing invoice for edit mode
  const fetchExistingInvoice = async () => {
    if (!invoiceId) return;

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
            bastp_work_details (
              id,
              work_details_id,
              work_details:work_details_id (
                id,
                description,
                quantity,
                uom,
                pic,
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
          invoice_work_details (
            id,
            work_details_id,
            payment_price,
            unit_price,
            work_details:work_details_id (
              id,
              description,
              quantity,
              uom,
              location:location_id (
                id,
                location
              ),
              work_scope:work_scope_id (
                id,
                work_scope
              )
            )
          )
        `
        )
        .eq("id", invoiceId)
        .single();

      if (fetchError) throw fetchError;

      setExistingInvoice(data);
      setBastp(data.bastp);

      // Populate form data
      setFormData({
        bastp_collection_date: data.bastp_collection_date || "",
        company: data.company || "",
        invoice_number: data.invoice_number || "",
        faktur_number: data.faktur_number || "",
        due_date: data.due_date || "",
        delivery_date: data.delivery_date || "",
        collection_date: data.collection_date || "",
        receiver_name: data.receiver_name || "",
        payment_status: data.payment_status,
        payment_date: data.payment_date || "",
        remarks: data.remarks || "",
      });

      // Populate work detail prices
      const allWorkDetailIds =
        data.bastp?.bastp_work_details
          ?.map((item: any) => item.work_details_id)
          .filter((id: number) => id !== null && id !== undefined) || [];

      const prices: WorkDetailPrice[] = allWorkDetailIds.map(
        (workDetailId: number) => {
          const existingPrice = data.invoice_work_details?.find(
            (item: any) => item.work_details_id === workDetailId
          );

          const workDetail = data.bastp?.bastp_work_details?.find(
            (bwd: any) => bwd.work_details_id === workDetailId
          )?.work_details;

          const quantity = workDetail?.quantity || 0;
          const uom = workDetail?.uom || "";
          const unit_price = existingPrice?.unit_price || 0;

          return {
            work_details_id: workDetailId,
            unit_price: unit_price,
            quantity: quantity,
            uom: uom,
            payment_price: unit_price * quantity,
          };
        }
      );

      setWorkDetailPrices(prices);

      // Populate general service prices
      const servicePrices: GeneralServicePrice[] =
        data.bastp?.general_services?.map((service: any) => ({
          service_type_id: service.service_type_id,
          total_days: service.total_days,
          unit_price: service.unit_price || 0,
          payment_price: service.payment_price || 0,
          remarks: service.remarks || "",
        })) || [];

      setGeneralServicePrices(servicePrices);
    } catch (err) {
      console.error("Error fetching invoice:", err);
      setError(err instanceof Error ? err.message : "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  };

  // Fetch BASTP for create mode
  const fetchBASTPreferenceDetails = async () => {
    if (!bastpId) return;

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
        bastp_work_details (
          id,
          work_details_id,
          work_details:work_details_id (
            id,
            description,
            quantity,
            uom,
            pic,
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
        ),
        general_services (
          id,
          service_type_id,
          total_days,
          remarks,
          service_type:service_type_id (
            id,
            service_name,
            display_order
          )
        )
      `
        )
        .eq("id", bastpId)
        .single();

      if (fetchError) throw fetchError;

      // Check if already invoiced
      if (data.is_invoiced) {
        setError("This BASTP has already been invoiced");
        setLoading(false);
        return;
      }

      if (data.status !== "READY_FOR_INVOICE") {
        setError("This BASTP is not ready for invoicing");
        setLoading(false);
        return;
      }

      setBastp(data);
      if (!data.bastp_work_details || data.bastp_work_details.length === 0) {
        setError("This BASTP has no work details to invoice");
        setLoading(false);
        return;
      }

      // Initialize work detail prices with 0
      const initialPrices: WorkDetailPrice[] =
        data.bastp_work_details
          ?.filter((item: any) => item.work_details_id)
          ?.map((item: any) => ({
            work_details_id: item.work_details_id,
            unit_price: 0,
            quantity: item.work_details?.quantity || 0,
            uom: item.work_details?.uom || "",
            payment_price: 0,
          })) || [];
      setWorkDetailPrices(initialPrices);

      // Initialize general service prices with 0
      const initialServicePrices: GeneralServicePrice[] =
        data.general_services?.map((service: any) => ({
          service_type_id: service.service_type_id,
          total_days: service.total_days,
          unit_price: 0,
          payment_price: 0,
          remarks: service.remarks || "",
        })) || [];
      setGeneralServicePrices(initialServicePrices);

      // Pre-fill some fields from BASTP
      setFormData((prev) => ({
        ...prev,
        company: data.vessel?.company || "",
        delivery_date: data.delivery_date || "",
      }));
    } catch (err) {
      console.error("Error fetching BASTP:", err);
      setError(err instanceof Error ? err.message : "Failed to load BASTP");
    } finally {
      setLoading(false);
    }
  };

  const handleUnitPriceChange = (work_details_id: number, value: string) => {
    const numericValue = value.replace(/\D/g, "");
    const unit_price = numericValue === "" ? 0 : parseInt(numericValue, 10);

    setWorkDetailPrices((prev) =>
      prev.map((item) =>
        item.work_details_id === work_details_id
          ? {
              ...item,
              unit_price: unit_price,
              payment_price: unit_price * item.quantity,
            }
          : item
      )
    );

    if (error && error.includes("work detail price")) {
      setError(null);
    }
  };

  const handleServiceUnitPriceChange = (
    service_type_id: number,
    value: string
  ) => {
    const numericValue = value.replace(/\D/g, "");
    const unit_price = numericValue === "" ? 0 : parseInt(numericValue, 10);

    setGeneralServicePrices((prev) =>
      prev.map((item) =>
        item.service_type_id === service_type_id
          ? {
              ...item,
              unit_price: unit_price,
              payment_price: unit_price * item.total_days,
            }
          : item
      )
    );

    if (error && error.includes("service price")) {
      setError(null);
    }
  };

  const calculateTotalAmount = () => {
    const workTotal = workDetailPrices.reduce(
      (sum, item) => sum + item.payment_price,
      0
    );
    const serviceTotal = generalServicePrices.reduce(
      (sum, item) => sum + item.payment_price,
      0
    );
    return workTotal + serviceTotal;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile) {
      setError("User not authenticated");
      return;
    }

    // Validate that at least one work detail has a unit price
    const hasWorkPrice = workDetailPrices.some((item) => item.unit_price > 0);
    const hasServicePrice = generalServicePrices.some(
      (item) => item.unit_price > 0
    );

    if (!hasWorkPrice && !hasServicePrice) {
      setError(
        "Please set at least one work detail price or general service price"
      );
      return;
    }

    try {
      setSaving(true);
      setError(null);

      if (isEditMode && invoiceId) {
        // UPDATE EXISTING INVOICE
        const { error: invoiceError } = await supabase
          .from("invoice_details")
          .update({
            bastp_collection_date: formData.bastp_collection_date || null,
            company: formData.company || null,
            invoice_number: formData.invoice_number || null,
            faktur_number: formData.faktur_number || null,
            due_date: formData.due_date || null,
            delivery_date: formData.delivery_date || null,
            collection_date: formData.collection_date || null,
            receiver_name: formData.receiver_name || null,
            payment_status: formData.payment_status,
            payment_date: formData.payment_date || null,
            remarks: formData.remarks || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoiceId);

        if (invoiceError) throw invoiceError;

        // Delete existing work details
        const { error: deleteError } = await supabase
          .from("invoice_work_details")
          .delete()
          .eq("invoice_details_id", invoiceId);

        if (deleteError) throw deleteError;

        // Insert work details
        const workDetailsToInsert = workDetailPrices
          .filter((item) => item.unit_price > 0)
          .map((item) => ({
            invoice_details_id: Number(invoiceId),
            work_details_id: item.work_details_id,
            unit_price: item.unit_price,
            payment_price: item.payment_price,
          }));

        if (workDetailsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from("invoice_work_details")
            .insert(workDetailsToInsert);

          if (insertError) throw insertError;
        }

        // Update general services in BASTP
        for (const service of generalServicePrices) {
          const { error: serviceError } = await supabase
            .from("general_services")
            .update({
              unit_price: service.unit_price,
              payment_price: service.payment_price,
            })
            .eq("bastp_id", bastp?.id)
            .eq("service_type_id", service.service_type_id);

          if (serviceError) throw serviceError;
        }

        setSuccess("✅ Invoice updated successfully!");
        setTimeout(() => navigate(`/invoices/${invoiceId}`), 1500);
      } else if (isCreateMode && bastpId) {
        // CREATE NEW INVOICE
        const { data: invoiceData, error: invoiceError } = await supabase
          .from("invoice_details")
          .insert({
            bastp_id: parseInt(bastpId),
            user_id: profile.id,
            bastp_collection_date: formData.bastp_collection_date || null,
            company: formData.company || null,
            invoice_number: formData.invoice_number || null,
            faktur_number: formData.faktur_number || null,
            due_date: formData.due_date || null,
            delivery_date: formData.delivery_date || null,
            collection_date: formData.collection_date || null,
            receiver_name: formData.receiver_name || null,
            payment_status: formData.payment_status,
            payment_date: formData.payment_date || null,
            remarks: formData.remarks || null,
          })
          .select()
          .single();

        if (invoiceError) throw invoiceError;

        // Insert work details
        const workDetailsToInsert = workDetailPrices
          .filter((item) => item.unit_price > 0)
          .map((item) => ({
            invoice_details_id: invoiceData.id,
            work_details_id: item.work_details_id,
            unit_price: item.unit_price,
            payment_price: item.payment_price,
          }));

        if (workDetailsToInsert.length > 0) {
          const { error: detailsError } = await supabase
            .from("invoice_work_details")
            .insert(workDetailsToInsert);

          if (detailsError) throw detailsError;
        }

        // Update general services in BASTP
        for (const service of generalServicePrices) {
          const { error: serviceError } = await supabase
            .from("general_services")
            .update({
              unit_price: service.unit_price,
              payment_price: service.payment_price,
            })
            .eq("bastp_id", bastpId)
            .eq("service_type_id", service.service_type_id);

          if (serviceError) throw serviceError;
        }

        // Update BASTP status to INVOICED
        const { error: bastpUpdateError } = await supabase
          .from("bastp")
          .update({
            is_invoiced: true,
            invoiced_date: new Date().toISOString(),
          })
          .eq("id", bastpId);

        if (bastpUpdateError) throw bastpUpdateError;

        setSuccess("✅ Invoice created successfully!");
        setTimeout(() => navigate(`/invoices/${invoiceData.id}`), 1500);
      }
    } catch (err) {
      console.error("Error saving invoice:", err);
      setError(err instanceof Error ? err.message : "Failed to save invoice");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingInvoice || !invoiceId) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this invoice? This action cannot be undone."
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      setError(null);

      // Soft delete invoice
      const { error: deleteError } = await supabase
        .from("invoice_details")
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);

      if (deleteError) throw deleteError;

      // Update BASTP back to READY_FOR_INVOICE
      if (existingInvoice.bastp_id) {
        const { error: bastpError } = await supabase
          .from("bastp")
          .update({
            is_invoiced: false,
            invoiced_date: null,
          })
          .eq("id", existingInvoice.bastp_id);

        if (bastpError) throw bastpError;
      }

      navigate("/invoices", {
        state: { successMessage: "Invoice deleted successfully" },
      });
    } catch (err) {
      console.error("Error deleting invoice:", err);
      setError(err instanceof Error ? err.message : "Failed to delete invoice");
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // View document with modal
  const handleViewDocument = async () => {
    if (!bastp?.storage_path) {
      setError("No BASTP document available");
      return;
    }

    try {
      setViewingDocument(true);

      const { data, error: signedUrlError } = await supabase.storage
        .from("bastp")
        .createSignedUrl(bastp.storage_path, 300);

      if (signedUrlError) throw signedUrlError;

      setDocumentUrl(data.signedUrl);
      setShowDocumentModal(true);
    } catch (err) {
      console.error("Error accessing document:", err);
      setError("Failed to access BASTP document");
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
          <span className="ml-3 text-gray-600">
            Loading {isEditMode ? "invoice" : "BASTP"} details...
          </span>
        </div>
      </div>
    );
  }

  if (error && !bastp) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-red-800 font-medium text-lg">Error</h3>
          <p className="text-red-600 mt-2">{error}</p>
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
      <div className="mb-6">
        <button
          onClick={() => navigate("/invoices")}
          className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-2"
        >
          ← Back to Invoices
        </button>
        <h1 className="text-3xl font-bold text-gray-900">
          {isEditMode ? "Edit Invoice" : "Create Invoice"}
        </h1>
        <p className="text-gray-600 mt-2">
          {isEditMode
            ? `Update invoice details for ${
                existingInvoice?.invoice_number || "invoice"
              }`
            : `Create invoice from BASTP: ${bastp?.number}`}
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <span className="text-red-600 mr-2">⚠️</span>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <span className="text-green-600 mr-2">✅</span>
            <p className="text-green-700 font-medium">{success}</p>
          </div>
        </div>
      )}

      {/* BASTP Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold text-blue-900">
            BASTP Information
          </h2>
          {bastp?.storage_path && (
            <button
              type="button"
              onClick={handleViewDocument}
              disabled={viewingDocument}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              📄 View BASTP Document
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-blue-600">BASTP Number</p>
            <p className="font-medium text-blue-900">{bastp?.number}</p>
          </div>
          <div>
            <p className="text-sm text-blue-600">Vessel</p>
            <p className="font-medium text-blue-900">{bastp?.vessel?.name}</p>
            <p className="text-xs text-blue-700">{bastp?.vessel?.company}</p>
          </div>
          <div>
            <p className="text-sm text-blue-600">Work Details</p>
            <p className="font-medium text-blue-900">
              {isEditMode
                ? existingInvoice?.invoice_work_details?.length || 0
                : bastp?.bastp_work_details?.length || 0}{" "}
              items
            </p>
          </div>
        </div>

        {/* Document Status */}
        <div className="mt-4 pt-4 border-t border-blue-200">
          <div className="flex items-center gap-2">
            {bastp?.storage_path ? (
              <>
                <span className="text-green-600">✓</span>
                <span className="text-sm text-blue-800">
                  BASTP document uploaded on{" "}
                  {bastp.bastp_upload_date
                    ? new Date(bastp.bastp_upload_date).toLocaleDateString(
                        "en-US",
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        }
                      )
                    : "N/A"}
                </span>
              </>
            ) : (
              <>
                <span className="text-yellow-600">⚠️</span>
                <span className="text-sm text-blue-800">
                  No BASTP document uploaded yet
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Invoice Details Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Invoice Details
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                BASTP Collection Date
              </label>
              <input
                type="date"
                value={formData.bastp_collection_date}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bastp_collection_date: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company
              </label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) =>
                  setFormData({ ...formData, company: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Company name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Invoice Number
              </label>
              <input
                type="text"
                value={formData.invoice_number}
                onChange={(e) =>
                  setFormData({ ...formData, invoice_number: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="INV-2024-001"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Faktur Number
              </label>
              <input
                type="text"
                value={formData.faktur_number}
                onChange={(e) =>
                  setFormData({ ...formData, faktur_number: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="FP-001"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Due Date
              </label>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) =>
                  setFormData({ ...formData, due_date: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Delivery Date (to Customer)
              </label>
              <input
                type="date"
                value={formData.delivery_date}
                onChange={(e) =>
                  setFormData({ ...formData, delivery_date: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Collection Date (by Customer)
              </label>
              <input
                type="date"
                value={formData.collection_date}
                onChange={(e) =>
                  setFormData({ ...formData, collection_date: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Receiver Name (from Customer)
              </label>
              <input
                type="text"
                value={formData.receiver_name}
                onChange={(e) =>
                  setFormData({ ...formData, receiver_name: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Receiver name"
              />
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.payment_status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      payment_status: e.target.checked,
                      payment_date:
                        e.target.checked && !formData.payment_date
                          ? new Date().toISOString().split("T")[0]
                          : formData.payment_date,
                    })
                  }
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Mark as Paid
                </span>
              </label>
            </div>

            {formData.payment_status && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Date
                </label>
                <input
                  type="date"
                  value={formData.payment_date}
                  onChange={(e) =>
                    setFormData({ ...formData, payment_date: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Remarks / Notes
              </label>
              <textarea
                value={formData.remarks}
                onChange={(e) =>
                  setFormData({ ...formData, remarks: e.target.value })
                }
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Additional notes or remarks..."
              />
            </div>
          </div>
        </div>

        {/* Work Details Pricing Section */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              💰 Work Details Pricing
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Enter unit price for each work detail. Payment price will be
              calculated automatically (Unit Price × Quantity)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Location
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Quantity
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    UOM
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Unit Price (IDR)
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Payment Price (IDR)
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {bastp?.bastp_work_details &&
                bastp.bastp_work_details.length > 0 ? (
                  bastp.bastp_work_details.map((item) => {
                    const priceItem = workDetailPrices.find(
                      (p) => p.work_details_id === item.work_details_id
                    );

                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <div className="text-sm">
                            <div className="font-medium text-gray-900">
                              {item.work_details?.description}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {item.work_details?.work_scope?.work_scope || "-"}
                            </div>
                            {item.work_details?.work_order && (
                              <div className="text-xs text-gray-500 mt-1">
                                WO:{" "}
                                {
                                  item.work_details.work_order
                                    .shipyard_wo_number
                                }
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-gray-900">
                            {item.work_details?.location?.location || "-"}
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
                        <td className="px-4 py-4">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={
                              priceItem?.unit_price === 0
                                ? ""
                                : priceItem?.unit_price.toString()
                            }
                            onChange={(e) =>
                              handleUnitPriceChange(
                                item.work_details_id,
                                e.target.value
                              )
                            }
                            onFocus={(e) => {
                              e.target.select();
                            }}
                            onPaste={(e) => {
                              e.preventDefault();
                              const pasteData = e.clipboardData.getData("text");
                              const numericValue = pasteData.replace(/\D/g, "");
                              handleUnitPriceChange(
                                item.work_details_id,
                                numericValue
                              );
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="text-sm font-bold text-blue-900">
                            {formatCurrency(priceItem?.payment_price || 0)}
                          </div>
                          {priceItem && priceItem.unit_price > 0 && (
                            <div className="text-xs text-gray-500 mt-1">
                              {formatCurrency(priceItem.unit_price)} ×{" "}
                              {priceItem.quantity}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      No work details available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* General Services Pricing Section */}
        {bastp?.general_services && Array.isArray(bastp.general_services) && bastp.general_services.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                🛠️ General Services Pricing
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Enter unit price (per day) for each service. Payment price will
                be calculated automatically (Unit Price × Total Days)
              </p>
            </div>
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
                      Unit Price (IDR/day)
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Payment Price (IDR)
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Remarks
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {bastp.general_services
                    .sort(
                      (a: any, b: any) =>
                        (a.service_type?.display_order || 0) -
                        (b.service_type?.display_order || 0)
                    )
                    .map((service: any) => {
                      const priceItem = generalServicePrices.find(
                        (p) => p.service_type_id === service.service_type_id
                      );

                      return (
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
                          <td className="px-4 py-4">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={
                                priceItem?.unit_price === 0
                                  ? ""
                                  : priceItem?.unit_price.toString()
                              }
                              onChange={(e) =>
                                handleServiceUnitPriceChange(
                                  service.service_type_id,
                                  e.target.value
                                )
                              }
                              onFocus={(e) => {
                                e.target.select();
                              }}
                              onPaste={(e) => {
                                e.preventDefault();
                                const pasteData =
                                  e.clipboardData.getData("text");
                                const numericValue = pasteData.replace(
                                  /\D/g,
                                  ""
                                );
                                handleServiceUnitPriceChange(
                                  service.service_type_id,
                                  numericValue
                                );
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                              placeholder="0"
                            />
                          </td>
                          <td className="px-4 py-4 text-right">
                            <div className="text-sm font-bold text-green-900">
                              {formatCurrency(priceItem?.payment_price || 0)}
                            </div>
                            {priceItem && priceItem.unit_price > 0 && (
                              <div className="text-xs text-gray-500 mt-1">
                                {formatCurrency(priceItem.unit_price)} ×{" "}
                                {priceItem.total_days}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-600">
                              {service.remarks || "-"}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Total Summary */}
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
                {formatCurrency(calculateTotalAmount())}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                <span className="text-blue-700">
                  Work:{" "}
                  {formatCurrency(
                    workDetailPrices.reduce(
                      (sum, item) => sum + item.payment_price,
                      0
                    )
                  )}
                </span>
                {" + "}
                <span className="text-green-700">
                  Services:{" "}
                  {formatCurrency(
                    generalServicePrices.reduce(
                      (sum, item) => sum + item.payment_price,
                      0
                    )
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center">
          {isEditMode && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              🗑️ Delete Invoice
            </button>
          )}

          <div className={`flex gap-4 ${!isEditMode ? "ml-auto" : ""}`}>
            <button
              type="button"
              onClick={() => navigate("/invoices")}
              className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || calculateTotalAmount() === 0}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  {isEditMode ? "Updating..." : "Creating..."}
                </>
              ) : (
                <>💾 {isEditMode ? "Update Invoice" : "Create Invoice"}</>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Document Viewer Modal */}
      {showDocumentModal && documentUrl && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                📄 BASTP Document - {bastp?.number}
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
              {getFileType(bastp?.storage_path) === "pdf" ? (
                <div className="w-full h-[70vh] bg-white rounded-lg overflow-hidden">
                  <iframe
                    src={`${documentUrl}#view=FitH`}
                    className="w-full h-full border-0"
                    title="BASTP Document Viewer"
                    style={{ minHeight: "70vh" }}
                  />
                </div>
              ) : getFileType(bastp?.storage_path) === "image" ? (
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
                  download={`BASTP-${bastp?.number}.pdf`}
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
