import {
  Fragment,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  supabase,
  type WorkDetails,
  type WorkOrder,
  type Vessel,
} from "../../lib/supabase";
import { openPermitFile } from "../../utils/urlHandler";
import { useAuth } from "../../hooks/useAuth";
import {
  useWorkSection,
  NEW_BUILDING_WORK_TYPE,
  STANDARD_WORK_TYPE_FILTER,
  STANDARD_DOCKING_TYPE_FILTER,
} from "../../hooks/useWorkSection";
import { isOpenForRework } from "../../utils/workVerificationStatus";
import { getLatestProgressRecord } from "../../utils/progressPercentage";
import { ActivityLogService } from "../../services/activityLogService";
import {
  Ship,
  FileText,
  User,
  Edit,
  Trash2,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  Plus,
  Wrench,
  BarChart3,
  Calendar,
  ClipboardList,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  FileCheck,
  Undo2,
  Ban,
  Loader2,
} from "lucide-react";
import { TableSkeleton } from "../common/Skeleton";
import Pagination from "../common/Pagination";
import {
  Dialog,
  FilterCombo,
  ProgressMeter,
  dangerButton,
  dangerOutlineButton,
  fieldClass,
  iconButton,
  labelClass,
  primaryButton,
  secondaryButton,
  tagBase,
} from "../common/ledgerUi";

interface ProjectOption {
  id: number;
  project_name: string;
  vessel_id: number;
}

const ITEMS_PER_PAGE = 10;

type WorkDetailsSortField =
  | "planned_start_date"
  | "target_close_date"
  | "created_at"
  | "description"
  | "work_scope"
  | "location";

// work_scope/location are FK embeds (work_scope_id/location_id), not plain
// columns on work_details, so ordering by them needs PostgREST's
// referencedTable option instead of a plain .order(field).
const EMBEDDED_SORT_FIELDS: Partial<Record<WorkDetailsSortField, string>> = {
  work_scope: "work_scope",
  location: "location",
};

// work_order is an inner join so that the list page can narrow work details to
// one section (Docking and Repair, or New Building) by the work order's type.
const WORK_DETAILS_SELECT = `
  *,
  work_order!inner (
    id,
    shipyard_wo_number,
    customer_wo_number,
    vessel (id, name, type, company)
  ),
  profiles!fk_work_details_user (id, name, email),
  work_progress (id, progress_percentage, report_date, created_at),
  work_verification (status, created_at, deleted_at),
  location:location_id (id, location),
  work_scope:work_scope_id (id, work_scope)
`;

// Columns of work_details itself that the search box covers.
const SEARCHABLE_WORK_DETAILS_COLUMNS = [
  "description",
  "pic",
  "spk_number",
  "spkk_number",
  "ptw_number",
] as const;

interface WorkDetailsWithWorkOrder extends WorkDetails {
  work_order?: WorkOrder & {
    vessel?: Vessel;
  };
  profiles?: {
    id: number;
    name: string;
    email: string;
  };
  work_progress?: Array<{
    id: number;
    progress_percentage: number;
    report_date: string;
    created_at: string;
  }>;
  current_progress?: number;
  latest_progress_date?: string;
  progress_count?: number;
  isOpenForRework?: boolean;
  cancelled_at?: string | null;
  cancelled_by?: number | null;
  cancellation_reason?: string | null;
  work_scope?: {
    id: number;
    work_scope: string;
  };
  location?: {
    id: number;
    location: string;
  };
}

interface WorkDetailsTableProps {
  workOrderId?: number;
  onRefresh?: () => void;
  embedded?: boolean;
}

// Whether this work detail was sent back for rework and hasn't been
// resubmitted yet — used to flag it in the table so production staff notice
// without having to open Add Progress.
function deriveIsOpenForRework(
  progressRecords: { created_at: string }[],
  verificationRecords:
    | {
        status: "APPROVED" | "REJECTED";
        created_at: string;
        deleted_at: string | null;
      }[]
    | undefined,
): boolean {
  const latestProgressCreatedAt = progressRecords.reduce(
    (latest: string | undefined, p) =>
      !latest || new Date(p.created_at).getTime() > new Date(latest).getTime()
        ? p.created_at
        : latest,
    undefined,
  );
  const latestVerification = (verificationRecords || [])
    .filter((v) => !v.deleted_at)
    .sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
  return isOpenForRework(latestVerification, latestProgressCreatedAt);
}

// PostgREST parses commas and parentheses inside filter values as syntax, so
// user-supplied values have to go in as quoted strings. Note this only holds
// inside an or=(...) group: as a standalone filter (what .ilike() builds) a
// quoted value is matched literally and the % wildcards stop working, so
// every search clause below goes through .or() even when there is only one.
function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// The search box spans work_details' own columns plus WO numbers, location
// and work scope, which live on related tables. PostgREST can't OR a parent
// column together with an embedded one in a single request, so resolve the
// related tables to id lists first and OR on the foreign keys instead.
// Deleted rows are deliberately not excluded here — a work detail still
// shows its WO/location/scope even if that parent row was soft deleted, so
// searching has to match them too.
async function buildWorkDetailsSearchFilter(term: string): Promise<string> {
  const quoted = quoteFilterValue(`%${term}%`);

  const [workOrders, locations, workScopes] = await Promise.all([
    supabase
      .from("work_order")
      .select("id")
      .or(
        `shipyard_wo_number.ilike.${quoted},customer_wo_number.ilike.${quoted}`,
      ),
    supabase.from("location").select("id").or(`location.ilike.${quoted}`),
    supabase.from("work_scope").select("id").or(`work_scope.ilike.${quoted}`),
  ]);

  for (const result of [workOrders, locations, workScopes]) {
    if (result.error) throw result.error;
  }

  const clauses = SEARCHABLE_WORK_DETAILS_COLUMNS.map(
    (column) => `${column}.ilike.${quoted}`,
  );

  const addForeignKeyClause = (
    column: string,
    rows: { id: number }[] | null,
  ) => {
    const ids = (rows || []).map((row) => row.id);
    if (ids.length > 0) clauses.push(`${column}.in.(${ids.join(",")})`);
  };

  addForeignKeyClause("work_order_id", workOrders.data);
  addForeignKeyClause("location_id", locations.data);
  addForeignKeyClause("work_scope_id", workScopes.data);

  return clauses.join(",");
}

