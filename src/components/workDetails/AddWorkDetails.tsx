import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase, type WorkOrder, type Vessel } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { ActivityLogService } from "../../services/activityLogService";
import SearchableSelect from "../common/SearchableSelect";
import {
  Ship,
  HardHat,
  X,
  Plus,
  Trash2,
  CheckCircle2,
  ArrowLeft,
  Wrench,
} from "lucide-react";

interface WorkOrderWithVessel extends WorkOrder {
  vessel?: Vessel;
  kapro?: { id: number; kapro_name: string };
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
  id: string;
  description: string;
  location_id: number;
  work_scope_id: number;
  quantity: string;
  uom: string;
  ppic_price: string;
  is_additional_wo_details: boolean;
  planned_start_date: string;
  target_close_date: string;
  period_close_target: string;
}

// Matches the month-name strings already stored in period_close_target
// ("January".."December") so deriving it from target_close_date doesn't
// introduce a new format.
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Parsed from the "YYYY-MM-DD" string directly (not `new Date(...)`) so a
// negative-UTC-offset browser can't shift it into the wrong month.
const getMonthNameFromDate = (dateStr: string): string => {
  const month = parseInt(dateStr.split("-")[1], 10);
  return MONTH_NAMES[month - 1] || "";
};

export default function AddWorkDetails() {
  const navigate = useNavigate();
  const { workOrderId } = useParams<{ workOrderId: string }>();
  const { profile } = useAuth();
  const location = useLocation();

  // Check user role - Only check for PPIC
  const isPPIC = profile?.role === "PPIC";
  // MASTER and ADMIN_SHIPPING both get the full create form. ADMIN_SHIPPING
  // exists to create Projects/Work Orders/Work Details only — it can never
  // reach an edit page (see EditWorkDetails.tsx/EditWorkOrder.tsx), so full
  // access here is safe.
  const isFullAccessCreator =
    profile?.role === "MASTER" || profile?.role === "ADMIN_SHIPPING";
  // ADMIN_SHIPPING creates the work detail shell only — PPIC fills in
  // scheduling (planned start / target close date) afterward via
  // EditWorkDetails.tsx, so those two fields aren't required from
  // ADMIN_SHIPPING at creation time. MASTER is unaffected.
  const isAdminShipping = profile?.role === "ADMIN_SHIPPING";

  // Redirect if not PPIC or a full-access creator
  useEffect(() => {
    if (profile && !isPPIC && !isFullAccessCreator) {
      navigate("/work-details");
    }
  }, [profile, isPPIC, isFullAccessCreator, navigate]);

  // Form state - array of work details
  const [workDetailsList, setWorkDetailsList] = useState<WorkDetailFormData[]>([
    {
      id: crypto.randomUUID(),
      description: "",
      location_id: 0,
      work_scope_id: 0,
      quantity: "",
      uom: "",
      ppic_price: "",
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
  const [workOrders, setWorkOrders] = useState<WorkOrderWithVessel[]>([]);
  const [selectedWorkOrder, setSelectedWorkOrder] =
    useState<WorkOrderWithVessel | null>(null);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<number>(
    workOrderId ? parseInt(workOrderId) : 0,
  );

  // Loading states
  const [loadingWorkOrders, setLoadingWorkOrders] = useState(false);

  const [locations, setLocations] = useState<Location[]>([]);
  const [workScopes, setWorkScopes] = useState<WorkScope[]>([]);
  const [_loadingLocations, setLoadingLocations] = useState(false);
  const [_loadingWorkScopes, setLoadingWorkScopes] = useState(false);

  // Search dropdown state — a single search across vessel name + WO number,
  // instead of a vessel-first cascade (vessel is carried on the WO itself).
  const [workOrderSearchTerm, setWorkOrderSearchTerm] = useState("");
  const [showWorkOrderDropdown, setShowWorkOrderDropdown] = useState(false);
  const workOrderDropdownRef = useRef<HTMLDivElement>(null);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
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
        err instanceof Error ? err.message : "Failed to load work scopes",
      );
    } finally {
      setLoadingWorkScopes(false);
    }
  };

  // Fetches every work order up front (joined with its vessel + kapro) so
  // the picker below can search across vessel name / WO number directly,
  // instead of forcing a vessel-first cascade.
  const fetchAllWorkOrders = async () => {
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
          ),
          kapro:kapro_id (
            id,
            kapro_name
          )
        `,
        )
        .is("deleted_at", null)
        .order("shipyard_wo_number", { ascending: true });

      if (error) throw error;
      setWorkOrders(data || []);
    } catch (err) {
      console.error("Error fetching work orders:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load work orders",
      );
    } finally {
      setLoadingWorkOrders(false);
    }
  };

  // Initialize
  useEffect(() => {
    fetchAllWorkOrders();
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
              ),
              kapro:kapro_id (
                id,
                kapro_name
              )
            `,
            )
            .eq("id", parseInt(workOrderId))
            .single();

          if (error) throw error;

          if (workOrder && workOrder.vessel) {
            setSelectedWorkOrder(workOrder);
            setSelectedWorkOrderId(workOrder.id);
            setWorkOrderSearchTerm(workOrder.shipyard_wo_number);
          }
        } catch (err) {
          console.error("Error initializing from work order:", err);
          setError("Failed to load work order information");
        }
      };

      initializeFromWorkOrder();
    }
  }, [workOrderId]);

  // Filter functions — search across vessel name and WO number together,
  // since the work order carries its vessel with it.
  const filteredWorkOrdersForSearch = workOrders.filter((wo) => {
    const searchLower = workOrderSearchTerm.toLowerCase();
    return (
      wo.shipyard_wo_number?.toLowerCase().includes(searchLower) ||
      wo.customer_wo_number?.toLowerCase().includes(searchLower) ||
      wo.vessel?.name?.toLowerCase().includes(searchLower)
    );
  });

  // Add new work detail row
  const handleAddWorkDetail = () => {
    setWorkDetailsList((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        description: "",
        location_id: 0,
        work_scope_id: 0,
        quantity: "",
        uom: "",
        ppic_price: "",
        is_additional_wo_details: false,
        planned_start_date: "",
        target_close_date: "",
        period_close_target: "",
      },
    ]);
  };

  // Remove work detail row
  const handleRemoveWorkDetail = (id: string) => {
    setWorkDetailsList((prev) => {
      if (prev.length === 1) {
        setError("At least one work detail is required");
        return prev;
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  // Update work detail
  const handleWorkDetailChange = (
    id: string,
    field: keyof WorkDetailFormData,
    value: string | number | boolean,
  ) => {
    setWorkDetailsList((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        // Suggest the period from the target close date instead of making
        // PPIC pick it separately — only when it hasn't been set yet, so an
        // intentional manual choice never gets silently overwritten.
        if (
          field === "target_close_date" &&
          typeof value === "string" &&
          value &&
          !item.period_close_target
        ) {
          updated.period_close_target = getMonthNameFromDate(value);
        }
        return updated;
      }),
    );
  };

  // Work Order handlers
  const handleWorkOrderSelectFromDropdown = (
    workOrder: WorkOrderWithVessel,
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
      if (!item.work_scope_id || item.work_scope_id === 0) {
        errors.push(`Row ${index + 1}: Work scope is required`);
      }
      if (!item.quantity || parseFloat(item.quantity) <= 0) {
        errors.push(`Row ${index + 1}: Quantity must be greater than 0`);
      }
      if (!item.uom.trim()) {
        errors.push(`Row ${index + 1}: UOM is required`);
      }
      if (!isAdminShipping && !item.planned_start_date) {
        errors.push(`Row ${index + 1}: Planned start date is required`);
      }
      if (!isAdminShipping && !item.target_close_date) {
        errors.push(`Row ${index + 1}: Target close date is required`);
      }
      if (!isAdminShipping && !item.period_close_target.trim()) {
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
            }: Target close date must be on or after planned start date`,
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
        work_scope_id: item.work_scope_id,
        quantity: parseFloat(item.quantity),
        uom: item.uom.trim(),
        ppic_price: item.ppic_price ? parseFloat(item.ppic_price) : null,
        is_additional_wo_details: item.is_additional_wo_details,
        // ADMIN_SHIPPING can leave these blank — PPIC fills them in later via
        // EditWorkDetails.tsx — so an empty string here must become null
        // rather than fail the date column's insert.
        planned_start_date: item.planned_start_date || null,
        target_close_date: item.target_close_date || null,
        period_close_target: item.period_close_target.trim() || null,
        user_id: userProfile.id,
        // Production fields initialized
        pic: "",
        spk_number: null,
        spkk_number: null,
        work_permit_url: null,
        storage_path: null,
        notes: null,
        actual_start_date: null,
        actual_close_date: null,
        ptw_number: null,
      }));

      const { data, error } = await supabase
        .from("work_details")
        .insert(workDetailsData)
        .select();

      if (error) throw error;

      // Log the activity for each work detail created
      if (data && data.length > 0) {
        for (const workDetail of data) {
          await ActivityLogService.logActivity({
            action: "create",
            tableName: "work_details",
            recordId: workDetail.id,
            newData: workDetail,
            description: `Created work detail: ${workDetail.description}`,
          });
        }
      }

      // Navigate back with filter state
      const returnFilters = location.state?.returnFilters;

      if (workOrderId) {
        navigate(`/work-order/${workOrderId}`);
      } else if (returnFilters) {
        // Pass the filters back to the table
        navigate("/work-details", {
          state: { returnFilters },
        });
      } else {
        navigate("/work-details");
      }
    } catch (err) {
      console.error("Error creating work details:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create work details",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    const returnFilters = location.state?.returnFilters;

    if (workOrderId) {
      navigate(`/work-order/${workOrderId}`);
    } else if (returnFilters) {
      navigate("/work-details", {
        state: { returnFilters },
      });
    } else {
      navigate("/work-details");
    }
  };

  // Access control - Only PPIC or a full-access creator can add
  if (!isPPIC && !isFullAccessCreator) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">
            Only PPIC, MASTER, and ADMIN_SHIPPING users can add new work
            details.
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
              {isFullAccessCreator && (
                <span className="text-purple-600 font-medium">
                  {" "}
                  (Full Access)
                </span>
              )}
            </p>
            {isPPIC && (
              <p className="text-sm text-blue-600 mt-1 flex items-center gap-1">
                <Wrench className="w-4 h-4" /> PPIC Mode: Creating planning and
                scope fields
              </p>
            )}
            {!isPPIC && isFullAccessCreator && (
              <p className="text-sm text-purple-600 mt-1 flex items-center gap-1">
                <Ship className="w-4 h-4" /> Full access to create work
                details
              </p>
            )}
          </div>
          <button
            onClick={handleCancel}
            className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back
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
            {isPPIC &&
              "Fill in the PPIC-managed fields. PRODUCTION team will complete the rest."}
            {!isPPIC &&
              isFullAccessCreator &&
              "Fill in all work details fields. PRODUCTION team can later add execution details."}
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

          {/* Work Order Selection — a single search across vessel name and
              WO number, since every work order already carries its vessel
              and (now-required) Kapro with it. */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Work Order *
            </label>
            {selectedWorkOrder ? (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <HardHat className="w-5 h-5 mt-0.5 text-blue-600" />
                  <div>
                    <div className="font-semibold text-blue-900">
                      {selectedWorkOrder.shipyard_wo_number}
                    </div>
                    <div className="text-sm text-blue-700 flex items-center gap-1 mt-0.5">
                      <Ship className="w-3.5 h-3.5" />
                      {selectedWorkOrder.vessel?.name || "Unknown Vessel"} •{" "}
                      {selectedWorkOrder.vessel?.type || "Unknown Type"} (
                      {selectedWorkOrder.vessel?.company || "Unknown Company"})
                    </div>
                    {selectedWorkOrder.kapro && (
                      <div className="text-xs text-blue-600 mt-0.5">
                        Kapro: {selectedWorkOrder.kapro.kapro_name}
                      </div>
                    )}
                  </div>
                </div>
                {!workOrderId && (
                  <button
                    type="button"
                    onClick={handleClearWorkOrderSearch}
                    className="text-blue-400 hover:text-blue-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <div className="relative" ref={workOrderDropdownRef}>
                <input
                  type="text"
                  value={workOrderSearchTerm}
                  onChange={(e) => {
                    setWorkOrderSearchTerm(e.target.value);
                    setShowWorkOrderDropdown(true);
                  }}
                  onFocus={() => setShowWorkOrderDropdown(true)}
                  placeholder="Search by vessel name or WO number..."
                  disabled={loadingWorkOrders}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                />
                {workOrderSearchTerm && (
                  <button
                    type="button"
                    onClick={handleClearWorkOrderSearch}
                    className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {showWorkOrderDropdown &&
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
                          <div className="text-xs text-gray-600">
                            {workOrder.vessel?.name} •{" "}
                            {workOrder.vessel?.type} (
                            {workOrder.vessel?.company})
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            )}
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
                  <Plus className="w-4 h-4" /> Add Row
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
                        <Trash2 className="w-4 h-4" /> Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4">
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
                            e.target.value,
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
                      <SearchableSelect
                        value={item.location_id}
                        onChange={(id) =>
                          handleWorkDetailChange(item.id, "location_id", id)
                        }
                        options={locations.map((loc) => ({
                          id: loc.id,
                          label: loc.location,
                        }))}
                        placeholder="Search location..."
                      />
                    </div>

                    {/* Work Scope */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Work Scope *
                      </label>
                      <SearchableSelect
                        value={item.work_scope_id}
                        onChange={(id) =>
                          handleWorkDetailChange(item.id, "work_scope_id", id)
                        }
                        options={workScopes.map((scope) => ({
                          id: scope.id,
                          label: scope.work_scope,
                        }))}
                        placeholder="Search work scope..."
                      />
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
                            e.target.value,
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

                    {/* PPIC Price */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Price (IDR)
                      </label>
                      <input
                        type="number"
                        value={item.ppic_price}
                        onChange={(e) =>
                          handleWorkDetailChange(
                            item.id,
                            "ppic_price",
                            e.target.value,
                          )
                        }
                        min="0"
                        step="1"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Optional — for Finance's reference"
                      />
                    </div>

                    {/* Planned Start Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Planned Start Date {!isAdminShipping && "*"}
                      </label>
                      <input
                        type="date"
                        value={item.planned_start_date}
                        onChange={(e) =>
                          handleWorkDetailChange(
                            item.id,
                            "planned_start_date",
                            e.target.value,
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                      {isAdminShipping && (
                        <p className="text-xs text-gray-500 mt-1">
                          Optional — PPIC will fill this in later
                        </p>
                      )}
                    </div>

                    {/* Target Close Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Target Close Date {!isAdminShipping && "*"}
                      </label>
                      <input
                        type="date"
                        value={item.target_close_date}
                        onChange={(e) =>
                          handleWorkDetailChange(
                            item.id,
                            "target_close_date",
                            e.target.value,
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                      {isAdminShipping && (
                        <p className="text-xs text-gray-500 mt-1">
                          Optional — PPIC will fill this in later
                        </p>
                      )}
                    </div>

                    {/* Period Close Target */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Period Close Target {!isAdminShipping && "*"}
                      </label>
                      <select
                        value={item.period_close_target}
                        onChange={(e) =>
                          handleWorkDetailChange(
                            item.id,
                            "period_close_target",
                            e.target.value,
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
                      {isAdminShipping ? (
                        <p className="text-xs text-gray-500 mt-1">
                          Optional — PPIC will fill this in later
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500 mt-1">
                          Auto-filled from Target Close Date's month — change
                          it here if needed
                        </p>
                      )}
                    </div>

                    {/* Is Additional */}
                    <div>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={item.is_additional_wo_details}
                          onChange={(e) =>
                            handleWorkDetailChange(
                              item.id,
                              "is_additional_wo_details",
                              e.target.checked,
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
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Create{" "}
                    {workDetailsList.length} Work Detail(s)
                  </>
                )}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
