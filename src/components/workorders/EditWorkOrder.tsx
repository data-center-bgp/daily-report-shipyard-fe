import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase, type WorkOrder, type Vessel } from "../../lib/supabase";

interface WorkOrderWithVessel extends WorkOrder {
  vessel?: Vessel;
}

export default function EditWorkOrder() {
  const navigate = useNavigate();
  const { workOrderId } = useParams<{ workOrderId: string }>();

  const [workOrder, setWorkOrder] = useState<WorkOrderWithVessel | null>(null);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loadingVessels, setLoadingVessels] = useState(true);
  const [loadingWorkOrder, setLoadingWorkOrder] = useState(true);

  // Form data state
  const [formData, setFormData] = useState({
    // Required fields
    vessel_id: "",
    shipyard_wo_number: "",
    shipyard_wo_date: "",

    // Optional fields
    customer_wo_number: "",
    customer_wo_date: "",
    wo_document_delivery_date: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch work order data
  useEffect(() => {
    const fetchWorkOrder = async () => {
      if (!workOrderId) {
        setError("Work Order ID is required");
        setLoadingWorkOrder(false);
        return;
      }

      try {
        setLoadingWorkOrder(true);
        setError(null);

        console.log(`Fetching work order ${workOrderId}...`);

        const { data, error } = await supabase
          .from("work_order")
          .select(
            `
            *,
            vessel (
              id,
              name,
              type,
              company
            )
          `
          )
          .eq("id", parseInt(workOrderId))
          .single();

        if (error) throw error;

        if (!data) {
          throw new Error("Work order not found");
        }

        console.log("Fetched work order:", data);
        setWorkOrder(data);

        // Populate form data
        setFormData({
          vessel_id: data.vessel_id?.toString() || "",
          shipyard_wo_number: data.shipyard_wo_number || "",
          shipyard_wo_date: data.shipyard_wo_date || "",
          customer_wo_number: data.customer_wo_number || "",
          customer_wo_date: data.customer_wo_date || "",
          wo_document_delivery_date: data.wo_document_delivery_date || "",
        });
      } catch (err) {
        console.error("Error fetching work order:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load work order"
        );
      } finally {
        setLoadingWorkOrder(false);
      }
    };

    fetchWorkOrder();
  }, [workOrderId]);

  // Fetch vessels
  useEffect(() => {
    const fetchVessels = async () => {
      try {
        setLoadingVessels(true);
        const { data, error } = await supabase
          .from("vessel")
          .select("*")
          .is("deleted_at", null)
          .order("name");

        if (error) throw error;

        console.log("Fetched vessels:", data);
        setVessels(data || []);
      } catch (err) {
        console.error("Error fetching vessels:", err);
        setError("Failed to load vessels. Please refresh the page.");
      } finally {
        setLoadingVessels(false);
      }
    };

    fetchVessels();
  }, []);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "vessel_id" ? parseInt(value) || "" : value,
    }));
  };

  const validateForm = () => {
    // Only these fields are required
    const required = ["vessel_id", "shipyard_wo_number", "shipyard_wo_date"];

    for (const field of required) {
      const value = formData[field as keyof typeof formData];
      if (!value) {
        setError(`${field.replace(/_/g, " ").toUpperCase()} is required`);
        return false;
      }
    }

    // Validate dates if both are provided
    if (formData.customer_wo_date && formData.shipyard_wo_date) {
      const customerDate = new Date(formData.customer_wo_date);
      const shipyardDate = new Date(formData.shipyard_wo_date);

      if (shipyardDate < customerDate) {
        setError("Shipyard WO date cannot be before Customer WO date");
        return false;
      }
    }

    setError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !workOrderId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log("Updating work order with data:", formData);

      // Prepare update data
      const updateData = {
        vessel_id: parseInt(formData.vessel_id.toString()),
        shipyard_wo_number: formData.shipyard_wo_number.trim(),
        shipyard_wo_date: formData.shipyard_wo_date,
        customer_wo_number: formData.customer_wo_number.trim() || null,
        customer_wo_date: formData.customer_wo_date || null,
        wo_document_delivery_date: formData.wo_document_delivery_date || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("work_order")
        .update(updateData)
        .eq("id", parseInt(workOrderId))
        .select()
        .single();

      if (error) {
        console.error("Database error:", error);
        throw new Error(`Database error: ${error.message}`);
      }

      if (!data) {
        throw new Error("No data returned from work order update");
      }

      console.log("Work order updated successfully:", data);

      // Navigate back to vessel work orders or dashboard
      const vesselId = formData.vessel_id;
      if (vesselId) {
        navigate(`/vessel/${vesselId}/work-orders`, {
          state: {
            message: `Work order ${formData.shipyard_wo_number} updated successfully!`,
          },
        });
      } else {
        navigate("/work-orders", {
          state: {
            message: `Work order ${formData.shipyard_wo_number} updated successfully!`,
          },
        });
      }
    } catch (err) {
      console.error("Error updating work order:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (workOrder?.vessel_id) {
      navigate(`/vessel/${workOrder.vessel_id}/work-orders`);
    } else {
      navigate("/work-orders");
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loadingWorkOrder || loadingVessels) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">
            {loadingWorkOrder ? "Loading work order..." : "Loading vessels..."}
          </p>
        </div>
      </div>
    );
  }

  if (error && !workOrder) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-rose-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-red-200 p-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
              <span className="text-white text-xl">⚠️</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">
              Cannot Load Work Order
            </h2>
            <p className="text-slate-600 text-sm mb-6">{error}</p>
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 text-sm font-medium shadow-md"
              >
                ← Back
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-gradient-to-r from-slate-500 to-slate-600 text-white px-4 py-2 rounded-lg hover:from-slate-600 hover:to-slate-700 transition-all duration-200 text-sm font-medium shadow-md"
              >
                🔄 Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <span className="text-slate-400 text-4xl mb-4 block">📋</span>
          <p className="text-slate-500 text-lg mb-4">Work order not found</p>
          <button
            onClick={handleCancel}
            className="text-blue-600 hover:text-blue-800 transition-colors font-medium"
          >
            ← Back to Work Orders
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-10 backdrop-blur-sm bg-white/95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <button
                onClick={handleCancel}
                className="mr-4 text-slate-600 hover:text-slate-900 transition-colors p-2 rounded-lg hover:bg-slate-100"
              >
                ← Back
              </button>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                  Edit Work Order
                </h1>
                <p className="text-sm text-slate-600">
                  {workOrder.shipyard_wo_number} • {workOrder.vessel?.name}
                </p>
              </div>
            </div>
            <div className="text-sm text-slate-600 bg-gradient-to-r from-slate-50 to-gray-50 px-3 py-2 rounded-lg border">
              Created: {formatDate(workOrder.created_at)}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-lg rounded-xl border border-slate-200/50 overflow-hidden">
          {/* Error Message */}
          {error && (
            <div className="p-6 border-b border-slate-200">
              <div className="bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-center">
                  <span className="text-red-600 mr-2">⚠️</span>
                  <p className="text-red-700 font-medium">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-8">
            {/* Current Work Order Info */}
            <div className="bg-gradient-to-r from-slate-50 to-gray-50 rounded-lg p-4 border border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
                📋 Current Work Order Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-slate-600">Vessel:</span>
                  <span className="ml-2 text-slate-800">
                    🚢 {workOrder.vessel?.name} ({workOrder.vessel?.type})
                  </span>
                </div>
                <div>
                  <span className="font-medium text-slate-600">Company:</span>
                  <span className="ml-2 text-slate-800">
                    {workOrder.vessel?.company}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-slate-600">Created:</span>
                  <span className="ml-2 text-slate-800">
                    {formatDate(workOrder.created_at)}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-slate-600">
                    Last Updated:
                  </span>
                  <span className="ml-2 text-slate-800">
                    {workOrder.updated_at
                      ? formatDate(workOrder.updated_at)
                      : "Never"}
                  </span>
                </div>
              </div>
            </div>

            {/* Vessel Selection */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Vessel <span className="text-red-500">*</span>
              </label>
              <select
                name="vessel_id"
                value={formData.vessel_id}
                onChange={handleInputChange}
                className="w-full px-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-colors"
                required
              >
                <option value="">Select Vessel</option>
                {vessels.map((vessel) => (
                  <option key={vessel.id} value={vessel.id}>
                    {vessel.name} - {vessel.type} ({vessel.company})
                  </option>
                ))}
              </select>
              {vessels.length === 0 && (
                <p className="text-sm text-amber-600 mt-1">
                  No vessels available. Please add vessels first.
                </p>
              )}
            </div>

            {/* Required Fields */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2 flex items-center gap-2">
                🔵 Required Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Shipyard WO Number */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Shipyard Work Order Number{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="shipyard_wo_number"
                    value={formData.shipyard_wo_number}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-colors"
                    placeholder="e.g., SY-2024-001"
                    required
                  />
                </div>

                {/* Shipyard WO Date */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Shipyard Work Order Date{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="shipyard_wo_date"
                    value={formData.shipyard_wo_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-colors"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Optional Fields */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2 flex items-center gap-2">
                🟡 Optional Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Customer WO Number */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Customer Work Order Number
                    <span className="text-slate-500 font-normal">
                      {" "}
                      (Optional)
                    </span>
                  </label>
                  <input
                    type="text"
                    name="customer_wo_number"
                    value={formData.customer_wo_number}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-colors"
                    placeholder="e.g., WO-2024-001"
                  />
                </div>

                {/* Customer WO Date */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Customer Work Order Date
                    <span className="text-slate-500 font-normal">
                      {" "}
                      (Optional)
                    </span>
                  </label>
                  <input
                    type="date"
                    name="customer_wo_date"
                    value={formData.customer_wo_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-colors"
                  />
                </div>
              </div>

              {/* WO Document Delivery Date */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Work Order Document Delivery Date
                  <span className="text-slate-500 font-normal">
                    {" "}
                    (Optional)
                  </span>
                </label>
                <input
                  type="date"
                  name="wo_document_delivery_date"
                  value={formData.wo_document_delivery_date}
                  onChange={handleInputChange}
                  className="w-full px-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-colors"
                />
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex flex-col sm:flex-row justify-end gap-4 pt-6 border-t border-slate-200">
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-gradient-to-r hover:from-slate-50 hover:to-gray-50 transition-all duration-200 disabled:opacity-50 font-medium shadow-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || vessels.length === 0}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-semibold shadow-lg"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Updating...
                  </>
                ) : (
                  <>💾 Update Work Order</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
