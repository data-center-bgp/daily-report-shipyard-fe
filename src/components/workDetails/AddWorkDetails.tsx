import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase, type WorkOrder, type Vessel } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";

interface WorkOrderWithVessel extends WorkOrder {
  vessel?: Vessel;
}

interface Location {
  id: number;
  location: string;
}

interface WorkScope {
  id: number;
  work_scope: string;
}

interface WorkDetailFormData {
  id: string; // Temporary ID for tracking
  description: string;
  location_id: number;
  work_location: string;
  work_scope_id: number;
  work_type: string;
  quantity: string;
  uom: string;
  is_additional_wo_details: boolean;
  planned_start_date: string;
  target_close_date: string;
  period_close_target: string;
}

export default function AddWorkDetails() {
  const navigate = useNavigate();
  const { workOrderId } = useParams<{ workOrderId: string }>();
  const { profile } = useAuth();

  // Check if user is PPIC
  const isPPICOrMaster = profile?.role === "PPIC" || profile?.role === "MASTER";

  // Redirect if not PPIC or MASTER
  useEffect(() => {
    if (profile && !isPPICOrMaster) {
      navigate("/work-details");
    }
  }, [profile, isPPICOrMaster, navigate]);

  // Form state - array of work details
  const [workDetailsList, setWorkDetailsList] = useState<WorkDetailFormData[]>([
    {
      id: crypto.randomUUID(),
      description: "",
      location_id: 0,
      work_location: "",
      work_scope_id: 0,
      work_type: "",
      quantity: "",
      uom: "",
      is_additional_wo_details: false,
      planned_start_date: "",
      target_close_date: "",
      period_close_target: "",
    },
  ]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [selectedVesselId, setSelectedVesselId] = useState<number>(0);
  const [workOrders, setWorkOrders] = useState<WorkOrderWithVessel[]>([]);
  const [selectedWorkOrder, setSelectedWorkOrder] =
    useState<WorkOrderWithVessel | null>(null);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<number>(
    workOrderId ? parseInt(workOrderId) : 0
  );

  // Loading states
  const [loadingVessels, setLoadingVessels] = useState(false);
  const [loadingWorkOrders, setLoadingWorkOrders] = useState(false);

  const [locations, setLocations] = useState<Location[]>([]);
  const [workScopes, setWorkScopes] = useState<WorkScope[]>([]);
  const [_loadingLocations, setLoadingLocations] = useState(false);
  const [_loadingWorkScopes, setLoadingWorkScopes] = useState(false);

  // Search dropdown states
  const [vesselSearchTerm, setVesselSearchTerm] = useState("");
  const [showVesselDropdown, setShowVesselDropdown] = useState(false);
  const vesselDropdownRef = useRef<HTMLDivElement>(null);

  const [workOrderSearchTerm, setWorkOrderSearchTerm] = useState("");
  const [showWorkOrderDropdown, setShowWorkOrderDropdown] = useState(false);
  const workOrderDropdownRef = useRef<HTMLDivElement>(null);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        vesselDropdownRef.current &&
        !vesselDropdownRef.current.contains(event.target as Node)
      ) {
        setShowVesselDropdown(false);
      }
      if (
        workOrderDropdownRef.current &&
        !workOrderDropdownRef.current.contains(event.target as Node)
      ) {
        setShowWorkOrderDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Fetch functions
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

  const fetchLocations = async () => {
    try {
      setLoadingLocations(true);
      const { data, error } = await supabase
        .from("location")
        .select("*")
        .is("deleted_at", null)
        .order("location", { ascending: true });

      if (error) throw error;
      setLocations(data || []);
    } catch (err) {
      console.error("Error fetching locations:", err);
      setError(err instanceof Error ? err.message : "Failed to load locations");
    } finally {
      setLoadingLocations(false);
    }
  };

  const fetchWorkScopes = async () => {
    try {
      setLoadingWorkScopes(true);
      const { data, error } = await supabase
        .from("work_scope")
        .select("*")
        .is("deleted_at", null)
        .order("work_scope", { ascending: true });

      if (error) throw error;
      setWorkScopes(data || []);
    } catch (err) {
      console.error("Error fetching work scopes:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load work scopes"
      );
    } finally {
      setLoadingWorkScopes(false);
    }
  };

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

  // Initialize
  useEffect(() => {
    fetchVessels();
    fetchLocations();
    fetchWorkScopes();

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
            setSelectedWorkOrderId(workOrder.id);
            setVesselSearchTerm(
              `${workOrder.vessel.name} - ${workOrder.vessel.type} (${workOrder.vessel.company})`
            );
            setWorkOrderSearchTerm(workOrder.shipyard_wo_number);
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

  // Filter functions
  const filteredVesselsForSearch = vessels.filter((vessel) => {
    const searchLower = vesselSearchTerm.toLowerCase();
    return (
      vessel.name?.toLowerCase().includes(searchLower) ||
      vessel.type?.toLowerCase().includes(searchLower) ||
      vessel.company?.toLowerCase().includes(searchLower)
    );
  });

  const filteredWorkOrdersForSearch = workOrders.filter((wo) => {
    const searchLower = workOrderSearchTerm.toLowerCase();
    return (
      wo.shipyard_wo_number?.toLowerCase().includes(searchLower) ||
      wo.customer_wo_number?.toLowerCase().includes(searchLower)
    );
  });

  // Add new work detail row
  const handleAddWorkDetail = () => {
    setWorkDetailsList([
      ...workDetailsList,
      {
        id: crypto.randomUUID(),
        description: "",
        location_id: 0,
        work_location: "",
        work_scope_id: 0,
        work_type: "",
        quantity: "",
        uom: "",
        is_additional_wo_details: false,
        planned_start_date: "",
        target_close_date: "",
        period_close_target: "",
      },
    ]);
  };

  // Remove work detail row
  const handleRemoveWorkDetail = (id: string) => {
    if (workDetailsList.length === 1) {
      setError("At least one work detail is required");
      return;
    }
    setWorkDetailsList(workDetailsList.filter((item) => item.id !== id));
  };

  // Update work detail
  const handleWorkDetailChange = (
    id: string,
    field: keyof WorkDetailFormData,
    value: string | number | boolean
  ) => {
    setWorkDetailsList(
      workDetailsList.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  // Vessel handlers
  const handleVesselSelectFromDropdown = (vessel: Vessel) => {
    setSelectedVesselId(vessel.id);
    setVesselSearchTerm(`${vessel.name} - ${vessel.type} (${vessel.company})`);
    setShowVesselDropdown(false);
    setWorkOrders([]);
    setSelectedWorkOrder(null);
    setWorkOrderSearchTerm("");
    setSelectedWorkOrderId(0);
    fetchWorkOrdersForVessel(vessel.id);
  };

  const handleClearVesselSearch = () => {
    setVesselSearchTerm("");
    setSelectedVesselId(0);
    setShowVesselDropdown(false);
    setWorkOrders([]);
    setSelectedWorkOrder(null);
    setWorkOrderSearchTerm("");
    setSelectedWorkOrderId(0);
  };

  // Work Order handlers
  const handleWorkOrderSelectFromDropdown = (
    workOrder: WorkOrderWithVessel
  ) => {
    setSelectedWorkOrderId(workOrder.id);
    setWorkOrderSearchTerm(workOrder.shipyard_wo_number || "");
    setShowWorkOrderDropdown(false);
    setSelectedWorkOrder(workOrder);
  };

  const handleClearWorkOrderSearch = () => {
    setWorkOrderSearchTerm("");
    setSelectedWorkOrderId(0);
    setShowWorkOrderDropdown(false);
    setSelectedWorkOrder(null);
  };

  // Validation
  const validateForm = () => {
    const errors: string[] = [];

    if (!selectedVesselId || selectedVesselId === 0) {
      errors.push("Please select a vessel");
    }
    if (!selectedWorkOrderId || selectedWorkOrderId === 0) {
      errors.push("Please select a work order");
    }

    workDetailsList.forEach((item, index) => {
      if (!item.description.trim()) {
        errors.push(`Row ${index + 1}: Description is required`);
      }
      if (!item.location_id || item.location_id === 0) {
        errors.push(`Row ${index + 1}: Location is required`);
      }
      if (!item.work_location.trim()) {
        errors.push(`Row ${index + 1}: Work location is required`);
      }
      if (!item.work_scope_id || item.work_scope_id === 0) {
        errors.push(`Row ${index + 1}: Work scope is required`);
      }
      if (!item.work_type.trim()) {
        errors.push(`Row ${index + 1}: Work type is required`);
      }
      if (!item.quantity || parseFloat(item.quantity) <= 0) {
        errors.push(`Row ${index + 1}: Quantity must be greater than 0`);
      }
      if (!item.uom.trim()) {
        errors.push(`Row ${index + 1}: UOM is required`);
      }
      if (!item.planned_start_date) {
        errors.push(`Row ${index + 1}: Planned start date is required`);
      }
      if (!item.target_close_date) {
        errors.push(`Row ${index + 1}: Target close date is required`);
      }
      if (!item.period_close_target.trim()) {
        errors.push(`Row ${index + 1}: Period close target is required`);
      }

      // Date validation
      if (item.planned_start_date && item.target_close_date) {
        const startDate = new Date(item.planned_start_date);
        const endDate = new Date(item.target_close_date);
        if (startDate > endDate) {
          errors.push(
            `Row ${
              index + 1
            }: Target close date must be on or after planned start date`
          );
        }
      }
    });

    return errors;
  };

  // Submit
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data: userProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();

      if (profileError) throw profileError;

      const workDetailsData = workDetailsList.map((item) => ({
        work_order_id: selectedWorkOrderId,
        description: item.description.trim(),
        location_id: item.location_id,
        work_location: item.work_location.trim(),
        work_scope_id: item.work_scope_id,
        work_type: item.work_type.trim(),
        quantity: parseFloat(item.quantity),
        uom: item.uom.trim(),
        is_additional_wo_details: item.is_additional_wo_details,
        planned_start_date: item.planned_start_date,
        target_close_date: item.target_close_date,
        period_close_target: item.period_close_target.trim(),
        user_id: userProfile.id,
        // PRODUCTION fields set to null initially
        pic: "",
        spk_number: null,
        spkk_number: null,
        work_permit_url: null,
        storage_path: null,
        notes: null,
        actual_start_date: null,
        actual_close_date: null,
      }));

      const { error } = await supabase
        .from("work_details")
        .insert(workDetailsData);

      if (error) throw error;

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
    }
  };

  const handleCancel = () => {
    if (workOrderId) {
      navigate(`/work-order/${workOrderId}`);
    } else {
      navigate("/work-details");
    }
  };

  if (!isPPICOrMaster) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">
            Only PPIC and MASTER users can add new work details.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Add Work Details
            </h1>
            <p className="text-gray-600 mt-2">
              Create one or multiple work details for one work order
            </p>
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
            Fill in the PPIC-managed fields. PRODUCTION team will complete the
            rest.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Error Display */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="text-red-800 font-medium">
                Please fix the following errors:
              </h3>
              <p className="text-red-600 mt-1 whitespace-pre-line">{error}</p>
            </div>
          )}

          {/* Vessel & Work Order Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Vessel Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Vessel *
              </label>
              {workOrderId && selectedWorkOrder ? (
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
                <div className="relative" ref={vesselDropdownRef}>
                  <input
                    type="text"
                    value={vesselSearchTerm}
                    onChange={(e) => {
                      setVesselSearchTerm(e.target.value);
                      setShowVesselDropdown(true);
                      if (selectedVesselId) {
                        handleClearVesselSearch();
                      }
                    }}
                    onFocus={() => setShowVesselDropdown(true)}
                    placeholder="Search vessel..."
                    disabled={loadingVessels}
                    className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  />
                  {vesselSearchTerm && (
                    <button
                      type="button"
                      onClick={handleClearVesselSearch}
                      className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  )}

                  {showVesselDropdown &&
                    filteredVesselsForSearch.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredVesselsForSearch.map((vessel) => (
                          <div
                            key={vessel.id}
                            onClick={() =>
                              handleVesselSelectFromDropdown(vessel)
                            }
                            className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                              selectedVesselId === vessel.id
                                ? "bg-blue-100"
                                : ""
                            }`}
                          >
                            <div className="font-medium text-gray-900 text-sm">
                              {vessel.name}
                            </div>
                            <div className="text-xs text-gray-600">
                              {vessel.type} • {vessel.company}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* Work Order Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Work Order *
              </label>
              {workOrderId && selectedWorkOrder ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center">
                    <span className="text-lg mr-2">🏗️</span>
                    <div>
                      <div className="font-semibold text-green-800">
                        {selectedWorkOrder.shipyard_wo_number}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative" ref={workOrderDropdownRef}>
                  <input
                    type="text"
                    value={workOrderSearchTerm}
                    onChange={(e) => {
                      setWorkOrderSearchTerm(e.target.value);
                      setShowWorkOrderDropdown(true);
                      if (selectedWorkOrderId) {
                        handleClearWorkOrderSearch();
                      }
                    }}
                    onFocus={() => setShowWorkOrderDropdown(true)}
                    placeholder={
                      selectedVesselId === 0
                        ? "Select vessel first"
                        : "Search work order..."
                    }
                    disabled={loadingWorkOrders || selectedVesselId === 0}
                    className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  />
                  {workOrderSearchTerm && (
                    <button
                      type="button"
                      onClick={handleClearWorkOrderSearch}
                      className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  )}

                  {showWorkOrderDropdown &&
                    selectedVesselId > 0 &&
                    filteredWorkOrdersForSearch.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredWorkOrdersForSearch.map((workOrder) => (
                          <div
                            key={workOrder.id}
                            onClick={() =>
                              handleWorkOrderSelectFromDropdown(workOrder)
                            }
                            className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                              selectedWorkOrderId === workOrder.id
                                ? "bg-blue-100"
                                : ""
                            }`}
                          >
                            <div className="font-medium text-gray-900 text-sm">
                              {workOrder.shipyard_wo_number}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>

          {/* Work Details List */}
          {selectedWorkOrderId > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Work Details Items ({workDetailsList.length})
                </h3>
                <button
                  type="button"
                  onClick={handleAddWorkDetail}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  ➕ Add Row
                </button>
              </div>

              {workDetailsList.map((item, index) => (
                <div
                  key={item.id}
                  className="border border-gray-200 rounded-lg p-6 bg-gray-50"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-gray-900">
                      Work Detail #{index + 1}
                    </h4>
                    {workDetailsList.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveWorkDetail(item.id)}
                        className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1"
                      >
                        🗑️ Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Description */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Description *
                      </label>
                      <textarea
                        value={item.description}
                        onChange={(e) =>
                          handleWorkDetailChange(
                            item.id,
                            "description",
                            e.target.value
                          )
                        }
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Describe the work..."
                      />
                    </div>

                    {/* Location */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Location *
                      </label>
                      <select
                        value={item.location_id}
                        onChange={(e) =>
                          handleWorkDetailChange(
                            item.id,
                            "location_id",
                            parseInt(e.target.value)
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={0}>Select location</option>
                        {locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.location}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Work Location */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Work Location *
                      </label>
                      <input
                        type="text"
                        value={item.work_location}
                        onChange={(e) =>
                          handleWorkDetailChange(
                            item.id,
                            "work_location",
                            e.target.value
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Specific work location"
                      />
                    </div>

                    {/* Work Scope */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Work Scope *
                      </label>
                      <select
                        value={item.work_scope_id}
                        onChange={(e) =>
                          handleWorkDetailChange(
                            item.id,
                            "work_scope_id",
                            parseInt(e.target.value)
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={0}>Select work scope</option>
                        {workScopes.map((scope) => (
                          <option key={scope.id} value={scope.id}>
                            {scope.work_scope}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Work Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Work Type *
                      </label>
                      <select
                        value={item.work_type}
                        onChange={(e) =>
                          handleWorkDetailChange(
                            item.id,
                            "work_type",
                            e.target.value
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select type</option>
                        <option value="Docking">Docking</option>
                        <option value="Repair">Repair</option>
                      </select>
                    </div>

                    {/* Quantity */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Quantity *
                      </label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) =>
                          handleWorkDetailChange(
                            item.id,
                            "quantity",
                            e.target.value
                          )
                        }
                        min="0"
                        step="0.01"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                      />
                    </div>

                    {/* UOM */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        UOM *
                      </label>
                      <select
                        value={item.uom}
                        onChange={(e) =>
                          handleWorkDetailChange(item.id, "uom", e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select UOM</option>
                        <option value="Ls">Ls</option>
                        <option value="Unit">Unit</option>
                        <option value="Pcs">Pcs</option>
                        <option value="Lbr">Lbr</option>
                      </select>
                    </div>

                    {/* Planned Start Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Planned Start Date *
                      </label>
                      <input
                        type="date"
                        value={item.planned_start_date}
                        onChange={(e) =>
                          handleWorkDetailChange(
                            item.id,
                            "planned_start_date",
                            e.target.value
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Target Close Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Target Close Date *
                      </label>
                      <input
                        type="date"
                        value={item.target_close_date}
                        onChange={(e) =>
                          handleWorkDetailChange(
                            item.id,
                            "target_close_date",
                            e.target.value
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Period Close Target */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Period Close Target *
                      </label>
                      <select
                        value={item.period_close_target}
                        onChange={(e) =>
                          handleWorkDetailChange(
                            item.id,
                            "period_close_target",
                            e.target.value
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select month</option>
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

                    {/* Is Additional */}
                    <div className="md:col-span-2">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={item.is_additional_wo_details}
                          onChange={(e) =>
                            handleWorkDetailChange(
                              item.id,
                              "is_additional_wo_details",
                              e.target.checked
                            )
                          }
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label className="ml-2 block text-sm font-medium text-gray-700">
                          Is Additional Work Order Details
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Form Actions */}
          {selectedWorkOrderId > 0 && (
            <div className="flex items-center justify-end gap-4 mt-8 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={handleCancel}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Creating...
                  </>
                ) : (
                  <>✅ Create {workDetailsList.length} Work Detail(s)</>
                )}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
