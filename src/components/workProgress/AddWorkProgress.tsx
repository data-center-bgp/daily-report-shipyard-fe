import { useState, useEffect } from "react";
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
  location: string;
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
    evidence_file: null as File | null,
  });

  const [loadingVessels, setLoadingVessels] = useState(false);
  const [loadingWorkOrders, setLoadingWorkOrders] = useState(false);
  const [loadingWorkDetails, setLoadingWorkDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        .select("id, description, location, pic")
        .eq("work_order_id", workOrderId)
        .is("deleted_at", null)
        .order("description", { ascending: true });

      if (error) throw error;

      const workDetailsData: WorkDetailsFormData[] = (data || []).map(
        (item) => ({
          id: item.id,
          description: item.description,
          location: item.location,
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

  const handleVesselChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const vesselId = parseInt(e.target.value);
    setSelectedVesselId(vesselId);
    setSelectedWorkOrderId(0);
    setSelectedWorkDetailsId(0);
  };

  const handleWorkOrderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const workOrderId = parseInt(e.target.value);
    setSelectedWorkOrderId(workOrderId);
    setSelectedWorkDetailsId(0);
  };

  const handleWorkDetailsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const workDetailsId = parseInt(e.target.value);
    setSelectedWorkDetailsId(workDetailsId);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, files } = e.target;

    if (name === "evidence_file" && files) {
      setFormData((prev) => ({ ...prev, evidence_file: files[0] || null }));
    } else if (name === "progress_percentage") {
      const numericValue = value.replace(/[^0-9]/g, "");
      if (
        numericValue === "" ||
        (parseInt(numericValue) >= 0 && parseInt(numericValue) <= 100)
      ) {
        setFormData((prev) => ({ ...prev, progress_percentage: numericValue }));
      }
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
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

    const progressValue = parseInt(formData.progress_percentage) || 0;
    if (
      formData.progress_percentage === "" ||
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
        const { data: newProfile, error: createError } = await supabase
          .from("profiles")
          .insert({
            auth_user_id: user.id,
            email: user.email,
            full_name:
              user.user_metadata?.full_name ||
              user.email?.split("@")[0] ||
              "User",
            role: "user",
          })
          .select("id")
          .single();

        if (createError) {
          console.error("Error creating user profile:", createError);

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

      if (!userId || typeof userId !== "number") {
        throw new Error(`Invalid user ID: ${userId}`);
      }

      const { error } = await supabase
        .from("work_progress")
        .insert({
          work_details_id: selectedWorkDetailsId,
          progress_percentage: progressValue,
          report_date: formData.report_date,
          evidence_url: evidenceUrl,
          storage_path: storagePath,
          user_id: userId,
        })
        .select()
        .single();

      if (error) throw error;

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

  const progressValue = parseInt(formData.progress_percentage) || 0;
  const isFormValid =
    selectedWorkDetailsId > 0 &&
    formData.report_date &&
    formData.progress_percentage !== "" &&
    progressValue >= 0 &&
    progressValue <= 100;

  const formatWorkOrderDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

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

            {/* Step 1: Vessel Selection */}
            {!effectiveWorkDetailsId && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🚢 Step 1: Select Vessel
                  </label>
                  <select
                    value={selectedVesselId}
                    onChange={handleVesselChange}
                    disabled={loadingVessels}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value={0}>
                      {loadingVessels
                        ? "Loading vessels..."
                        : "Select a vessel"}
                    </option>
                    {vessels.map((vessel) => (
                      <option key={vessel.id} value={vessel.id}>
                        {vessel.name} ({vessel.type})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Step 2: Work Order Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📋 Step 2: Select Work Order
                  </label>
                  <select
                    value={selectedWorkOrderId}
                    onChange={handleWorkOrderChange}
                    disabled={!selectedVesselId || loadingWorkOrders}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                  >
                    <option value={0}>
                      {loadingWorkOrders
                        ? "Loading work orders..."
                        : selectedVesselId
                        ? "Select a work order"
                        : "Select vessel first"}
                    </option>
                    {workOrders.map((workOrder) => (
                      <option key={workOrder.id} value={workOrder.id}>
                        {workOrder.shipyard_wo_number}
                        {workOrder.shipyard_wo_date &&
                          ` (${formatWorkOrderDate(
                            workOrder.shipyard_wo_date
                          )})`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Step 3: Work Details Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🔧 Step 3: Select Work Details
                  </label>
                  <select
                    value={selectedWorkDetailsId}
                    onChange={handleWorkDetailsChange}
                    disabled={!selectedWorkOrderId || loadingWorkDetails}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                  >
                    <option value={0}>
                      {loadingWorkDetails
                        ? "Loading work details..."
                        : selectedWorkOrderId
                        ? "Select work details"
                        : "Select work order first"}
                    </option>
                    {workDetailsList.map((workDetails) => (
                      <option key={workDetails.id} value={workDetails.id}>
                        {workDetails.description.substring(0, 40)}
                        {workDetails.description.length > 40 ? "..." : ""}
                        {workDetails.location && ` (${workDetails.location})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

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
                            📍 {selectedWorkDetails.location}
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
                      placeholder="Enter percentage (0-100)"
                    />
                    <span className="absolute right-3 top-2 text-gray-500 text-sm">
                      %
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Enter a value between 0 and 100 (numbers only)
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
            </div>

            {/* Evidence Upload */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">
                🖼️ Progress Evidence
              </h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Evidence Photo (Optional)
                </label>
                <input
                  type="file"
                  name="evidence_file"
                  onChange={handleInputChange}
                  accept="image/*"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload an image to document the current progress (max 10MB,
                  formats: JPEG, PNG, GIF, WebP)
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
