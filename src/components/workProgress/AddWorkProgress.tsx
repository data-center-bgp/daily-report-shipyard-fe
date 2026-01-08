import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { uploadProgressEvidence } from "../../utils/progressEvidenceHandler";

interface AddWorkProgressProps {
  workDetailsId?: number;
}

interface VesselFormData {
  id: number;
  name: string;
  type: string;
  company: string;
}

interface WorkOrderFormData {
  id: number;
  shipyard_wo_number: string;
  shipyard_wo_date: string;
}

interface WorkDetailsFormData {
  id: number;
  description: string;
  location?: {
    id: number;
    location: string;
  };
  pic: string;
}

interface WorkDetailsContext {
  id: number;
  description: string;
  work_order: {
    id: number;
    shipyard_wo_number: string;
    vessel_id: number;
    vessel: {
      id: number;
      name: string;
    };
  };
}

export default function AddWorkProgress({
  workDetailsId,
}: AddWorkProgressProps) {
  const navigate = useNavigate();
  const params = useParams();

  const effectiveWorkDetailsId =
    workDetailsId ||
    (params.workDetailsId ? parseInt(params.workDetailsId) : undefined);

  const [vessels, setVessels] = useState<VesselFormData[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderFormData[]>([]);
  const [workDetailsList, setWorkDetailsList] = useState<WorkDetailsFormData[]>(
    []
  );

  const [selectedVesselId, setSelectedVesselId] = useState<number>(0);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<number>(0);
  const [selectedWorkDetailsId, setSelectedWorkDetailsId] = useState<number>(
    effectiveWorkDetailsId || 0
  );

  const [formData, setFormData] = useState({
    progress_percentage: "",
    report_date: new Date().toISOString().split("T")[0],
    notes: "",
    evidence_file: null as File | null,
  });

  const [loadingVessels, setLoadingVessels] = useState(false);
  const [loadingWorkOrders, setLoadingWorkOrders] = useState(false);
  const [loadingWorkDetails, setLoadingWorkDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [vesselSearchTerm, setVesselSearchTerm] = useState("");
  const [showVesselDropdown, setShowVesselDropdown] = useState(false);
  const vesselDropdownRef = useRef<HTMLDivElement>(null);

  const [workOrderSearchTerm, setWorkOrderSearchTerm] = useState("");
  const [showWorkOrderDropdown, setShowWorkOrderDropdown] = useState(false);
  const workOrderDropdownRef = useRef<HTMLDivElement>(null);

  const [workDetailsSearchTerm, setWorkDetailsSearchTerm] = useState("");
  const [showWorkDetailsDropdown, setShowWorkDetailsDropdown] = useState(false);
  const workDetailsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchVessels();

    if (effectiveWorkDetailsId) {
      fetchWorkDetailsContext(effectiveWorkDetailsId);
    }
  }, [effectiveWorkDetailsId]);

  useEffect(() => {
    if (selectedVesselId > 0) {
      fetchWorkOrders(selectedVesselId);
    } else {
      setWorkOrders([]);
      setSelectedWorkOrderId(0);
    }
  }, [selectedVesselId]);

  useEffect(() => {
    if (selectedWorkOrderId > 0) {
      fetchWorkDetails(selectedWorkOrderId);
    } else {
      setWorkDetailsList([]);
      setSelectedWorkDetailsId(effectiveWorkDetailsId || 0);
    }
  }, [selectedWorkOrderId, effectiveWorkDetailsId]);

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
      if (
        workDetailsDropdownRef.current &&
        !workDetailsDropdownRef.current.contains(event.target as Node)
      ) {
        setShowWorkDetailsDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const fetchVessels = async () => {
    try {
      setLoadingVessels(true);
      const { data, error } = await supabase
        .from("vessel")
        .select("id, name, type, company")
        .is("deleted_at", null)
        .order("name", { ascending: true });

      if (error) throw error;

      const vesselData: VesselFormData[] = (data || []).map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        company: item.company,
      }));

      setVessels(vesselData);
    } catch (err) {
      console.error("Error fetching vessels:", err);
      setError("Failed to load vessels");
    } finally {
      setLoadingVessels(false);
    }
  };

  const fetchWorkOrders = async (vesselId: number) => {
    try {
      setLoadingWorkOrders(true);
      const { data, error } = await supabase
        .from("work_order")
        .select("id, shipyard_wo_number, shipyard_wo_date")
        .eq("vessel_id", vesselId)
        .is("deleted_at", null)
        .order("shipyard_wo_number", { ascending: true });

      if (error) throw error;

      const workOrderData: WorkOrderFormData[] = (data || []).map((item) => ({
        id: item.id,
        shipyard_wo_number: item.shipyard_wo_number,
        shipyard_wo_date: item.shipyard_wo_date,
      }));

      setWorkOrders(workOrderData);
    } catch (err) {
      console.error("Error fetching work orders:", err);
      setError("Failed to load work orders");
    } finally {
      setLoadingWorkOrders(false);
    }
  };

  const fetchWorkDetails = async (workOrderId: number) => {
    try {
      setLoadingWorkDetails(true);
      const { data, error } = await supabase
        .from("work_details")
        .select(
          `
        id, 
        description, 
        location:location_id (
          id,
          location
        ), 
        pic
      `
        )
        .eq("work_order_id", workOrderId)
        .is("deleted_at", null)
        .order("description", { ascending: true });

      if (error) throw error;

      const workDetailsData: WorkDetailsFormData[] = (data || []).map(
        (item: any) => ({
          id: item.id,
          description: item.description,
          location: Array.isArray(item.location)
            ? item.location[0]
            : item.location,
          pic: item.pic,
        })
      );

      setWorkDetailsList(workDetailsData);
    } catch (err) {
      console.error("Error fetching work details:", err);
      setError("Failed to load work details");
    } finally {
      setLoadingWorkDetails(false);
    }
  };

  const fetchWorkDetailsContext = async (workDetailsId: number) => {
    try {
      const { data, error } = await supabase
        .from("work_details")
        .select(
          `
          id,
          description,
          work_order (
            id,
            shipyard_wo_number,
            vessel_id,
            vessel (
              id,
              name
            )
          )
        `
        )
        .eq("id", workDetailsId)
        .single();

      if (error) throw error;

      const workDetailsContext = data as unknown as WorkDetailsContext;

      if (workDetailsContext?.work_order?.vessel) {
        const vessel = Array.isArray(workDetailsContext.work_order.vessel)
          ? workDetailsContext.work_order.vessel[0]
          : workDetailsContext.work_order.vessel;

        setSelectedVesselId(vessel.id);
        setSelectedWorkOrderId(workDetailsContext.work_order.id);
        setSelectedWorkDetailsId(workDetailsId);
      }
    } catch (err) {
      console.error("Error fetching work details context:", err);
      setError("Failed to load work details information");
    }
  };

  const handleVesselSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVesselSearchTerm(e.target.value);
    setShowVesselDropdown(true);
    if (selectedVesselId) {
      setSelectedVesselId(0);
      setSelectedWorkOrderId(0);
      setSelectedWorkDetailsId(0);
      setWorkOrders([]);
      setWorkDetailsList([]);
    }
  };

  const handleVesselSelectFromDropdown = (vessel: VesselFormData) => {
    setSelectedVesselId(vessel.id);
    setVesselSearchTerm(`${vessel.name} - ${vessel.type} (${vessel.company})`);
    setShowVesselDropdown(false);
    setSelectedWorkOrderId(0);
    setSelectedWorkDetailsId(0);
    setWorkOrderSearchTerm("");
    setWorkDetailsSearchTerm("");
  };

  const handleClearVesselSearch = () => {
    setVesselSearchTerm("");
    setSelectedVesselId(0);
    setShowVesselDropdown(false);
    setSelectedWorkOrderId(0);
    setSelectedWorkDetailsId(0);
    setWorkOrderSearchTerm("");
    setWorkDetailsSearchTerm("");
    setWorkOrders([]);
    setWorkDetailsList([]);
  };

  const handleWorkOrderSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWorkOrderSearchTerm(e.target.value);
    setShowWorkOrderDropdown(true);
    if (selectedWorkOrderId) {
      setSelectedWorkOrderId(0);
      setSelectedWorkDetailsId(0);
      setWorkDetailsList([]);
    }
  };

  const handleWorkOrderSelectFromDropdown = (workOrder: WorkOrderFormData) => {
    setSelectedWorkOrderId(workOrder.id);
    setWorkOrderSearchTerm(workOrder.shipyard_wo_number || "");
    setShowWorkOrderDropdown(false);
    setSelectedWorkDetailsId(0);
    setWorkDetailsSearchTerm("");
  };

  const handleClearWorkOrderSearch = () => {
    setWorkOrderSearchTerm("");
    setSelectedWorkOrderId(0);
    setShowWorkOrderDropdown(false);
    setSelectedWorkDetailsId(0);
    setWorkDetailsSearchTerm("");
    setWorkDetailsList([]);
  };

  const handleWorkDetailsSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWorkDetailsSearchTerm(e.target.value);
    setShowWorkDetailsDropdown(true);
    if (selectedWorkDetailsId) {
      setSelectedWorkDetailsId(0);
    }
  };

  const handleWorkDetailsSelectFromDropdown = (
    workDetails: WorkDetailsFormData
  ) => {
    setSelectedWorkDetailsId(workDetails.id);
    setWorkDetailsSearchTerm(workDetails.description);
    setShowWorkDetailsDropdown(false);
  };

  const handleClearWorkDetailsSearch = () => {
    setWorkDetailsSearchTerm("");
    setSelectedWorkDetailsId(effectiveWorkDetailsId || 0);
    setShowWorkDetailsDropdown(false);
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    if (name === "progress_percentage") {
      const formattedValue = value.replace(/\./g, ",");
      const numericValue = formattedValue.replace(/[^0-9,]/g, "");

      const commaCount = (numericValue.match(/,/g) || []).length;
      if (commaCount > 1) return;

      const parsedValue =
        numericValue === "" ? 0 : parseFloat(numericValue.replace(",", "."));
      if (
        numericValue === "" ||
        (!isNaN(parsedValue) && parsedValue >= 0 && parsedValue <= 100)
      ) {
        setFormData((prev) => ({ ...prev, progress_percentage: numericValue }));
      }
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = e.target;
    if (files && files[0]) {
      setFormData((prev) => ({ ...prev, evidence_file: files[0] }));
    }
  };

  const handleProgressFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedWorkDetailsId) {
      setError("Please select a work details item");
      return;
    }

    const progressValue = formData.progress_percentage
      ? parseFloat(formData.progress_percentage.replace(",", ".")) || 0
      : 0;

    if (
      formData.progress_percentage === "" ||
      isNaN(progressValue) ||
      progressValue < 0 ||
      progressValue > 100
    ) {
      setError("Please enter a valid progress percentage between 0 and 100");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let evidenceUrl = "";
      let storagePath = "";

      if (formData.evidence_file) {
        const uploadResult = await uploadProgressEvidence({
          file: formData.evidence_file,
          workDetailsId: selectedWorkDetailsId,
          reportDate: formData.report_date,
        });

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || "Failed to upload evidence");
        }

        evidenceUrl = uploadResult.publicUrl || "";
        storagePath = uploadResult.storagePath || "";
      }

      // ✅ Get current authenticated user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        console.error("Auth error:", authError);
        throw new Error("User not authenticated. Please log in again.");
      }

      // ✅ Get user profile from profiles table using auth_user_id
      const { data: userProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id, name, email")
        .eq("auth_user_id", user.id)
        .single();

      if (profileError) {
        console.error("Profile fetch error:", profileError);

        // If profile doesn't exist, this is a serious issue
        throw new Error(
          "Your user profile was not found. Please contact the administrator to ensure your profile is properly set up."
        );
      }

      if (!userProfile || !userProfile.id) {
        throw new Error(
          "Invalid user profile. Please contact the administrator."
        );
      }

      console.log(
        "Creating work progress with user_id:",
        userProfile.id,
        "Name:",
        userProfile.name
      );

      // ✅ Insert work progress with the correct user_id from profiles table
      const { data: insertedProgress, error: insertError } = await supabase
        .from("work_progress")
        .insert({
          work_details_id: selectedWorkDetailsId,
          progress_percentage: progressValue,
          report_date: formData.report_date,
          notes: formData.notes.trim() || null,
          evidence_url: evidenceUrl || null,
          storage_path: storagePath || null,
          user_id: userProfile.id, // ✅ This is the profiles.id, not auth user id
        })
        .select()
        .single();

      if (insertError) {
        console.error("Insert error:", insertError);
        throw new Error(
          `Failed to create progress report: ${insertError.message}`
        );
      }

      console.log("Progress created successfully:", insertedProgress);

      // Navigate to appropriate page
      if (effectiveWorkDetailsId) {
        navigate(`/work-details/${effectiveWorkDetailsId}/progress`);
      } else {
        navigate("/work-progress");
      }
    } catch (err) {
      console.error("Error creating work progress:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create progress report"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectedVessel = vessels.find((v) => v.id === selectedVesselId);
  const selectedWorkOrder = workOrders.find(
    (wo) => wo.id === selectedWorkOrderId
  );
  const selectedWorkDetails = workDetailsList.find(
    (wd) => wd.id === selectedWorkDetailsId
  );

  const progressValue = formData.progress_percentage
    ? parseFloat(formData.progress_percentage.replace(",", ".")) || 0
    : 0;
  const isFormValid =
    selectedWorkDetailsId > 0 &&
    formData.report_date &&
    formData.progress_percentage !== "" &&
    !isNaN(progressValue) &&
    progressValue >= 0 &&
    progressValue <= 100;

  const formatWorkOrderDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Add these filter functions:
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
    return wo.shipyard_wo_number?.toLowerCase().includes(searchLower);
  });

  const filteredWorkDetailsForSearch = workDetailsList.filter((wd) => {
    const searchLower = workDetailsSearchTerm.toLowerCase();

    // Handle location search
    let locationMatch = false;
    if (wd.location) {
      locationMatch = (wd.location.location || "")
        .toLowerCase()
        .includes(searchLower);
    }

    return (
      wd.description.toLowerCase().includes(searchLower) ||
      locationMatch ||
      wd.pic.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Add Progress Report
        </h1>
        <p className="text-gray-600">
          {effectiveWorkDetailsId
            ? "Add a new progress report for the selected work details"
            : "Select work details and add a progress report with evidence"}
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error</h3>
          <p className="text-red-600 mt-1">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Selection Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sticky top-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              📋 Work Selection
            </h3>

            <div className="relative" ref={vesselDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🚢 Step 1: Select Vessel
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={vesselSearchTerm}
                  onChange={handleVesselSearch}
                  onFocus={() => setShowVesselDropdown(true)}
                  placeholder="Search vessel..."
                  disabled={loadingVessels}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {vesselSearchTerm && (
                  <button
                    onClick={handleClearVesselSearch}
                    className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Vessel Dropdown */}
              {showVesselDropdown && filteredVesselsForSearch.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredVesselsForSearch.map((vessel) => (
                    <div
                      key={vessel.id}
                      onClick={() => handleVesselSelectFromDropdown(vessel)}
                      className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                        selectedVesselId === vessel.id ? "bg-blue-100" : ""
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

            <div className="relative" ref={workOrderDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                📋 Step 2: Select Work Order
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={workOrderSearchTerm}
                  onChange={handleWorkOrderSearch}
                  onFocus={() => setShowWorkOrderDropdown(true)}
                  placeholder={
                    selectedVesselId === 0
                      ? "Select vessel first"
                      : "Search work order..."
                  }
                  disabled={loadingWorkOrders || selectedVesselId === 0}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                />
                {workOrderSearchTerm && (
                  <button
                    onClick={handleClearWorkOrderSearch}
                    className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Work Order Dropdown */}
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
                        {workOrder.shipyard_wo_date && (
                          <div className="text-xs text-gray-600">
                            {formatWorkOrderDate(workOrder.shipyard_wo_date)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
            </div>

            <div className="relative" ref={workDetailsDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🔧 Step 3: Select Work Details
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={workDetailsSearchTerm}
                  onChange={handleWorkDetailsSearch}
                  onFocus={() => setShowWorkDetailsDropdown(true)}
                  placeholder={
                    selectedWorkOrderId === 0
                      ? "Select work order first"
                      : "Search work details..."
                  }
                  disabled={loadingWorkDetails || selectedWorkOrderId === 0}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                />
                {workDetailsSearchTerm && (
                  <button
                    onClick={handleClearWorkDetailsSearch}
                    className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Work Details Dropdown */}
              {showWorkDetailsDropdown &&
                selectedWorkOrderId > 0 &&
                filteredWorkDetailsForSearch.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredWorkDetailsForSearch.map((workDetails) => (
                      <div
                        key={workDetails.id}
                        onClick={() =>
                          handleWorkDetailsSelectFromDropdown(workDetails)
                        }
                        className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                          selectedWorkDetailsId === workDetails.id
                            ? "bg-blue-100"
                            : ""
                        }`}
                      >
                        <div className="font-medium text-gray-900 text-sm">
                          {workDetails.description.substring(0, 50)}
                          {workDetails.description.length > 50 ? "..." : ""}
                        </div>
                        <div className="text-xs text-gray-600">
                          📍{" "}
                          {typeof workDetails.location === "string"
                            ? workDetails.location || "No location"
                            : workDetails.location?.location ||
                              "No location"}{" "}
                          • 👤 {workDetails.pic}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {/* Selection Summary */}
            {(selectedVessel || effectiveWorkDetailsId) && (
              <div className="mt-6 pt-4 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  📊 Selection Summary
                </h4>
                <div className="space-y-2 text-sm">
                  {selectedVessel && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">🚢 Vessel:</span>
                      <span className="font-medium">{selectedVessel.name}</span>
                    </div>
                  )}
                  {selectedWorkOrder && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 mt-0.5">
                        📋 Work Order:
                      </span>
                      <div className="font-medium">
                        <div>{selectedWorkOrder.shipyard_wo_number}</div>
                        {selectedWorkOrder.shipyard_wo_date && (
                          <div className="text-xs text-gray-500">
                            {formatWorkOrderDate(
                              selectedWorkOrder.shipyard_wo_date
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedWorkDetails && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 mt-0.5">
                        🔧 Work Details:
                      </span>
                      <div className="font-medium text-sm leading-tight">
                        <div>{selectedWorkDetails.description}</div>
                        {selectedWorkDetails.location && (
                          <div className="text-xs text-gray-500">
                            📍{" "}
                            {typeof selectedWorkDetails.location === "string"
                              ? selectedWorkDetails.location
                              : selectedWorkDetails.location.location}
                          </div>
                        )}
                        {selectedWorkDetails.pic && (
                          <div className="text-xs text-gray-500">
                            👤 PIC: {selectedWorkDetails.pic}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Progress Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">
                📈 Progress Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Progress Percentage */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📊 Progress Percentage *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="progress_percentage"
                      value={formData.progress_percentage}
                      onChange={handleInputChange}
                      onFocus={handleProgressFocus}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
                      placeholder="Enter percentage (e.g., 10,5 or 100)"
                    />
                    <span className="absolute right-3 top-2 text-gray-500 text-sm">
                      %
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Enter a value between 0 and 100 (use comma for decimals,
                    e.g., 10,5 or 50,75)
                  </p>
                  {formData.progress_percentage !== "" && (
                    <div className="mt-1">
                      {progressValue >= 0 && progressValue <= 100 ? (
                        <span className="text-xs text-green-600">
                          ✅ Valid percentage
                        </span>
                      ) : (
                        <span className="text-xs text-red-600">
                          ❌ Must be between 0-100
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Report Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📅 Report Date *
                  </label>
                  <input
                    type="date"
                    name="report_date"
                    value={formData.report_date}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Progress Bar Preview */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Progress Preview
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(Math.max(progressValue, 0), 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700 min-w-[3rem]">
                    {formData.progress_percentage || "0"}%
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  📝 Notes (Optional)
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Add any additional notes or comments about this progress update..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Optional field to provide additional context or details about
                  the progress
                </p>
              </div>
            </div>

            {/* Evidence Upload */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">
                🖼️ Progress Evidence (Optional)
              </h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Evidence Photo
                </label>
                <input
                  type="file"
                  name="evidence_file"
                  onChange={handleFileChange}
                  accept="image/*"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload an image to document the current progress (optional,
                  max 10MB, formats: JPEG, PNG, GIF, WebP)
                </p>
              </div>

              {formData.evidence_file && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-600">📎</span>
                    <span className="text-sm text-blue-800 font-medium">
                      {formData.evidence_file.name}
                    </span>
                    <span className="text-xs text-blue-600">
                      ({(formData.evidence_file.size / 1024 / 1024).toFixed(2)}{" "}
                      MB)
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={submitting}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={!isFormValid || submitting}
                className="px-8 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Creating...
                  </>
                ) : (
                  <>✅ Create Progress Report</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