export default function WODetailsTable({
  workOrderId,
  onRefresh,
  embedded = false,
}: WorkDetailsTableProps) {
  const { profile, isOperationsReadOnly, isShippingCreateOnly } = useAuth();
  // ADMIN_SHIPPING can create work details but never edit/delete one.
  const canEditWorkDetails = !isOperationsReadOnly && !isShippingCreateOnly;
  // Adding a progress report is PRODUCTION's job specifically (MASTER keeps
  // the usual superuser override) — narrower than canEditWorkDetails, which
  // also covers PPIC editing its own work-detail planning fields.
  const canWriteProgress =
    profile?.role === "MASTER" || profile?.role === "PRODUCTION";
  // Cancelling a work detail is PPIC's call, and PRODUCTION's too (MASTER
  // keeps the usual superuser override) — separate from canEditWorkDetails
  // since ADMIN_SHIPPING can edit/create but shouldn't decide cancellations.
  const canCancelWorkDetail =
    profile?.role === "PPIC" ||
    profile?.role === "PRODUCTION" ||
    profile?.role === "MASTER";
  const navigate = useNavigate();
  // Docking and Repair and New Building each list their own work details.
  // A table fixed to one work order (embedded) is not narrowed.
  const { isNewBuilding } = useWorkSection();
  const [searchParams, setSearchParams] = useSearchParams();

  // State Management
  const [workDetails, setWorkDetails] = useState<WorkDetailsWithWorkOrder[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  // Separates the first load from later refetches. Searching and paging now
  // go to the server, and replacing the whole page with a spinner on every
  // debounced keystroke would unmount the search box and steal focus.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sorting & Pagination
  const [sortField, setSortField] = useState<WorkDetailsSortField>(() => {
    const sort = searchParams.get("sortField");
    return (sort as WorkDetailsSortField) || "planned_start_date";
  });
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(() => {
    const direction = searchParams.get("sortDirection");
    return (direction as "asc" | "desc") || "asc";
  });
  const [currentPage, setCurrentPage] = useState(() => {
    const page = searchParams.get("page");
    return page ? parseInt(page) : 1;
  });
  // Row count of the current query, straight from PostgREST — the table only
  // ever holds one page's worth of rows, so it can't be counted locally.
  const [totalItems, setTotalItems] = useState(0);

  // UI State
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [detailToDelete, setDetailToDelete] =
    useState<WorkDetailsWithWorkOrder | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [detailToCancel, setDetailToCancel] =
    useState<WorkDetailsWithWorkOrder | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  // Filter State
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [workScopes, setWorkScopes] = useState<
    { id: number; work_scope: string }[]
  >([]);
  const [locations, setLocations] = useState<
    { id: number; location: string }[]
  >([]);
  const [selectedWorkScopeId, setSelectedWorkScopeId] = useState<number>(
    () => {
      const workScopeId = searchParams.get("workScopeId");
      return workScopeId ? parseInt(workScopeId) : 0;
    },
  );
  const [selectedLocationId, setSelectedLocationId] = useState<number>(() => {
    const locationId = searchParams.get("locationId");
    return locationId ? parseInt(locationId) : 0;
  });
  const [selectedVesselId, setSelectedVesselId] = useState<number>(() => {
    const vesselId = searchParams.get("vesselId");
    return vesselId ? parseInt(vesselId) : workOrderId || 0;
  });
  const [selectedProjectId, setSelectedProjectId] = useState<number>(() => {
    const projectId = searchParams.get("projectId");
    return projectId ? parseInt(projectId) : 0;
  });
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<number>(() => {
    const woId = searchParams.get("workOrderId");
    return woId ? parseInt(woId) : workOrderId || 0;
  });
  const [selectedWorkOrderDetails, setSelectedWorkOrderDetails] = useState<
    | (WorkOrder & {
        vessel?: Vessel;
        kapro?: { id: number; kapro_name: string };
      })
    | null
  >(null);

  // Search State
  const [vesselSearchTerm, setVesselSearchTerm] = useState(
    () => searchParams.get("vesselSearch") || "",
  );
  const [projectSearchTerm, setProjectSearchTerm] = useState(
    () => searchParams.get("projectSearch") || "",
  );
  const [workOrderSearchTerm, setWorkOrderSearchTerm] = useState(
    () => searchParams.get("woSearch") || "",
  );
  const [workDetailsSearchTerm, setWorkDetailsSearchTerm] = useState(
    () => searchParams.get("search") || "",
  );
  // "" = all, "yes" = only additional work details, "no" = only original ones.
  const [additionalWoFilter, setAdditionalWoFilter] = useState<string>(
    () => searchParams.get("additionalWo") || "",
  );
  // The work details search now hits the database, so keystrokes are
  // debounced instead of filtering an in-memory array.
  const [debouncedWorkDetailsSearchTerm, setDebouncedWorkDetailsSearchTerm] =
    useState(workDetailsSearchTerm);

  // Dropdown State
  const [showVesselDropdown, setShowVesselDropdown] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showWorkOrderDropdown, setShowWorkOrderDropdown] = useState(false);
  const [loadingVessels, setLoadingVessels] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingWorkOrders, setLoadingWorkOrders] = useState(false);

  // Refs
  const vesselDropdownRef = useRef<HTMLDivElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const workOrderDropdownRef = useRef<HTMLDivElement>(null);

  // ==================== COMPUTED VALUES ====================

  // Pagination calculations. Filtering, sorting and slicing all happen in the
  // query now, so workDetails already *is* the current page.
  const currentWorkDetails = workDetails;

  // Filter vessels for search dropdown
  const filteredVesselsForSearch = useMemo(() => {
    if (!vesselSearchTerm) return vessels;
    const searchLower = vesselSearchTerm.toLowerCase();
    return vessels.filter(
      (vessel) =>
        vessel.name?.toLowerCase().includes(searchLower) ||
        vessel.type?.toLowerCase().includes(searchLower) ||
        vessel.company?.toLowerCase().includes(searchLower),
    );
  }, [vessels, vesselSearchTerm]);

  // Filter projects for search dropdown
  const filteredProjectsForSearch = useMemo(() => {
    if (!projectSearchTerm) return projects;
    const searchLower = projectSearchTerm.toLowerCase();
    return projects.filter((project) =>
      project.project_name?.toLowerCase().includes(searchLower),
    );
  }, [projects, projectSearchTerm]);

  // Filter work orders for search dropdown
  const filteredWorkOrdersForSearch = useMemo(() => {
    if (!workOrderSearchTerm) return workOrders;
    const searchLower = workOrderSearchTerm.toLowerCase();
    return workOrders.filter(
      (wo) =>
        wo.shipyard_wo_number?.toLowerCase().includes(searchLower) ||
        wo.customer_wo_number?.toLowerCase().includes(searchLower),
    );
  }, [workOrders, workOrderSearchTerm]);

  // Kept stable (updates read the previous params rather than closing over
  // them) so writing to the URL doesn't invalidate the fetch callbacks below
  // and trigger a second, redundant query.
  const updateUrlParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      setSearchParams(
        (prev) => {
          const newParams = new URLSearchParams(prev);

          Object.entries(updates).forEach(([key, value]) => {
            if (value === null || value === "" || value === 0) {
              newParams.delete(key);
            } else {
              newParams.set(key, String(value));
            }
          });

          return newParams;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // ==================== DATA FETCHING ====================

  const fetchWorkScopes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("work_scope")
        .select("id, work_scope")
        .is("deleted_at", null)
        .order("work_scope", { ascending: true });

      if (error) throw error;
      setWorkScopes(data || []);
    } catch (err) {
      console.error("Error fetching work scopes:", err);
    }
  }, []);

  const fetchLocations = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("location")
        .select("id, location")
        .is("deleted_at", null)
        .order("location", { ascending: true });

      if (error) throw error;
      setLocations(data || []);
    } catch (err) {
      console.error("Error fetching locations:", err);
    }
  }, []);

  const fetchVessels = useCallback(async () => {
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
    } finally {
      setLoadingVessels(false);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      setLoadingProjects(true);
      let query = supabase
        .from("projects")
        .select("id, project_name, vessel_id")
        .is("deleted_at", null);
      query = isNewBuilding
        ? query.eq("docking_type", NEW_BUILDING_WORK_TYPE)
        : query.or(STANDARD_DOCKING_TYPE_FILTER);
      const { data, error } = await query.order("project_name", {
        ascending: true,
      });

      if (error) throw error;
      setProjects(data || []);
    } catch (err) {
      console.error("Error fetching projects:", err);
    } finally {
      setLoadingProjects(false);
    }
  }, [isNewBuilding]);

  // Work orders for the dropdown, scoped to whichever of vessel/project
  // filters are active (either alone is enough; both together AND).
  const fetchWorkOrdersForFilters = useCallback(
    async (vesselIdParam: number, projectIdParam: number) => {
      try {
        setLoadingWorkOrders(true);
        let query = supabase
          .from("work_order")
          .select("*")
          .is("deleted_at", null)
          .order("shipyard_wo_number", { ascending: true });

        if (vesselIdParam > 0) query = query.eq("vessel_id", vesselIdParam);
        if (projectIdParam > 0) query = query.eq("project_id", projectIdParam);
        query = isNewBuilding
          ? query.eq("work_type", NEW_BUILDING_WORK_TYPE)
          : query.or(STANDARD_WORK_TYPE_FILTER);

        const { data, error } = await query;

        if (error) throw error;
        setWorkOrders(data || []);
      } catch (err) {
        console.error("Error fetching work orders:", err);
      } finally {
        setLoadingWorkOrders(false);
      }
    },
    [isNewBuilding],
  );

  const fetchWorkOrderDetails = useCallback(async (workOrderId: number) => {
    try {
      const { data, error } = await supabase
        .from("work_order")
        .select(
          `
          *,
          vessel (id, name, type, company),
          kapro (id, kapro_name)
        `,
        )
        .eq("id", workOrderId)
        .single();

      if (error) throw error;
      setSelectedWorkOrderDetails(data);
    } catch (err) {
      console.error("Error fetching work order details:", err);
      setSelectedWorkOrderDetails(null);
    }
  }, []);

  // Single place where the work details list is queried. Everything is done
  // server-side: PostgREST caps any response at 1000 rows, so filtering or
  // paginating in the browser silently hid every work detail past that cap.
  const runWorkDetailsQuery = useCallback(
    async (params: {
      vesselId: number;
      projectId: number;
      workOrderIdFilter: number;
      workScopeId: number;
      locationId: number;
      sortField: WorkDetailsSortField;
      sortDirection: "asc" | "desc";
      page: number;
      search: string;
      additionalWo: string;
    }) => {
      try {
        setLoading(true);
        setError(null);

        let baseQuery = supabase
          .from("work_details")
          .select(WORK_DETAILS_SELECT, { count: "exact" })
          .is("deleted_at", null);

        if (!workOrderId) {
          baseQuery = isNewBuilding
            ? baseQuery.eq("work_order.work_type", NEW_BUILDING_WORK_TYPE)
            : baseQuery.or(STANDARD_WORK_TYPE_FILTER, {
                referencedTable: "work_order",
              });
        }

        if (params.additionalWo === "yes") {
          baseQuery = baseQuery.eq("is_additional_wo_details", true);
        } else if (params.additionalWo === "no") {
          baseQuery = baseQuery.eq("is_additional_wo_details", false);
        }

        if (params.workScopeId > 0) {
          baseQuery = baseQuery.eq("work_scope_id", params.workScopeId);
        }
        if (params.locationId > 0) {
          baseQuery = baseQuery.eq("location_id", params.locationId);
        }

        // Apply filters
        if (workOrderId) {
          baseQuery = baseQuery.eq("work_order_id", workOrderId);
        } else if (params.workOrderIdFilter > 0) {
          baseQuery = baseQuery.eq("work_order_id", params.workOrderIdFilter);
        } else if (params.vesselId > 0 || params.projectId > 0) {
          let woQuery = supabase
            .from("work_order")
            .select("id")
            .is("deleted_at", null);
          if (params.vesselId > 0) {
            woQuery = woQuery.eq("vessel_id", params.vesselId);
          }
          if (params.projectId > 0) {
            woQuery = woQuery.eq("project_id", params.projectId);
          }
          const { data: matchingWorkOrders } = await woQuery;

          if (matchingWorkOrders && matchingWorkOrders.length > 0) {
            const workOrderIds = matchingWorkOrders.map((wo) => wo.id);
            baseQuery = baseQuery.in("work_order_id", workOrderIds);
          } else {
            setWorkDetails([]);
            setTotalItems(0);
            setLoading(false);
            return;
          }
        }

        const searchTerm = params.search.trim();
        if (searchTerm) {
          baseQuery = baseQuery.or(
            await buildWorkDetailsSearchFilter(searchTerm),
          );
        }

        // Add sorting. id breaks ties so that rows sharing a sort value (most
        // work details share a planned_start_date) keep a stable order and
        // can't be duplicated across pages or skipped entirely.
        const embeddedTable = EMBEDDED_SORT_FIELDS[params.sortField];
        const rangeStart = (params.page - 1) * ITEMS_PER_PAGE;
        const sortedQuery = embeddedTable
          ? baseQuery.order(params.sortField, {
              ascending: params.sortDirection === "asc",
              referencedTable: embeddedTable,
            })
          : baseQuery.order(params.sortField, {
              ascending: params.sortDirection === "asc",
            });
        const query = sortedQuery
          .order("id", { ascending: true })
          .range(rangeStart, rangeStart + ITEMS_PER_PAGE - 1);

        const { data, error: queryError, count } = await query;

        if (queryError) throw queryError;

        const rowCount = count ?? 0;
        setTotalItems(rowCount);

        // Requesting a page past the end (stale ?page=, or a narrower filter
        // than last time) returns nothing; land on the last real page instead
        // of showing an empty table. Changing the page refetches.
        const lastPage = Math.max(1, Math.ceil(rowCount / ITEMS_PER_PAGE));
        if (params.page > lastPage) {
          setCurrentPage(lastPage);
          updateUrlParams({ page: lastPage });
          return;
        }

        // Process work details with progress data
        const workDetailsWithProgress = (data || []).map((detail) => {
          const progressRecords: Array<{
            progress_percentage: number;
            report_date: string;
            created_at: string;
          }> = detail.work_progress || [];
          const isOpenForReworkFlag = deriveIsOpenForRework(
            progressRecords,
            detail.work_verification,
          );

          if (progressRecords.length === 0) {
            return {
              ...detail,
              current_progress: 0,
              latest_progress_date: undefined,
              progress_count: 0,
              isOpenForRework: isOpenForReworkFlag,
            };
          }

          // Latest by report_date, tie-broken by created_at — sorting on
          // report_date alone left same-day entries in whatever order the
          // query happened to return them, which could show an earlier
          // same-day report (e.g. 10%) instead of a later one (e.g. 100%).
          const latest = getLatestProgressRecord(progressRecords);

          return {
            ...detail,
            current_progress: latest?.progress_percentage || 0,
            latest_progress_date: latest?.report_date,
            progress_count: progressRecords.length,
            isOpenForRework: isOpenForReworkFlag,
          };
        });

        setWorkDetails(workDetailsWithProgress);
      } catch (err) {
        console.error("Error in runWorkDetailsQuery:", err);
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
        setHasLoadedOnce(true);
      }
    },
    [workOrderId, updateUrlParams, isNewBuilding],
  );

  const fetchWorkDetails = useCallback(
    () =>
      runWorkDetailsQuery({
        vesselId: selectedVesselId,
        projectId: selectedProjectId,
        workOrderIdFilter: selectedWorkOrderId,
        workScopeId: selectedWorkScopeId,
        locationId: selectedLocationId,
        sortField,
        sortDirection,
        page: currentPage,
        search: debouncedWorkDetailsSearchTerm,
        additionalWo: additionalWoFilter,
      }),
    [
      runWorkDetailsQuery,
      selectedVesselId,
      selectedProjectId,
      selectedWorkOrderId,
      selectedWorkScopeId,
      selectedLocationId,
      sortField,
      sortDirection,
      currentPage,
      debouncedWorkDetailsSearchTerm,
      additionalWoFilter,
    ],
  );

  // Used by the "returning from add/edit" path, which has the restored
  // filters in hand before the corresponding state updates have landed.
  const fetchWorkDetailsWithFilters = useCallback(
    (
      vesselIdParam: number,
      projectIdParam: number,
      workOrderIdParam: number,
      workScopeIdParam: number,
      locationIdParam: number,
      sortFieldParam: WorkDetailsSortField,
      sortDirectionParam: "asc" | "desc",
      pageParam: number,
      searchParam: string,
      additionalWoParam: string,
    ) =>
      runWorkDetailsQuery({
        vesselId: vesselIdParam,
        projectId: projectIdParam,
        workOrderIdFilter: workOrderIdParam,
        workScopeId: workScopeIdParam,
        locationId: locationIdParam,
        sortField: sortFieldParam,
        sortDirection: sortDirectionParam,
        page: pageParam,
        search: searchParam,
        additionalWo: additionalWoParam,
      }),
    [runWorkDetailsQuery],
  );

  // ==================== EVENT HANDLERS ====================

  const toggleRowExpansion = (detailId: number) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(detailId)) {
        newSet.delete(detailId);
      } else {
        newSet.add(detailId);
      }
      return newSet;
    });
  };

  const handleVesselSearch = (value: string) => {
    setVesselSearchTerm(value);
    setShowVesselDropdown(true);
    if (selectedVesselId) {
      setSelectedVesselId(0);
      setSelectedWorkOrderId(0);
      setWorkOrders([]);
    }
  };

  const handleVesselSelectFromDropdown = (vessel: Vessel) => {
    const vesselDisplayText = `${vessel.name} - ${vessel.type} (${vessel.company})`;

    setSelectedVesselId(vessel.id);
    setVesselSearchTerm(vesselDisplayText);
    setShowVesselDropdown(false);
    setSelectedWorkOrderId(0);
    setWorkOrderSearchTerm("");
    setCurrentPage(1);

    updateUrlParams({
      vesselId: vessel.id,
      vesselSearch: vesselDisplayText,
      workOrderId: null,
      woSearch: null,
      page: 1,
    });

    fetchWorkOrdersForFilters(vessel.id, selectedProjectId);
  };

  const handleClearVesselSearch = () => {
    setVesselSearchTerm("");
    setSelectedVesselId(0);
    setShowVesselDropdown(false);
    setSelectedWorkOrderId(0);
    setWorkOrderSearchTerm("");
    setCurrentPage(1);
    setSelectedWorkOrderDetails(null);

    updateUrlParams({
      vesselId: null,
      vesselSearch: null,
      workOrderId: null,
      woSearch: null,
      page: 1,
    });

    if (selectedProjectId > 0) {
      fetchWorkOrdersForFilters(0, selectedProjectId);
    } else {
      setWorkOrders([]);
    }
  };

  const handleProjectSearch = (value: string) => {
    setProjectSearchTerm(value);
    setShowProjectDropdown(true);
    if (selectedProjectId) {
      setSelectedProjectId(0);
      setSelectedWorkOrderId(0);
      setWorkOrders([]);
    }
  };

  const handleProjectSelectFromDropdown = (project: ProjectOption) => {
    setSelectedProjectId(project.id);
    setProjectSearchTerm(project.project_name);
    setShowProjectDropdown(false);
    setSelectedWorkOrderId(0);
    setWorkOrderSearchTerm("");
    setCurrentPage(1);

    updateUrlParams({
      projectId: project.id,
      projectSearch: project.project_name,
      workOrderId: null,
      woSearch: null,
      page: 1,
    });

    fetchWorkOrdersForFilters(selectedVesselId, project.id);
  };

  const handleClearProjectSearch = () => {
    setProjectSearchTerm("");
    setSelectedProjectId(0);
    setShowProjectDropdown(false);
    setSelectedWorkOrderId(0);
    setWorkOrderSearchTerm("");
    setCurrentPage(1);
    setSelectedWorkOrderDetails(null);

    updateUrlParams({
      projectId: null,
      projectSearch: null,
      workOrderId: null,
      woSearch: null,
      page: 1,
    });

    if (selectedVesselId > 0) {
      fetchWorkOrdersForFilters(selectedVesselId, 0);
    } else {
      setWorkOrders([]);
    }
  };

  const handleWorkOrderSearch = (value: string) => {
    setWorkOrderSearchTerm(value);
    setShowWorkOrderDropdown(true);
    if (selectedWorkOrderId) {
      setSelectedWorkOrderId(0);
    }
  };

  const handleWorkOrderSelectFromDropdown = (workOrder: WorkOrder) => {
    setSelectedWorkOrderId(workOrder.id);
    setWorkOrderSearchTerm(workOrder.shipyard_wo_number || "");
    setShowWorkOrderDropdown(false);
    setCurrentPage(1);

    updateUrlParams({
      workOrderId: workOrder.id,
      woSearch: workOrder.shipyard_wo_number || "",
      page: 1,
    });

    fetchWorkOrderDetails(workOrder.id);
  };

  const handleClearWorkOrderSearch = () => {
    setWorkOrderSearchTerm("");
    setSelectedWorkOrderId(0);
    setShowWorkOrderDropdown(false);
    setCurrentPage(1);
    setSelectedWorkOrderDetails(null);

    updateUrlParams({
      workOrderId: null,
      woSearch: null,
      page: 1,
    });
  };

  const handleAdditionalWoFilterChange = (value: string) => {
    setAdditionalWoFilter(value);
    setCurrentPage(1);

    updateUrlParams({
      additionalWo: value || null,
      page: 1,
    });
  };

  const handleWorkScopeFilterChange = (value: string) => {
    const id = value ? parseInt(value) : 0;
    setSelectedWorkScopeId(id);
    setCurrentPage(1);

    updateUrlParams({
      workScopeId: id || null,
      page: 1,
    });
  };

  const handleLocationFilterChange = (value: string) => {
    const id = value ? parseInt(value) : 0;
    setSelectedLocationId(id);
    setCurrentPage(1);

    updateUrlParams({
      locationId: id || null,
      page: 1,
    });
  };

  const handleSort = (field: typeof sortField) => {
    const newDirection =
      sortField === field && sortDirection === "asc" ? "desc" : "asc";
    setSortField(field);
    setSortDirection(newDirection);
    setCurrentPage(1);

    updateUrlParams({
      sortField: field,
      sortDirection: newDirection,
      page: 1,
    });
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);

    updateUrlParams({ page });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleAddWorkDetails = () => {
    // ✅ FIX: Save current filter state before navigating
    const filterState = {
      vesselId: selectedVesselId,
      vesselSearch: vesselSearchTerm,
      projectId: selectedProjectId,
      projectSearch: projectSearchTerm,
      workOrderId: selectedWorkOrderId,
      woSearch: workOrderSearchTerm,
      workScopeId: selectedWorkScopeId,
      locationId: selectedLocationId,
      search: workDetailsSearchTerm,
      additionalWo: additionalWoFilter,
      sortField,
      sortDirection,
      page: currentPage,
    };

    if (workOrderId) {
      navigate(`/work-details/add/${workOrderId}`);
    } else if (selectedWorkOrderId > 0) {
      navigate(`/work-details/add/${selectedWorkOrderId}`, {
        state: { returnFilters: filterState },
      });
    } else {
      navigate("/work-details/add", {
        state: { returnFilters: filterState },
      });
    }
  };

  const handleEditWorkDetails = (workDetailsId: number) => {
    // Save current filter state to navigate with
    const filterState = {
      vesselId: selectedVesselId,
      vesselSearch: vesselSearchTerm,
      projectId: selectedProjectId,
      projectSearch: projectSearchTerm,
      workOrderId: selectedWorkOrderId,
      woSearch: workOrderSearchTerm,
      workScopeId: selectedWorkScopeId,
      locationId: selectedLocationId,
      search: workDetailsSearchTerm,
      additionalWo: additionalWoFilter,
      sortField,
      sortDirection,
      page: currentPage,
    };

    navigate(`/edit-work-details/${workDetailsId}`, {
      state: { returnFilters: filterState },
    });
  };

  const handleDeleteWorkDetails = (detail: WorkDetailsWithWorkOrder) => {
    setDetailToDelete(detail);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!detailToDelete) return;

    try {
      setIsDeleting(true);
      const { data, error } = await supabase
        .from("work_details")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", detailToDelete.id)
        .select()
        .single();

      if (error) throw error;

      // Log the soft delete activity
      if (data) {
        await ActivityLogService.logActivity({
          action: "delete",
          tableName: "work_details",
          recordId: data.id,
          oldData: detailToDelete,
          description: `Soft deleted work detail: ${detailToDelete.description}`,
        });
      }

      const newTotalItems = totalItems - 1;
      const newTotalPages = Math.ceil(newTotalItems / ITEMS_PER_PAGE);
      if (currentPage > newTotalPages && newTotalPages > 0) {
        setCurrentPage(newTotalPages);
      }

      await fetchWorkDetails();
      onRefresh?.();
      setShowDeleteModal(false);
      setDetailToDelete(null);
    } catch (err) {
      console.error("Error deleting work details:", err);
      setError(
        err instanceof Error ? err.message : "An error occurred while deleting",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setDetailToDelete(null);
  };

  const handleCancelWorkDetail = (detail: WorkDetailsWithWorkOrder) => {
    setDetailToCancel(detail);
    setCancellationReason("");
  };

  const closeCancelModal = () => {
    setDetailToCancel(null);
    setCancellationReason("");
  };

  const confirmCancelWorkDetail = async () => {
    if (!detailToCancel || !profile) return;

    try {
      setIsCancelling(true);
      const { data, error } = await supabase
        .from("work_details")
        .update({
          cancelled_at: new Date().toISOString(),
          cancelled_by: profile.id,
          cancellation_reason: cancellationReason.trim() || null,
        })
        .eq("id", detailToCancel.id)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        await ActivityLogService.logActivity({
          action: "update",
          tableName: "work_details",
          recordId: data.id,
          oldData: detailToCancel,
          newData: data,
          description: `Cancelled work detail: ${detailToCancel.description}`,
        });
      }

      await fetchWorkDetails();
      onRefresh?.();
      closeCancelModal();
    } catch (err) {
      console.error("Error cancelling work detail:", err);
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred while cancelling",
      );
    } finally {
      setIsCancelling(false);
    }
  };

  const handleUncancelWorkDetail = async (detail: WorkDetailsWithWorkOrder) => {
    if (
      !window.confirm(
        `Uncancel "${detail.description}"? It'll count toward the work order's progress average again.`,
      )
    ) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from("work_details")
        .update({
          cancelled_at: null,
          cancelled_by: null,
          cancellation_reason: null,
        })
        .eq("id", detail.id)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        await ActivityLogService.logActivity({
          action: "update",
          tableName: "work_details",
          recordId: data.id,
          oldData: detail,
          newData: data,
          description: `Uncancelled work detail: ${detail.description}`,
        });
      }

      await fetchWorkDetails();
      onRefresh?.();
    } catch (err) {
      console.error("Error uncancelling work detail:", err);
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred while uncancelling",
      );
    }
  };

  const handleViewPermit = async (detail: WorkDetailsWithWorkOrder) => {
    if (!detail.storage_path) return;
    try {
      await openPermitFile(detail.storage_path);
    } catch (err) {
      console.error("Error opening permit file:", err);
      alert("Failed to open permit file");
    }
  };

  const handleViewProgress = (workDetailsId: number) => {
    navigate(`/work-details/${workDetailsId}/progress`);
  };

  const handleAddProgress = (workDetailsId: number) => {
    navigate(`/add-work-progress/${workDetailsId}`);
  };

  const handleWorkDetailsSearchChange = (value: string) => {
    setWorkDetailsSearchTerm(value);
    setCurrentPage(1);

    updateUrlParams({
      search: value,
      page: 1,
    });
  };

  // ==================== UTILITY FUNCTIONS ====================

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field)
      return <ArrowUpDown className="h-4 w-4" aria-hidden="true" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="h-4 w-4" aria-hidden="true" />
    ) : (
      <ArrowDown className="h-4 w-4" aria-hidden="true" />
    );
  };

  // ==================== EFFECTS ====================

  // Click outside handling for dropdowns
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

  // ESC key to close dropdowns
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowVesselDropdown(false);
        setShowProjectDropdown(false);
        setShowWorkOrderDropdown(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  useEffect(() => {
    if (!workOrderId) {
      fetchVessels();
      fetchProjects();
      fetchWorkScopes();
      fetchLocations();
    }
  }, [workOrderId, fetchVessels, fetchProjects, fetchWorkScopes, fetchLocations]);

  useEffect(() => {
    if (workOrderId) {
      fetchWorkOrderDetails(workOrderId);
    }
  }, [workOrderId, fetchWorkOrderDetails]);

  useEffect(() => {
    if (workOrderId && workDetails.length > 0) {
      const workDetail = workDetails[0];
      if (workDetail.work_order?.vessel) {
        setSelectedVesselId(workDetail.work_order.vessel.id);
        setSelectedWorkOrderId(workOrderId);
      }
    }
  }, [workOrderId, workDetails]);

  // Debounce the search term before it reaches the database. Resetting to
  // page 1 is handled by handleWorkDetailsSearchChange, so that a page
  // restored from the URL or from navigation state survives mount.
  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedWorkDetailsSearchTerm(workDetailsSearchTerm),
      300,
    );
    return () => clearTimeout(timeout);
  }, [workDetailsSearchTerm]);

  useEffect(() => {
    // Check if we're returning from edit with saved filters
    const navigationState = window.history.state?.usr?.returnFilters;

    if (navigationState) {
      console.log("🔄 Restoring filters from navigation:", navigationState);

      // Create an async function to restore filters in sequence
      const restoreFiltersAndFetch = async () => {
        try {
          // Restore simple filters
          if (navigationState.search) {
            setWorkDetailsSearchTerm(navigationState.search);
          }
          if (navigationState.additionalWo) {
            setAdditionalWoFilter(navigationState.additionalWo);
          }
          if (navigationState.workScopeId) {
            setSelectedWorkScopeId(navigationState.workScopeId);
          }
          if (navigationState.locationId) {
            setSelectedLocationId(navigationState.locationId);
          }
          if (navigationState.sortField) {
            setSortField(navigationState.sortField);
            setSortDirection(navigationState.sortDirection);
          }
          if (navigationState.page) {
            setCurrentPage(navigationState.page);
          }

          // Restore project filter
          if (navigationState.projectId) {
            console.log("Restoring project:", navigationState.projectId);
            setSelectedProjectId(navigationState.projectId);
            setProjectSearchTerm(navigationState.projectSearch || "");
          }

          // Restore vessel and work order filters
          if (navigationState.vesselId || navigationState.projectId) {
            console.log(
              "Restoring vessel/project:",
              navigationState.vesselId,
              navigationState.projectId,
            );
            if (navigationState.vesselId) {
              setSelectedVesselId(navigationState.vesselId);
              setVesselSearchTerm(navigationState.vesselSearch || "");
            }

            // Fetch work orders for the restored vessel and/or project
            await fetchWorkOrdersForFilters(
              navigationState.vesselId || 0,
              navigationState.projectId || 0,
            );

            if (navigationState.workOrderId) {
              console.log("Restoring work order:", navigationState.workOrderId);
              setSelectedWorkOrderId(navigationState.workOrderId);
              setWorkOrderSearchTerm(navigationState.woSearch || "");

              // Fetch work order details
              await fetchWorkOrderDetails(navigationState.workOrderId);
            }
          }

          // Update URL params to match restored state
          const newParams = new URLSearchParams();
          Object.entries(navigationState).forEach(([key, value]) => {
            if (value && value !== 0) {
              newParams.set(key, String(value));
            }
          });
          setSearchParams(newParams, { replace: true });

          // Clear navigation state to prevent re-triggering
          window.history.replaceState(
            { ...window.history.state, usr: undefined },
            "",
          );

          // Wait for state updates then fetch
          setTimeout(() => {
            // Force refetch by directly calling the fetch with the restored values
            fetchWorkDetailsWithFilters(
              navigationState.vesselId || 0,
              navigationState.projectId || 0,
              navigationState.workOrderId || 0,
              navigationState.workScopeId || 0,
              navigationState.locationId || 0,
              navigationState.sortField || "planned_start_date",
              navigationState.sortDirection || "asc",
              navigationState.page || 1,
              navigationState.search || "",
              navigationState.additionalWo || "",
            );
          }, 300);
        } catch (error) {
          console.error("Error restoring filters:", error);
          fetchWorkDetails(); // Fallback to regular fetch
        }
      };

      restoreFiltersAndFetch();
    } else {
      // No navigation state, do normal fetch
      fetchWorkDetails();
    }
    // fetchWorkDetails already closes over every filter, sort, page and
    // search value this needs, so it is the only dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchWorkDetails]);

  useEffect(() => {
    if (selectedVesselId > 0 && vessels.length === 0) {
      fetchVessels().then(() => {
        const vessel = vessels.find((v) => v.id === selectedVesselId);
        if (vessel && !vesselSearchTerm) {
          setVesselSearchTerm(
            `${vessel.name} - ${vessel.type} (${vessel.company})`,
          );
        }
      });
    }

    if (selectedProjectId > 0 && projects.length === 0) {
      fetchProjects().then(() => {
        const project = projects.find((p) => p.id === selectedProjectId);
        if (project && !projectSearchTerm) {
          setProjectSearchTerm(project.project_name);
        }
      });
    }

    if (
      (selectedVesselId > 0 || selectedProjectId > 0) &&
      workOrders.length === 0
    ) {
      fetchWorkOrdersForFilters(selectedVesselId, selectedProjectId);
    }

    if (selectedWorkOrderId > 0 && !selectedWorkOrderDetails) {
      fetchWorkOrderDetails(selectedWorkOrderId);
    }
  }, [
    selectedVesselId,
    selectedProjectId,
    selectedWorkOrderId,
    vessels.length,
    projects.length,
    workOrders.length,
    selectedWorkOrderDetails,
    vesselSearchTerm,
    projectSearchTerm,
    fetchVessels,
    fetchProjects,
    fetchWorkOrdersForFilters,
    fetchWorkOrderDetails,
  ]);

  // ==================== RENDER COMPONENTS ====================

  const hasActiveFilters =
    selectedVesselId > 0 ||
    selectedProjectId > 0 ||
    selectedWorkOrderId > 0 ||
    selectedWorkScopeId > 0 ||
    selectedLocationId > 0 ||
    additionalWoFilter !== "" ||
    workDetailsSearchTerm.trim() !== "";

  const clearAllFilters = () => {
    setSelectedVesselId(0);
    setVesselSearchTerm("");
    setSelectedProjectId(0);
    setProjectSearchTerm("");
    setSelectedWorkOrderId(0);
    setWorkOrderSearchTerm("");
    setSelectedWorkScopeId(0);
    setSelectedLocationId(0);
    setAdditionalWoFilter("");
    setWorkDetailsSearchTerm("");
    setSelectedWorkOrderDetails(null);
    setWorkOrders([]);
    setCurrentPage(1);
    updateUrlParams({
      vesselId: null,
      vesselSearch: null,
      projectId: null,
      projectSearch: null,
      workOrderId: null,
      woSearch: null,
      workScopeId: null,
      locationId: null,
      additionalWo: null,
      search: null,
      page: 1,
    });
  };

  // A sortable column heading: a real button, with the sort state announced.
  const sortableHeading = (label: string, field: WorkDetailsSortField) => (
    <th
      scope="col"
      aria-sort={
        sortField === field
          ? sortDirection === "asc"
            ? "ascending"
            : "descending"
          : undefined
      }
      className="px-4 py-1 text-left text-sm font-semibold text-slate-700"
    >
      <button
        type="button"
        onClick={() => handleSort(field)}
        className="-ml-2 inline-flex min-h-10 items-center gap-1 whitespace-nowrap rounded-md px-2 font-semibold hover:bg-slate-100"
      >
        {label} {getSortIcon(field)}
      </button>
    </th>
  );

  const plainHeading = (label: string) => (
    <th
      scope="col"
      className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-slate-700"
    >
      {label}
    </th>
  );

  const renderTableHeader = () => (
    <thead className="bg-slate-50">
      <tr>
        {sortableHeading("Work detail", "description")}
        {sortableHeading("Work scope", "work_scope")}
        {sortableHeading("Location", "location")}
        {plainHeading("SPK / SPKK")}
        {plainHeading("Quantity")}
        {sortableHeading("Schedule", "target_close_date")}
        {plainHeading("Progress")}
        {canEditWorkDetails && plainHeading("Actions")}
      </tr>
    </thead>
  );

  const detailTerm = "text-sm text-slate-600";
  const detailValue = "text-sm font-medium text-slate-900";

  const renderTableRow = (detail: WorkDetailsWithWorkOrder) => {
    const isExpanded = expandedRows.has(detail.id);
    const panelId = `wd-detail-${detail.id}`;
    const columnCount = canEditWorkDetails ? 8 : 7;

    return (
      // Two sibling rows (main + expandable), so the list key has to sit on
      // the fragment itself; a key on the inner <tr> doesn't count.
      <Fragment key={detail.id}>
        <tr
          className={`align-top transition-colors hover:bg-slate-50 ${
            detail.cancelled_at ? "bg-slate-50" : ""
          }`}
        >
          <td className="px-4 py-3">
            <div className="flex items-start gap-1">
              <button
                type="button"
                onClick={() => toggleRowExpansion(detail.id)}
                aria-expanded={isExpanded}
                aria-controls={panelId}
                aria-label={`${isExpanded ? "Hide" : "Show"} details of ${detail.description}`}
                className={`${iconButton} -ml-2 flex-shrink-0`}
              >
                <ChevronRight
                  className={`h-5 w-5 transition-transform ${
                    isExpanded ? "rotate-90" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>
              <div className="min-w-0 pt-2">
                <p
                  className="line-clamp-2 text-sm font-medium text-slate-900"
                  title={detail.description}
                >
                  {detail.description}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className={`${tagBase} bg-slate-100 text-slate-800`}>
                    <User className="h-3.5 w-3.5" aria-hidden="true" />
                    {detail.pic || "No PIC"}
                  </span>
                  {detail.is_additional_wo_details && (
                    <span className={`${tagBase} bg-orange-50 text-orange-900`}>
                      <AlertTriangle
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      Additional work
                    </span>
                  )}
                  {detail.isOpenForRework && (
                    <span className={`${tagBase} bg-red-50 text-red-800`}>
                      <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Needs rework
                    </span>
                  )}
                  {detail.cancelled_at && (
                    <span
                      className={`${tagBase} bg-slate-200 text-slate-800`}
                      title={
                        detail.cancellation_reason
                          ? `Reason: ${detail.cancellation_reason}`
                          : undefined
                      }
                    >
                      <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                      Cancelled
                    </span>
                  )}
                </div>
              </div>
            </div>
          </td>

          <td data-label="Work scope" className="px-4 py-3 pt-5 text-sm text-slate-900">
            {detail.work_scope?.work_scope || (
              <span className="text-slate-600">None</span>
            )}
          </td>

          <td data-label="Location" className="px-4 py-3 pt-5 text-sm text-slate-900">
            {detail.location?.location || (
              <span className="text-slate-600">None</span>
            )}
          </td>

          <td data-label="SPK / SPKK" className="px-4 py-3 pt-5 text-sm">
            {detail.spk_number || detail.spkk_number ? (
              <div className="space-y-0.5 text-slate-900">
                {detail.spk_number && <div>SPK {detail.spk_number}</div>}
                {detail.spkk_number && <div>SPKK {detail.spkk_number}</div>}
              </div>
            ) : (
              <span className="text-slate-600">Not set</span>
            )}
          </td>

          <td
            data-label="Quantity"
            className="whitespace-nowrap px-4 py-3 pt-5 text-sm tabular-nums text-slate-900"
          >
            {detail.quantity || 0}{" "}
            <span className="text-slate-600">{detail.uom || ""}</span>
          </td>

          <td
            data-label="Schedule"
            className="whitespace-nowrap px-4 py-3 pt-5 text-sm text-slate-900"
          >
            <div>
              <span className="text-slate-600">Start </span>
              {formatDate(detail.planned_start_date)}
            </div>
            <div>
              <span className="text-slate-600">Target </span>
              {formatDate(detail.target_close_date)}
            </div>
          </td>

          <td data-label="Progress" className="px-4 py-3 pt-5">
            <ProgressMeter
              value={detail.current_progress || 0}
              label={`Progress of ${detail.description}`}
            />
          </td>

          {canEditWorkDetails && (
            <td className="whitespace-nowrap px-4 py-3">
              <div className="flex justify-end gap-1 md:justify-start">
                <button
                  type="button"
                  onClick={() => handleEditWorkDetails(detail.id)}
                  title="Edit"
                  aria-label={`Edit ${detail.description}`}
                  className={`${iconButton} text-blue-800`}
                >
                  <Edit className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteWorkDetails(detail)}
                  title="Delete"
                  aria-label={`Delete ${detail.description}`}
                  className={`${iconButton} text-red-800 hover:bg-red-50`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </td>
          )}
        </tr>

        {isExpanded && (
          <tr>
            <td colSpan={columnCount} id={panelId} className="p-0">
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-6">
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  <section className="lg:col-span-3">
                    <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <ClipboardList className="h-4 w-4" aria-hidden="true" />
                      Full description
                    </h3>
                    <p className="max-w-4xl whitespace-pre-line text-sm text-slate-900">
                      {detail.description}
                    </p>
                  </section>

                  <section>
                    <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <FileText className="h-4 w-4" aria-hidden="true" />
                      Work order
                    </h3>
                    <dl className="space-y-1">
                      <div>
                        <dt className={detailTerm}>Shipyard WO</dt>
                        <dd className={detailValue}>
                          {detail.work_order?.shipyard_wo_number || "None"}
                        </dd>
                      </div>
                      {detail.work_order?.customer_wo_number && (
                        <div>
                          <dt className={detailTerm}>Customer WO</dt>
                          <dd className={detailValue}>
                            {detail.work_order.customer_wo_number}
                          </dd>
                        </div>
                      )}
                      {detail.work_order?.vessel && (
                        <div>
                          <dt className={detailTerm}>Vessel</dt>
                          <dd className={detailValue}>
                            {detail.work_order.vessel.name}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </section>

                  <section>
                    <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <FileCheck className="h-4 w-4" aria-hidden="true" />
                      Document numbers
                    </h3>
                    {detail.spk_number ||
                    detail.spkk_number ||
                    detail.ptw_number ? (
                      <dl className="space-y-1">
                        {detail.spk_number && (
                          <div>
                            <dt className={detailTerm}>SPK</dt>
                            <dd className={detailValue}>{detail.spk_number}</dd>
                          </div>
                        )}
                        {detail.spkk_number && (
                          <div>
                            <dt className={detailTerm}>SPKK</dt>
                            <dd className={detailValue}>{detail.spkk_number}</dd>
                          </div>
                        )}
                        {detail.ptw_number && (
                          <div>
                            <dt className={detailTerm}>PTW</dt>
                            <dd className={detailValue}>{detail.ptw_number}</dd>
                          </div>
                        )}
                      </dl>
                    ) : (
                      <p className={detailTerm}>No documents</p>
                    )}
                  </section>

                  <section>
                    <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Calendar className="h-4 w-4" aria-hidden="true" />
                      Schedule
                    </h3>
                    <dl className="space-y-1">
                      <div>
                        <dt className={detailTerm}>Planned start</dt>
                        <dd className={detailValue}>
                          {formatDate(detail.planned_start_date)}
                        </dd>
                      </div>
                      <div>
                        <dt className={detailTerm}>Target close</dt>
                        <dd className={detailValue}>
                          {formatDate(detail.target_close_date)}
                        </dd>
                      </div>
                      {detail.actual_start_date && (
                        <div>
                          <dt className={detailTerm}>Actual start</dt>
                          <dd className={detailValue}>
                            {formatDate(detail.actual_start_date)}
                          </dd>
                        </div>
                      )}
                      {detail.actual_close_date && (
                        <div>
                          <dt className={detailTerm}>Actual close</dt>
                          <dd className={detailValue}>
                            {formatDate(detail.actual_close_date)}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </section>

                  <section>
                    <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <BarChart3 className="h-4 w-4" aria-hidden="true" />
                      Progress
                    </h3>
                    <dl className="space-y-1">
                      <div>
                        <dt className={detailTerm}>Current</dt>
                        <dd className={`${detailValue} tabular-nums`}>
                          {detail.current_progress || 0}%
                        </dd>
                      </div>
                      {detail.latest_progress_date && (
                        <div>
                          <dt className={detailTerm}>Last update</dt>
                          <dd className={detailValue}>
                            {formatDate(detail.latest_progress_date)}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt className={detailTerm}>Reports</dt>
                        <dd className={`${detailValue} tabular-nums`}>
                          {detail.progress_count || 0}
                        </dd>
                      </div>
                    </dl>
                  </section>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                  {detail.storage_path && (
                    <button
                      type="button"
                      onClick={() => handleViewPermit(detail)}
                      className={secondaryButton}
                    >
                      <FileCheck className="h-4 w-4" aria-hidden="true" /> View
                      work permit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleViewProgress(detail.id)}
                    className={secondaryButton}
                  >
                    <BarChart3 className="h-4 w-4" aria-hidden="true" /> View
                    progress ({detail.progress_count || 0})
                  </button>
                  {canWriteProgress && !detail.cancelled_at && (
                    <button
                      type="button"
                      onClick={() => handleAddProgress(detail.id)}
                      className={primaryButton}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" /> Add
                      progress
                    </button>
                  )}
                  {canCancelWorkDetail &&
                    (detail.cancelled_at ? (
                      <button
                        type="button"
                        onClick={() => handleUncancelWorkDetail(detail)}
                        className={secondaryButton}
                      >
                        <Undo2 className="h-4 w-4" aria-hidden="true" />{" "}
                        Uncancel
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleCancelWorkDetail(detail)}
                        className={dangerOutlineButton}
                      >
                        <Ban className="h-4 w-4" aria-hidden="true" /> Cancel
                        work detail
                      </button>
                    ))}
                </div>
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  const renderDeleteDialog = () => {
    if (!showDeleteModal || !detailToDelete) return null;

    return (
      <Dialog
        title="Delete work detail"
        icon={Trash2}
        onClose={cancelDelete}
        busy={isDeleting}
        footer={
          <>
            <button
              type="button"
              onClick={cancelDelete}
              disabled={isDeleting}
              className={secondaryButton}
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={isDeleting}
              className={dangerButton}
            >
              {isDeleting ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Deleting
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
                </>
              )}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Delete this work detail? It leaves every list.
        </p>
        <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-900">
          {detailToDelete.description}
        </p>
      </Dialog>
    );
  };

  const renderCancelDialog = () => {
    if (!detailToCancel) return null;

    return (
      <Dialog
        title="Cancel work detail"
        icon={Ban}
        onClose={closeCancelModal}
        busy={isCancelling}
        footer={
          <>
            <button
              type="button"
              onClick={closeCancelModal}
              disabled={isCancelling}
              className={secondaryButton}
            >
              Back
            </button>
            <button
              type="button"
              onClick={confirmCancelWorkDetail}
              disabled={isCancelling}
              className={dangerButton}
            >
              {isCancelling ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Cancelling
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4" aria-hidden="true" /> Confirm cancel
                </>
              )}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          This removes it from the work order's progress average and lets it be
          added to a BASTP at zero price. It can be uncancelled later if needed.
        </p>
        <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-900">
          {detailToCancel.description}
        </p>
        <label htmlFor="wd-cancel-reason" className={`${labelClass} mt-4`}>
          Reason (optional)
        </label>
        <textarea
          id="wd-cancel-reason"
          value={cancellationReason}
          onChange={(e) => setCancellationReason(e.target.value)}
          rows={3}
          placeholder="Why is this work detail being cancelled?"
          className={fieldClass}
        />
      </Dialog>
    );
  };

  const renderFilters = () => {
    if (workOrderId) return null;

    const workOrderLocked = selectedVesselId === 0 && selectedProjectId === 0;

    return (
      <section
        aria-label="Find work details"
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
      >
        <form role="search" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="wd-search" className={labelClass}>
            Search work details
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
              aria-hidden="true"
            />
            <input
              id="wd-search"
              type="search"
              placeholder="Description, PIC, WO number, SPK, SPKK, PTW or work scope"
              value={workDetailsSearchTerm}
              onChange={(e) => handleWorkDetailsSearchChange(e.target.value)}
              className={`${fieldClass} pl-9`}
            />
          </div>
        </form>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FilterCombo
            label="Project"
            placeholder="Search project"
            value={projectSearchTerm}
            onInputChange={handleProjectSearch}
            onClear={handleClearProjectSearch}
            options={filteredProjectsForSearch.map((project) => ({
              key: project.id,
              label: project.project_name,
              selected: selectedProjectId === project.id,
            }))}
            onSelect={(key) => {
              const project = projects.find((p) => p.id === key);
              if (project) handleProjectSelectFromDropdown(project);
            }}
            open={showProjectDropdown}
            onOpenChange={setShowProjectDropdown}
            disabled={loadingProjects}
            containerRef={projectDropdownRef}
          />

          <FilterCombo
            label="Vessel"
            placeholder="Search vessel"
            value={vesselSearchTerm}
            onInputChange={handleVesselSearch}
            onClear={handleClearVesselSearch}
            options={filteredVesselsForSearch.map((vessel) => ({
              key: vessel.id,
              label: vessel.name,
              detail: `${vessel.type} · ${vessel.company}`,
              selected: selectedVesselId === vessel.id,
            }))}
            onSelect={(key) => {
              const vessel = vessels.find((v) => v.id === key);
              if (vessel) handleVesselSelectFromDropdown(vessel);
            }}
            open={showVesselDropdown}
            onOpenChange={setShowVesselDropdown}
            disabled={loadingVessels}
            containerRef={vesselDropdownRef}
          />

          <FilterCombo
            label="Work order"
            placeholder={
              workOrderLocked
                ? "Pick a project or vessel first"
                : "Search work order"
            }
            value={workOrderSearchTerm}
            onInputChange={handleWorkOrderSearch}
            onClear={handleClearWorkOrderSearch}
            options={
              workOrderLocked
                ? []
                : filteredWorkOrdersForSearch.map((workOrder) => ({
                    key: workOrder.id,
                    label: workOrder.shipyard_wo_number,
                    detail: workOrder.customer_wo_number
                      ? `Customer ${workOrder.customer_wo_number}`
                      : undefined,
                    selected: selectedWorkOrderId === workOrder.id,
                  }))
            }
            onSelect={(key) => {
              const workOrder = workOrders.find((w) => w.id === key);
              if (workOrder) handleWorkOrderSelectFromDropdown(workOrder);
            }}
            open={showWorkOrderDropdown}
            onOpenChange={setShowWorkOrderDropdown}
            disabled={loadingWorkOrders || workOrderLocked}
            containerRef={workOrderDropdownRef}
          />

          <div>
            <label htmlFor="wd-scope" className={labelClass}>
              Work scope
            </label>
            <select
              id="wd-scope"
              value={selectedWorkScopeId || ""}
              onChange={(e) => handleWorkScopeFilterChange(e.target.value)}
              className={fieldClass}
            >
              <option value="">All work scopes</option>
              {workScopes.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.work_scope}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="wd-location" className={labelClass}>
              Location
            </label>
            <select
              id="wd-location"
              value={selectedLocationId || ""}
              onChange={(e) => handleLocationFilterChange(e.target.value)}
              className={fieldClass}
            >
              <option value="">All locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.location}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="wd-additional" className={labelClass}>
              Additional work
            </label>
            <select
              id="wd-additional"
              value={additionalWoFilter}
              onChange={(e) => handleAdditionalWoFilterChange(e.target.value)}
              className={fieldClass}
            >
              <option value="">All</option>
              <option value="yes">Additional only</option>
              <option value="no">Original only</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p role="status" className="text-sm text-slate-600">
            {totalItems} work detail{totalItems === 1 ? "" : "s"}
            {workDetailsSearchTerm.trim() &&
              ` matching "${workDetailsSearchTerm.trim()}"`}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className={secondaryButton}
            >
              Clear filters
            </button>
          )}
        </div>
      </section>
    );
  };

  const renderEmptyState = () => (
    <div className="px-4 py-12 text-center">
      <Wrench className="mx-auto h-8 w-8 text-slate-500" aria-hidden="true" />
      <p className="mt-2 text-sm font-medium text-slate-900">
        No work details found
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
        {workDetailsSearchTerm
          ? `No work details match "${workDetailsSearchTerm}".`
          : workOrderId
            ? "Add work details to break this work order into tasks."
            : selectedWorkOrderId > 0
              ? "This work order has no work details yet."
              : selectedVesselId > 0 || selectedProjectId > 0
                ? "No work details for the selected project or vessel."
                : "Work details are the tasks inside a work order."}
      </p>
      {hasActiveFilters && !workOrderId ? (
        <button
          type="button"
          onClick={clearAllFilters}
          className={`mt-4 ${secondaryButton}`}
        >
          Show all work details
        </button>
      ) : (
        !workDetailsSearchTerm &&
        !isOperationsReadOnly && (
          <button
            type="button"
            onClick={handleAddWorkDetails}
            className={`mt-4 ${primaryButton}`}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Add work details
          </button>
        )
      )}
    </div>
  );

  // ==================== MAIN RENDER ====================

  if (loading && !hasLoadedOnce) {
    return <TableSkeleton label="Loading work details..." toolbar />;
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="text-sm text-red-900">
          <span className="font-semibold">Work details could not load.</span>{" "}
          {error}
        </p>
        <button
          type="button"
          onClick={fetchWorkDetails}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-red-700 bg-white px-4 text-sm font-medium text-red-800 hover:bg-red-100"
        >
          Try again
        </button>
      </div>
    );
  }

  const canAddWorkDetails =
    !isOperationsReadOnly &&
    (profile?.role === "PPIC" ||
      profile?.role === "MASTER" ||
      profile?.role === "ADMIN_SHIPPING");

  return (
    <div className="space-y-6">
      {renderDeleteDialog()}
      {renderCancelDialog()}

      {!embedded && (
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              Work Details
            </h1>
            <p className="mt-1 text-sm text-slate-600 sm:text-base">
              The tasks inside{" "}
              {isNewBuilding ? "new building" : "docking and repair"} work
              orders: scope, location, schedule and progress.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={fetchWorkDetails}
              className={secondaryButton}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
            </button>
            {canAddWorkDetails && (
              <button
                type="button"
                onClick={handleAddWorkDetails}
                className={primaryButton}
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Add work details
              </button>
            )}
          </div>
        </header>
      )}

      {renderFilters()}

      {(selectedWorkOrderId > 0 || workOrderId) && selectedWorkOrderDetails && (
        <section
          aria-label="Selected work order"
          className="rounded-lg border border-slate-200 bg-white p-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className={`${detailTerm} flex items-center gap-1.5`}>
                  <Ship className="h-4 w-4" aria-hidden="true" /> Vessel
                </dt>
                <dd className="text-base font-semibold text-slate-900">
                  {selectedWorkOrderDetails.vessel?.name || "No vessel"}
                </dd>
                <dd className="text-sm text-slate-600">
                  {[
                    selectedWorkOrderDetails.vessel?.type,
                    selectedWorkOrderDetails.vessel?.company,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </dd>
              </div>
              <div>
                <dt className={`${detailTerm} flex items-center gap-1.5`}>
                  <FileText className="h-4 w-4" aria-hidden="true" /> Work order
                </dt>
                <dd className="text-base font-semibold text-slate-900">
                  {selectedWorkOrderDetails.shipyard_wo_number}
                </dd>
                {selectedWorkOrderDetails.customer_wo_number && (
                  <dd className="text-sm text-slate-600">
                    Customer {selectedWorkOrderDetails.customer_wo_number}
                  </dd>
                )}
              </div>
            </dl>
            {!workOrderId && (
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/vessel/${selectedWorkOrderDetails.vessel_id}/work-orders`,
                    {
                      state: {
                        highlightWorkOrderId: selectedWorkOrderDetails.id,
                      },
                    },
                  )
                }
                className={secondaryButton}
              >
                Open work order
              </button>
            )}
          </div>
        </section>
      )}

      <section aria-label="Work details table">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          {/* Wide screens sort from the column headings. */}
          <div className="sm:w-64 md:hidden">
            <label htmlFor="wd-sort" className={labelClass}>
              Sort by
            </label>
            <select
              id="wd-sort"
              value={`${sortField}-${sortDirection}`}
              onChange={(e) => {
                const [field, direction] = e.target.value.split("-");
                setSortField(field as typeof sortField);
                setSortDirection(direction as "asc" | "desc");
              }}
              className={fieldClass}
            >
              <option value="planned_start_date-asc">Start date, earliest</option>
              <option value="planned_start_date-desc">Start date, latest</option>
              <option value="target_close_date-asc">Target date, earliest</option>
              <option value="target_close_date-desc">Target date, latest</option>
              <option value="description-asc">Description, A to Z</option>
              <option value="description-desc">Description, Z to A</option>
              <option value="work_scope-asc">Work scope, A to Z</option>
              <option value="work_scope-desc">Work scope, Z to A</option>
              <option value="location-asc">Location, A to Z</option>
              <option value="location-desc">Location, Z to A</option>
              <option value="created_at-desc">Recently added</option>
              <option value="created_at-asc">Oldest first</option>
            </select>
          </div>
          {embedded && canAddWorkDetails && (
            <button
              type="button"
              onClick={handleAddWorkDetails}
              className={primaryButton}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add work details
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {loading ? (
            <div
              role="status"
              className="flex items-center justify-center py-16 text-sm text-slate-600"
            >
              <Loader2
                className="mr-2 h-5 w-5 animate-spin"
                aria-hidden="true"
              />
              Loading work details
            </div>
          ) : currentWorkDetails.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="table-stack min-w-full divide-y divide-slate-200">
                <caption className="sr-only">
                  Work details, {totalItems} in total
                </caption>
                {renderTableHeader()}
                <tbody className="divide-y divide-slate-200 bg-white">
                  {currentWorkDetails.map((detail) => renderTableRow(detail))}
                </tbody>
              </table>
            </div>
          ) : (
            renderEmptyState()
          )}
        </div>

        <Pagination
          page={currentPage}
          totalItems={totalItems}
          pageSize={ITEMS_PER_PAGE}
          onPageChange={handlePageChange}
        />
      </section>
    </div>
  );
}
