import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import {
  uploadWorkPermitFile,
  validateWorkPermitFile,
  deleteWorkPermitFile,
} from "../../utils/uploadHandler";
import { openPermitFile } from "../../utils/urlHandler";

interface Location {
  id: number;
  location: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

interface WorkScope {
  id: number;
  work_scope: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

interface WorkDetailsData {
  id: number;
  work_order_id: number;
  description: string;
  location_id: number;
  work_location: string;
  planned_start_date: string;
  target_close_date: string;
  period_close_target: string;
  pic: string;
  work_permit_url?: string;
  storage_path?: string;
  actual_start_date?: string;
  actual_close_date?: string;
  work_scope_id: number;
  work_type: string;
  quantity: number;
  uom: string;
  is_additional_wo_details: boolean;
  spk_number?: string;
  spkk_number?: string;
  notes?: string;
  work_order: {
    id: number;
    shipyard_wo_number: string;
    vessel: {
      id: number;
      name: string;
      type: string;
      company: string;
    };
  };
  location?: Location;
  work_scope?: WorkScope;
}

export default function EditWorkDetails() {
  const navigate = useNavigate();
  const { workDetailsId } = useParams<{ workDetailsId: string }>();
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check user role
  const isPPICOrMaster = profile?.role === "PPIC" || profile?.role === "MASTER";
  const isProduction = profile?.role === "PRODUCTION";

  // Form state
  const [formData, setFormData] = useState({
    description: "",
    location_id: 0,
    work_location: "",
    planned_start_date: "",
    target_close_date: "",
    period_close_target: "",
    actual_start_date: "",
    actual_close_date: "",
    pic: "",
    work_permit_url: "",
    storage_path: "",
    work_scope_id: 0,
    work_type: "",
    quantity: "",
    uom: "",
    is_additional_wo_details: false,
    spk_number: "",
    spkk_number: "",
    notes: "",
  });

  // Original data for comparison
  const [originalData, setOriginalData] = useState<WorkDetailsData | null>(
    null
  );

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);

  // Dropdown data
  const [locations, setLocations] = useState<Location[]>([]);
  const [workScopes, setWorkScopes] = useState<WorkScope[]>([]);
  const [_loadingLocations, setLoadingLocations] = useState(false);
  const [_loadingWorkScopes, setLoadingWorkScopes] = useState(false);

  // Search dropdown states
  const [locationSearchTerm, setLocationSearchTerm] = useState("");
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const locationDropdownRef = useRef<HTMLDivElement>(null);

  const [workScopeSearchTerm, setWorkScopeSearchTerm] = useState("");
  const [showWorkScopeDropdown, setShowWorkScopeDropdown] = useState(false);
  const workScopeDropdownRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        locationDropdownRef.current &&
        !locationDropdownRef.current.contains(event.target as Node)
      ) {
        setShowLocationDropdown(false);
      }
      if (
        workScopeDropdownRef.current &&
        !workScopeDropdownRef.current.contains(event.target as Node)
      ) {
        setShowWorkScopeDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Filter locations for search dropdown
  const filteredLocationsForSearch = locations.filter((location) => {
    const searchLower = locationSearchTerm.toLowerCase();
    return location.location?.toLowerCase().includes(searchLower);
  });

  // Filter work scopes for search dropdown
  const filteredWorkScopesForSearch = workScopes.filter((scope) => {
    const searchLower = workScopeSearchTerm.toLowerCase();
    return scope.work_scope?.toLowerCase().includes(searchLower);
  });

  // Location search handlers
  const handleLocationSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocationSearchTerm(e.target.value);
    setShowLocationDropdown(true);
    if (formData.location_id) {
      setFormData((prev) => ({ ...prev, location_id: 0 }));
    }
  };

  const handleLocationSelectFromDropdown = (location: Location) => {
    setFormData((prev) => ({ ...prev, location_id: location.id }));
    setLocationSearchTerm(location.location);
    setShowLocationDropdown(false);
  };

  const handleClearLocationSearch = () => {
    setLocationSearchTerm("");
    setFormData((prev) => ({ ...prev, location_id: 0 }));
    setShowLocationDropdown(false);
  };

