import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase, type WorkOrder, type Vessel } from "../../lib/supabase";
import {
  uploadWorkPermitFile,
  validateWorkPermitFile,
} from "../../utils/uploadHandler";

interface WorkOrderWithVessel extends WorkOrder {
  vessel?: Vessel;
}

export default function AddWorkDetails() {
  const navigate = useNavigate();
  const { workOrderId } = useParams<{ workOrderId: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState({
    work_order_id: workOrderId ? parseInt(workOrderId) : 0,
    description: "",
    location: "",
    planned_start_date: "",
    target_close_date: "",
    period_close_target: "",
    pic: "",
    work_permit_url: "",
    storage_path: "",
  });

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Selection state
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [selectedVesselId, setSelectedVesselId] = useState<number>(0);
  const [workOrders, setWorkOrders] = useState<WorkOrderWithVessel[]>([]);
  const [selectedWorkOrder, setSelectedWorkOrder] =
    useState<WorkOrderWithVessel | null>(null);

  // Loading states
  const [loadingVessels, setLoadingVessels] = useState(false);
  const [loadingWorkOrders, setLoadingWorkOrders] = useState(false);

  // Fetch all vessels
  const fetchVessels = async () => {
    try {
      setLoadingVessels(true);

      const { data, error } = await supabase
        .from("vessel")
        .select("*")
        .is("deleted_at", null)
        .order("name", { ascending: true });

      if (error) throw error;

      setVessels(data || []);
    } catch (err) {
      console.error("Error fetching vessels:", err);
      setError(err instanceof Error ? err.message : "Failed to load vessels");
    } finally {
      setLoadingVessels(false);
    }
  };

  // Fetch work orders for selected vessel
  const fetchWorkOrdersForVessel = async (vesselId: number) => {
    try {
      setLoadingWorkOrders(true);

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
        .eq("vessel_id", vesselId)
        .is("deleted_at", null)
        .order("shipyard_wo_number", { ascending: true });

      if (error) throw error;

      setWorkOrders(data || []);
    } catch (err) {
      console.error("Error fetching work orders:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load work orders"
      );
    } finally {
      setLoadingWorkOrders(false);
    }
  };

  // Handle vessel selection
  const handleVesselChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const vesselId = parseInt(e.target.value);
    setSelectedVesselId(vesselId);

    // Reset work order selection
    setWorkOrders([]);
    setSelectedWorkOrder(null);
    setFormData((prev) => ({ ...prev, work_order_id: 0 }));

    // Fetch work orders for selected vessel
    if (vesselId > 0) {
      fetchWorkOrdersForVessel(vesselId);
    }
  };

  // Handle work order selection
  const handleWorkOrderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const workOrderId = parseInt(e.target.value);
    setFormData((prev) => ({ ...prev, work_order_id: workOrderId }));

    const workOrder = workOrders.find((wo) => wo.id === workOrderId);
    setSelectedWorkOrder(workOrder || null);
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    // Validate file
    const validation = validateWorkPermitFile(file);
    if (!validation.isValid) {
      setFileError(validation.error || "Invalid file");
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setSelectedFile(file);
  };

  // Remove selected file
  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Initialize component
  useEffect(() => {
    fetchVessels();

    // If we have a specific work order ID, find its vessel and set selections
    if (workOrderId) {
      const initializeFromWorkOrder = async () => {
        try {
          const { data: workOrder, error } = await supabase
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

          if (workOrder && workOrder.vessel) {
            setSelectedVesselId(workOrder.vessel.id);
            setSelectedWorkOrder(workOrder);
            setFormData((prev) => ({ ...prev, work_order_id: workOrder.id }));

            // Fetch all work orders for this vessel
            await fetchWorkOrdersForVessel(workOrder.vessel.id);
          }
        } catch (err) {
          console.error("Error initializing from work order:", err);
          setError("Failed to load work order information");
        }
      };

      initializeFromWorkOrder();
    }
  }, [workOrderId]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    const errors: string[] = [];

    if (!selectedVesselId || selectedVesselId === 0) {
      errors.push("Please select a vessel");
    }
    if (!formData.work_order_id || formData.work_order_id === 0) {
      errors.push("Please select a work order");
    }
    if (!formData.description.trim()) {
      errors.push("Description is required");
    }
    if (!formData.location.trim()) {
      errors.push("Location is required");
    }
    if (!formData.planned_start_date) {
      errors.push("Planned start date is required");
    }
    if (!formData.target_close_date) {
      errors.push("Target close date is required");
    }
    if (!formData.period_close_target.trim()) {
      errors.push("Period close target is required");
    }
    if (!formData.pic.trim()) {
      errors.push("Person in charge (PIC) is required");
    }

    // Date validation
    if (formData.planned_start_date && formData.target_close_date) {
      const startDate = new Date(formData.planned_start_date);
      const endDate = new Date(formData.target_close_date);
      if (startDate >= endDate) {
        errors.push("Target close date must be after planned start date");
      }
    }

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      setError(validationErrors.join(", "));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }

      const { data: userProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

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
          .from("profiles")
          .insert({
            auth_user_id: user.id,
            email: user.email,
            full_name:
              user.user_metadata?.full_name ||
              user.email?.split("@")[0] ||
              "User",
            role: "user", // Default role for work details
          })
          .select("id")
          .single();

        if (createError) {
          console.error("Error creating user profile:", createError);

          // Check if it's a duplicate key error (user profile might have been created by another process)
          if (createError.code === "23505") {
            const { data: existingProfile, error: fetchError } = await supabase
              .from("profiles")
              .select("id")
              .eq("auth_user_id", user.id)
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

      let storagePath = null;
      let workPermitUrl = null;

      // Handle file upload if a file is selected
      if (selectedFile) {
        setUploadProgress(true);

        // Generate custom path for the file
        const workOrderNumber =
          selectedWorkOrder?.shipyard_wo_number || "unknown";
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const customPath = `work-orders/${workOrderNumber}/permits/${timestamp}_${selectedFile.name.replace(
          /[^a-zA-Z0-9.-]/g,
          "_"
        )}`;

        const uploadResult = await uploadWorkPermitFile(
          selectedFile,
          customPath
        );

        setUploadProgress(false);

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || "File upload failed");
        }

        storagePath = uploadResult.storagePath;
        workPermitUrl = uploadResult.publicUrl;
      }

      // Prepare data for insertion
      const workDetailsData = {
        work_order_id: formData.work_order_id,
        description: formData.description.trim(),
        location: formData.location.trim(),
        planned_start_date: formData.planned_start_date,
        target_close_date: formData.target_close_date,
        period_close_target: formData.period_close_target.trim(),
        pic: formData.pic.trim(),
        work_permit_url: workPermitUrl,
        storage_path: storagePath,
        user_id: userId,
      };

      const { error } = await supabase
        .from("work_details")
        .insert([workDetailsData])
        .select()
        .single();

      if (error) {
        console.error("Database insert error:", error);
        throw error;
      }

      // Navigate back to appropriate page
      if (workOrderId) {
        navigate(`/work-order/${workOrderId}`);
      } else {
        navigate("/work-details");
      }
    } catch (err) {
      console.error("Error creating work details:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create work details"
      );
    } finally {
      setLoading(false);
      setUploadProgress(false);
    }
  };

  const handleCancel = () => {
    if (workOrderId) {
      navigate(`/work-order/${workOrderId}`);
    } else {
      navigate("/work-details");
    }
  };

  const getPageTitle = () => {
    if (workOrderId && selectedWorkOrder) {
      return `Add Work Details to WO: ${selectedWorkOrder.shipyard_wo_number}`;
    }
    return "Add New Work Details";
  };

  const getPageDescription = () => {
    if (workOrderId && selectedWorkOrder) {
      return `Create detailed work breakdown for work order ${
        selectedWorkOrder.shipyard_wo_number
      }${
        selectedWorkOrder.vessel ? ` on ${selectedWorkOrder.vessel.name}` : ""
      }`;
    }
    return "Create detailed work breakdown with specific timelines and responsibilities";
  };

  const selectedVessel = vessels.find((v) => v.id === selectedVesselId);

  return (
    <div className="p-8">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {getPageTitle()}
            </h1>
            <p className="text-gray-600 mt-2">{getPageDescription()}</p>
          </div>
          <button
            onClick={handleCancel}
            className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Form Container */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Work Details Information
          </h2>
          <p className="text-sm text-gray-600">
            Fill in the details for the work breakdown item
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Error Display */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="text-red-800 font-medium">
                Please fix the following errors:
              </h3>
              <p className="text-red-600 mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Step 1: Vessel Selection */}
            <div className="md:col-span-2">
              <label
                htmlFor="vessel_id"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Step 1: Select Vessel *
              </label>
              {workOrderId && selectedWorkOrder ? (
                // Show selected vessel info (read-only when coming from specific work order)
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center">
                    <span className="text-lg mr-2">🚢</span>
                    <div>
                      <div className="font-semibold text-blue-800">
                        {selectedWorkOrder.vessel?.name || "Unknown Vessel"}
                      </div>
                      <div className="text-sm text-blue-600">
                        {selectedWorkOrder.vessel?.type || "Unknown Type"} •{" "}
                        {selectedWorkOrder.vessel?.company || "Unknown Company"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <select
                  id="vessel_id"
                  value={selectedVesselId}
                  onChange={handleVesselChange}
                  disabled={loadingVessels}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  required
                >
                  <option value={0}>
                    {loadingVessels ? "Loading vessels..." : "Select a vessel"}
                  </option>
                  {vessels.map((vessel) => (
                    <option key={vessel.id} value={vessel.id}>
                      {vessel.name} ({vessel.type}) - {vessel.company}
                    </option>
                  ))}
                </select>
              )}

              {selectedVessel && !workOrderId && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-sm text-blue-800 flex items-center">
                    <span className="mr-2">🚢</span>
                    <strong>Selected Vessel:</strong> {selectedVessel.name} (
                    {selectedVessel.type}) - {selectedVessel.company}
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Work Order Selection */}
            <div className="md:col-span-2">
              <label
                htmlFor="work_order_id"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Step 2: Select Work Order *
              </label>
              {workOrderId && selectedWorkOrder ? (
                // Show selected work order info (read-only when coming from specific work order)
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center">
                    <span className="text-lg mr-2">🏗️</span>
                    <div>
                      <div className="font-semibold text-green-800">
                        {selectedWorkOrder.shipyard_wo_number}
                      </div>
                      <div className="text-sm text-green-600">
                        Work Order ID: {selectedWorkOrder.id}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <select
                    id="work_order_id"
                    name="work_order_id"
                    value={formData.work_order_id}
                    onChange={handleWorkOrderChange}
                    disabled={loadingWorkOrders || selectedVesselId === 0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    required
                  >
                    <option value={0}>
                      {selectedVesselId === 0
                        ? "First select a vessel"
                        : loadingWorkOrders
                        ? "Loading work orders..."
                        : workOrders.length === 0
                        ? "No work orders found for this vessel"
                        : "Select a work order"}
                    </option>
                    {workOrders.map((workOrder) => (
                      <option key={workOrder.id} value={workOrder.id}>
                        {workOrder.shipyard_wo_number}
                        {workOrder.customer_wo_number &&
                          ` (Customer: ${workOrder.customer_wo_number})`}
                      </option>
                    ))}
                  </select>

                  {selectedWorkOrder && (
                    <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="text-sm text-green-800">
                        <strong>Selected Work Order:</strong>{" "}
                        {selectedWorkOrder.shipyard_wo_number}
                        {selectedWorkOrder.customer_wo_number && (
                          <div className="mt-1 text-green-600">
                            Customer WO: {selectedWorkOrder.customer_wo_number}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Show form fields only when work order is selected */}
            {formData.work_order_id > 0 && (
              <>
                {/* Description */}
                <div className="md:col-span-2">
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Work Description *
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Describe the specific work task in detail..."
                    required
                  />
                </div>

                {/* Location */}
                <div>
                  <label
                    htmlFor="location"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Location *
                  </label>
                  <input
                    type="text"
                    id="location"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Engine Room, Deck, Bridge, etc."
                    required
                  />
                </div>

                {/* Person in Charge */}
                <div>
                  <label
                    htmlFor="pic"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Person in Charge (PIC) *
                  </label>
                  <input
                    type="text"
                    id="pic"
                    name="pic"
                    value={formData.pic}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Name of responsible person"
                    required
                  />
                </div>

                {/* Planned Start Date */}
                <div>
                  <label
                    htmlFor="planned_start_date"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Planned Start Date *
                  </label>
                  <input
                    type="date"
                    id="planned_start_date"
                    name="planned_start_date"
                    value={formData.planned_start_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* Target Close Date */}
                <div>
                  <label
                    htmlFor="target_close_date"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Target Close Date *
                  </label>
                  <input
                    type="date"
                    id="target_close_date"
                    name="target_close_date"
                    value={formData.target_close_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* Period Close Target */}
                <div className="md:col-span-2">
                  <label
                    htmlFor="period_close_target"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Period Close Target *
                  </label>
                  <input
                    type="text"
                    id="period_close_target"
                    name="period_close_target"
                    value={formData.period_close_target}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., 2 weeks, 1 month, End of Q1, etc."
                    required
                  />
                </div>

                {/* Work Permit File Upload */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Work Permit Document (Optional)
                  </label>

                  {/* File Input */}
                  <div className="mt-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="work_permit_file"
                    />
                    <label
                      htmlFor="work_permit_file"
                      className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      📄 Choose PDF File
                    </label>
                  </div>

                  {/* File Error */}
                  {fileError && (
                    <div className="mt-2 text-sm text-red-600">{fileError}</div>
                  )}

                  {/* Selected File Display */}
                  {selectedFile && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="text-green-600 mr-2">📄</span>
                          <div>
                            <div className="text-sm font-medium text-green-800">
                              {selectedFile.name}
                            </div>
                            <div className="text-xs text-green-600">
                              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveFile}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-500 mt-1">
                    Upload a PDF file containing the work permit or safety
                    authorization (max 10MB)
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Form Actions - Show only when work order is selected */}
          {formData.work_order_id > 0 && (
            <div className="flex items-center justify-end gap-4 mt-8 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={handleCancel}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                disabled={loading || uploadProgress}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || uploadProgress}
                className="px-8 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading || uploadProgress ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    {uploadProgress ? "Uploading file..." : "Creating..."}
                  </>
                ) : (
                  <>✅ Create Work Details</>
                )}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
