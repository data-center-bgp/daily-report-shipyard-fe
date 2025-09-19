import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase, type Vessel } from "../../lib/supabase";

export default function AddWorkOrder() {
  const navigate = useNavigate();
  const location = useLocation();
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loadingVessels, setLoadingVessels] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Simplified form data - only essential fields
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

  // Check if there's a preselected vessel from the vessel page
  useEffect(() => {
    if (location.state?.preselectedVesselId) {
      setFormData((prev) => ({
        ...prev,
        vessel_id: location.state.preselectedVesselId.toString(),
      }));
    }
  }, [location.state]);

  // Get current user on component mount
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error) throw error;
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

    // Check if user is available
    if (!currentUser) {
      setError("User information not available. Please refresh and try again.");
      return false;
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

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: userProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", currentUser.id)
        .maybeSingle(); // Use maybeSingle instead of single to avoid error if no record

      if (profileError) {
        console.error("Error querying user profile:", profileError);
        throw new Error(
          `Failed to query user profile: ${profileError.message}`
        );
      }

      let userId;

      if (!userProfile) {
        // Create user profile if it doesn't exist
        const { data: newProfile, error: createError } = await supabase
          .from("user_profile")
          .insert({
            auth_user_id: currentUser.id,
            email: currentUser.email,
            name:
              currentUser.user_metadata?.full_name ||
              currentUser.email?.split("@")[0] ||
              "User",
          })
          .select("id")
          .single();

        if (createError) {
          console.error("Error creating user profile:", createError);

          // Check if it's a duplicate key error (user profile might have been created by another process)
          if (createError.code === "23505") {
            const { data: existingProfile, error: fetchError } = await supabase
              .from("user_profile")
              .select("id")
              .eq("auth_user_id", currentUser.id)
              .single();

            if (fetchError || !existingProfile) {
              throw new Error("Failed to fetch existing user profile");
            }

            userId = existingProfile.id;
          } else {
            throw new Error(
              `Failed to create user profile: ${createError.message}`
            );
          }
        } else {
          if (!newProfile || !newProfile.id) {
            throw new Error("Failed to create user profile - no ID returned");
          }
          userId = newProfile.id;
        }
      } else {
        userId = userProfile.id;
      }

      // Ensure userId is a valid integer
      if (!userId || typeof userId !== "number") {
        throw new Error(`Invalid user ID: ${userId}`);
      }
      const submitData = {
        vessel_id: parseInt(formData.vessel_id.toString()),
        shipyard_wo_number: formData.shipyard_wo_number.trim(),
        shipyard_wo_date: formData.shipyard_wo_date,
        customer_wo_number: formData.customer_wo_number.trim() || null,
        customer_wo_date: formData.customer_wo_date || null,
        wo_document_delivery_date: formData.wo_document_delivery_date || null,
        user_id: userId,
      };
      const { data, error } = await supabase
        .from("work_order")
        .insert([submitData])
        .select();

      if (error) {
        console.error("Database error:", error);
        throw new Error(`Database error: ${error.message}`);
      }

      if (!data || data.length === 0) {
        throw new Error("No data returned from work order creation");
      }
      navigate("/work-orders", {
        state: { message: "Work order created successfully!" },
      });
    } catch (err) {
      console.error("Error creating work order:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate("/work-orders");
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
      <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow rounded-lg">
          {/* Info Banner */}
          <div className="p-6 border-b border-gray-200">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <span className="text-blue-400 text-xl">📋</span>
                </div>
                <div className="ml-3">
                  <p className="text-blue-800 font-medium">
                    Simplified Work Order
                  </p>
                  <p className="text-blue-700 text-sm">
                    This simplified form captures only the essential work order
                    information. Additional details can be tracked through
                    progress reports.
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
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Vessel Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Vessel <span className="text-red-500">*</span>
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

            {/* Required Fields */}
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900 border-b pb-2">
                Required Information
              </h3>

              {/* Shipyard WO Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Shipyard Work Order Number{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="shipyard_wo_number"
                  value={formData.shipyard_wo_number}
                  onChange={handleInputChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., SY-2024-001"
                  required
                />
              </div>

              {/* Shipyard WO Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Shipyard Work Order Date{" "}
                  <span className="text-red-500">*</span>
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
            </div>

            {/* Optional Fields */}
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900 border-b pb-2">
                Optional Information
              </h3>

              {/* Customer WO Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Work Order Number{" "}
                  <span className="text-gray-500">(Optional)</span>
                </label>
                <input
                  type="text"
                  name="customer_wo_number"
                  value={formData.customer_wo_number}
                  onChange={handleInputChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., WO-2024-001"
                />
              </div>

              {/* Customer WO Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Work Order Date{" "}
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

              {/* WO Document Delivery Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Work Order Document Delivery Date{" "}
                  <span className="text-gray-500">(Optional)</span>
                </label>
                <input
                  type="date"
                  name="wo_document_delivery_date"
                  value={formData.wo_document_delivery_date}
                  onChange={handleInputChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This date is typically filled when the work order process is
                  completed
                </p>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-4 pt-6 border-t">
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
