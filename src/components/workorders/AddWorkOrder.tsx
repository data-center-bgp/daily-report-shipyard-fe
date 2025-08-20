// src/components/workorders/AddWorkOrder.tsx

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, type Vessel } from "../../lib/supabase";

export default function AddWorkOrder() {
  const navigate = useNavigate();
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loadingVessels, setLoadingVessels] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [formData, setFormData] = useState({
    // Optional WO Document fields
    customer_wo_number: "",
    customer_wo_date: "",
    shipyard_wo_number: "",
    shipyard_wo_date: "",

    // Required fields
    vessel_id: "",
    wo_location: "",
    wo_description: "",
    quantity: "",
    planned_start_date: "",
    target_close_date: "",
    period_close_target: "",
    pic: "",

    // Optional fields
    invoice_delivery_date: "",
    actual_start_date: "",
    actual_close_date: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get current user on component mount
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error) throw error;

        console.log("Current user:", user);
        setCurrentUser(user);
      } catch (err) {
        console.error("Error getting current user:", err);
        setError("Failed to get user information. Please login again.");
      }
    };

    getCurrentUser();
  }, []);

  // Fetch vessels on component mount
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
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        name === "quantity"
          ? value // Keep as string to allow empty input
          : name === "vessel_id"
          ? parseInt(value) || ""
          : value,
    }));
  };

  // Function to determine wo_document_status
  const getWoDocumentStatus = () => {
    const {
      customer_wo_number,
      customer_wo_date,
      shipyard_wo_number,
      shipyard_wo_date,
    } = formData;

    // If all WO document fields are filled, status is true
    return !!(
      customer_wo_number &&
      customer_wo_date &&
      shipyard_wo_number &&
      shipyard_wo_date
    );
  };

  const validateForm = () => {
    // Only these fields are required
    const required = [
      "vessel_id",
      "wo_location",
      "wo_description",
      "quantity",
      "planned_start_date",
      "target_close_date",
      "period_close_target",
      "pic",
    ];

    for (const field of required) {
      const value = formData[field as keyof typeof formData];
      if (
        !value ||
        (field === "quantity" && (isNaN(Number(value)) || Number(value) <= 0))
      ) {
        if (field === "quantity") {
          setError("Quantity must be a positive number");
        } else {
          setError(`${field.replace(/_/g, " ").toUpperCase()} is required`);
        }
        return false;
      }
    }

    // Check if user is available
    if (!currentUser) {
      setError("User information not available. Please refresh and try again.");
      return false;
    }

    // Validate dates (only for filled dates)
    if (formData.customer_wo_date && formData.shipyard_wo_date) {
      const customerDate = new Date(formData.customer_wo_date);
      const shipyardDate = new Date(formData.shipyard_wo_date);

      if (shipyardDate < customerDate) {
        setError("Shipyard WO date cannot be before Customer WO date");
        return false;
      }
    }

    const plannedStart = new Date(formData.planned_start_date);
    const targetClose = new Date(formData.target_close_date);

    if (targetClose < plannedStart) {
      setError("Target close date cannot be before Planned start date");
      return false;
    }

    // Validate actual dates if provided
    if (formData.actual_start_date) {
      const actualStart = new Date(formData.actual_start_date);
      if (actualStart < plannedStart) {
        setError("Actual start date cannot be before Planned start date");
        return false;
      }
    }

    if (formData.actual_close_date && formData.actual_start_date) {
      const actualStart = new Date(formData.actual_start_date);
      const actualClose = new Date(formData.actual_close_date);
      if (actualClose < actualStart) {
        setError("Actual close date cannot be before Actual start date");
        return false;
      }
    }

    if (formData.invoice_delivery_date) {
      const invoiceDate = new Date(formData.invoice_delivery_date);
      if (invoiceDate < targetClose) {
        setError("Invoice delivery date cannot be before Target close date");
        return false;
      }
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
      // Debug: Log current user data
      console.log("=== DEBUGGING USER DATA ===");
      console.log("Current user object:", currentUser);
      console.log("User ID (UUID):", currentUser.id);
      console.log("User email:", currentUser.email);

      // Fetch user data from the profiles table using auth_user_id
      console.log("=== FETCHING USER FROM PROFILES TABLE ===");
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("auth_user_id", currentUser.id)
        .maybeSingle();

      if (profileError && profileError.code !== "PGRST116") {
        console.error("Error fetching profile data:", profileError);
        throw new Error("Failed to fetch user profile from profiles table");
      }

      console.log("Profile data from profiles table:", profileData);

      // If profile doesn't exist in profiles table, create one
      let userId;
      if (!profileData) {
        console.log("=== CREATING NEW PROFILE RECORD ===");

        // Generate user_id from email hash (same logic as before)
        const userEmail = currentUser.email || "unknown";
        let generatedUserId = 1;

        if (userEmail !== "unknown") {
          let hash = 0;
          for (let i = 0; i < userEmail.length; i++) {
            const char = userEmail.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
          }
          generatedUserId = Math.abs(hash);
        }

        const newProfileData = {
          id: generatedUserId,
          auth_user_id: currentUser.id,
          email: currentUser.email,
          name: currentUser.email?.split("@")[0] || "Unknown User",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        console.log("Creating profile with data:", newProfileData);

        const { data: createdProfile, error: createError } = await supabase
          .from("profiles")
          .insert([newProfileData])
          .select()
          .single();

        if (createError) {
          console.error("Error creating profile:", createError);
          throw new Error(
            `Failed to create profile record: ${createError.message}`
          );
        }

        console.log("Created new profile:", createdProfile);
        userId = createdProfile.id;
      } else {
        console.log("Using existing profile:", profileData);
        userId = profileData.id;
      }

      console.log("=== FINAL USER ID ===");
      console.log("Using user_id:", userId);

      // Prepare submit data with wo_document_status
      const submitData = {
        // WO Document fields (optional)
        customer_wo_number: formData.customer_wo_number || null,
        customer_wo_date: formData.customer_wo_date || null,
        shipyard_wo_number: formData.shipyard_wo_number || null,
        shipyard_wo_date: formData.shipyard_wo_date || null,

        // Required fields
        vessel_id: parseInt(formData.vessel_id.toString()),
        wo_location: formData.wo_location,
        wo_description: formData.wo_description,
        quantity: parseInt(formData.quantity.toString()),
        planned_start_date: formData.planned_start_date,
        target_close_date: formData.target_close_date,
        period_close_target: formData.period_close_target,
        pic: formData.pic,

        // Optional fields
        invoice_delivery_date: formData.invoice_delivery_date || null,
        actual_start_date: formData.actual_start_date || null,
        actual_close_date: formData.actual_close_date || null,

        // Auto-calculated status
        wo_document_status: getWoDocumentStatus(),

        // User info
        user_id: userId,
      };

      console.log("=== SUBMITTING WORK ORDER ===");
      console.log("Submit data:", submitData);
      console.log("WO Document Status:", getWoDocumentStatus());

      const { data, error } = await supabase
        .from("work_order")
        .insert([submitData])
        .select();

      if (error) {
        console.error("Database error:", error);
        throw error;
      }

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

  if (loadingVessels || !currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {loadingVessels
              ? "Loading vessels..."
              : "Loading user information..."}
          </p>
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
            <div className="text-sm text-gray-600">
              Creating as: {currentUser?.email}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          {/* Info Banner */}
          <div className="p-6 border-b border-gray-200">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <span className="text-blue-400 text-xl">⚡</span>
                </div>
                <div className="ml-3">
                  <p className="text-blue-800 font-medium">
                    Urgent/Unplanned Work Order
                  </p>
                  <p className="text-blue-700 text-sm">
                    For urgent work that requires immediate action. Essential
                    information (vessel, location, description, PIC) is required
                    now. Formal WO documents can be completed later after work
                    is finished and inspected.
                  </p>
                </div>
              </div>
            </div>
          </div>

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
              {/* Left Column - Required Fields */}
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900 border-b pb-2">
                  Required Information
                </h3>

                {/* Vessel Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vessel * <span className="text-red-500">Required</span>
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
                        {vessel.name} - {vessel.type} ({vessel.company})
                      </option>
                    ))}
                  </select>
                  {vessels.length === 0 && (
                    <p className="text-sm text-gray-500 mt-1">
                      No vessels available. Please add vessels first.
                    </p>
                  )}
                </div>

                {/* WO Location */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Work Order Location *{" "}
                    <span className="text-red-500">Required</span>
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

                {/* Person In Charge (PIC) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Person In Charge (PIC) *{" "}
                    <span className="text-red-500">Required</span>
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

                {/* Quantity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity * <span className="text-red-500">Required</span>
                  </label>
                  <input
                    type="number"
                    name="quantity"
                    value={formData.quantity}
                    onChange={handleInputChange}
                    min="1"
                    step="1"
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter quantity (e.g., 1, 2, 10...)"
                    required
                  />
                </div>

                {/* Planned Start Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Planned Start Date *{" "}
                    <span className="text-red-500">Required</span>
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
                    Target Close Date *{" "}
                    <span className="text-red-500">Required</span>
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
                    Period Close Target *{" "}
                    <span className="text-red-500">Required</span>
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
              </div>

              {/* Right Column - Optional Fields */}
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900 border-b pb-2">
                  Optional Information
                </h3>

                {/* Customer WO Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer WO Number{" "}
                    <span className="text-gray-500">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    name="customer_wo_number"
                    value={formData.customer_wo_number}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., WO-2024-008"
                  />
                </div>

                {/* Customer WO Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer WO Date{" "}
                    <span className="text-gray-500">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    name="customer_wo_date"
                    value={formData.customer_wo_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Shipyard WO Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Shipyard WO Number{" "}
                    <span className="text-gray-500">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    name="shipyard_wo_number"
                    value={formData.shipyard_wo_number}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., SY-2024-008"
                  />
                </div>

                {/* Shipyard WO Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Shipyard WO Date{" "}
                    <span className="text-gray-500">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    name="shipyard_wo_date"
                    value={formData.shipyard_wo_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Invoice Delivery Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Invoice Delivery Date{" "}
                    <span className="text-gray-500">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    name="invoice_delivery_date"
                    value={formData.invoice_delivery_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Actual Start Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Actual Start Date{" "}
                    <span className="text-gray-500">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    name="actual_start_date"
                    value={formData.actual_start_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Actual Close Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Actual Close Date{" "}
                    <span className="text-gray-500">(Optional)</span>
                  </label>
                  <input
                    type="date"
                    name="actual_close_date"
                    value={formData.actual_close_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  Work Order Description *{" "}
                  <span className="text-red-500">Required</span>
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

            {/* Document Status Preview */}
            <div className="mt-8 p-4 bg-gray-50 rounded-lg">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                Work Order Document Status Preview:
              </h4>
              <div className="flex items-center space-x-2">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    getWoDocumentStatus()
                      ? "bg-green-100 text-green-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {getWoDocumentStatus()
                    ? "✅ Documents Complete"
                    : "📄 Documents Pending"}
                </span>
                <span className="text-xs text-gray-500">
                  {getWoDocumentStatus()
                    ? "All WO document fields are filled"
                    : "WO document fields can be completed later"}
                </span>
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
                disabled={loading || vessels.length === 0 || !currentUser}
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
