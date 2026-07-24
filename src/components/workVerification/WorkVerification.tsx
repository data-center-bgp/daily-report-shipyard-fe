import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  supabase,
  type WorkDetails,
  type WorkOrder,
  type Vessel,
} from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import {
  getLatestVerificationByWorkDetails,
  isApproved,
  isOpenForRework,
  hasRejectionHistory,
  type VerificationRecord,
} from "../../utils/workVerificationStatus";
import { getLatestProgressRecord } from "../../utils/progressPercentage";
import {
  Ship,
  X,
  FileEdit,
  Clock,
  CheckCircle2,
  FileCheck,
  DollarSign,
  FileText,
  Search,
  ArrowLeft,
  MapPin,
  Calendar,
  ChevronRight,
  Eye,
  User,
  AlertTriangle,
  Undo2,
  RotateCcw,
  FolderKanban,
} from "lucide-react";

interface ProjectOption {
  id: number;
  project_name: string;
}

interface WorkOrderOption {
  id: number;
  shipyard_wo_number: string;
  customer_wo_number?: string;
}

interface WorkDetailsWithProgress extends WorkDetails {
  current_progress?: number;
  has_progress_data?: boolean;
  latest_progress_date?: string;
  latest_progress_created_at?: string;
  work_order?: WorkOrder & {
    vessel?: Vessel;
    project?: ProjectOption;
  };
  location?: {
    id: number;
    location: string;
  };
}

interface VerificationWithDetails extends VerificationRecord {
  work_details: WorkDetailsWithProgress;
}

interface WorkProgressItem {
  progress_percentage: number;
  report_date: string;
  created_at: string;
}

interface BASTPs {
  id: number;
  number: string;
  date: string;
  delivery_date: string;
  status: string;
  vessel_id: number;
  vessel?: {
    id: number;
    name: string;
    type: string;
    company: string;
  };
}

