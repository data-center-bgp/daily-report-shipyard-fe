import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, type Vessel } from "../../lib/supabase";

export default function AddWorkOrder() {
  const navigate = useNavigate();
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loadingVessels, setLoadingVessels] = useState(true);
  const [formData, setFormData] = useState({
    customer_wo_number: "",
    customer_wo_date: "",
    shipyard_wo_number: "",
    shipyard_wo_date: "",
    vessel_id: "", // Add vessel_id to form data
    wo_location: "",
    wo_description: "",
    quantity: 1,
    planned_start_date: "",
    target_close_date: "",
    period_close_target: "",
    invoice_delivery_date: "",
    pic: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch vessels on component mount
  useEffect(() => {
    const fetchVessels = async () => {
      try {
        setLoadingVessels(true);
        const { data, error } = await supabase
          .from("vessel")
          .select("*")
          .is("deleted_at", null) // Only get non-deleted vessels
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
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        name === "quantity" || name === "vessel_id"
          ? parseInt(value) || (name === "quantity" ? 1 : "")
          : value,
    }));
  };

  const validateForm = () => {
    const required = [
      "customer_wo_number",
      "customer_wo_date",
      "shipyard_wo_number",
      "shipyard_wo_date",
      "vessel_id", // Add vessel_id to validation
      "wo_location",
      "wo_description",
      "planned_start_date",
      "target_close_date",
      "period_close_target",
      "invoice_delivery_date",
      "pic",
    ];

    for (const field of required) {
      if (!formData[field as keyof typeof formData]) {
        setError(`${field.replace(/_/g, " ").toUpperCase()} is required`);
        return false;
      }
    }

    // Validate dates
    const customerDate = new Date(formData.customer_wo_date);
    const shipyardDate = new Date(formData.shipyard_wo_date);
    const plannedStart = new Date(formData.planned_start_date);
    const targetClose = new Date(formData.target_close_date);
    const invoiceDate = new Date(formData.invoice_delivery_date);

    if (shipyardDate < customerDate) {
      setError("Shipyard WO date cannot be before Customer WO date");
      return false;
    }

    if (plannedStart < shipyardDate) {
      setError("Planned start date cannot be before Shipyard WO date");
      return false;
    }

    if (targetClose < plannedStart) {
      setError("Target close date cannot be before Planned start date");
      return false;
    }

    if (invoiceDate < targetClose) {
      setError("Invoice delivery date cannot be before Target close date");
      return false;
    }

    setError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Convert vessel_id to number before submitting
      const submitData = {
        ...formData,
        vessel_id: parseInt(formData.vessel_id.toString()),
      };

      const { data, error } = await supabase
        .from("work_order")
        .insert([submitData])
        .select();

      if (error) throw error;

      console.log("Work order created successfully:", data);

      // Navigate back to dashboard with success message
      navigate("/", { state: { message: "Work order created successfully!" } });
    } catch (err) {
      console.error("Error creating work order:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate("/");
  };

  if (loadingVessels) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading vessels...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <button
                onClick={handleCancel}
                className="mr-4 text-gray-600 hover:text-gray-900"
              >
                ← Back
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                Add New Work Order
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          {/* Error Message */}
          {error && (
            <div className="p-6 border-b border-gray-200">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-600">{error}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column */}
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900 border-b pb-2">
                  Work Order Information
                </h3>

                {/* Vessel Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vessel *
                  </label>
                  <select
                    name="vessel_id"
                    value={formData.vessel_id}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select Vessel</option>
                    {vessels.map((vessel) => (
                      <option key={vessel.id} value={vessel.id}>
                        {vessel.name}
                      </option>
                    ))}
                  </select>
                  {vessels.length === 0 && (
                    <p className="text-sm text-gray-500 mt-1">
                      No vessels available. Please add vessels first.
                    </p>
                  )}
                </div>

                {/* Customer WO Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer WO Number *
                  </label>
                  <input
                    type="text"
                    name="customer_wo_number"
                    value={formData.customer_wo_number}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., WO-2024-008"
                    required
                  />
                </div>

                {/* Customer WO Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer WO Date *
                  </label>
                  <input
                    type="date"
                    name="customer_wo_date"
                    value={formData.customer_wo_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* Shipyard WO Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Shipyard WO Number *
                  </label>
                  <input
                    type="text"
                    name="shipyard_wo_number"
                    value={formData.shipyard_wo_number}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., SY-2024-008"
                    required
                  />
                </div>

                {/* Shipyard WO Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Shipyard WO Date *
                  </label>
                  <input
                    type="date"
                    name="shipyard_wo_date"
                    value={formData.shipyard_wo_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* WO Location */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Work Order Location *
                  </label>
                  <select
                    name="wo_location"
                    value={formData.wo_location}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select Location</option>
                    <option value="Dock A1">Dock A1</option>
                    <option value="Dock A2">Dock A2</option>
                    <option value="Dock B1">Dock B1</option>
                    <option value="Dock B2">Dock B2</option>
                    <option value="Dock C1">Dock C1</option>
                    <option value="Dock C2">Dock C2</option>
                    <option value="Dock C3">Dock C3</option>
                    <option value="Dock D1">Dock D1</option>
                    <option value="Dock D2">Dock D2</option>
                    <option value="Dry Dock 1">Dry Dock 1</option>
                    <option value="Dry Dock 2">Dry Dock 2</option>
                    <option value="Workshop">Workshop</option>
                  </select>
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    name="quantity"
                    value={formData.quantity}
                    onChange={handleInputChange}
                    min="1"
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* PIC */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Person In Charge (PIC) *
                  </label>
                  <input
                    type="text"
                    name="pic"
                    value={formData.pic}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., John Smith"
                    required
                  />
                </div>
              </div>

              {/* Right Column - Schedule & Delivery */}
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900 border-b pb-2">
                  Schedule & Delivery
                </h3>

                {/* Planned Start Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Planned Start Date *
                  </label>
                  <input
                    type="date"
                    name="planned_start_date"
                    value={formData.planned_start_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* Target Close Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Target Close Date *
                  </label>
                  <input
                    type="date"
                    name="target_close_date"
                    value={formData.target_close_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* Period Close Target */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Period Close Target *
                  </label>
                  <select
                    name="period_close_target"
                    value={formData.period_close_target}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select Period</option>
                    <option value="January">January</option>
                    <option value="February">February</option>
                    <option value="March">March</option>
                    <option value="April">April</option>
                    <option value="May">May</option>
                    <option value="June">June</option>
                    <option value="July">July</option>
                    <option value="August">August</option>
                    <option value="September">September</option>
                    <option value="October">October</option>
                    <option value="November">November</option>
                    <option value="December">December</option>
                  </select>
                </div>

                {/* Invoice Delivery Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Invoice Delivery Date *
                  </label>
                  <input
                    type="date"
                    name="invoice_delivery_date"
                    value={formData.invoice_delivery_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Work Order Description - Full Width */}
            <div className="mt-8">
              <h3 className="text-lg font-medium text-gray-900 border-b pb-2 mb-6">
                Description
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Work Order Description *
                </label>
                <textarea
                  name="wo_description"
                  value={formData.wo_description}
                  onChange={handleInputChange}
                  rows={6}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Describe the work to be performed in detail..."
                  required
                />
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-4 mt-8 pt-6 border-t">
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || vessels.length === 0}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Creating...
                  </>
                ) : (
                  <>➕ Create Work Order</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
