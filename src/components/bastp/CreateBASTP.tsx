import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase, type Vessel, type WorkDetails } from "../../lib/supabase";
import type { BASTP } from "../../types/bastp.types";
import type {
  GeneralServiceType,
  GeneralServiceInput,
} from "../../types/generalService.types";
import {
  AlertTriangle,
  ArrowLeft,
  FileText,
  Wrench,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  Plus,
  X,
  FileEdit,
  Search,
  Loader,
} from "lucide-react";

interface WorkDetailsWithProgress extends WorkDetails {
  current_progress?: number;
  has_progress_data?: boolean;
  latest_progress_date?: string;
  work_order?: {
    id: number;
    shipyard_wo_number: string;
    customer_wo_number: string;
    vessel?: Vessel;
  };
  location?: {
    id: number;
    location: string;
  };
  is_verified?: boolean;
}

export default function CreateBASTP() {
  const navigate = useNavigate();
  const { bastpId } = useParams<{ bastpId: string }>();
  const isEditMode = !!bastpId;

  // Form states
  const [formData, setFormData] = useState({
    number: "",
    date: new Date().toISOString().split("T")[0],
    delivery_date: "",
    vessel_id: 0,
  });

  // Data states
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [availableWorkDetails, setAvailableWorkDetails] = useState<
    WorkDetailsWithProgress[]
  >([]);
  const [selectedWorkDetails, setSelectedWorkDetails] = useState<
    WorkDetailsWithProgress[]
  >([]);
  const [existingBastp, setExistingBastp] = useState<BASTP | null>(null);

  // UI states
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadingDocument, setUploadingDocument] = useState(false);

  // General services states
  const [serviceTypes, setServiceTypes] = useState<GeneralServiceType[]>([]);
  const [selectedServices, setSelectedServices] = useState<
    GeneralServiceInput[]
  >([]);
  const [loadingServiceTypes, setLoadingServiceTypes] = useState(false);

  // Fetch vessels
  const fetchVessels = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("vessel")
        .select("*")
        .is("deleted_at", null)
        .order("name", { ascending: true });

      if (error) throw error;
      setVessels(data || []);
    } catch (err) {
      console.error("Error fetching vessels:", err);
      setError("Failed to load vessels");
    }
  }, []);

  // Fetch service types
  const fetchServiceTypes = useCallback(async () => {
    try {
      setLoadingServiceTypes(true);
      const { data, error } = await supabase
        .from("general_service_types")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) throw error;
      setServiceTypes(data || []);
    } catch (err) {
      console.error("Error fetching service types:", err);
      setError("Failed to load service types");
    } finally {
      setLoadingServiceTypes(false);
    }
  }, []);

  // Fetch existing BASTP data (for edit mode)
  const fetchExistingBastp = useCallback(async () => {
    if (!bastpId) return;

    try {
      const { data, error } = await supabase
        .from("bastp")
        .select(
          `
          *,
          bastp_work_details (
            id,
            work_details (
              *,
              location (
                id,
                location
              ),
              work_order (
                id,
                shipyard_wo_number,
                customer_wo_number,
                vessel (
                  id,
                  name,
                  type,
                  company
                )
              )
            )
          ),
          general_services (
            id,
            service_type_id,
            total_days,
            unit_price,
            payment_price,
            remarks,
            service_type:service_type_id (
              id,
              service_name,
              service_code,
              display_order
            )
          )
        `,
        )
        .eq("id", bastpId)
        .is("deleted_at", null)
        .single();

      if (error) throw error;

      setExistingBastp(data);
      setFormData({
        number: data.number,
        date: data.date,
        delivery_date: data.delivery_date,
        vessel_id: data.vessel_id,
      });

      // Set selected work details
      const workDetailsFromBastp =
        data.bastp_work_details?.map((bwd: any) => bwd.work_details) || [];
      setSelectedWorkDetails(workDetailsFromBastp);

      // Set selected general services
      const servicesFromBastp =
        data.general_services?.map((gs: any) => ({
          service_type_id: gs.service_type_id,
          start_date: gs.start_date || new Date().toISOString().split("T")[0],
          close_date: gs.close_date || new Date().toISOString().split("T")[0],
          total_days: gs.total_days,
          remarks: gs.remarks || "",
        })) || [];
      setSelectedServices(servicesFromBastp);
    } catch (err) {
      console.error("Error fetching BASTP:", err);
      setError("Failed to load BASTP data");
    }
  }, [bastpId]);

  // Fetch completed and verified work details for selected vessel
  const fetchAvailableWorkDetails = useCallback(async () => {
    if (!formData.vessel_id) {
      setAvailableWorkDetails([]);
      return;
    }

    try {
      // Get all work details with 100% progress for the selected vessel
      const { data: workDetailsData, error: wdError } = await supabase
        .from("work_details")
        .select(
          `
          *,
          work_order!inner (
            id,
            shipyard_wo_number,
            customer_wo_number,
            vessel:vessel_id!inner (
              id,
              name,
              type,
              company
            )
          ),
          work_progress (
            progress_percentage,
            report_date
          ),
          location:location_id (
            id,
            location
          )
        `,
        )
        .eq("work_order.vessel.id", formData.vessel_id)
        .is("deleted_at", null);

      if (wdError) throw wdError;

      // Process to get only 100% completed work
      const completedWork = (workDetailsData || [])
        .map((wd) => {
          const progressRecords = wd.work_progress || [];
          if (progressRecords.length === 0) {
            return { ...wd, current_progress: 0, has_progress_data: false };
          }

          const sortedProgress = progressRecords.sort(
            (a: any, b: any) =>
              new Date(b.report_date).getTime() -
              new Date(a.report_date).getTime(),
          );

          const latestProgress = sortedProgress[0]?.progress_percentage || 0;
          const latestProgressDate = sortedProgress[0]?.report_date;

          return {
            ...wd,
            current_progress: latestProgress,
            has_progress_data: true,
            latest_progress_date: latestProgressDate,
          };
        })
        .filter((wd) => wd.current_progress === 100);

      // Check which work details are verified
      const { data: verifications, error: verError } = await supabase
        .from("work_verification")
        .select("work_details_id")
        .is("deleted_at", null);

      if (verError) throw verError;

      const verifiedIds = new Set(
        verifications?.map((v) => v.work_details_id) || [],
      );

      // Mark verified work details
      const workWithVerification = completedWork.map((wd) => ({
        ...wd,
        is_verified: verifiedIds.has(wd.id),
      }));

      // Filter out work details already in other BASTPs (except current one in edit mode)
      const { data: existingBastpWorkDetails, error: bastpError } =
        await supabase
          .from("bastp_work_details")
          .select("work_details_id, bastp_id")
          .is("deleted_at", null);

      if (bastpError) throw bastpError;

      const workDetailsInOtherBastps = new Set(
        existingBastpWorkDetails
          ?.filter((bwd) => bwd.bastp_id !== Number(bastpId))
          .map((bwd) => bwd.work_details_id) || [],
      );

      // Also exclude currently selected work details
      const currentlySelectedIds = new Set(
        selectedWorkDetails.map((wd) => wd.id),
      );

      const availableWork = workWithVerification.filter(
        (wd) =>
          !workDetailsInOtherBastps.has(wd.id) &&
          !currentlySelectedIds.has(wd.id),
      );

      setAvailableWorkDetails(availableWork);
    } catch (err) {
      console.error("Error fetching work details:", err);
      setError("Failed to load work details");
    }
  }, [formData.vessel_id, bastpId, selectedWorkDetails]);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      // Load vessels and service types in parallel
      await Promise.all([fetchVessels(), fetchServiceTypes()]);

      // Then load BASTP data (which depends on service types being loaded)
      if (isEditMode) {
        await fetchExistingBastp();
      }

      setLoading(false);
    };

    loadData();
  }, [fetchVessels, fetchServiceTypes, fetchExistingBastp, isEditMode]);

  // Fetch work details when vessel changes
  useEffect(() => {
    if (formData.vessel_id) {
      fetchAvailableWorkDetails();
    }
  }, [fetchAvailableWorkDetails]);

  // Handle service selection toggle
  const handleToggleService = (serviceTypeId: number) => {
    setSelectedServices((prev) => {
      const exists = prev.find((s) => s.service_type_id === serviceTypeId);
      if (exists) {
        return prev.filter((s) => s.service_type_id !== serviceTypeId);
      } else {
        const today = new Date().toISOString().split("T")[0];
        return [
          ...prev,
          {
            service_type_id: serviceTypeId,
            start_date: today,
            close_date: today,
            total_days: 1,
            remarks: "",
          },
        ];
      }
    });
  };

  // Handle service remarks change
  const handleServiceRemarksChange = (
    serviceTypeId: number,
    remarks: string,
  ) => {
    setSelectedServices((prev) =>
      prev.map((service) =>
        service.service_type_id === serviceTypeId
          ? { ...service, remarks }
          : service,
      ),
    );
  };

  const calculateTotalDays = (startDate: string, closeDate: string): number => {
    if (!startDate || !closeDate) return 0;

    const start = new Date(startDate);
    const end = new Date(closeDate);

    if (end < start) return 0;

    // Calculate difference in days
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end date

    return diffDays > 0 ? diffDays : 0;
  };

  const handleServiceStartDateChange = (
    serviceTypeId: number,
    startDate: string,
  ) => {
    setSelectedServices((prev) =>
      prev.map((service) => {
        if (service.service_type_id === serviceTypeId) {
          const totalDays = calculateTotalDays(startDate, service.close_date);
          return {
            ...service,
            start_date: startDate,
            total_days: totalDays,
          };
        }
        return service;
      }),
    );
  };

  const handleServiceCloseDateChange = (
    serviceTypeId: number,
    closeDate: string,
  ) => {
    setSelectedServices((prev) =>
      prev.map((service) => {
        if (service.service_type_id === serviceTypeId) {
          const totalDays = calculateTotalDays(service.start_date, closeDate);
          return {
            ...service,
            close_date: closeDate,
            total_days: totalDays,
          };
        }
        return service;
      }),
    );
  };

  // Handle add work detail
  const handleAddWorkDetail = (workDetail: WorkDetailsWithProgress) => {
    setSelectedWorkDetails((prev) => [...prev, workDetail]);
    setAvailableWorkDetails((prev) =>
      prev.filter((wd) => wd.id !== workDetail.id),
    );
  };

  // Handle remove work detail
  const handleRemoveWorkDetail = (workDetail: WorkDetailsWithProgress) => {
    setSelectedWorkDetails((prev) =>
      prev.filter((wd) => wd.id !== workDetail.id),
    );
    setAvailableWorkDetails((prev) => [...prev, workDetail]);
  };

  // Handle document upload
  const handleDocumentUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !bastpId) return;

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("❌ File size must be less than 10MB");
      return;
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
    ];
    if (!allowedTypes.includes(file.type)) {
      alert("❌ Only PDF, JPG, and PNG files are allowed");
      return;
    }

    try {
      setUploadingDocument(true);

      // Delete old file if exists
      if (existingBastp?.storage_path) {
        await supabase.storage
          .from("bastp")
          .remove([existingBastp.storage_path]);
      }

      // Upload to Supabase Storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${bastpId}_${Date.now()}.${fileExt}`;
      const filePath = `bastp-documents/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("bastp")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Update BASTP record
      const { error: updateError } = await supabase
        .from("bastp")
        .update({
          storage_path: filePath,
          bastp_upload_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", bastpId);

      if (updateError) throw updateError;

      alert(
        "✅ Document uploaded successfully! Status will update automatically.",
      );

      // Refresh to show new document
      await fetchExistingBastp();
    } catch (err) {
      console.error("Error uploading document:", err);
      alert(
        `❌ Failed to upload document: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      setUploadingDocument(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.vessel_id) {
      setError("Please select a vessel");
      return;
    }

    if (selectedWorkDetails.length === 0) {
      setError("Please select at least one completed work detail");
      return;
    }

    // Only validate services in CREATE mode, not in EDIT mode (for backward compatibility)
    if (!isEditMode && selectedServices.length === 0) {
      setError("Please select at least one general service");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();

      if (!profile) throw new Error("User profile not found");

      if (isEditMode && bastpId) {
        // ========== UPDATE MODE ==========
        const { error: updateError } = await supabase
          .from("bastp")
          .update({
            number: formData.number,
            date: formData.date,
            delivery_date: formData.delivery_date,
            vessel_id: formData.vessel_id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", bastpId);

        if (updateError) throw updateError;

        // Delete existing work details
        await supabase
          .from("bastp_work_details")
          .delete()
          .eq("bastp_id", bastpId);

        // Insert updated work details
        const workDetailsToInsert = selectedWorkDetails.map((wd) => ({
          bastp_id: parseInt(bastpId),
          work_details_id: wd.id,
        }));

        const { error: workDetailsError } = await supabase
          .from("bastp_work_details")
          .insert(workDetailsToInsert);

        if (workDetailsError) throw workDetailsError;

        // Delete existing general services
        await supabase
          .from("general_services")
          .delete()
          .eq("bastp_id", bastpId);

        // Only insert general services if there are any selected
        if (selectedServices.length > 0) {
          const servicesToInsert = selectedServices.map((service) => ({
            bastp_id: parseInt(bastpId),
            service_type_id: service.service_type_id,
            start_date: service.start_date,
            close_date: service.close_date,
            total_days: service.total_days,
            unit_price: 0,
            payment_price: 0,
            remarks: service.remarks || null,
          }));

          const { error: servicesError } = await supabase
            .from("general_services")
            .insert(servicesToInsert);

          if (servicesError) throw servicesError;
        }

        navigate(`/bastp/${bastpId}`);
      } else {
        // ========== CREATE MODE ==========
        const { data: bastpData, error: bastpError } = await supabase
          .from("bastp")
          .insert({
            number: formData.number,
            date: formData.date,
            delivery_date: formData.delivery_date,
            vessel_id: formData.vessel_id,
            user_id: profile.id,
            status: "DRAFT",
            is_invoiced: false,
            total_work_details: selectedWorkDetails.length,
          })
          .select()
          .single();

        if (bastpError) throw bastpError;

        // Insert work details
        const workDetailsToInsert = selectedWorkDetails.map((wd) => ({
          bastp_id: bastpData.id,
          work_details_id: wd.id,
        }));

        const { error: workDetailsError } = await supabase
          .from("bastp_work_details")
          .insert(workDetailsToInsert);

        if (workDetailsError) throw workDetailsError;

        // Insert general services (required in create mode)
        if (selectedServices.length > 0) {
          const servicesToInsert = selectedServices.map((service) => ({
            bastp_id: bastpData.id,
            service_type_id: service.service_type_id,
            start_date: service.start_date,
            close_date: service.close_date,
            total_days: service.total_days,
            unit_price: 0,
            payment_price: 0,
            remarks: service.remarks || null,
          }));

          const { error: servicesError } = await supabase
            .from("general_services")
            .insert(servicesToInsert);

          if (servicesError) throw servicesError;
        }

        navigate(`/bastp/${bastpData.id}`);
      }
    } catch (err) {
      console.error("Error saving BASTP:", err);
      setError(err instanceof Error ? err.message : "Failed to save BASTP");
    } finally {
      setSubmitting(false);
    }
  };

  // Filter available work details
  const filteredAvailableWork = availableWorkDetails.filter((wd) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      wd.description?.toLowerCase().includes(searchLower) ||
      wd.work_order?.shipyard_wo_number?.toLowerCase().includes(searchLower) ||
      wd.work_order?.customer_wo_number?.toLowerCase().includes(searchLower)
    );
  });

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {isEditMode ? "Edit BASTP" : "Create New BASTP"}
          </h1>
          <p className="text-gray-600 mt-2">
            {isEditMode
              ? "Update BASTP details and work items"
              : "Create work handover document"}
          </p>
        </div>
        <button
          onClick={() => navigate("/bastp")}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
        >
          <ArrowLeft className="w-4 h-4" /> Back to BASTP List
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* BASTP Information */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5" /> BASTP Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                BASTP Number *
              </label>
              <input
                type="text"
                value={formData.number}
                onChange={(e) =>
                  setFormData({ ...formData, number: e.target.value })
                }
                placeholder="e.g., BASTP/2024/001"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Vessel *
              </label>
              <select
                value={formData.vessel_id}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    vessel_id: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
                disabled={isEditMode && selectedWorkDetails.length > 0}
              >
                <option value={0}>Select Vessel</option>
                {vessels.map((vessel) => (
                  <option key={vessel.id} value={vessel.id}>
                    {vessel.name} - {vessel.type} ({vessel.company})
                  </option>
                ))}
              </select>
              {isEditMode && selectedWorkDetails.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Cannot change vessel after adding work details
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                BASTP Date *
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Delivery Date *
              </label>
              <input
                type="date"
                value={formData.delivery_date}
                onChange={(e) =>
                  setFormData({ ...formData, delivery_date: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>
        </div>

        {/* General Services Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Wrench className="w-5 h-5" /> General Services
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Select the general services used for this vessel and specify the
              number of days
            </p>
          </div>

          {loadingServiceTypes ? (
            <div className="text-center py-8">
              <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
              <p className="text-gray-600 mt-2">Loading services...</p>
            </div>
          ) : serviceTypes.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No service types available</p>
              <button
                type="button"
                onClick={() => fetchServiceTypes()}
                className="mt-2 flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm mx-auto"
              >
                <RefreshCw className="w-4 h-4" /> Retry Loading
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {serviceTypes.map((serviceType) => {
                const isSelected = selectedServices.some(
                  (s) => s.service_type_id === serviceType.id,
                );
                const serviceData = selectedServices.find(
                  (s) => s.service_type_id === serviceType.id,
                );

                return (
                  <div
                    key={serviceType.id}
                    className={`border rounded-lg p-4 transition-colors ${
                      isSelected
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Checkbox */}
                      <div className="flex items-center pt-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleService(serviceType.id)}
                          className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Service Info */}
                      <div className="flex-1">
                        <label className="font-medium text-gray-900 cursor-pointer">
                          {serviceType.service_name}
                        </label>

                        {/* Days Input - Only show if selected */}
                        {isSelected && (
                          <>
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Start Date{" "}
                                  <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="date"
                                  value={serviceData?.start_date || ""}
                                  onChange={(e) =>
                                    handleServiceStartDateChange(
                                      serviceType.id,
                                      e.target.value,
                                    )
                                  }
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Close Date{" "}
                                  <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="date"
                                  value={serviceData?.close_date || ""}
                                  onChange={(e) =>
                                    handleServiceCloseDateChange(
                                      serviceType.id,
                                      e.target.value,
                                    )
                                  }
                                  min={serviceData?.start_date} // HTML5 validation
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  required
                                />
                                {/* ✅ ADD: Warning for invalid date */}
                                {serviceData?.start_date &&
                                  serviceData?.close_date &&
                                  new Date(serviceData.close_date) <
                                    new Date(serviceData.start_date) && (
                                    <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3" />{" "}
                                      Close date cannot be before start date
                                    </p>
                                  )}
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Total Days
                                </label>
                                <input
                                  type="number"
                                  value={serviceData?.total_days || 0}
                                  readOnly
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
                                  placeholder="Auto-calculated"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                  Auto-calculated from dates
                                </p>
                              </div>
                            </div>
                            <div className="mt-3">
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Remarks (Optional)
                              </label>
                              <input
                                type="text"
                                value={serviceData?.remarks || ""}
                                onChange={(e) =>
                                  handleServiceRemarksChange(
                                    serviceType.id,
                                    e.target.value,
                                  )
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Add notes..."
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Summary */}
          {selectedServices.length > 0 && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Selected{" "}
                {selectedServices.length} service(s) • Total Days:{" "}
                {selectedServices.reduce((sum, s) => sum + s.total_days, 0)}
              </p>
            </div>
          )}

          {/* No services selected warning */}
          {selectedServices.length === 0 &&
            !loadingServiceTypes &&
            serviceTypes.length > 0 && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {isEditMode
                    ? "No general services selected."
                    : "Please select at least one general service"}
                </p>
              </div>
            )}
        </div>

        {/* Document Upload (Edit Mode Only) */}
        {isEditMode && existingBastp && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" /> BASTP Document
            </h2>
            {existingBastp.document_url ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-green-900">
                      Document Uploaded
                    </p>
                    <p className="text-xs text-green-700">
                      Uploaded on:{" "}
                      {existingBastp.bastp_upload_date
                        ? new Date(
                            existingBastp.bastp_upload_date,
                          ).toLocaleDateString()
                        : "Unknown"}
                    </p>
                  </div>
                  <a
                    href={existingBastp.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
                  >
                    View Document <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Replace Document
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleDocumentUpload}
                    disabled={uploadingDocument}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload Signed Document
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleDocumentUpload}
                  disabled={uploadingDocument}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload the signed BASTP document (PDF, JPG, or PNG)
                </p>
              </div>
            )}
            {uploadingDocument && (
              <div className="flex items-center gap-2 text-blue-600 mt-2">
                <Loader className="w-4 h-4 animate-spin" />
                <span className="text-sm">Uploading document...</span>
              </div>
            )}
          </div>
        )}

        {/* Work Details Selection */}
        {formData.vessel_id > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Available Work Details */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" /> Available
                Work Details ({filteredAvailableWork.length})
              </h2>
              <div className="mb-4">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search work details..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredAvailableWork.length > 0 ? (
                  filteredAvailableWork.map((wd) => (
                    <div
                      key={wd.id}
                      className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {wd.description.substring(0, 60)}
                            {wd.description.length > 60 ? "..." : ""}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500">
                              WO: {wd.work_order?.shipyard_wo_number}
                            </span>
                            {wd.is_verified && (
                              <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                <CheckCircle2 className="w-3 h-3" /> Verified
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddWorkDetail(wd)}
                          className="ml-2 text-blue-600 hover:text-blue-800"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm text-center py-8">
                    No available work details for this vessel
                  </p>
                )}
              </div>
            </div>

            {/* Selected Work Details */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileEdit className="w-5 h-5 text-blue-600" /> Selected Work
                Details ({selectedWorkDetails.length})
              </h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {selectedWorkDetails.length > 0 ? (
                  selectedWorkDetails.map((wd) => (
                    <div
                      key={wd.id}
                      className="p-3 border border-blue-200 bg-blue-50 rounded-lg"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {wd.description.substring(0, 60)}
                            {wd.description.length > 60 ? "..." : ""}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500">
                              WO: {wd.work_order?.shipyard_wo_number}
                            </span>
                            <span className="text-xs text-gray-500">
                              {wd.quantity} {wd.uom}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveWorkDetail(wd)}
                          className="ml-2 text-red-600 hover:text-red-800"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm text-center py-8">
                    No work details selected yet
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Submit Buttons */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting || selectedWorkDetails.length === 0}
            className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {submitting
              ? "Saving..."
              : isEditMode
                ? "Update BASTP"
                : "Create BASTP"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/bastp")}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
