import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { uploadProgressEvidence } from "../../utils/progressEvidenceHandler";
import { ActivityLogService } from "../../services/activityLogService";
import {
  sanitizeProgressPercentageInput,
  parseProgressPercentage,
  isValidProgressPercentage,
  formatProgressPercentage,
  getLatestProgressRecord,
} from "../../utils/progressPercentage";
import { isOpenForRework } from "../../utils/workVerificationStatus";
import {
  FileText,
  Ship,
  Wrench,
  BarChart3,
  Calendar,
  FileEdit,
  Image,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  X,
  MapPin,
  User,
  FolderKanban,
  Undo2,
} from "lucide-react";

interface AddWorkProgressProps {
  workDetailsId?: number;
}

interface VesselFormData {
  id: number;
  name: string;
  type: string;
  company: string;
}

interface KaproFormData {
  id: number;
  kapro_name: string;
}

interface ProjectFormData {
  id: number;
  project_name: string;
}

interface WorkOrderFormData {
  id: number;
  shipyard_wo_number: string;
  shipyard_wo_date: string;
  vessel?: VesselFormData;
  kapro?: KaproFormData;
  project?: ProjectFormData;
}

interface WorkDetailsFormData {
  id: number;
  description: string;
  location?: {
    id: number;
    location: string;
  };
  pic: string;
  current_progress: number;
  // True when this item was sent back for rework and hasn't been
  // resubmitted yet — it stays selectable in the picker even though it's
  // at 100%, unlike other fully-complete items.
  isOpenForRework: boolean;
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

  // Every work order is fetched up front (joined with its vessel + Kapro),
  // so the picker below can search across vessel name / WO number directly
  // instead of forcing a Kapro-first, vessel-second cascade — Kapro is now
  // required on every work order, so it's just context, not a filter step.
  const [workOrders, setWorkOrders] = useState<WorkOrderFormData[]>([]);
  const [workDetailsList, setWorkDetailsList] = useState<WorkDetailsFormData[]>(
    [],
  );

  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<number>(0);
  const [selectedWorkDetailsId, setSelectedWorkDetailsId] = useState<number>(
    effectiveWorkDetailsId || 0,
  );

  // Highest progress percentage already recorded for the selected work
  // detail (across every entry point into this form, not just the one that
  // happens to pass it via navigation state) — null while unknown/loading.
  const [currentMaxProgress, setCurrentMaxProgress] = useState<number | null>(
    null,
  );

