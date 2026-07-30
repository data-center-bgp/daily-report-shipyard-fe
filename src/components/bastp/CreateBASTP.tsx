import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  supabase,
  type Vessel,
  type WorkDetails,
  type WorkProgress,
} from "../../lib/supabase";
import type { BASTP } from "../../types/bastp.types";
import { useAuth } from "../../hooks/useAuth";
import {
  getLatestVerificationByWorkDetails,
  isApproved,
  isOpenForRework,
} from "../../utils/workVerificationStatus";
import { getLatestProgressRecord } from "../../utils/progressPercentage";
import { suggestBastpNumber } from "../../utils/bastpNumbering";
import type {
  GeneralServiceType,
  GeneralServiceInput,
} from "../../types/generalService.types";
import { ActivityLogService } from "../../services/activityLogService";
import {
  AlertTriangle,
  ArrowLeft,
  FileText,
  Wrench,
  RefreshCw,
  CheckCircle2,
  Plus,
  X,
  FileEdit,
  Search,
  Loader,
  Undo2,
  Ban,
  Lock,
  Ship,
  FolderKanban,
} from "lucide-react";

interface ProjectOption {
  id: number;
  project_name: string;
  vessel_id: number;
}

interface WorkOrderOption {
  id: number;
  shipyard_wo_number: string;
  customer_wo_number?: string;
  vessel_id: number;
  project_id: number | null;
}

interface WorkDetailsWithProgress extends WorkDetails {
  current_progress?: number;
  has_progress_data?: boolean;
  latest_progress_date?: string;
  work_order?: {
    id: number;
    shipyard_wo_number: string;
    customer_wo_number: string;
    vessel?: Vessel;
    project?: { id: number; project_name: string };
  };
  location?: {
    id: number;
    location: string;
  };
  is_verified?: boolean;
  isOpenForRework?: boolean;
}