  // Work Scope search handlers
  const handleWorkScopeSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWorkScopeSearchTerm(e.target.value);
    setShowWorkScopeDropdown(true);
    if (formData.work_scope_id) {
      setFormData((prev) => ({ ...prev, work_scope_id: 0 }));
    }
  };

  const handleWorkScopeSelectFromDropdown = (scope: WorkScope) => {
    setFormData((prev) => ({ ...prev, work_scope_id: scope.id }));
    setWorkScopeSearchTerm(scope.work_scope);
    setShowWorkScopeDropdown(false);
  };

  const handleClearWorkScopeSearch = () => {
    setWorkScopeSearchTerm("");
    setFormData((prev) => ({ ...prev, work_scope_id: 0 }));
    setShowWorkScopeDropdown(false);
  };

  // Fetch locations
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
    } finally {
      setLoadingLocations(false);
    }
  };

  // Fetch work scopes
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
    } finally {
      setLoadingWorkScopes(false);
    }
  };

  // Fetch work details data
  const fetchWorkDetails = useCallback(async () => {
    if (!workDetailsId) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("work_details")
        .select(
          `
          *,
          work_order (
            id,
            shipyard_wo_number,
            vessel (
              id,
              name,
              type,
              company
            )
          ),
          location:location_id (
            id,
            location
          ),
          work_scope:work_scope_id (
            id,
            work_scope
          )
        `
        )
        .eq("id", parseInt(workDetailsId))
        .single();

      if (error) throw error;

      if (!data) {
        throw new Error("Work details not found");
      }

      setOriginalData(data);

      // Set search terms for existing selections
      if (data.location) {
        setLocationSearchTerm(data.location.location);
      }
      if (data.work_scope) {
        setWorkScopeSearchTerm(data.work_scope.work_scope);
      }

      setFormData({
        description: data.description || "",
        location_id: data.location_id || 0,
        work_location: data.work_location || "",
        planned_start_date: data.planned_start_date || "",
        target_close_date: data.target_close_date || "",
        period_close_target: data.period_close_target || "",
        actual_start_date: data.actual_start_date || "",
        actual_close_date: data.actual_close_date || "",
        pic: data.pic || "",
        work_permit_url: data.work_permit_url || "",
        storage_path: data.storage_path || "",
        work_scope_id: data.work_scope_id || 0,
        work_type: data.work_type || "",
        quantity: data.quantity?.toString() || "",
        uom: data.uom || "",
        is_additional_wo_details: data.is_additional_wo_details || false,
        spk_number: data.spk_number || "",
        spkk_number: data.spkk_number || "",
        notes: data.notes || "",
      });
    } catch (err) {
      console.error("Error fetching work details:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load work details"
      );
    } finally {
      setLoading(false);
    }
  }, [workDetailsId]);

  useEffect(() => {
    fetchLocations();
    fetchWorkScopes();
    fetchWorkDetails();
  }, [fetchWorkDetails]);

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
    setRemoveExistingFile(false);
  };

  // Remove selected file
  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Toggle remove existing file
  const handleRemoveExistingFile = () => {
    setRemoveExistingFile(!removeExistingFile);
    setSelectedFile(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // View existing permit
  const handleViewPermit = async () => {
    if (!originalData?.storage_path) return;

    try {
      await openPermitFile(originalData.storage_path);
    } catch (err) {
      console.error("Error opening permit file:", err);
      alert("Failed to open permit file");
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    const errors: string[] = [];

    // PPIC fields validation
    if (isPPICOrMaster) {
      if (!formData.description.trim()) {
        errors.push("Description is required");
      }
      if (!formData.location_id || formData.location_id === 0) {
        errors.push("Location is required");
      }
      if (!formData.work_location.trim()) {
        errors.push("Work location is required");
      }
      if (!formData.work_scope_id || formData.work_scope_id === 0) {
        errors.push("Work scope is required");
      }
      if (!formData.work_type.trim()) {
        errors.push("Work type is required");
      }
      if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
        errors.push("Quantity must be greater than 0");
      }
      if (!formData.uom.trim()) {
        errors.push("Unit of measure (UOM) is required");
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

      // Date validation for PPIC
      if (formData.planned_start_date && formData.target_close_date) {
        const startDate = new Date(formData.planned_start_date);
        const endDate = new Date(formData.target_close_date);
        if (startDate > endDate) {
          errors.push(
            "Target close date must be on or after planned start date"
          );
        }
      }
    }

    // PRODUCTION fields validation
    if (isProduction) {
      if (!formData.pic.trim()) {
        errors.push("Person in charge (PIC) is required");
      }

      // Date validation for PRODUCTION
      if (formData.actual_start_date && formData.actual_close_date) {
        const actualStart = new Date(formData.actual_start_date);
        const actualClose = new Date(formData.actual_close_date);
        if (actualStart > actualClose) {
          errors.push(
            "Actual close date must be on or after actual start date"
          );
        }
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

    setSaving(true);
    setError(null);

    try {
      let newStoragePath: string | null = formData.storage_path || null;
      let newWorkPermitUrl: string | null = formData.work_permit_url || null;

      // Handle file operations (only for PRODUCTION users)
      if (isProduction || isPPICOrMaster) {
        if (removeExistingFile && originalData?.storage_path) {
          await deleteWorkPermitFile(originalData.storage_path);
          newStoragePath = null;
          newWorkPermitUrl = null;
        }

        if (selectedFile) {
          setUploadProgress(true);

          const workOrderNumber =
            originalData?.work_order?.shipyard_wo_number || "unknown";
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

          if (
            originalData?.storage_path &&
            originalData.storage_path !== uploadResult.storagePath
          ) {
            try {
              await deleteWorkPermitFile(originalData.storage_path);
            } catch (deleteErr) {
              console.warn("Failed to delete old permit file:", deleteErr);
            }
          }

          newStoragePath = uploadResult.storagePath || null;
          newWorkPermitUrl = uploadResult.publicUrl || null;
        }
      }

      // Prepare data based on role
      let updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (isPPICOrMaster) {
        // PPIC can update their fields
        updateData = {
          ...updateData,
          description: formData.description.trim(),
          location_id: formData.location_id,
          work_location: formData.work_location.trim(),
          work_scope_id: formData.work_scope_id,
          work_type: formData.work_type.trim(),
          quantity: parseFloat(formData.quantity),
          uom: formData.uom.trim(),
          is_additional_wo_details: formData.is_additional_wo_details,
          planned_start_date: formData.planned_start_date,
          target_close_date: formData.target_close_date,
          period_close_target: formData.period_close_target.trim(),
        };
      }

      if (isProduction || isPPICOrMaster) {
        // PRODUCTION (and MASTER) can update their fields
        updateData = {
          ...updateData,
          pic: formData.pic.trim(),
          spk_number: formData.spk_number.trim() || null,
          spkk_number: formData.spkk_number.trim() || null,
          work_permit_url: newWorkPermitUrl,
          storage_path: newStoragePath,
          notes: formData.notes.trim() || null,
          actual_start_date: formData.actual_start_date || null,
          actual_close_date: formData.actual_close_date || null,
        };
      }

      const { error } = await supabase
        .from("work_details")
        .update(updateData)
        .eq("id", parseInt(workDetailsId!))
        .select()
        .single();

      if (error) {
        console.error("Database update error:", error);
        throw error;
      }

      navigate(`/work-details`);
    } catch (err) {
      console.error("Error updating work details:", err);
      setError(
        err instanceof Error ? err.message : "Failed to update work details"
      );
    } finally {
      setSaving(false);
      setUploadProgress(false);
    }
  };

  const handleCancel = () => {
    navigate(`/work-details`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading work details...</span>
      </div>
    );
  }

  if (error && !originalData) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">
            Error Loading Work Details
          </h3>
          <p className="text-red-600 mt-1">{error}</p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={fetchWorkDetails}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => navigate("/work-details")}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Back to List
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!originalData) {
    return (
      <div className="p-8">
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900">
            Work Details Not Found
          </h3>
          <p className="text-gray-500 mt-2">
            The work details you're looking for doesn't exist.
          </p>
          <button
            onClick={() => navigate("/work-details")}
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to List
          </button>
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
              Edit Work Details
            </h1>
            <p className="text-gray-600 mt-2">
              Update work details for{" "}
              {originalData.work_order.shipyard_wo_number} on{" "}
              {originalData.work_order.vessel.name}
            </p>
            {isPPICOrMaster && (
              <p className="text-sm text-blue-600 mt-1">
                🔧 PPIC Mode: Editing planning and scope fields
              </p>
            )}
            {isProduction && (
              <p className="text-sm text-green-600 mt-1">
                🏭 PRODUCTION Mode: Editing execution and documentation fields
              </p>
            )}
          </div>
          <button
            onClick={handleCancel}
            className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Work Order Info */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center">
          <span className="text-lg mr-3">🏗️</span>
          <div>
            <div className="font-semibold text-blue-800">
              Work Order: {originalData.work_order.shipyard_wo_number}
            </div>
            <div className="text-sm text-blue-600">
              🚢 {originalData.work_order.vessel.name} (
              {originalData.work_order.vessel.type}) -{" "}
              {originalData.work_order.vessel.company}
            </div>
          </div>
        </div>
      </div>

      {/* Form Container */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Work Details Information
          </h2>
          <p className="text-sm text-gray-600">
            {isPPICOrMaster &&
              "Update planning fields (PPIC): description, location, work scope, dates, quantity"}
            {isProduction &&
              "Update execution fields (PRODUCTION): PIC, SPK/SPKK numbers, work permit, actual dates, notes"}
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
            {/* PPIC FIELDS */}
            {isPPICOrMaster && (
              <>
                {/* Description */}
                <div className="md:col-span-2">
                  <label
                    htmlFor="description"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Work Description *{" "}
                    <span className="text-blue-600">(PPIC)</span>
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
                    htmlFor="location_id"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Location * <span className="text-blue-600">(PPIC)</span>
                  </label>
                  <div className="relative" ref={locationDropdownRef}>
                    <div className="relative">
                      <input
                        type="text"
                        value={locationSearchTerm}
                        onChange={handleLocationSearch}
                        onFocus={() => setShowLocationDropdown(true)}
                        placeholder="Search location..."
                        className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      {locationSearchTerm && (
                        <button
                          type="button"
                          onClick={handleClearLocationSearch}
                          className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {showLocationDropdown &&
                      filteredLocationsForSearch.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {filteredLocationsForSearch.map((location) => (
                            <div
                              key={location.id}
                              onClick={() =>
                                handleLocationSelectFromDropdown(location)
                              }
                              className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                                formData.location_id === location.id
                                  ? "bg-blue-100"
                                  : ""
                              }`}
                            >
                              <div className="font-medium text-gray-900 text-sm">
                                {location.location}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                </div>

                {/* Work Location */}
                <div>
                  <label
                    htmlFor="work_location"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Work Location *{" "}
                    <span className="text-blue-600">(PPIC)</span>
                  </label>
                  <input
                    type="text"
                    id="work_location"
                    name="work_location"
                    value={formData.work_location}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Specific work location"
                    required
                  />
                </div>

                {/* Work Scope */}
                <div className="md:col-span-2">
                  <label
                    htmlFor="work_scope_id"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Work Scope * <span className="text-blue-600">(PPIC)</span>
                  </label>
                  <div className="relative" ref={workScopeDropdownRef}>
                    <div className="relative">
                      <input
                        type="text"
                        value={workScopeSearchTerm}
                        onChange={handleWorkScopeSearch}
                        onFocus={() => setShowWorkScopeDropdown(true)}
                        placeholder="Search work scope..."
                        className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      {workScopeSearchTerm && (
                        <button
                          type="button"
                          onClick={handleClearWorkScopeSearch}
                          className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {showWorkScopeDropdown &&
                      filteredWorkScopesForSearch.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {filteredWorkScopesForSearch.map((scope) => (
                            <div
                              key={scope.id}
                              onClick={() =>
                                handleWorkScopeSelectFromDropdown(scope)
                              }
                              className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                                formData.work_scope_id === scope.id
                                  ? "bg-blue-100"
                                  : ""
                              }`}
                            >
                              <div className="font-medium text-gray-900 text-sm">
                                {scope.work_scope}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                </div>

                {/* Work Type */}
                <div>
                  <label
                    htmlFor="work_type"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Work Type * <span className="text-blue-600">(PPIC)</span>
                  </label>
                  <select
                    id="work_type"
                    name="work_type"
                    value={formData.work_type}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select work type</option>
                    <option value="Docking">Docking</option>
                    <option value="Repair">Repair</option>
                  </select>
                </div>

                {/* Quantity */}
                <div>
                  <label
                    htmlFor="quantity"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Quantity * <span className="text-blue-600">(PPIC)</span>
                  </label>
                  <input
                    type="number"
                    id="quantity"
                    name="quantity"
                    value={formData.quantity}
                    onChange={handleInputChange}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter quantity"
                    required
                  />
                </div>

                {/* UOM */}
                <div>
                  <label
                    htmlFor="uom"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    UOM * <span className="text-blue-600">(PPIC)</span>
                  </label>
                  <select
                    id="uom"
                    name="uom"
                    value={formData.uom}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
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
                  <label
                    htmlFor="planned_start_date"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Planned Start Date *{" "}
                    <span className="text-blue-600">(PPIC)</span>
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
                    Target Close Date *{" "}
                    <span className="text-blue-600">(PPIC)</span>
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
                    Period Close Target *{" "}
                    <span className="text-blue-600">(PPIC)</span>
                  </label>
                  <select
                    id="period_close_target"
                    name="period_close_target"
                    value={formData.period_close_target}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select target month</option>
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
                      id="is_additional_wo_details"
                      name="is_additional_wo_details"
                      checked={formData.is_additional_wo_details}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          is_additional_wo_details: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label
                      htmlFor="is_additional_wo_details"
                      className="ml-2 block text-sm font-medium text-gray-700"
                    >
                      Is Additional Work Order Details{" "}
                      <span className="text-blue-600">(PPIC)</span>
                    </label>
                  </div>
                </div>
              </>
            )}

            {/* READ-ONLY PPIC FIELDS FOR PRODUCTION */}
            {isProduction && (
              <>
                <div className="md:col-span-2 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    📋 Planning Information (Read-only)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Description:</span>
                      <div className="font-medium text-gray-900">
                        {formData.description}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Location:</span>
                      <div className="font-medium text-gray-900">
                        {locationSearchTerm}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Work Location:</span>
                      <div className="font-medium text-gray-900">
                        {formData.work_location}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Work Scope:</span>
                      <div className="font-medium text-gray-900">
                        {workScopeSearchTerm}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Work Type:</span>
                      <div className="font-medium text-gray-900">
                        {formData.work_type}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Quantity:</span>
                      <div className="font-medium text-gray-900">
                        {formData.quantity} {formData.uom}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Planned Dates:</span>
                      <div className="font-medium text-gray-900">
                        {new Date(
                          formData.planned_start_date
                        ).toLocaleDateString()}{" "}
                        -{" "}
                        {new Date(
                          formData.target_close_date
                        ).toLocaleDateString()}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Period Target:</span>
                      <div className="font-medium text-gray-900">
                        {formData.period_close_target}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* PRODUCTION FIELDS */}
            {(isProduction || isPPICOrMaster) && (
              <>
                {/* Person in Charge */}
                <div>
                  <label
                    htmlFor="pic"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Person in Charge (PIC) *{" "}
                    <span className="text-green-600">(PRODUCTION)</span>
                  </label>
                  <input
                    type="text"
                    id="pic"
                    name="pic"
                    value={formData.pic}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Name of responsible person"
                    required={isProduction}
                  />
                </div>

                {/* SPK Number */}
                <div>
                  <label
                    htmlFor="spk_number"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    SPK Number{" "}
                    <span className="text-green-600">(PRODUCTION)</span>
                  </label>
                  <input
                    type="text"
                    id="spk_number"
                    name="spk_number"
                    value={formData.spk_number}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter SPK number"
                  />
                </div>

                {/* SPKK Number */}
                <div>
                  <label
                    htmlFor="spkk_number"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    SPKK Number{" "}
                    <span className="text-green-600">(PRODUCTION)</span>
                  </label>
                  <input
                    type="text"
                    id="spkk_number"
                    name="spkk_number"
                    value={formData.spkk_number}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter SPKK number"
                  />
                </div>

                {/* Actual Start Date */}
                <div>
                  <label
                    htmlFor="actual_start_date"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Actual Start Date{" "}
                    <span className="text-green-600">(PRODUCTION)</span>
                  </label>
                  <input
                    type="date"
                    id="actual_start_date"
                    name="actual_start_date"
                    value={formData.actual_start_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Actual Close Date */}
                <div>
                  <label
                    htmlFor="actual_close_date"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Actual Close Date{" "}
                    <span className="text-green-600">(PRODUCTION)</span>
                  </label>
                  <input
                    type="date"
                    id="actual_close_date"
                    name="actual_close_date"
                    value={formData.actual_close_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Notes */}
                <div className="md:col-span-2">
                  <label
                    htmlFor="notes"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Notes <span className="text-green-600">(PRODUCTION)</span>
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Additional notes or comments..."
                  />
                </div>

                {/* Work Permit File */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Work Permit Document{" "}
                    <span className="text-green-600">(PRODUCTION)</span>
                  </label>

                  {originalData.storage_path && !removeExistingFile && (
                    <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="text-green-600 mr-2">📄</span>
                          <div>
                            <div className="text-sm font-medium text-green-800">
                              Current Work Permit
                            </div>
                            <div className="text-xs text-green-600">
                              Uploaded and available
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleViewPermit}
                            className="text-blue-600 hover:text-blue-800 text-sm underline"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={handleRemoveExistingFile}
                            className="text-red-600 hover:text-red-800 text-sm underline"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {removeExistingFile && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <span className="text-red-600 mr-2">⚠️</span>
                          <div>
                            <div className="text-sm font-medium text-red-800">
                              Work Permit Will Be Removed
                            </div>
                            <div className="text-xs text-red-600">
                              The current work permit will be deleted when you
                              save
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRemoveExistingFile(false)}
                          className="text-blue-600 hover:text-blue-800 text-sm underline"
                        >
                          Keep File
                        </button>
                      </div>
                    </div>
                  )}

                  {!originalData.storage_path && (
                    <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center">
                        <span className="text-yellow-600 mr-2">⚠️</span>
                        <div>
                          <div className="text-sm font-medium text-yellow-800">
                            No Work Permit Uploaded
                          </div>
                          <div className="text-xs text-yellow-600">
                            Upload a work permit to start this work
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-4">
                    <div className="mb-2">
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
                        📄{" "}
                        {originalData.storage_path
                          ? "Replace with New PDF"
                          : "Upload PDF File"}
                      </label>
                    </div>

                    {fileError && (
                      <div className="mt-2 text-sm text-red-600">
                        {fileError}
                      </div>
                    )}

                    {selectedFile && (
                      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <span className="text-blue-600 mr-2">📄</span>
                            <div>
                              <div className="text-sm font-medium text-blue-800">
                                {selectedFile.name}
                              </div>
                              <div className="text-xs text-blue-600">
                                {(selectedFile.size / 1024 / 1024).toFixed(2)}{" "}
                                MB - Ready to upload
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

                    <p className="text-xs text-gray-500 mt-2">
                      Upload a PDF file containing the work permit or safety
                      authorization (max 10MB)
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-4 mt-8 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              disabled={saving || uploadProgress}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploadProgress}
              className="px-8 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving || uploadProgress ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  {uploadProgress ? "Uploading file..." : "Saving..."}
                </>
              ) : (
                <>✅ Save Changes</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
