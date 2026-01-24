import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase, type Vessel, type Kapro } from "../../lib/supabase";
import { ActivityLogService } from "../../services/activityLogService";
import { useAuth } from "../../hooks/useAuth";
import { ArrowLeft, FileText, Plus } from "lucide-react";

export default function AddWorkOrder() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isReadOnly } = useAuth();
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [kapros, setKapros] = useState<Kapro[]>([]);
  const [loadingVessels, setLoadingVessels] = useState(true);
  const [loadingKapros, setLoadingKapros] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Search state for vessel dropdown
  const [vesselSearchTerm, setVesselSearchTerm] = useState("");
  const [showVesselDropdown, setShowVesselDropdown] = useState(false);
  const vesselDropdownRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    // Required fields
    vessel_id: "",
    shipyard_wo_number: "",
    shipyard_wo_date: "",

    // Optional fields
    customer_wo_number: "",
    customer_wo_date: "",
    is_additional_wo: false,
    kapro_id: "",
    work_location: "",
    work_type: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if there's a preselected vessel from the vessel page
  useEffect(() => {
    if (location.state?.preselectedVesselId) {
      const preselectedVessel = vessels.find(
        (v) => v.id === location.state.preselectedVesselId,
      );
      if (preselectedVessel) {
        setFormData((prev) => ({
          ...prev,
          vessel_id: location.state.preselectedVesselId.toString(),
        }));
        setVesselSearchTerm(
          `${preselectedVessel.name} - ${preselectedVessel.type} (${preselectedVessel.company})`,
        );
      }
    }
  }, [location.state, vessels]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        vesselDropdownRef.current &&
        !vesselDropdownRef.current.contains(event.target as Node)
      ) {
        setShowVesselDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (isReadOnly) {
      alert("You don't have permission to create work orders");
      navigate("/work-orders");
    }
  }, [isReadOnly, navigate]);

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

  // Fetch kapros on component mount
  useEffect(() => {
    const fetchKapros = async () => {
      try {
        setLoadingKapros(true);
        const { data, error } = await supabase
          .from("kapro")
          .select("*")
          .is("deleted_at", null)
          .order("kapro_name");

        if (error) throw error;

        setKapros(data || []);
      } catch (err) {
        console.error("Error fetching kapros:", err);
        setError("Failed to load kapros. Please refresh the page.");
      } finally {
        setLoadingKapros(false);
      }
    };

    fetchKapros();
  }, []);

  // Filter vessels based on search term
  const filteredVessels = vessels.filter((vessel) => {
    const searchLower = vesselSearchTerm.toLowerCase();
    return (
      vessel.name?.toLowerCase().includes(searchLower) ||
      vessel.type?.toLowerCase().includes(searchLower) ||
      vessel.company?.toLowerCase().includes(searchLower)
    );
  });

  const handleVesselSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVesselSearchTerm(e.target.value);
    setShowVesselDropdown(true);
    // Clear selection when typing
    if (formData.vessel_id) {
      setFormData((prev) => ({ ...prev, vessel_id: "" }));
    }
  };

  const handleVesselSelect = (vessel: Vessel) => {
    setFormData((prev) => ({ ...prev, vessel_id: vessel.id.toString() }));
    setVesselSearchTerm(`${vessel.name} - ${vessel.type} (${vessel.company})`);
    setShowVesselDropdown(false);
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value, type } = e.target;

    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({
        ...prev,
        [name]: checked,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]:
          name === "vessel_id" || name === "kapro_id"
            ? parseInt(value) || ""
            : value,
      }));
    }
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
        .maybeSingle();

      if (profileError) {
        console.error("Error querying user profile:", profileError);
        throw new Error(
          `Failed to query user profile: ${profileError.message}`,
        );
      }

      let userId;

      if (!userProfile) {
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
              `Failed to create user profile: ${createError.message}`,
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

      if (!userId || typeof userId !== "number") {
        throw new Error(`Invalid user ID: ${userId}`);
      }

      const submitData = {
        vessel_id: parseInt(formData.vessel_id.toString()),
        shipyard_wo_number: formData.shipyard_wo_number.trim(),
        shipyard_wo_date: formData.shipyard_wo_date,
        customer_wo_number: formData.customer_wo_number.trim() || null,
        customer_wo_date: formData.customer_wo_date || null,
        is_additional_wo: formData.is_additional_wo,
        kapro_id: formData.kapro_id
          ? parseInt(formData.kapro_id.toString())
          : null,
        work_location: formData.work_location.trim() || null,
        work_type: formData.work_type || null,
        user_id: userId,
      };

      const { data, error } = await supabase
        .from("work_order")
        .insert([submitData])
        .select()
        .single();

      if (error) {
        console.error("Database error:", error);
        throw new Error(`Database error: ${error.message}`);
      }

      if (!data) {
        throw new Error("No data returned from work order creation");
      }

      // Log the activity
      await ActivityLogService.logActivity({
        action: "create",
        tableName: "work_order",
        recordId: data.id,
        newData: data,
        description: `Created work order ${data.shipyard_wo_number}`,
      });

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

  if (loadingVessels || loadingKapros || !currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {loadingVessels
              ? "Loading vessels..."
              : loadingKapros
                ? "Loading kapros..."
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
                className="mr-4 text-gray-600 hover:text-gray-900 flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Back
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
                  <FileText className="w-6 h-6 text-blue-500" />
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
            {/* Vessel Selection with Search */}
            <div className="relative" ref={vesselDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Vessel <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={vesselSearchTerm}
                onChange={handleVesselSearch}
                onFocus={() => setShowVesselDropdown(true)}
                placeholder="Search vessel by name, type, or company..."
                className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required={!formData.vessel_id}
              />
              {!formData.vessel_id && vesselSearchTerm && (
                <p className="text-xs text-amber-600 mt-1">
                  Please select a vessel from the dropdown
                </p>
              )}

              {/* Dropdown */}
              {showVesselDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredVessels.length > 0 ? (
                    filteredVessels.map((vessel) => (
                      <div
                        key={vessel.id}
                        onClick={() => handleVesselSelect(vessel)}
                        className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                          formData.vessel_id === vessel.id.toString()
                            ? "bg-blue-100"
                            : ""
                        }`}
                      >
                        <div className="font-medium text-gray-900">
                          {vessel.name}
                        </div>
                        <div className="text-sm text-gray-600">
                          {vessel.type} • {vessel.company}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-gray-500 text-sm">
                      No vessels found
                    </div>
                  )}
                </div>
              )}

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

              {/* Work Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Work Type <span className="text-gray-500">(Optional)</span>
                </label>
                <select
                  name="work_type"
                  value={formData.work_type}
                  onChange={handleInputChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Work Type</option>
                  <option value="Docking">Docking</option>
                  <option value="Docking - IS (Intermediate Survey)">
                    Docking - IS (Intermediate Survey)
                  </option>
                  <option value="Docking - AS (Annual Survey)">
                    Docking - AS (Annual Survey)
                  </option>
                  <option value="Docking - SS (Special Survey)">
                    Docking - SS (Special Survey)
                  </option>
                  <option value="Repair">Repair</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Select the type of work to be performed
                </p>
              </div>

              {/* Work Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Work Location{" "}
                  <span className="text-gray-500">(Optional)</span>
                </label>
                <input
                  type="text"
                  name="work_location"
                  value={formData.work_location}
                  onChange={handleInputChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Dock 1, Workshop Area A"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Specify the general location where work will be performed
                </p>
              </div>

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

              {/* Additional WO Checkbox */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="is_additional_wo"
                  id="is_additional_wo"
                  checked={formData.is_additional_wo}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label
                  htmlFor="is_additional_wo"
                  className="ml-2 block text-sm text-gray-700"
                >
                  Check this if this is an ADDITIONAL Work Order
                </label>
              </div>

              {/* Kapro Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kapro <span className="text-gray-500">(Optional)</span>
                </label>
                <select
                  name="kapro_id"
                  value={formData.kapro_id}
                  onChange={handleInputChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select Kapro</option>
                  {kapros.map((kapro) => (
                    <option key={kapro.id} value={kapro.id}>
                      {kapro.kapro_name}
                    </option>
                  ))}
                </select>
                {kapros.length === 0 && (
                  <p className="text-sm text-gray-500 mt-1">
                    No kapros available.
                  </p>
                )}
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
                  <>
                    <Plus className="w-4 h-4" /> Create Work Order
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