  // Whether the selected work detail was sent back for rework and hasn't
  // been resubmitted yet — lifts the "already at 100%" lock specifically
  // for this item, and reworkNotes carries the reviewer's reason to show
  // as a banner.
  const [isReworkReopen, setIsReworkReopen] = useState(false);
  const [reworkNotes, setReworkNotes] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    progress_percentage: "",
    report_date: new Date().toISOString().split("T")[0],
    notes: "",
    evidence_file: null as File | null,
  });

  const [loadingWorkOrders, setLoadingWorkOrders] = useState(false);
  const [loadingWorkDetails, setLoadingWorkDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optional narrowing filter on top of the Work Order search — picking a
  // project restricts the search below to that project's work orders.
  const [projectFilterId, setProjectFilterId] = useState<number>(0);
  const [projectSearchTerm, setProjectSearchTerm] = useState("");
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  const [workOrderSearchTerm, setWorkOrderSearchTerm] = useState("");
  const [showWorkOrderDropdown, setShowWorkOrderDropdown] = useState(false);
  const workOrderDropdownRef = useRef<HTMLDivElement>(null);

  const [workDetailsSearchTerm, setWorkDetailsSearchTerm] = useState("");
  const [showWorkDetailsDropdown, setShowWorkDetailsDropdown] = useState(false);
  const workDetailsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAllWorkOrders();

    if (effectiveWorkDetailsId) {
      fetchWorkDetailsContext(effectiveWorkDetailsId);
    }
  }, [effectiveWorkDetailsId]);

  useEffect(() => {
    if (selectedWorkOrderId > 0) {
      fetchWorkDetails(selectedWorkOrderId);
    } else {
      setWorkDetailsList([]);
      setSelectedWorkDetailsId(effectiveWorkDetailsId || 0);
    }
  }, [selectedWorkOrderId, effectiveWorkDetailsId]);

  // Look up the current max progress for whichever work detail ends up
  // selected, then use it to suggest a sensible next value and to guard
  // against regressing or over-reporting past 100%.
  useEffect(() => {
    if (!selectedWorkDetailsId) {
      setCurrentMaxProgress(null);
      setIsReworkReopen(false);
      setReworkNotes(null);
      return;
    }

    let cancelled = false;

    const fetchGuardState = async () => {
      try {
        const [progressResult, verificationResult] = await Promise.all([
          supabase
            .from("work_progress")
            .select("progress_percentage, report_date, created_at")
            .eq("work_details_id", selectedWorkDetailsId),
          supabase
            .from("work_verification")
            .select("work_details_id, status, created_at, verification_notes")
            .eq("work_details_id", selectedWorkDetailsId)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(1),
        ]);

        if (progressResult.error) throw progressResult.error;
        if (verificationResult.error) throw verificationResult.error;
        if (cancelled) return;

        const progressRows = progressResult.data || [];
        // "Current progress" is the LATEST report by report_date — same
        // convention used everywhere else in the app (Work Details, Work
        // Verification, BASTP). This matters now that rework can regress
        // progress: the historical peak is no longer the same thing as the
        // current state once a rejection is resubmitted below 100%.
        const currentProgress =
          getLatestProgressRecord(progressRows)?.progress_percentage ?? 0;
        const latestProgressCreatedAt = progressRows.reduce(
          (latest: string | undefined, p) =>
            !latest ||
            new Date(p.created_at).getTime() > new Date(latest).getTime()
              ? p.created_at
              : latest,
          undefined,
        );
        setCurrentMaxProgress(currentProgress);

        const latestVerification = verificationResult.data?.[0];
        const openForRework = isOpenForRework(
          latestVerification,
          latestProgressCreatedAt,
        );
        setIsReworkReopen(openForRework);
        setReworkNotes(
          openForRework ? latestVerification?.verification_notes ?? null : null,
        );

        // No suggested value for a rework reopen — the field is left blank
        // so whoever's fixing it has to deliberately state the real
        // percentage (which may be below 100 if more work remains).
        if (currentProgress > 0 && currentProgress < 100 && !openForRework) {
          const suggested = Math.min(currentProgress + 10, 100);
          setFormData((prev) =>
            prev.progress_percentage === ""
              ? {
                  ...prev,
                  progress_percentage: formatProgressPercentage(suggested),
                }
              : prev,
          );
        }
      } catch (err) {
        console.error("Error fetching current progress/review state:", err);
        if (!cancelled) {
          setCurrentMaxProgress(0);
          setIsReworkReopen(false);
          setReworkNotes(null);
        }
      }
    };

    fetchGuardState();
    return () => {
      cancelled = true;
    };
  }, [selectedWorkDetailsId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
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

  const fetchAllWorkOrders = async () => {
    try {
      setLoadingWorkOrders(true);
      const { data, error } = await supabase
        .from("work_order")
        .select(
          `
          id, shipyard_wo_number, shipyard_wo_date,
          vessel:vessel_id ( id, name, type, company ),
          kapro:kapro_id ( id, kapro_name ),
          project:project_id ( id, project_name )
        `,
        )
        .is("deleted_at", null)
        .order("shipyard_wo_number", { ascending: true });

      if (error) throw error;

      setWorkOrders((data as unknown as WorkOrderFormData[]) || []);
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
        pic,
        work_progress ( progress_percentage, report_date, created_at ),
        work_verification ( status, created_at, deleted_at )
      `,
        )
        .eq("work_order_id", workOrderId)
        .is("deleted_at", null)
        .order("description", { ascending: true });

      if (error) throw error;

      const workDetailsData: WorkDetailsFormData[] = (
        (data || []) as unknown as {
          id: number;
          description: string;
          pic: string;
          location: { id: number; location: string } | { id: number; location: string }[] | null;
          work_progress: {
            progress_percentage: number;
            report_date: string;
            created_at: string;
          }[];
          work_verification: {
            status: "APPROVED" | "REJECTED";
            created_at: string;
            deleted_at: string | null;
          }[];
        }[]
      ).map((item) => {
          const progressRecords = item.work_progress || [];
          // Latest by report_date, not the historical peak — matches the
          // "current progress" convention used everywhere else, and matters
          // now that a rework resubmission can regress below a past 100%.
          const current_progress =
            getLatestProgressRecord(progressRecords)?.progress_percentage ?? 0;
          const latestProgressCreatedAt = progressRecords.reduce(
            (latest: string | undefined, p) =>
              !latest ||
              new Date(p.created_at).getTime() > new Date(latest).getTime()
                ? p.created_at
                : latest,
            undefined,
          );
          const latestVerification = (item.work_verification || [])
            .filter((v) => !v.deleted_at)
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime(),
            )[0];

          return {
            id: item.id,
            description: item.description,
            location:
              (Array.isArray(item.location)
                ? item.location[0]
                : item.location) ?? undefined,
            pic: item.pic,
            current_progress,
            isOpenForRework: isOpenForRework(
              latestVerification,
              latestProgressCreatedAt,
            ),
          };
        },
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
        `,
        )
        .eq("id", workDetailsId)
        .single();

      if (error) throw error;

      const workDetailsContext = data as unknown as WorkDetailsContext;

      if (workDetailsContext?.work_order) {
        setSelectedWorkOrderId(workDetailsContext.work_order.id);
        setWorkOrderSearchTerm(
          workDetailsContext.work_order.shipyard_wo_number || "",
        );
        setSelectedWorkDetailsId(workDetailsId);
      }
    } catch (err) {
      console.error("Error fetching work details context:", err);
      setError("Failed to load work details information");
    }
  };

  const handleProjectSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProjectSearchTerm(e.target.value);
    setShowProjectDropdown(true);
    if (projectFilterId) {
      setProjectFilterId(0);
    }
  };

  const handleProjectSelectFromDropdown = (project: ProjectFormData) => {
    setProjectFilterId(project.id);
    setProjectSearchTerm(project.project_name);
    setShowProjectDropdown(false);
  };

  const handleClearProjectSearch = () => {
    setProjectSearchTerm("");
    setProjectFilterId(0);
    setShowProjectDropdown(false);
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
    workDetails: WorkDetailsFormData,
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
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;

    if (name === "progress_percentage") {
      const sanitized = sanitizeProgressPercentageInput(value);
      if (sanitized !== null) {
        setFormData((prev) => ({ ...prev, progress_percentage: sanitized }));
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

    if (!isValidProgressPercentage(formData.progress_percentage)) {
      setError("Please enter a valid progress percentage between 0 and 100");
      return;
    }

    const progressValue = parseProgressPercentage(
      formData.progress_percentage,
    );

    if (currentMaxProgress !== null) {
      if (currentMaxProgress >= 100 && !isReworkReopen) {
        setError(
          "This work detail has already reached 100% completion — no further progress reports can be added.",
        );
        return;
      }
      // A rework resubmission can honestly regress below the old 100% — the
      // "no regression" floor only applies once it's back in normal tracking
      // (i.e. after this first post-rejection report).
      if (!isReworkReopen && progressValue < currentMaxProgress) {
        setError(
          `Progress can't be lower than the current recorded progress (${formatProgressPercentage(currentMaxProgress)}%). Edit an existing report instead if it needs correcting.`,
        );
        return;
      }
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

      // Get current authenticated user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        console.error("Auth error:", authError);
        throw new Error("User not authenticated. Please log in again.");
      }

      // Get user profile from profiles table using auth_user_id
      const { data: userProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id, name, email")
        .eq("auth_user_id", user.id)
        .single();

      if (profileError) {
        console.error("Profile fetch error:", profileError);

        // If profile doesn't exist, this is a serious issue
        throw new Error(
          "Your user profile was not found. Please contact the administrator to ensure your profile is properly set up.",
        );
      }

      if (!userProfile || !userProfile.id) {
        throw new Error(
          "Invalid user profile. Please contact the administrator.",
        );
      }

      // Insert work progress with the correct user_id from profiles table
      const { data: insertedProgress, error: insertError } = await supabase
        .from("work_progress")
        .insert({
          work_details_id: selectedWorkDetailsId,
          progress_percentage: progressValue,
          report_date: formData.report_date,
          notes: formData.notes.trim() || null,
          evidence_url: evidenceUrl || null,
          storage_path: storagePath || null,
          user_id: userProfile.id,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Insert error:", insertError);
        throw new Error(
          `Failed to create progress report: ${insertError.message}`,
        );
      }

      // Log the activity
      await ActivityLogService.logActivity({
        action: "create",
        tableName: "work_progress",
        recordId: insertedProgress.id,
        newData: insertedProgress,
        description: `Created work progress report (${progressValue}%) for work details ID ${selectedWorkDetailsId}`,
      });

      // Navigate to appropriate page
      if (effectiveWorkDetailsId) {
        navigate(`/work-details/${effectiveWorkDetailsId}/progress`);
      } else {
        navigate("/work-progress");
      }
    } catch (err) {
      console.error("Error creating work progress:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create progress report",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectedWorkOrder = workOrders.find(
    (wo) => wo.id === selectedWorkOrderId,
  );
  const selectedWorkDetails = workDetailsList.find(
    (wd) => wd.id === selectedWorkDetailsId,
  );

  const progressValue = parseProgressPercentage(formData.progress_percentage);
  const isAlreadyComplete =
    currentMaxProgress !== null &&
    currentMaxProgress >= 100 &&
    !isReworkReopen;
  const isBelowCurrentProgress =
    currentMaxProgress !== null &&
    !isReworkReopen &&
    progressValue < currentMaxProgress;
  const isFormValid =
    selectedWorkDetailsId > 0 &&
    formData.report_date &&
    isValidProgressPercentage(formData.progress_percentage) &&
    !isAlreadyComplete &&
    !isBelowCurrentProgress;

  const formatWorkOrderDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Every distinct project among the fetched work orders — projects with no
  // work order yet have nothing to select here, so they're left out.
  const availableProjects = Array.from(
    new Map(
      workOrders
        .filter((wo): wo is WorkOrderFormData & { project: ProjectFormData } =>
          Boolean(wo.project),
        )
        .map((wo) => [wo.project.id, wo.project]),
    ).values(),
  ).sort((a, b) => a.project_name.localeCompare(b.project_name));

  const filteredProjectsForSearch = availableProjects.filter((project) =>
    project.project_name.toLowerCase().includes(projectSearchTerm.toLowerCase()),
  );

  // Filter functions — search across vessel name and WO number together,
  // since the work order carries its vessel and Kapro with it. An optional
  // project filter narrows this further without gating it (Work Order search
  // works with or without a project picked).
  const filteredWorkOrdersForSearch = workOrders.filter((wo) => {
    if (projectFilterId && wo.project?.id !== projectFilterId) return false;

    const searchLower = workOrderSearchTerm.toLowerCase();
    return (
      wo.shipyard_wo_number?.toLowerCase().includes(searchLower) ||
      wo.vessel?.name?.toLowerCase().includes(searchLower)
    );
  });

  const filteredWorkDetailsForSearch = workDetailsList.filter((wd) => {
    // Hide work details that already reached 100% — nothing left to report
    // progress on. Exceptions: the currently-selected item (so a deep link
    // into an already-finished item still shows it) and items sent back for
    // rework, which need to be resubmittable from the normal picker flow.
    if (
      wd.current_progress >= 100 &&
      !wd.isOpenForRework &&
      wd.id !== selectedWorkDetailsId
    ) {
      return false;
    }

    const searchLower = workDetailsSearchTerm.toLowerCase();

    // Handle location search
    let locationMatch = false;
    if (wd.location) {
      locationMatch = (wd.location.location || "")
        .toLowerCase()
        .includes(searchLower);
    }

    return (
      (wd.description || "").toLowerCase().includes(searchLower) ||
      locationMatch ||
      (wd.pic || "").toLowerCase().includes(searchLower)
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
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" /> Work Selection
            </h3>

            {/* Step 1: Select Work Order — a single search across vessel
                name and WO number, since Kapro is now required on every
                work order and just shows up as read-only context below
                instead of being a filter step. */}
            <div className="mb-4">
              {selectedWorkOrder ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <FileText className="w-4 h-4" /> Step 1: Work Order
                  </label>
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-blue-900 text-sm">
                        {selectedWorkOrder.shipyard_wo_number}
                      </div>
                      <div className="text-xs text-blue-700 flex items-center gap-1 mt-0.5">
                        <Ship className="w-3.5 h-3.5" />{" "}
                        {selectedWorkOrder.vessel?.name}
                      </div>
                      {selectedWorkOrder.kapro && (
                        <div className="text-xs text-blue-600 mt-0.5">
                          Kapro: {selectedWorkOrder.kapro.kapro_name}
                        </div>
                      )}
                      {selectedWorkOrder.project && (
                        <div className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                          <FolderKanban className="w-3.5 h-3.5" />{" "}
                          {selectedWorkOrder.project.project_name}
                        </div>
                      )}
                    </div>
                    {!effectiveWorkDetailsId && (
                      <button
                        onClick={handleClearWorkOrderSearch}
                        className="text-blue-400 hover:text-blue-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  {/* Optional Project filter — narrows the Work Order search
                      below without gating it; leave it blank to search every
                      work order. */}
                  <div className="relative mb-3" ref={projectDropdownRef}>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                      <FolderKanban className="w-4 h-4" /> Filter by Project{" "}
                      <span className="text-gray-500 font-normal">
                        (optional)
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={projectSearchTerm}
                        onChange={handleProjectSearch}
                        onFocus={() => setShowProjectDropdown(true)}
                        placeholder="Search project..."
                        disabled={loadingWorkOrders}
                        className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      {projectSearchTerm && (
                        <button
                          onClick={handleClearProjectSearch}
                          className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {showProjectDropdown &&
                      filteredProjectsForSearch.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {filteredProjectsForSearch.map((project) => (
                            <div
                              key={project.id}
                              onClick={() =>
                                handleProjectSelectFromDropdown(project)
                              }
                              className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                                projectFilterId === project.id
                                  ? "bg-blue-100"
                                  : ""
                              }`}
                            >
                              <div className="font-medium text-gray-900 text-sm">
                                {project.project_name}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                  </div>

                  <div className="relative" ref={workOrderDropdownRef}>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                      <FileText className="w-4 h-4" /> Step 1: Select Work
                      Order
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={workOrderSearchTerm}
                        onChange={handleWorkOrderSearch}
                        onFocus={() => setShowWorkOrderDropdown(true)}
                        placeholder="Search by vessel name or WO number..."
                        disabled={loadingWorkOrders}
                        className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      {workOrderSearchTerm && (
                        <button
                          onClick={handleClearWorkOrderSearch}
                          className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Work Order Dropdown */}
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
                              {workOrder.vessel?.name}
                              {workOrder.shipyard_wo_date &&
                                ` • ${formatWorkOrderDate(workOrder.shipyard_wo_date)}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="relative" ref={workDetailsDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Wrench className="w-4 h-4" /> Step 2: Select Work Details
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
                    <X className="w-4 h-4" />
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
                        <div className="text-xs text-gray-600 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />{" "}
                          {typeof workDetails.location === "string"
                            ? workDetails.location || "No location"
                            : workDetails.location?.location ||
                              "No location"}{" "}
                          • <User className="w-3 h-3" /> {workDetails.pic}
                        </div>
                        {workDetails.isOpenForRework && (
                          <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded mt-1">
                            <Undo2 className="w-3 h-3" /> Needs Rework
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

              {showWorkDetailsDropdown &&
                selectedWorkOrderId > 0 &&
                !loadingWorkDetails &&
                filteredWorkDetailsForSearch.length === 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3 text-center text-sm text-gray-500">
                    {workDetailsList.length > 0
                      ? "Every work detail on this work order is already at 100%"
                      : "No work details found"}
                  </div>
                )}
            </div>

            {/* Selection Summary — Vessel/Kapro/WO are already shown in the
                read-only card above once a work order is picked, so this
                only needs to surface the selected work detail. */}
            {selectedWorkDetails && (
              <div className="mt-6 pt-4 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-1">
                  <BarChart3 className="w-4 h-4" /> Selection Summary
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 mt-0.5 flex items-center gap-1">
                      <Wrench className="w-3.5 h-3.5" /> Work Details:
                    </span>
                    <div className="font-medium text-sm leading-tight">
                      <div>{selectedWorkDetails.description}</div>
                      {selectedWorkDetails.location && (
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />{" "}
                          {typeof selectedWorkDetails.location === "string"
                            ? selectedWorkDetails.location
                            : selectedWorkDetails.location.location}
                        </div>
                      )}
                      {selectedWorkDetails.pic && (
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <User className="w-3 h-3" /> PIC:{" "}
                          {selectedWorkDetails.pic}
                        </div>
                      )}
                    </div>
                  </div>

                  {currentMaxProgress !== null && currentMaxProgress > 0 && (
                    <div
                      className={`flex items-center gap-1 mt-2 ${
                        isAlreadyComplete
                          ? "text-green-700"
                          : isReworkReopen
                            ? "text-red-700"
                            : "text-blue-700"
                      }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      Current progress:{" "}
                      {formatProgressPercentage(currentMaxProgress)}%
                      {isAlreadyComplete && " — already complete"}
                      {isReworkReopen && " — sent back for rework"}
                    </div>
                  )}
                </div>

                {isReworkReopen ? (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 flex items-start gap-2">
                    <Undo2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div>
                      This work was sent back for rework by the Operation
                      Head.
                      {reworkNotes && (
                        <div className="mt-1 font-medium">
                          Reason: {reworkNotes}
                        </div>
                      )}
                      <div className="mt-1">
                        Submit a new progress report reflecting the real
                        state of the work — it doesn't have to be 100% if
                        more work remains. It'll go back up for review once
                        it reaches 100% again.
                      </div>
                    </div>
                  </div>
                ) : (
                  isAlreadyComplete && (
                    <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-800 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      This work detail has already reached 100% completion —
                      no further progress reports can be added.
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* Progress Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" /> Progress Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Progress Percentage */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <BarChart3 className="w-4 h-4" /> Progress Percentage *
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
                      {!(progressValue >= 0 && progressValue <= 100) ? (
                        <span className="text-xs text-red-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Must be between
                          0-100
                        </span>
                      ) : isBelowCurrentProgress ? (
                        <span className="text-xs text-red-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Can't be lower
                          than the current progress (
                          {formatProgressPercentage(currentMaxProgress ?? 0)}%)
                        </span>
                      ) : (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Valid percentage
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Report Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <Calendar className="w-4 h-4" /> Report Date *
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
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <FileEdit className="w-4 h-4" /> Notes (Optional)
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
              <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <Image className="w-5 h-5" /> Progress Evidence (Optional)
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
                    <Paperclip className="w-4 h-4 text-blue-600" />
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
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Create Progress
                    Report
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