export default function CreateBASTP() {
  const navigate = useNavigate();
  const { bastpId } = useParams<{ bastpId: string }>();
  const isEditMode = !!bastpId;
  const { isBastpReadOnly, profile } = useAuth();
  // FINANCE consumes BASTPs to create invoices — it shouldn't create/edit
  // their composition. Kept only for the message text below; the actual gate
  // is isBastpReadOnly (MANAGER + FINANCE + OP_HEAD).
  const isFinanceReadOnly = profile?.role === "FINANCE";
  const canEditBastp = !isBastpReadOnly;

  // Form states
  const [formData, setFormData] = useState({
    number: "",
    date: new Date().toISOString().split("T")[0],
    vessel_id: 0,
  });

  // Data states
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderOption[]>([]);
  const [availableWorkDetails, setAvailableWorkDetails] = useState<
    WorkDetailsWithProgress[]
  >([]);
  const [selectedWorkDetails, setSelectedWorkDetails] = useState<
    WorkDetailsWithProgress[]
  >([]);
  const [existingBastp, setExistingBastp] = useState<BASTP | null>(null);
  // The work-detail composition as loaded, so we can tell at submit time
  // whether it actually changed and the BASTP needs to go back to DRAFT
  // for re-verification.
  const [initialWorkDetailIds, setInitialWorkDetailIds] = useState<
    Set<number>
  >(new Set());

  // Once a BASTP is ready for (or already) invoicing, its composition and
  // materials are financially committed and shouldn't change anymore —
  // matches the same lock in BASTPDetails.tsx.
  const isLocked =
    isEditMode &&
    (existingBastp?.status === "READY_FOR_INVOICE" ||
      existingBastp?.status === "INVOICED");

  // UI states
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Vessel is locked once work details are selected — the vessel and the
  // project/work-order "find" fields below all share that same lock, since
  // picking any of them can change which vessel the BASTP is scoped to.
  const [vesselSearchTerm, setVesselSearchTerm] = useState("");
  const [showVesselDropdown, setShowVesselDropdown] = useState(false);
  const vesselDropdownRef = useRef<HTMLDivElement>(null);

  const [selectedProjectId, setSelectedProjectId] = useState<number>(0);
  const [projectSearchTerm, setProjectSearchTerm] = useState("");
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<number>(0);
  const [workOrderSearchTerm, setWorkOrderSearchTerm] = useState("");
  const [showWorkOrderDropdown, setShowWorkOrderDropdown] = useState(false);
  const workOrderDropdownRef = useRef<HTMLDivElement>(null);

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

  // Fetch projects (for the "find by project" search — each project belongs
  // to exactly one vessel, so picking one can auto-select the vessel)
  const fetchProjects = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("id, project_name, vessel_id")
        .is("deleted_at", null)
        .order("project_name", { ascending: true });

      if (error) throw error;
      setProjects(data || []);
    } catch (err) {
      console.error("Error fetching projects:", err);
    }
  }, []);

  // Fetch work orders (for the "find by work order" search — same
  // one-vessel-per-record reasoning as projects, plus a project_id to also
  // resolve the project)
  const fetchWorkOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("work_order")
        .select("id, shipyard_wo_number, customer_wo_number, vessel_id, project_id")
        .is("deleted_at", null)
        .order("shipyard_wo_number", { ascending: true });

      if (error) throw error;
      setWorkOrders(data || []);
    } catch (err) {
      console.error("Error fetching work orders:", err);
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
        vessel_id: data.vessel_id,
      });

      // Set selected work details
      const workDetailsFromBastp =
        data.bastp_work_details?.map((bwd: any) => bwd.work_details) || [];
      setSelectedWorkDetails(workDetailsFromBastp);
      setInitialWorkDetailIds(
        new Set(workDetailsFromBastp.map((wd: { id: number }) => wd.id)),
      );

      // Set selected general services. Some BASTPs have leftover duplicate
      // rows for the same service_type_id (pre-existing data issue) — if
      // loaded as-is, the edit form's delete-then-reinsert-on-save would
      // perpetuate them forever, and downstream invoice pricing would count
      // that service's price twice. Keep only the first row per service type.
      const seenServiceTypes = new Set<number>();
      const servicesFromBastp = (data.general_services || [])
        .filter((gs: any) => {
          if (seenServiceTypes.has(gs.service_type_id)) return false;
          seenServiceTypes.add(gs.service_type_id);
          return true;
        })
        .map((gs: any) => ({
          service_type_id: gs.service_type_id,
          start_date: gs.start_date || new Date().toISOString().split("T")[0],
          close_date: gs.close_date || new Date().toISOString().split("T")[0],
          total_days: gs.total_days,
          remarks: gs.remarks || "",
        }));
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
            ),
            project:project_id (
              id,
              project_name
            )
          ),
          work_progress (
            progress_percentage,
            report_date,
            created_at
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
          const progressRecords: WorkProgress[] = wd.work_progress || [];
          if (progressRecords.length === 0) {
            return { ...wd, current_progress: 0, has_progress_data: false };
          }

          const latestRecord = getLatestProgressRecord(progressRecords);
          const latestProgress = latestRecord?.progress_percentage || 0;
          const latestProgressDate = latestRecord?.report_date;
          const latestProgressCreatedAt = progressRecords.reduce(
            (latest: string | undefined, p: { created_at: string }) =>
              !latest ||
              new Date(p.created_at).getTime() > new Date(latest).getTime()
                ? p.created_at
                : latest,
            undefined,
          );

          return {
            ...wd,
            current_progress: latestProgress,
            has_progress_data: true,
            latest_progress_date: latestProgressDate,
            latest_progress_created_at: latestProgressCreatedAt,
          };
        })
        // Cancelled items skip the 100%-complete requirement entirely —
        // they'll never be worked on, but PPIC can still add them to a
        // BASTP (at zero invoice price) for record-keeping.
        .filter((wd) => wd.current_progress === 100 || wd.cancelled_at);

      // Check which work details are approved — the latest review per work
      // detail decides this, not just "does a work_verification row exist,"
      // since a rejected item can later be approved after rework.
      const { data: verifications, error: verError } = await supabase
        .from("work_verification")
        .select("work_details_id, status, created_at")
        .is("deleted_at", null);

      if (verError) throw verError;

      const latestVerificationByWorkDetails = getLatestVerificationByWorkDetails(
        verifications || [],
      );

      // Mark verified / sent-back-for-rework work details
      const workWithVerification = completedWork.map((wd) => ({
        ...wd,
        is_verified: isApproved(latestVerificationByWorkDetails.get(wd.id)),
        isOpenForRework: isOpenForRework(
          latestVerificationByWorkDetails.get(wd.id),
          wd.latest_progress_created_at,
        ),
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

      // Load vessels, projects, work orders, and service types in parallel
      await Promise.all([
        fetchVessels(),
        fetchProjects(),
        fetchWorkOrders(),
        fetchServiceTypes(),
      ]);

      // Then load BASTP data (which depends on service types being loaded)
      if (isEditMode) {
        await fetchExistingBastp();
      }

      setLoading(false);
    };

    loadData();
  }, [
    fetchVessels,
    fetchProjects,
    fetchWorkOrders,
    fetchServiceTypes,
    fetchExistingBastp,
    isEditMode,
  ]);

  // Auto-generate the BASTP number from its date, same convention as the
  // Work Order number — locked/read-only in create mode (see the input
  // below); edit mode leaves it manually editable, pre-filled from the
  // loaded row.
  useEffect(() => {
    if (isEditMode || !formData.date) return;

    let cancelled = false;
    suggestBastpNumber(formData.date)
      .then((number) => {
        if (!cancelled) {
          setFormData((prev) => ({ ...prev, number }));
        }
      })
      .catch((err) => {
        console.error("Error suggesting BASTP number:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [isEditMode, formData.date]);

  // Pre-fill the vessel search box once vessels are loaded and a vessel_id
  // is already set (edit mode, or right after a project/work-order pick).
  useEffect(() => {
    if (formData.vessel_id && vessels.length > 0 && !vesselSearchTerm) {
      const vessel = vessels.find((v) => v.id === formData.vessel_id);
      if (vessel) {
        setVesselSearchTerm(`${vessel.name} - ${vessel.type} (${vessel.company})`);
      }
    }
  }, [formData.vessel_id, vessels, vesselSearchTerm]);

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

  // Close the vessel/project/work-order search dropdowns on an outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        vesselDropdownRef.current &&
        !vesselDropdownRef.current.contains(event.target as Node)
      ) {
        setShowVesselDropdown(false);
      }
      if (
        projectDropdownRef.current &&
        !projectDropdownRef.current.contains(event.target as Node)
      ) {
        setShowProjectDropdown(false);
      }
      if (
        workOrderDropdownRef.current &&
        !workOrderDropdownRef.current.contains(event.target as Node)
      ) {
        setShowWorkOrderDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredVesselsForSearch = vessels.filter((vessel) => {
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
    if (formData.vessel_id) {
      setFormData((prev) => ({ ...prev, vessel_id: 0 }));
    }
  };

  const handleVesselSelectFromDropdown = (vessel: Vessel) => {
    setFormData((prev) => ({ ...prev, vessel_id: vessel.id }));
    setVesselSearchTerm(`${vessel.name} - ${vessel.type} (${vessel.company})`);
    setShowVesselDropdown(false);

    // A stale project/WO pick that belongs to a different vessel would be
    // confusing left in place — clear it.
    if (
      selectedProjectId &&
      projects.find((p) => p.id === selectedProjectId)?.vessel_id !== vessel.id
    ) {
      handleClearProjectSearch();
    }
    if (
      selectedWorkOrderId &&
      workOrders.find((w) => w.id === selectedWorkOrderId)?.vessel_id !==
        vessel.id
    ) {
      handleClearWorkOrderSearch();
    }
  };

  const handleClearVesselSearch = () => {
    setVesselSearchTerm("");
    setFormData((prev) => ({ ...prev, vessel_id: 0 }));
    setShowVesselDropdown(false);
    handleClearProjectSearch();
    handleClearWorkOrderSearch();
  };

  const handleProjectSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProjectSearchTerm(e.target.value);
    setShowProjectDropdown(true);
    if (selectedProjectId) setSelectedProjectId(0);
  };

  const handleProjectSelectFromDropdown = (project: ProjectOption) => {
    setSelectedProjectId(project.id);
    setProjectSearchTerm(project.project_name);
    setShowProjectDropdown(false);

    // A project belongs to exactly one vessel — auto-select it so users can
    // reach the right BASTP scope by project instead of hunting through the
    // vessel list, as long as the vessel isn't already locked by chosen
    // work details.
    if (
      selectedWorkDetails.length === 0 &&
      project.vessel_id !== formData.vessel_id
    ) {
      const vessel = vessels.find((v) => v.id === project.vessel_id);
      setFormData((prev) => ({ ...prev, vessel_id: project.vessel_id }));
      setVesselSearchTerm(
        vessel ? `${vessel.name} - ${vessel.type} (${vessel.company})` : "",
      );
      if (selectedWorkOrderId) handleClearWorkOrderSearch();
    }
  };

  const handleClearProjectSearch = () => {
    setProjectSearchTerm("");
    setSelectedProjectId(0);
    setShowProjectDropdown(false);
  };

  const handleWorkOrderSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWorkOrderSearchTerm(e.target.value);
    setShowWorkOrderDropdown(true);
    if (selectedWorkOrderId) setSelectedWorkOrderId(0);
  };

  const handleWorkOrderSelectFromDropdown = (workOrder: WorkOrderOption) => {
    setSelectedWorkOrderId(workOrder.id);
    setWorkOrderSearchTerm(workOrder.shipyard_wo_number || "");
    setShowWorkOrderDropdown(false);

    if (selectedWorkDetails.length === 0) {
      if (workOrder.vessel_id !== formData.vessel_id) {
        const vessel = vessels.find((v) => v.id === workOrder.vessel_id);
        setFormData((prev) => ({ ...prev, vessel_id: workOrder.vessel_id }));
        setVesselSearchTerm(
          vessel ? `${vessel.name} - ${vessel.type} (${vessel.company})` : "",
        );
      }
      if (workOrder.project_id && workOrder.project_id !== selectedProjectId) {
        const project = projects.find((p) => p.id === workOrder.project_id);
        setSelectedProjectId(workOrder.project_id);
        setProjectSearchTerm(project?.project_name || "");
      }
    }
  };

  const handleClearWorkOrderSearch = () => {
    setWorkOrderSearchTerm("");
    setSelectedWorkOrderId(0);
    setShowWorkOrderDropdown(false);
  };

  // Project/work-order "find" dropdowns are scoped to the selected vessel
  // once one is set, so they only ever offer choices that are actually
  // reachable — otherwise they show everything, to help locate the vessel.
  const filteredProjectsForSearch = projects
    .filter((p) => !formData.vessel_id || p.vessel_id === formData.vessel_id)
    .filter((p) =>
      p.project_name.toLowerCase().includes(projectSearchTerm.toLowerCase()),
    );

  const filteredWorkOrdersForSearch = workOrders
    .filter((wo) => !formData.vessel_id || wo.vessel_id === formData.vessel_id)
    .filter((wo) => !selectedProjectId || wo.project_id === selectedProjectId)
    .filter((wo) => {
      const searchLower = workOrderSearchTerm.toLowerCase();
      return (
        wo.shipyard_wo_number?.toLowerCase().includes(searchLower) ||
        wo.customer_wo_number?.toLowerCase().includes(searchLower)
      );
    });

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

      const { data: userProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();

      if (!userProfile) throw new Error("User profile not found");

      if (isEditMode && bastpId) {
        // ========== UPDATE MODE ==========
        // If the work-detail composition changed, the BASTP needs to go
        // back through review — don't let it stay VERIFIED (or beyond) for
        // items nobody has approved yet.
        const currentIds = new Set(selectedWorkDetails.map((wd) => wd.id));
        const compositionChanged =
          currentIds.size !== initialWorkDetailIds.size ||
          [...currentIds].some((id) => !initialWorkDetailIds.has(id));

        const { error: updateError } = await supabase
          .from("bastp")
          .update({
            number: formData.number,
            date: formData.date,
            vessel_id: formData.vessel_id,
            total_work_details: selectedWorkDetails.length,
            ...(compositionChanged ? { status: "DRAFT" } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", bastpId);

        if (updateError) throw updateError;

        // Only touch rows for work details that actually left or joined the
        // composition — a blanket delete-then-reinsert would also wipe the
        // materials_status of every unchanged work detail on each edit,
        // even ones that don't touch composition at all (e.g. just editing
        // the BASTP date or general services).
        const removedIds = [...initialWorkDetailIds].filter(
          (id) => !currentIds.has(id),
        );
        const addedIds = [...currentIds].filter(
          (id) => !initialWorkDetailIds.has(id),
        );

        if (removedIds.length > 0) {
          const { error: removeError } = await supabase
            .from("bastp_work_details")
            .delete()
            .eq("bastp_id", bastpId)
            .in("work_details_id", removedIds);

          if (removeError) throw removeError;
        }

        if (addedIds.length > 0) {
          const { error: workDetailsError } = await supabase
            .from("bastp_work_details")
            .insert(
              addedIds.map((id) => ({
                bastp_id: parseInt(bastpId),
                work_details_id: id,
              })),
            );

          if (workDetailsError) throw workDetailsError;
        }

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

        // Log the activity for update
        await ActivityLogService.logActivity({
          action: "update",
          tableName: "bastp",
          recordId: parseInt(bastpId),
          oldData: existingBastp || undefined,
          newData: { ...formData, id: parseInt(bastpId) },
          description: `Updated BASTP ${formData.number}`,
        });

        navigate(`/bastp/${bastpId}`);
      } else {
        // ========== CREATE MODE ==========
        const { data: bastpData, error: bastpError } = await supabase
          .from("bastp")
          .insert({
            number: formData.number,
            date: formData.date,
            vessel_id: formData.vessel_id,
            user_id: userProfile.id,
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

        // Log the activity for create
        await ActivityLogService.logActivity({
          action: "create",
          tableName: "bastp",
          recordId: bastpData.id,
          newData: bastpData,
          description: `Created BASTP ${bastpData.number}`,
        });

        navigate(`/bastp/${bastpData.id}`);
      }
    } catch (err) {
      console.error("Error saving BASTP:", err);
      setError(err instanceof Error ? err.message : "Failed to save BASTP");
    } finally {
      setSubmitting(false);
    }
  };

  // Filter available work details — vessel is already applied server-side by
  // fetchAvailableWorkDetails; project/work-order/text narrow it further.
  const filteredAvailableWork = availableWorkDetails.filter((wd) => {
    if (selectedProjectId && wd.work_order?.project?.id !== selectedProjectId) {
      return false;
    }
    if (selectedWorkOrderId && wd.work_order?.id !== selectedWorkOrderId) {
      return false;
    }
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

  if (!canEditBastp) {
    return (
      <div className="p-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 flex items-start gap-3">
          <Lock className="w-6 h-6 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="text-yellow-900 font-medium">
              You don't have permission to {isEditMode ? "edit" : "create"}{" "}
              BASTPs.
            </p>
            <p className="text-sm text-yellow-700 mt-1">
              {isFinanceReadOnly
                ? "Finance has view access to BASTPs for invoicing, but can't change their composition."
                : "Your role only has view access here."}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate("/bastp")}
          className="mt-4 flex items-center gap-2 text-blue-600 hover:text-blue-800"
        >
          <ArrowLeft className="w-4 h-4" /> Back to BASTP List
        </button>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="p-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 flex items-start gap-3">
          <Lock className="w-6 h-6 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="text-yellow-900 font-medium">
              This BASTP is locked from further edits.
            </p>
            <p className="text-sm text-yellow-700 mt-1">
              It's already{" "}
              {existingBastp?.status === "INVOICED"
                ? "invoiced"
                : "ready for invoicing"}
              , so its composition and materials are financially committed
              and can't be changed here.
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate(`/bastp/${bastpId}`)}
          className="mt-4 flex items-center gap-2 text-blue-600 hover:text-blue-800"
        >
          <ArrowLeft className="w-4 h-4" /> Back to BASTP Details
        </button>
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
                placeholder={
                  isEditMode
                    ? "e.g., BASTP/2024/001"
                    : "Pick a BASTP Date to generate this number"
                }
                readOnly={!isEditMode}
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  !isEditMode ? "bg-gray-100 text-gray-600 cursor-not-allowed" : ""
                }`}
                required
              />
              {!isEditMode && (
                <p className="text-xs text-gray-500 mt-1">
                  Auto-generated from the BASTP Date below. Need to change
                  it? Edit the BASTP after creating it.
                </p>
              )}
            </div>

            <div className="relative" ref={projectDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <FolderKanban className="w-4 h-4" /> Find by Project
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={projectSearchTerm}
                  onChange={handleProjectSearch}
                  onFocus={() =>
                    selectedWorkDetails.length === 0 &&
                    setShowProjectDropdown(true)
                  }
                  placeholder="Search project (optional)..."
                  disabled={selectedWorkDetails.length > 0}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                {projectSearchTerm && selectedWorkDetails.length === 0 && (
                  <button
                    type="button"
                    onClick={handleClearProjectSearch}
                    className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {showProjectDropdown &&
                selectedWorkDetails.length === 0 &&
                filteredProjectsForSearch.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredProjectsForSearch.map((project) => (
                      <div
                        key={project.id}
                        onClick={() => handleProjectSelectFromDropdown(project)}
                        className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                          selectedProjectId === project.id ? "bg-blue-100" : ""
                        }`}
                      >
                        <div className="font-medium text-gray-900 text-sm">
                          {project.project_name}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              <p className="text-xs text-gray-500 mt-1">
                Optional — picking a project auto-selects its vessel
              </p>
            </div>

            <div className="relative" ref={vesselDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Ship className="w-4 h-4" /> Vessel *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={vesselSearchTerm}
                  onChange={handleVesselSearch}
                  onFocus={() =>
                    selectedWorkDetails.length === 0 &&
                    setShowVesselDropdown(true)
                  }
                  placeholder="Search vessel..."
                  disabled={selectedWorkDetails.length > 0}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                {vesselSearchTerm && selectedWorkDetails.length === 0 && (
                  <button
                    type="button"
                    onClick={handleClearVesselSearch}
                    className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {showVesselDropdown &&
                selectedWorkDetails.length === 0 &&
                filteredVesselsForSearch.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredVesselsForSearch.map((vessel) => (
                      <div
                        key={vessel.id}
                        onClick={() => handleVesselSelectFromDropdown(vessel)}
                        className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                          formData.vessel_id === vessel.id ? "bg-blue-100" : ""
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
              {selectedWorkDetails.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Cannot change vessel after adding work details — remove them
                  first
                </p>
              )}
            </div>

            <div className="relative" ref={workOrderDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <FileText className="w-4 h-4" /> Find by Work Order
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={workOrderSearchTerm}
                  onChange={handleWorkOrderSearch}
                  onFocus={() =>
                    selectedWorkDetails.length === 0 &&
                    setShowWorkOrderDropdown(true)
                  }
                  placeholder="Search WO number (optional)..."
                  disabled={selectedWorkDetails.length > 0}
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                {workOrderSearchTerm && selectedWorkDetails.length === 0 && (
                  <button
                    type="button"
                    onClick={handleClearWorkOrderSearch}
                    className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {showWorkOrderDropdown &&
                selectedWorkDetails.length === 0 &&
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
                          {workOrder.customer_wo_number}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              <p className="text-xs text-gray-500 mt-1">
                Optional — picking a work order auto-selects its vessel and
                project, and narrows the work details below
              </p>
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
                {calculateTotalDays(
                  selectedServices.reduce(
                    (min, s) => (s.start_date < min ? s.start_date : min),
                    selectedServices[0].start_date,
                  ),
                  selectedServices.reduce(
                    (max, s) => (s.close_date > max ? s.close_date : max),
                    selectedServices[0].close_date,
                  ),
                )}{" "}
                <span className="text-blue-700">
                  (earliest start to latest close, across all services)
                </span>
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
                            {wd.isOpenForRework && (
                              <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                                <Undo2 className="w-3 h-3" /> Needs Rework
                              </span>
                            )}
                            {wd.cancelled_at && (
                              <span className="inline-flex items-center gap-1 text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                                <Ban className="w-3 h-3" /> Cancelled
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