export default function WorkVerification() {
  const navigate = useNavigate();
  const { isReadOnly, canAccess } = useAuth();
  const canReview = canAccess("verification") && !isReadOnly;

  const [completedWorkDetails, setCompletedWorkDetails] = useState<
    WorkDetailsWithProgress[]
  >([]);
  const [verifications, setVerifications] = useState<VerificationWithDetails[]>(
    [],
  );
  // work_details_id -> bastp_id, from the real join table (bastp linkage was
  // never actually stored on work_details itself — see bastp_work_details).
  const [bastpLinkByWorkDetails, setBastpLinkByWorkDetails] = useState<
    Map<number, number>
  >(new Map());
  const [bastps, setBastps] = useState<BASTPs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<
    "pending" | "pendingWithBastp" | "needsRework" | "verified"
  >("pending");

  // Filter states
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [selectedVesselId, setSelectedVesselId] = useState<number>(0);
  const [selectedProjectId, setSelectedProjectId] = useState<number>(0);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<number>(0);

  // Search dropdown states
  const [vesselSearchTerm, setVesselSearchTerm] = useState("");
  const [showVesselDropdown, setShowVesselDropdown] = useState(false);
  const vesselDropdownRef = useRef<HTMLDivElement>(null);

  const [projectSearchTerm, setProjectSearchTerm] = useState("");
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  const [workOrderSearchTerm, setWorkOrderSearchTerm] = useState("");
  const [showWorkOrderDropdown, setShowWorkOrderDropdown] = useState(false);
  const workOrderDropdownRef = useRef<HTMLDivElement>(null);

  const [expandedGroups, setExpandedGroups] = useState<
    Set<number | "no-bastp">
  >(new Set(["no-bastp"]));

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
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const toggleGroupExpansion = (groupId: number | "no-bastp") => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

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
    if (selectedVesselId) {
      setSelectedVesselId(0);
    }
  };

  const handleVesselSelectFromDropdown = (vessel: Vessel) => {
    setSelectedVesselId(vessel.id);
    setVesselSearchTerm(`${vessel.name} - ${vessel.type} (${vessel.company})`);
    setShowVesselDropdown(false);
  };

  const handleClearVesselSearch = () => {
    setVesselSearchTerm("");
    setSelectedVesselId(0);
    setShowVesselDropdown(false);
  };

  const handleProjectSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProjectSearchTerm(e.target.value);
    setShowProjectDropdown(true);
    if (selectedProjectId) {
      setSelectedProjectId(0);
    }
  };

  const handleProjectSelectFromDropdown = (project: ProjectOption) => {
    setSelectedProjectId(project.id);
    setProjectSearchTerm(project.project_name);
    setShowProjectDropdown(false);
  };

  const handleClearProjectSearch = () => {
    setProjectSearchTerm("");
    setSelectedProjectId(0);
    setShowProjectDropdown(false);
  };

  const handleWorkOrderSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWorkOrderSearchTerm(e.target.value);
    setShowWorkOrderDropdown(true);
    if (selectedWorkOrderId) {
      setSelectedWorkOrderId(0);
    }
  };

  const handleWorkOrderSelectFromDropdown = (workOrder: WorkOrderOption) => {
    setSelectedWorkOrderId(workOrder.id);
    setWorkOrderSearchTerm(workOrder.shipyard_wo_number || "");
    setShowWorkOrderDropdown(false);
  };

  const handleClearWorkOrderSearch = () => {
    setWorkOrderSearchTerm("");
    setSelectedWorkOrderId(0);
    setShowWorkOrderDropdown(false);
  };

  const handleReviewClick = (workDetailsId: number) => {
    if (!canReview) {
      alert("❌ You don't have permission to review work details.");
      return;
    }
    navigate(`/work-verification/verify/${workDetailsId}`);
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch work details with progress data
      const { data: workDetailsData, error: wdError } = await supabase
        .from("work_details")
        .select(
          `
          *,
          work_order (
            id,
            shipyard_wo_number,
            customer_wo_number,
            shipyard_wo_date,
            customer_wo_date,
            vessel (
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
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (wdError) throw wdError;

      // Process work details to find completed ones (100% progress)
      const workDetailsWithProgress = (workDetailsData || []).map((wd) => {
        const progressRecords: WorkProgressItem[] = wd.work_progress || [];
        if (progressRecords.length === 0) {
          return {
            ...wd,
            current_progress: 0,
            has_progress_data: false,
          };
        }
        const latestRecord = getLatestProgressRecord(progressRecords);
        const latestCreatedAt = progressRecords.reduce(
          (latest: string | undefined, p) =>
            !latest || new Date(p.created_at).getTime() > new Date(latest).getTime()
              ? p.created_at
              : latest,
          undefined,
        );
        return {
          ...wd,
          current_progress: latestRecord?.progress_percentage || 0,
          has_progress_data: true,
          latest_progress_date: latestRecord?.report_date,
          latest_progress_created_at: latestCreatedAt,
        };
      });

      // Filter only completed work details (100% progress)
      const completed = workDetailsWithProgress.filter(
        (wd) => wd.current_progress === 100,
      );
      setCompletedWorkDetails(completed);

      const { data: verificationData, error: verError } = await supabase
        .from("work_verification")
        .select(
          `
          *,
          work_details (
            *,
            location:location_id (
              id,
              location
            ),
            work_order (
              id,
              shipyard_wo_number,
              customer_wo_number,
              shipyard_wo_date,
              customer_wo_date,
              vessel (
                id,
                name,
                type,
                company
              ),
              project:project_id (
                id,
                project_name
              )
            )
          ),
          profiles (
            id,
            name,
            email
          )
        `,
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (verError) throw verError;
      setVerifications((verificationData as unknown as VerificationWithDetails[]) || []);

      // Real BASTP linkage lives in bastp_work_details — work_details'
      // own is_in_bastp/bastp_id columns are legacy and nothing writes to
      // them anymore, so they're never used here.
      const { data: bastpLinks, error: linkError } = await supabase
        .from("bastp_work_details")
        .select("work_details_id, bastp_id")
        .is("deleted_at", null);

      if (linkError) throw linkError;
      setBastpLinkByWorkDetails(
        new Map((bastpLinks || []).map((l) => [l.work_details_id, l.bastp_id])),
      );

      // Fetch BASTPs with vessel information
      const { data: bastpData, error: bastpError } = await supabase
        .from("bastp")
        .select(
          `
    id,
    number,
    date,
    delivery_date,
    status,
    vessel:vessel_id (
      id,
      name,
      type,
      company
    )
  `,
        )
        .is("deleted_at", null)
        .order("date", { ascending: false });

      if (bastpError) throw bastpError;
      setBastps(
        (bastpData || []).map((b: any) => ({
          ...b,
          vessel_id: b.vessel?.id ?? null,
          vessel: Array.isArray(b.vessel) ? b.vessel[0] : b.vessel,
        })),
      );

      // Fetch vessels for filter
      const { data: vesselData, error: vesselError } = await supabase
        .from("vessel")
        .select("*")
        .is("deleted_at", null)
        .order("name", { ascending: true });

      if (vesselError) throw vesselError;
      setVessels(vesselData || []);
    } catch (err) {
      console.error("Error fetching verification data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Current review state, per work_details_id, derived from the latest
  // non-deleted work_verification row — never from "does any row exist,"
  // since a rejected item can later be approved after rework.
  const latestReviewByWorkDetails = getLatestVerificationByWorkDetails(
    verifications,
  );

  const needsReworkList: WorkDetailsWithProgress[] = [];
  const pendingList: WorkDetailsWithProgress[] = [];

  completedWorkDetails.forEach((wd) => {
    const latest = latestReviewByWorkDetails.get(wd.id);
    if (isApproved(latest)) return; // shown via the verifications list instead
    if (isOpenForRework(latest, wd.latest_progress_created_at)) {
      needsReworkList.push(wd);
    } else {
      pendingList.push(wd);
    }
  });

  const wdSearchFields = (wd: WorkDetailsWithProgress) => [
    wd.description,
    wd.location?.location,
    wd.pic,
    wd.work_order?.customer_wo_number,
    wd.work_order?.shipyard_wo_number,
    wd.work_order?.vessel?.name,
    wd.work_order?.vessel?.company,
  ];

  // Each dropdown's own selection is excluded when checking scope for that
  // SAME dropdown's option list, so picking a value never collapses its own
  // other options — only the vessel filter (an independent full-vessel-table
  // list) sits outside this scope check.
  type ScopeFilter = "project" | "workOrder";
  const matchesScope = (
    wd: WorkDetailsWithProgress | undefined,
    exclude?: ScopeFilter,
  ) => {
    if (!wd) return false;
    if (selectedVesselId !== 0 && wd.work_order?.vessel?.id !== selectedVesselId) {
      return false;
    }
    if (
      exclude !== "project" &&
      selectedProjectId !== 0 &&
      wd.work_order?.project?.id !== selectedProjectId
    ) {
      return false;
    }
    if (
      exclude !== "workOrder" &&
      selectedWorkOrderId !== 0 &&
      wd.work_order?.id !== selectedWorkOrderId
    ) {
      return false;
    }
    return true;
  };

  const matchesFilters = (wd: WorkDetailsWithProgress | undefined) => {
    if (!matchesScope(wd)) return false;
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return wdSearchFields(wd!).some((value) =>
      value?.toLowerCase().includes(searchLower),
    );
  };

  // Options for the Project / Work Order dropdowns, scoped to whichever
  // completed work details are still in play under every OTHER active
  // filter (never its own selection).
  const availableProjects: ProjectOption[] = Array.from(
    new Map(
      completedWorkDetails
        .filter((wd) => matchesScope(wd, "project") && wd.work_order?.project)
        .map((wd) => [wd.work_order!.project!.id, wd.work_order!.project!]),
    ).values(),
  ).sort((a, b) => a.project_name.localeCompare(b.project_name));

  const availableWorkOrders: WorkOrderOption[] = Array.from(
    new Map(
      completedWorkDetails
        .filter((wd) => matchesScope(wd, "workOrder") && wd.work_order)
        .map((wd) => [
          wd.work_order!.id,
          {
            id: wd.work_order!.id,
            shipyard_wo_number: wd.work_order!.shipyard_wo_number,
            customer_wo_number: wd.work_order!.customer_wo_number,
          },
        ]),
    ).values(),
  ).sort((a, b) =>
    (a.shipyard_wo_number || "").localeCompare(b.shipyard_wo_number || ""),
  );

  const filteredProjectsForSearch = availableProjects.filter((project) =>
    project.project_name.toLowerCase().includes(projectSearchTerm.toLowerCase()),
  );
  const filteredWorkOrdersForSearch = availableWorkOrders.filter((wo) => {
    const searchLower = workOrderSearchTerm.toLowerCase();
    return (
      wo.shipyard_wo_number?.toLowerCase().includes(searchLower) ||
      wo.customer_wo_number?.toLowerCase().includes(searchLower)
    );
  });

  // Apply vessel + project + work order + text filters
  const filteredPending = pendingList.filter((wd) => matchesFilters(wd));
  const filteredNeedsRework = needsReworkList.filter((wd) => matchesFilters(wd));

  // Split pending work details for tabs
  const pendingNotInBASTP = filteredPending.filter(
    (wd) => !bastpLinkByWorkDetails.has(wd.id),
  );
  const pendingWithBASTP = filteredPending.filter((wd) =>
    bastpLinkByWorkDetails.has(wd.id),
  );

  // Group pendingWithBASTP by BASTP
  const groupedPendingWithBASTP: {
    bastp: BASTPs | null;
    workDetails: WorkDetailsWithProgress[];
  }[] = [];
  const pendingBastpMap = new Map<number, WorkDetailsWithProgress[]>();
  pendingWithBASTP.forEach((wd) => {
    const id = bastpLinkByWorkDetails.get(wd.id)!;
    if (!pendingBastpMap.has(id)) pendingBastpMap.set(id, []);
    pendingBastpMap.get(id)!.push(wd);
  });
  pendingBastpMap.forEach((wds, bastpId) => {
    const bastp = bastps.find((b) => b.id === bastpId) || null;
    groupedPendingWithBASTP.push({ bastp, workDetails: wds });
  });
  groupedPendingWithBASTP.sort((a, b) => {
    if (a.bastp === null) return -1;
    if (b.bastp === null) return 1;
    return new Date(b.bastp.date).getTime() - new Date(a.bastp.date).getTime();
  });

  // Verified = latest review per work detail is APPROVED
  const filteredVerified = verifications.filter((verification) => {
    if (latestReviewByWorkDetails.get(verification.work_details_id)?.id !== verification.id) {
      return false; // superseded by a later review — history, not current state
    }
    if (!isApproved(verification)) return false;
    return matchesFilters(verification.work_details);
  });

  const groupedVerified: {
    bastp: BASTPs | null;
    verifications: VerificationWithDetails[];
  }[] = [];
  const verifiedBastpMap = new Map<number, VerificationWithDetails[]>();
  const verifiedNoBastp: VerificationWithDetails[] = [];
  filteredVerified.forEach((verification) => {
    const bastpId = bastpLinkByWorkDetails.get(verification.work_details_id);
    if (bastpId) {
      if (!verifiedBastpMap.has(bastpId)) verifiedBastpMap.set(bastpId, []);
      verifiedBastpMap.get(bastpId)!.push(verification);
    } else {
      verifiedNoBastp.push(verification);
    }
  });
  verifiedBastpMap.forEach((verificationsForBastp, bastpId) => {
    const bastp = bastps.find((b) => b.id === bastpId) || null;
    groupedVerified.push({ bastp, verifications: verificationsForBastp });
  });
  if (verifiedNoBastp.length > 0) {
    groupedVerified.push({ bastp: null, verifications: verifiedNoBastp });
  }
  groupedVerified.sort((a, b) => {
    if (a.bastp === null) return 1;
    if (b.bastp === null) return -1;
    return new Date(b.bastp.date).getTime() - new Date(a.bastp.date).getTime();
  });

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      { bg: string; text: string; icon: React.ReactElement }
    > = {
      DRAFT: {
        bg: "bg-gray-100",
        text: "text-gray-700",
        icon: <FileEdit className="w-3 h-3" />,
      },
      PENDING_VERIFICATION: {
        bg: "bg-yellow-100",
        text: "text-yellow-700",
        icon: <Clock className="w-3 h-3" />,
      },
      VERIFIED: {
        bg: "bg-blue-100",
        text: "text-blue-700",
        icon: <CheckCircle2 className="w-3 h-3" />,
      },
      DOCUMENT_UPLOADED: {
        bg: "bg-purple-100",
        text: "text-purple-700",
        icon: <FileCheck className="w-3 h-3" />,
      },
      READY_FOR_INVOICE: {
        bg: "bg-green-100",
        text: "text-green-700",
        icon: <DollarSign className="w-3 h-3" />,
      },
      INVOICED: {
        bg: "bg-emerald-100",
        text: "text-emerald-700",
        icon: <CheckCircle2 className="w-3 h-3" />,
      },
    };
    const config = statusConfig[status] || statusConfig.DRAFT;
    return (
      <span
        className={`px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text} inline-flex items-center gap-1`}
      >
        {config.icon} {status.replace(/_/g, " ")}
      </span>
    );
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedVesselId(0);
    handleClearProjectSearch();
    handleClearWorkOrderSearch();
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">
            Loading work verification data...
          </span>
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
            Work Verification
          </h1>
          <p className="text-gray-600 mt-2">
            {canReview
              ? "Review completed work details (100% progress) before they go into a BASTP"
              : "View completed work details (100% progress) and their review status"}
          </p>
        </div>
        <button
          onClick={() => navigate("/work-details")}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Work Details
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Total Completed
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {completedWorkDetails.length}
              </p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Pending Review
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {pendingNotInBASTP.length + pendingWithBASTP.length}
              </p>
            </div>
            <Clock className="w-8 h-8 text-yellow-500" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Needs Rework
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {filteredNeedsRework.length}
              </p>
            </div>
            <Undo2 className="w-8 h-8 text-red-500" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Verified</p>
              <p className="text-2xl font-bold text-gray-900">
                {filteredVerified.length}
              </p>
            </div>
            <Eye className="w-8 h-8 text-green-500" />
          </div>
        </div>
      </div>

      {/* Filters and Tabs */}
      <div className="bg-white rounded-lg shadow">
        {/* Filters */}
        <div className="p-6 border-b border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Vessel Filter with Search Dropdown */}
            <div className="relative" ref={vesselDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Ship className="w-4 h-4" /> Filter by Vessel
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={vesselSearchTerm}
                  onChange={handleVesselSearch}
                  onFocus={() => setShowVesselDropdown(true)}
                  placeholder="Search vessel..."
                  className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {vesselSearchTerm && (
                  <button
                    onClick={handleClearVesselSearch}
                    className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
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
            {/* Project Filter with Search Dropdown */}
            <div className="relative" ref={projectDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <FolderKanban className="w-4 h-4" /> Filter by Project
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={projectSearchTerm}
                  onChange={handleProjectSearch}
                  onFocus={() => setShowProjectDropdown(true)}
                  placeholder="Search project..."
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
              {showProjectDropdown && filteredProjectsForSearch.length > 0 && (
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
            </div>
            {/* Work Order Filter with Search Dropdown */}
            <div className="relative" ref={workOrderDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <FileText className="w-4 h-4" /> Filter by Work Order
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={workOrderSearchTerm}
                  onChange={handleWorkOrderSearch}
                  onFocus={() => setShowWorkOrderDropdown(true)}
                  placeholder="Search WO number..."
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
              {showWorkOrderDropdown && filteredWorkOrdersForSearch.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredWorkOrdersForSearch.map((workOrder) => (
                    <div
                      key={workOrder.id}
                      onClick={() => handleWorkOrderSelectFromDropdown(workOrder)}
                      className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                        selectedWorkOrderId === workOrder.id ? "bg-blue-100" : ""
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
            </div>
            {/* Text Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Search className="w-4 h-4" /> Search
              </label>
              <input
                type="text"
                placeholder="Search work details..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex space-x-8 px-6 overflow-x-auto">
            <button
              onClick={() => setActiveTab("pending")}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === "pending"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Pending Review ({pendingNotInBASTP.length})
            </button>
            <button
              onClick={() => setActiveTab("pendingWithBastp")}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === "pendingWithBastp"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Pending Review with BASTP ({pendingWithBASTP.length})
            </button>
            <button
              onClick={() => setActiveTab("needsRework")}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === "needsRework"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Needs Rework ({filteredNeedsRework.length})
            </button>
            <button
              onClick={() => setActiveTab("verified")}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                activeTab === "verified"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Verified ({filteredVerified.length})
            </button>
          </div>
        </div>
        {/* Content */}
        <div className="p-6">
          {activeTab === "pending" &&
            (pendingNotInBASTP.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                        #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Work Order
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Vessel
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Location
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Qty
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Progress
                      </th>
                      {canReview && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Action
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {pendingNotInBASTP.map((wd, idx) => (
                      <tr key={wd.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {idx + 1}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {wd.description}
                          </div>
                          <div className="text-sm text-gray-500 flex items-center gap-1">
                            <User className="w-3 h-3" /> {wd.pic || "-"}
                          </div>
                          {hasRejectionHistory(verifications, wd.id) && (
                            <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded mt-1">
                              <RotateCcw className="w-3 h-3" /> Resubmitted
                              after rework
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {wd.work_order?.shipyard_wo_number || "-"}
                          </div>
                          <div className="text-sm text-gray-500">
                            {wd.work_order?.customer_wo_number || "-"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {wd.work_order?.vessel?.name || "-"}
                          </div>
                          <div className="text-sm text-gray-500">
                            {wd.work_order?.vessel?.type || "-"} •{" "}
                            {wd.work_order?.vessel?.company || "-"}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />{" "}
                            {wd.location?.location || "-"}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {wd.quantity} {wd.uom}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {typeof wd.current_progress === "number" ? (
                            <div>
                              <div>{wd.current_progress}%</div>
                              {wd.latest_progress_date && (
                                <div className="text-xs text-gray-400">
                                  {new Date(
                                    wd.latest_progress_date,
                                  ).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">
                              No progress
                            </span>
                          )}
                        </td>
                        {canReview && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              onClick={() => handleReviewClick(wd.id)}
                              className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                            >
                              Review
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-lg mb-2">
                  No pending reviews found matching your filters
                </p>
                <button
                  onClick={clearFilters}
                  className="text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Clear filters
                </button>
              </div>
            ))}
          {activeTab === "pendingWithBastp" &&
            (groupedPendingWithBASTP.length > 0 ? (
              <div className="space-y-6">
                {groupedPendingWithBASTP.map((group, gi) => {
                  const groupId = group.bastp?.id || "no-bastp";
                  const isExpanded = expandedGroups.has(groupId as any);
                  return (
                    <div
                      key={gi}
                      className="border border-gray-200 rounded-lg overflow-hidden"
                    >
                      <button
                        onClick={() => toggleGroupExpansion(groupId as any)}
                        className="w-full p-4 bg-gradient-to-r from-slate-50 to-gray-50 hover:from-slate-100 hover:to-gray-100 transition-all duration-200"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <ChevronRight
                              className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
                                isExpanded ? "rotate-90" : ""
                              }`}
                            />
                            {group.bastp ? (
                              <div className="text-left">
                                <div className="flex items-center gap-3">
                                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <FileText className="w-5 h-5" /> BASTP:{" "}
                                    {group.bastp.number}
                                  </h3>
                                  {getStatusBadge(group.bastp.status)}
                                </div>
                                <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                                  <span className="flex items-center gap-1">
                                    <Ship className="w-4 h-4" />{" "}
                                    {group.bastp.vessel?.name}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-4 h-4" />{" "}
                                    {formatDate(group.bastp.date)}
                                  </span>
                                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-medium">
                                    {group.workDetails.length} item
                                    {group.workDetails.length > 1 ? "s" : ""}
                                  </span>
                                </div>
                              </div>
                            ) : null}
                          </div>
                          {group.bastp && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/bastp/${group.bastp!.id}`);
                              }}
                              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                            >
                              View BASTP →
                            </button>
                          )}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-gray-200">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                                  #
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Description
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Work Order
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Vessel
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Location
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Qty
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Progress
                                </th>
                                {canReview && (
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Action
                                  </th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {group.workDetails.map((wd, idx) => (
                                <tr key={wd.id} className="hover:bg-gray-50">
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {idx + 1}
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="text-sm font-medium text-gray-900">
                                      {wd.description}
                                    </div>
                                    <div className="text-sm text-gray-500 flex items-center gap-1">
                                      <User className="w-3 h-3" />{" "}
                                      {wd.pic || "-"}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-900">
                                      {wd.work_order?.shipyard_wo_number || "-"}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                      {wd.work_order?.customer_wo_number || "-"}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="text-sm font-medium text-gray-900">
                                      {wd.work_order?.vessel?.name || "-"}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                      {wd.work_order?.vessel?.type || "-"} •{" "}
                                      {wd.work_order?.vessel?.company || "-"}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-500">
                                    <div className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />{" "}
                                      {wd.location?.location || "-"}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-900">
                                    {wd.quantity} {wd.uom}
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-500">
                                    {typeof wd.current_progress === "number" ? (
                                      <div>
                                        <div>{wd.current_progress}%</div>
                                        {wd.latest_progress_date && (
                                          <div className="text-xs text-gray-400">
                                            {new Date(
                                              wd.latest_progress_date,
                                            ).toLocaleDateString()}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-gray-400">
                                        No progress
                                      </span>
                                    )}
                                  </td>
                                  {canReview && (
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <button
                                        onClick={() => handleReviewClick(wd.id)}
                                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                                      >
                                        Review
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-lg mb-2">
                  No pending reviews with BASTP found matching your filters
                </p>
                <button
                  onClick={clearFilters}
                  className="text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Clear filters
                </button>
              </div>
            ))}
          {activeTab === "needsRework" &&
            (filteredNeedsRework.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                        #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Work Order
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Vessel
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Sent Back By
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Reason
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredNeedsRework.map((wd, idx) => {
                      const review = latestReviewByWorkDetails.get(wd.id);
                      return (
                        <tr key={wd.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {idx + 1}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">
                              {wd.description}
                            </div>
                            <div className="text-sm text-gray-500 flex items-center gap-1">
                              <User className="w-3 h-3" /> {wd.pic || "-"}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {wd.work_order?.shipyard_wo_number || "-"}
                            </div>
                            <div className="text-sm text-gray-500">
                              {wd.work_order?.customer_wo_number || "-"}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">
                              {wd.work_order?.vessel?.name || "-"}
                            </div>
                            <div className="text-sm text-gray-500">
                              {wd.work_order?.vessel?.type || "-"} •{" "}
                              {wd.work_order?.vessel?.company || "-"}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            <div>{review?.profiles?.name || "Unknown"}</div>
                            <div className="text-xs text-gray-400">
                              {review && formatDate(review.verification_date)}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-700 max-w-xs">
                            {review?.verification_notes || "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Undo2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-lg mb-2">
                  No work sent back for rework matching your filters
                </p>
                <button
                  onClick={clearFilters}
                  className="text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Clear filters
                </button>
              </div>
            ))}
          {activeTab === "verified" &&
            (groupedVerified.length > 0 ? (
              <div className="space-y-6">
                {groupedVerified.map((group, groupIndex) => {
                  const groupId = group.bastp?.id || "no-bastp";
                  const isExpanded = expandedGroups.has(groupId as any);
                  return (
                    <div
                      key={groupIndex}
                      className="border border-gray-200 rounded-lg overflow-hidden"
                    >
                      <button
                        onClick={() => toggleGroupExpansion(groupId as any)}
                        className="w-full p-4 bg-gradient-to-r from-slate-50 to-gray-50 hover:from-slate-100 hover:to-gray-100 transition-all duration-200"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <ChevronRight
                              className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
                                isExpanded ? "rotate-90" : ""
                              }`}
                            />
                            {group.bastp ? (
                              <div className="text-left">
                                <div className="flex items-center gap-3">
                                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <FileText className="w-5 h-5" /> BASTP:{" "}
                                    {group.bastp.number}
                                  </h3>
                                  {getStatusBadge(group.bastp.status)}
                                </div>
                                <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                                  <span className="flex items-center gap-1">
                                    <Ship className="w-4 h-4" />{" "}
                                    {group.bastp.vessel?.name}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-4 h-4" />{" "}
                                    {formatDate(group.bastp.date)}
                                  </span>
                                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-medium">
                                    {group.verifications.length} item
                                    {group.verifications.length > 1 ? "s" : ""}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-left">
                                <h3 className="text-lg font-bold text-gray-900">
                                  Not yet in a BASTP
                                </h3>
                                <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-xs font-medium">
                                  {group.verifications.length} item
                                  {group.verifications.length > 1 ? "s" : ""}
                                </span>
                              </div>
                            )}
                          </div>
                          {group.bastp && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/bastp/${group.bastp!.id}`);
                              }}
                              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                            >
                              View BASTP →
                            </button>
                          )}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-gray-200">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                                  #
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Description
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Work Order
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Vessel
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Location
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Qty
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Approved By
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Approval Date
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Notes
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {group.verifications.map((verification, idx) => (
                                <tr
                                  key={verification.id}
                                  className="hover:bg-gray-50"
                                >
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {idx + 1}
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="text-sm font-medium text-gray-900">
                                      {verification.work_details?.description}
                                    </div>
                                    <div className="text-sm text-gray-500 flex items-center gap-1">
                                      <User className="w-3 h-3" />{" "}
                                      {verification.work_details?.pic || "-"}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-900">
                                      {verification.work_details?.work_order
                                        ?.shipyard_wo_number || "-"}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                      {verification.work_details?.work_order
                                        ?.customer_wo_number || "-"}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="text-sm font-medium text-gray-900">
                                      {verification.work_details?.work_order
                                        ?.vessel?.name || "-"}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                      {verification.work_details?.work_order
                                        ?.vessel?.type || "-"}{" "}
                                      •{" "}
                                      {verification.work_details?.work_order
                                        ?.vessel?.company || "-"}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-500">
                                    <div className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />{" "}
                                      {verification.work_details?.location
                                        ?.location || "-"}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-900">
                                    {verification.work_details?.quantity}{" "}
                                    {verification.work_details?.uom}
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-500">
                                    {verification.profiles?.name ||
                                      "Unknown User"}
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-500">
                                    {formatDate(verification.verification_date)}
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-500">
                                    {verification.verification_notes || "-"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <CheckCircle2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-lg mb-2">
                  No verified work details found matching your filters
                </p>
                <button
                  onClick={clearFilters}
                  className="text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Clear filters
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
