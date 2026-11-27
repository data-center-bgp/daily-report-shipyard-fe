/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchAllRows } from "../../utils/fetchAllRows";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { openProgressEvidence } from "../../utils/progressEvidenceHandler";
import type { WorkProgressWithDetails } from "../../types/progressTypes";
import { useAuth } from "../../hooks/useAuth";
import {
  useWorkSection,
  NEW_BUILDING_WORK_TYPE,
  STANDARD_WORK_TYPE_FILTER,
} from "../../hooks/useWorkSection";
import {
  getLatestVerificationByWorkDetails,
  isOpenForRework,
} from "../../utils/workVerificationStatus";
import { getLatestProgressRecord } from "../../utils/progressPercentage";
import {
  Search,
  RefreshCw,
  MapPin,
  X,
  Plus,
  BarChart3,
  CheckCircle2,
  Edit,
  Camera,
  Pin,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { TableSkeleton } from "../common/Skeleton";
import Pagination from "../common/Pagination";
import {
  Dialog,
  FilterCombo,
  ProgressMeter,
  fieldClass,
  iconButton,
  labelClass,
  pageShell,
  primaryButton,
  secondaryButton,
  tagBase,
} from "../common/ledgerUi";

// ==================== INTERFACES ====================

// Search ids are sent in the request URL (~8KB limit, ~7 chars per id once
// encoded); stay well under it so the friendly message shows first.
const MAX_SEARCH_IDS = 800;

interface VesselInfo {
  id: number;
  name: string;
  type: string;
  company: string;
}

interface WorkProgressTableProps {
  workDetailsId?: number;
  embedded?: boolean;
}

interface Kapro {
  id: number;
  kapro_name: string;
}

interface ProjectOption {
  id: number;
  project_name: string;
}

interface WorkOrderFullData {
  id: number;
  vessel_id: number;
  project_id?: number;
  shipyard_wo_number: string;
  customer_wo_number?: string;
  work_type?: string;
  work_location?: string;
  is_additional_wo?: boolean;
  kapro_id?: number;
}

// ==================== MAIN COMPONENT ====================

export default function WorkProgressTable({
  workDetailsId: workDetailsIdProp,
  embedded = false,
}: WorkProgressTableProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  // Viewing progress is open to everyone progress-accessible (incl. PPIC),
  // but adding/editing/deleting a report is PRODUCTION's job specifically —
  // MASTER keeps the usual superuser override, same as elsewhere in the app.
  const canWriteProgress =
    profile?.role === "MASTER" || profile?.role === "PRODUCTION";
  // The /work-details/:workDetailsId/progress route renders this component
  // with no props, so fall back to the URL param when one isn't passed in.
  const params = useParams<{ workDetailsId?: string }>();
  // Docking and Repair and New Building each list their own progress
  // reports. One work detail's reports (workDetailsId) are not narrowed.
  const { isNewBuilding } = useWorkSection();
  const workDetailsId =
    workDetailsIdProp ??
    (params.workDetailsId ? parseInt(params.workDetailsId) : undefined);

  // ==================== STATE - Data ====================
  const [workProgress, setWorkProgress] = useState<WorkProgressWithDetails[]>(
    [],
  );
  const [totalCount, setTotalCount] = useState(0);
  const [maxProgressByWorkDetail, setMaxProgressByWorkDetail] = useState<
    Record<number, number>
  >({});
  // work_details_id -> currently sent back for rework, awaiting a new
  // progress report before it re-enters the verification queue.
  const [needsReworkByWorkDetail, setNeedsReworkByWorkDetail] = useState<
    Record<number, boolean>
  >({});

  // ==================== STATE - Filters ====================
  const [showFilters, setShowFilters] = useState(false);
  const [vesselFilter, setVesselFilter] = useState("");
  const [vesselSearchTerm, setVesselSearchTerm] = useState("");
  const [showVesselDropdown, setShowVesselDropdown] = useState(false);
  const [projectFilter, setProjectFilter] = useState("");
  const [projectSearchTerm, setProjectSearchTerm] = useState("");
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [shipyardWoFilter, setShipyardWoFilter] = useState("");
  const [shipyardWoSearchTerm, setShipyardWoSearchTerm] = useState("");
  const [showShipyardWoDropdown, setShowShipyardWoDropdown] = useState(false);
  const [customerWoFilter, setCustomerWoFilter] = useState("");
  const [customerWoSearchTerm, setCustomerWoSearchTerm] = useState("");
  const [showCustomerWoDropdown, setShowCustomerWoDropdown] = useState(false);
  const [kaproFilter, setKaproFilter] = useState("");
  const [workLocationFilter, setWorkLocationFilter] = useState("");
  const [workTypeFilter, setWorkTypeFilter] = useState("");
  const [additionalWoFilter, setAdditionalWoFilter] = useState("");
  const [workDetailsSearchTerm, setWorkDetailsSearchTerm] = useState("");

  // ==================== STATE - Filter Options ====================
  const [allVessels, setAllVessels] = useState<VesselInfo[]>([]);
  const [allProjects, setAllProjects] = useState<ProjectOption[]>([]);
  const [allWorkOrders, setAllWorkOrders] = useState<WorkOrderFullData[]>([]);
  const [allKapros, setAllKapros] = useState<Kapro[]>([]);
  const vesselDropdownRef = useRef<HTMLDivElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const shipyardWoDropdownRef = useRef<HTMLDivElement>(null);
  const customerWoDropdownRef = useRef<HTMLDivElement>(null);

  // ==================== STATE - UI ====================
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ==================== CONSTANTS ====================
  const itemsPerPage = 10;

  // ==================== COMPUTED VALUES ====================
  const hasActiveFilters = !!(
    vesselFilter ||
    projectFilter ||
    shipyardWoFilter ||
    customerWoFilter ||
    kaproFilter ||
    workLocationFilter ||
    workTypeFilter ||
    additionalWoFilter
  );
  const hasSearchTerm = !!workDetailsSearchTerm.trim();

  // Applies every active dropdown filter to a work order list, optionally
  // skipping one filter — used so each filter's own "available options" is
  // computed from every OTHER active filter, not from itself. Without this,
  // picking a value collapses that same dropdown down to just the value you
  // picked, hiding every other option until you reset back to "All".
  type WorkOrderFilterKey =
    | "vessel"
    | "project"
    | "kapro"
    | "workType"
    | "workLocation"
    | "additionalWo"
    | "shipyardWo"
    | "customerWo";

  const applyWorkOrderFilters = useCallback(
    (orders: WorkOrderFullData[], exclude?: WorkOrderFilterKey) => {
      let filtered = orders;

      if (exclude !== "vessel" && vesselFilter) {
        filtered = filtered.filter(
          (wo) => wo.vessel_id === parseInt(vesselFilter),
        );
      }
      if (exclude !== "project" && projectFilter) {
        filtered = filtered.filter(
          (wo) => wo.project_id === parseInt(projectFilter),
        );
      }
      if (exclude !== "kapro" && kaproFilter) {
        if (kaproFilter === "unassigned") {
          filtered = filtered.filter((wo) => !wo.kapro_id);
        } else {
          filtered = filtered.filter(
            (wo) => wo.kapro_id === parseInt(kaproFilter),
          );
        }
      }
      if (exclude !== "workType" && workTypeFilter) {
        filtered = filtered.filter((wo) => wo.work_type === workTypeFilter);
      }
      if (exclude !== "workLocation" && workLocationFilter) {
        filtered = filtered.filter(
          (wo) => wo.work_location === workLocationFilter,
        );
      }
      if (exclude !== "additionalWo" && additionalWoFilter) {
        const isAdditional = additionalWoFilter === "yes";
        filtered = filtered.filter(
          (wo) => wo.is_additional_wo === isAdditional,
        );
      }
      if (exclude !== "shipyardWo" && shipyardWoFilter) {
        filtered = filtered.filter(
          (wo) => wo.shipyard_wo_number === shipyardWoFilter,
        );
      }
      if (exclude !== "customerWo" && customerWoFilter) {
        filtered = filtered.filter(
          (wo) => wo.customer_wo_number === customerWoFilter,
        );
      }

      return filtered;
    },
    [
      vesselFilter,
      projectFilter,
      kaproFilter,
      workTypeFilter,
      workLocationFilter,
      additionalWoFilter,
      shipyardWoFilter,
      customerWoFilter,
    ],
  );

  // Work orders matching every active filter — used to scope the actual
  // work_progress query.
  const filteredWorkOrders = useMemo(
    () => applyWorkOrderFilters(allWorkOrders),
    [allWorkOrders, applyWorkOrderFilters],
  );

  // Available vessels — every OTHER active filter applied, but not vessel.
  const availableVessels = useMemo(() => {
    if (!hasActiveFilters) return allVessels;
    const scoped = applyWorkOrderFilters(allWorkOrders, "vessel");
    const vesselIds = new Set(scoped.map((wo) => wo.vessel_id));
    return allVessels.filter((vessel) => vesselIds.has(vessel.id));
  }, [allVessels, allWorkOrders, applyWorkOrderFilters, hasActiveFilters]);

  // Available projects — every OTHER active filter applied, but not project.
  const availableProjects = useMemo(() => {
    if (!hasActiveFilters) return allProjects;
    const scoped = applyWorkOrderFilters(allWorkOrders, "project");
    const projectIds = new Set(
      scoped
        .map((wo) => wo.project_id)
        .filter((id): id is number => id !== null && id !== undefined),
    );
    return allProjects.filter((project) => projectIds.has(project.id));
  }, [allProjects, allWorkOrders, applyWorkOrderFilters, hasActiveFilters]);

  // Available shipyard WO numbers — every OTHER active filter applied.
  const availableShipyardWoNumbers = useMemo(() => {
    const scoped = applyWorkOrderFilters(allWorkOrders, "shipyardWo");
    const numbers = scoped
      .map((wo) => wo.shipyard_wo_number)
      .filter((num): num is string => !!num);
    return Array.from(new Set(numbers)).sort();
  }, [allWorkOrders, applyWorkOrderFilters]);

  // Available customer WO numbers — every OTHER active filter applied.
  const availableCustomerWoNumbers = useMemo(() => {
    const scoped = applyWorkOrderFilters(allWorkOrders, "customerWo");
    const numbers = scoped
      .map((wo) => wo.customer_wo_number)
      .filter((num): num is string => !!num);
    return Array.from(new Set(numbers)).sort();
  }, [allWorkOrders, applyWorkOrderFilters]);

  // Available work types — every OTHER active filter applied.
  const availableWorkTypes = useMemo(() => {
    const scoped = applyWorkOrderFilters(allWorkOrders, "workType");
    const types = scoped
      .map((wo) => wo.work_type)
      .filter((type): type is string => !!type);
    return Array.from(new Set(types)).sort();
  }, [allWorkOrders, applyWorkOrderFilters]);

  // Available work locations — every OTHER active filter applied.
  const availableWorkLocations = useMemo(() => {
    const scoped = applyWorkOrderFilters(allWorkOrders, "workLocation");
    const locations = scoped
      .map((wo) => wo.work_location)
      .filter((loc): loc is string => !!loc);
    return Array.from(new Set(locations)).sort();
  }, [allWorkOrders, applyWorkOrderFilters]);

  // Available kapros — every OTHER active filter applied, but not kapro.
  const availableKapros = useMemo(() => {
    if (!hasActiveFilters) {
      return {
        kapros: allKapros,
        hasUnassigned: allWorkOrders.some((wo) => !wo.kapro_id),
      };
    }

    const scoped = applyWorkOrderFilters(allWorkOrders, "kapro");
    const kaproIds = new Set(
      scoped
        .map((wo) => wo.kapro_id)
        .filter((id): id is number => id !== null && id !== undefined),
    );

    const filteredKapros = allKapros.filter((kapro) => kaproIds.has(kapro.id));
    const hasUnassigned = scoped.some((wo) => !wo.kapro_id);

    return { kapros: filteredKapros, hasUnassigned };
  }, [allKapros, allWorkOrders, applyWorkOrderFilters, hasActiveFilters]);

  // Filtered vessels for search dropdown
  const filteredVesselsForSearch = useMemo(() => {
    if (!vesselSearchTerm) return availableVessels;

    const searchLower = vesselSearchTerm.toLowerCase();
    return availableVessels.filter((vessel) => {
      const name = vessel.name?.toLowerCase() || "";
      const type = vessel.type?.toLowerCase() || "";
      const company = vessel.company?.toLowerCase() || "";

      return (
        name.includes(searchLower) ||
        type.includes(searchLower) ||
        company.includes(searchLower)
      );
    });
  }, [availableVessels, vesselSearchTerm]);

  // Filtered projects for search dropdown
  const filteredProjectsForSearch = useMemo(() => {
    if (!projectSearchTerm) return availableProjects;

    const searchLower = projectSearchTerm.toLowerCase();
    return availableProjects.filter((project) =>
      project.project_name?.toLowerCase().includes(searchLower),
    );
  }, [availableProjects, projectSearchTerm]);

  // Filtered shipyard WO numbers for search dropdown
  const filteredShipyardWoForSearch = useMemo(() => {
    if (!shipyardWoSearchTerm) return availableShipyardWoNumbers;
    const searchLower = shipyardWoSearchTerm.toLowerCase();
    return availableShipyardWoNumbers.filter((wo) =>
      wo.toLowerCase().includes(searchLower),
    );
  }, [availableShipyardWoNumbers, shipyardWoSearchTerm]);

  // Filtered customer WO numbers for search dropdown
  const filteredCustomerWoForSearch = useMemo(() => {
    if (!customerWoSearchTerm) return availableCustomerWoNumbers;
    const searchLower = customerWoSearchTerm.toLowerCase();
    return availableCustomerWoNumbers.filter((wo) =>
      wo.toLowerCase().includes(searchLower),
    );
  }, [availableCustomerWoNumbers, customerWoSearchTerm]);

  // ==================== DATA FETCHING FUNCTIONS ====================

  const fetchFilterOptions = useCallback(async () => {
    try {
      // Fetch ALL Vessels
      const { data: vesselData, error: vesselError } = await supabase
        .from("vessel")
        .select("id, name, type, company")
        .is("deleted_at", null)
        .order("name", { ascending: true });

      if (vesselError) throw vesselError;
      setAllVessels(vesselData || []);

      // Fetch ALL Projects
      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .select("id, project_name")
        .is("deleted_at", null)
        .order("project_name", { ascending: true });

      if (projectError) throw projectError;
      setAllProjects(projectData || []);

      // Fetch ALL Kapros
      const { data: kaproData, error: kaproError } = await supabase
        .from("kapro")
        .select("id, kapro_name")
        .is("deleted_at", null)
        .order("kapro_name", { ascending: true });

      if (kaproError) throw kaproError;
      setAllKapros(kaproData || []);

      // Fetch this section's work orders with all fields
      const woQuery = supabase
        .from("work_order")
        .select(
          "id, vessel_id, project_id, shipyard_wo_number, customer_wo_number, work_type, work_location, is_additional_wo, kapro_id",
        )
        .is("deleted_at", null);
      const { data: woData, error: woError } = await (isNewBuilding
        ? woQuery.eq("work_type", NEW_BUILDING_WORK_TYPE)
        : woQuery.or(STANDARD_WORK_TYPE_FILTER));

      if (woError) throw woError;
      setAllWorkOrders(woData || []);

      // The vessel and project pickers list only what this section has.
      const sectionVessels = new Set((woData || []).map((wo) => wo.vessel_id));
      const sectionProjects = new Set(
        (woData || []).map((wo) => wo.project_id),
      );
      setAllVessels((vessels) => vessels.filter((v) => sectionVessels.has(v.id)));
      setAllProjects((projects) =>
        projects.filter((p) => sectionProjects.has(p.id)),
      );
    } catch (err) {
      console.error("Error fetching filter options:", err);
    }
  }, [isNewBuilding]);

  const fetchWorkProgress = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all profiles first
      const { data: allProfiles, error: profilesError } =
        await supabase.rpc("get_all_profiles");

      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
      }

      // Create a map for quick lookup
      const profilesMap: Record<number, { id: number; name: string }> = {};
      if (allProfiles) {
        allProfiles.forEach((profile: { id: number; name: string }) => {
          profilesMap[profile.id] = profile;
        });
      }

      // Fetch work progress data
      let query = supabase.from("work_progress").select(
        `
        id,
        progress_percentage,
        report_date,
        notes,
        evidence_url,
        storage_path,
        created_at,
        work_details_id,
        user_id,
        work_details!inner (
          id,
          description,
          location:location_id (
            id,
            location
          ),
          work_order!inner (
            id,
            shipyard_wo_number,
            customer_wo_number,
            work_type,
            work_location,
            is_additional_wo,
            kapro_id,
            vessel!inner (
              id,
              name,
              type
            )
          )
        )
      `,
        { count: "exact" },
      );

      // Scoped to a single work detail (e.g. opened via its "View / Edit
      // Progress" action) takes priority over the dropdown filters below.
      if (!workDetailsId) {
        query = isNewBuilding
          ? query.eq("work_details.work_order.work_type", NEW_BUILDING_WORK_TYPE)
          : query.or(STANDARD_WORK_TYPE_FILTER, {
              referencedTable: "work_details.work_order",
            });
      }

      if (workDetailsId) {
        query = query.eq("work_details_id", workDetailsId);
      } else if (hasActiveFilters) {
        if (filteredWorkOrders.length === 0) {
          setWorkProgress([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }

        // Filter on the embedded work_details instead of first resolving the
        // work orders to a list of work detail ids: that list can exceed
        // PostgREST's 1000-row cap and the URL length limit.
        const workOrderIds = filteredWorkOrders.map((wo) => wo.id);
        query = query
          .in("work_details.work_order_id", workOrderIds)
          .is("work_details.deleted_at", null);
      }

      // Free-text search across work detail description/PIC and progress
      // notes. Resolved to plain numeric id lists first (via safely-encoded
      // .ilike() calls) so the final .or() only ever contains ids we looked
      // up ourselves — never raw user text — avoiding any filter-syntax
      // injection risk from special characters in the search term.
      if (!workDetailsId && hasSearchTerm) {
        const term = `%${workDetailsSearchTerm.trim()}%`;

        const [descMatches, picMatches, notesMatches] = await Promise.all([
          fetchAllRows<{ id: number }>((from, to) =>
            supabase
              .from("work_details")
              .select("id")
              .ilike("description", term)
              .is("deleted_at", null)
              .order("id")
              .range(from, to),
          ),
          fetchAllRows<{ id: number }>((from, to) =>
            supabase
              .from("work_details")
              .select("id")
              .ilike("pic", term)
              .is("deleted_at", null)
              .order("id")
              .range(from, to),
          ),
          fetchAllRows<{ id: number }>((from, to) =>
            supabase
              .from("work_progress")
              .select("id")
              .ilike("notes", term)
              .order("id")
              .range(from, to),
          ),
        ]);

        const matchedDetailIds = new Set([
          ...descMatches.map((d) => d.id),
          ...picMatches.map((d) => d.id),
        ]);
        const matchedProgressIds = new Set(notesMatches.map((p) => p.id));

        // The ids go into the request URL, which has a hard length limit.
        // Fail loudly instead of silently dropping matches.
        if (matchedDetailIds.size + matchedProgressIds.size > MAX_SEARCH_IDS) {
          setWorkProgress([]);
          setTotalCount(0);
          setError(
            "Too many results match this search. Please use a more specific search term.",
          );
          setLoading(false);
          return;
        }

        if (matchedDetailIds.size === 0 && matchedProgressIds.size === 0) {
          setWorkProgress([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }

        const orParts: string[] = [];
        if (matchedProgressIds.size > 0) {
          orParts.push(`id.in.(${Array.from(matchedProgressIds).join(",")})`);
        }
        if (matchedDetailIds.size > 0) {
          orParts.push(
            `work_details_id.in.(${Array.from(matchedDetailIds).join(",")})`,
          );
        }
        query = query.or(orParts.join(","));
      }

      // Apply pagination
      const startIdx = (currentPage - 1) * itemsPerPage;
      query = query
        .order("report_date", { ascending: false })
        .order("created_at", { ascending: false })
        // Imported rows share report_date and created_at; without a unique
        // final key, rows can repeat or be skipped between pages.
        .order("id", { ascending: false })
        .range(startIdx, startIdx + itemsPerPage - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      // Transform data and attach profiles from map
      const progressData = (data || []).map((item: any) => {
        const workDetails = Array.isArray(item.work_details)
          ? item.work_details[0]
          : item.work_details;

        // Get profile from map
        const profile = item.user_id ? profilesMap[item.user_id] : undefined;

        return {
          id: item.id,
          progress_percentage: item.progress_percentage,
          report_date: item.report_date,
          notes: item.notes,
          evidence_url: item.evidence_url,
          storage_path: item.storage_path,
          created_at: item.created_at,
          work_details_id: item.work_details_id,
          user_id: item.user_id ?? 0,
          work_details: {
            id: workDetails.id,
            description: workDetails.description,
            work_location: workDetails.work_order.work_location || "",
            location: workDetails.location
              ? Array.isArray(workDetails.location)
                ? workDetails.location[0]
                : workDetails.location
              : undefined,
            work_order: {
              id: workDetails.work_order.id,
              shipyard_wo_number: workDetails.work_order.shipyard_wo_number,
              vessel: Array.isArray(workDetails.work_order.vessel)
                ? workDetails.work_order.vessel[0]
                : workDetails.work_order.vessel,
            },
          },
          profiles: profile,
        } as WorkProgressWithDetails;
      });

      setWorkProgress(progressData);
      setTotalCount(count || 0);

      await Promise.all([
        calculateMaxProgress(progressData),
        calculateReworkFlags(progressData),
      ]);
    } catch (err) {
      console.error("Error fetching work progress:", err);
      setError("Failed to load work progress data");
    } finally {
      setLoading(false);
    }
  }, [
    currentPage,
    hasActiveFilters,
    hasSearchTerm,
    workDetailsSearchTerm,
    filteredWorkOrders,
    workDetailsId,
    isNewBuilding,
  ]);

  const calculateMaxProgress = async (
    currentProgressData: WorkProgressWithDetails[],
  ) => {
    try {
      const workDetailIds = [
        ...new Set(currentProgressData.map((item) => item.work_details.id)),
      ];

      if (workDetailIds.length === 0) {
        setMaxProgressByWorkDetail({});
        return;
      }

      const { data: maxProgressData, error } = await supabase
        .from("work_progress")
        .select("work_details_id, progress_percentage, report_date, created_at")
        .in("work_details_id", workDetailIds);

      if (error) {
        console.error("Error fetching max progress:", error);
        return;
      }

      // Despite the name, this tracks the CURRENT progress (latest by
      // report_date) rather than the historical peak — matching the
      // convention used everywhere else. That distinction matters now that
      // a rework resubmission can regress below a past 100%, so the old
      // "highest percentage ever" reading would otherwise stay stuck at 100
      // and incorrectly keep showing "Complete" / blocking further reports.
      const maxProgressMap: Record<number, number> = {};

      if (maxProgressData) {
        workDetailIds.forEach((workDetailId) => {
          const progressReports = maxProgressData.filter(
            (item) => item.work_details_id === workDetailId,
          );
          const latest = getLatestProgressRecord(progressReports);
          if (latest) {
            maxProgressMap[workDetailId] = latest.progress_percentage;
          }
        });
      }

      setMaxProgressByWorkDetail(maxProgressMap);
    } catch (err) {
      console.error("Error calculating max progress:", err);
    }
  };

  const calculateReworkFlags = async (
    currentProgressData: WorkProgressWithDetails[],
  ) => {
    try {
      const workDetailIds = [
        ...new Set(currentProgressData.map((item) => item.work_details.id)),
      ];

      if (workDetailIds.length === 0) {
        setNeedsReworkByWorkDetail({});
        return;
      }

      const [progressResult, verificationResult] = await Promise.all([
        supabase
          .from("work_progress")
          .select("work_details_id, created_at")
          .in("work_details_id", workDetailIds),
        supabase
          .from("work_verification")
          .select("work_details_id, status, created_at, deleted_at")
          .in("work_details_id", workDetailIds)
          .is("deleted_at", null),
      ]);

      if (progressResult.error) throw progressResult.error;
      if (verificationResult.error) throw verificationResult.error;

      const latestProgressByWorkDetail = new Map<number, string>();
      (progressResult.data || []).forEach((p) => {
        const current = latestProgressByWorkDetail.get(p.work_details_id);
        if (!current || new Date(p.created_at).getTime() > new Date(current).getTime()) {
          latestProgressByWorkDetail.set(p.work_details_id, p.created_at);
        }
      });

      const latestVerificationByWorkDetail = getLatestVerificationByWorkDetails(
        verificationResult.data || [],
      );

      const reworkMap: Record<number, boolean> = {};
      workDetailIds.forEach((id) => {
        reworkMap[id] = isOpenForRework(
          latestVerificationByWorkDetail.get(id),
          latestProgressByWorkDetail.get(id),
        );
      });

      setNeedsReworkByWorkDetail(reworkMap);
    } catch (err) {
      console.error("Error calculating rework flags:", err);
    }
  };

  // ==================== FILTER HANDLERS ====================

  const handleClearFilters = () => {
    setVesselFilter("");
    setVesselSearchTerm("");
    setProjectFilter("");
    setProjectSearchTerm("");
    setShipyardWoFilter("");
    setShipyardWoSearchTerm("");
    setCustomerWoFilter("");
    setCustomerWoSearchTerm("");
    setKaproFilter("");
    setWorkLocationFilter("");
    setWorkTypeFilter("");
    setAdditionalWoFilter("");
    setWorkDetailsSearchTerm("");
    setCurrentPage(1);
  };

  const handleVesselSearch = (value: string) => {
    setVesselSearchTerm(value);
    setShowVesselDropdown(true);
    if (vesselFilter) {
      setVesselFilter("");
    }
  };

  const handleVesselSelectFromDropdown = (vessel: VesselInfo) => {
    setVesselFilter(vessel.id.toString());
    setVesselSearchTerm(`${vessel.name} - ${vessel.type}`);
    setShowVesselDropdown(false);
    setCurrentPage(1);
  };

  const handleClearVesselSearch = () => {
    setVesselSearchTerm("");
    setVesselFilter("");
    setShowVesselDropdown(false);
    setCurrentPage(1);
  };

  const handleProjectSearch = (value: string) => {
    setProjectSearchTerm(value);
    setShowProjectDropdown(true);
    if (projectFilter) {
      setProjectFilter("");
    }
  };

  const handleProjectSelectFromDropdown = (project: ProjectOption) => {
    setProjectFilter(project.id.toString());
    setProjectSearchTerm(project.project_name);
    setShowProjectDropdown(false);
    setCurrentPage(1);
  };

  const handleClearProjectSearch = () => {
    setProjectSearchTerm("");
    setProjectFilter("");
    setShowProjectDropdown(false);
    setCurrentPage(1);
  };

  const handleShipyardWoSearch = (value: string) => {
    setShipyardWoSearchTerm(value);
    setShowShipyardWoDropdown(true);
    if (shipyardWoFilter) {
      setShipyardWoFilter("");
    }
  };

  const handleShipyardWoSelectFromDropdown = (wo: string) => {
    setShipyardWoFilter(wo);
    setShipyardWoSearchTerm(wo);
    setShowShipyardWoDropdown(false);
    setCurrentPage(1);
  };

  const handleClearShipyardWoSearch = () => {
    setShipyardWoSearchTerm("");
    setShipyardWoFilter("");
    setShowShipyardWoDropdown(false);
    setCurrentPage(1);
  };

  const handleCustomerWoSearch = (value: string) => {
    setCustomerWoSearchTerm(value);
    setShowCustomerWoDropdown(true);
    if (customerWoFilter) {
      setCustomerWoFilter("");
    }
  };

  const handleCustomerWoSelectFromDropdown = (wo: string) => {
    setCustomerWoFilter(wo);
    setCustomerWoSearchTerm(wo);
    setShowCustomerWoDropdown(false);
    setCurrentPage(1);
  };

  const handleClearCustomerWoSearch = () => {
    setCustomerWoSearchTerm("");
    setCustomerWoFilter("");
    setShowCustomerWoDropdown(false);
    setCurrentPage(1);
  };

  // Snapshot of every filter/search/page value, threaded through navigation
  // state so the Edit page can hand it back when the user returns here.
  const buildReturnFilters = () => ({
    vesselFilter,
    vesselSearchTerm,
    projectFilter,
    projectSearchTerm,
    shipyardWoFilter,
    customerWoFilter,
    kaproFilter,
    workLocationFilter,
    workTypeFilter,
    additionalWoFilter,
    workDetailsSearchTerm,
    currentPage,
    showFilters,
  });

  // ==================== NAVIGATION HANDLERS ====================

  const canAddProgress = (workDetailsId: number): boolean => {
    const maxProgress = maxProgressByWorkDetail[workDetailsId] || 0;
    return maxProgress < 100;
  };

  const handleAddProgressFromCurrent = async (
    progressItem: WorkProgressWithDetails,
  ) => {
    if (!canWriteProgress) {
      alert("❌ You don't have permission to add progress reports.");
      return;
    }
    const workDetailsId = progressItem.work_details.id;
    // Captured before the `location` identifier below gets shadowed by the
    // work detail's own location field.
    const returnTo = location.state?.returnTo;

    if (!canAddProgress(workDetailsId)) {
      alert(
        "❌ Cannot add progress report. This work detail has already reached 100% completion.",
      );
      return;
    }

    try {
      const { data: workDetailsData, error: workDetailsError } = await supabase
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
          planned_start_date,
          target_close_date,
          period_close_target,
          work_order!inner (
            id,
            shipyard_wo_number,
            shipyard_wo_date,
            work_location,
            vessel!inner (
              id,
              name,
              type,
              company
            )
          )
        `,
        )
        .eq("id", workDetailsId)
        .single();

      if (workDetailsError) throw workDetailsError;

      // Transform the data inline
      const workOrder = Array.isArray(workDetailsData.work_order)
        ? workDetailsData.work_order[0]
        : workDetailsData.work_order;

      const vessel = Array.isArray(workOrder.vessel)
        ? workOrder.vessel[0]
        : workOrder.vessel;

      const location = workDetailsData.location
        ? Array.isArray(workDetailsData.location)
          ? workDetailsData.location[0]
          : workDetailsData.location
        : null;

      const transformedData = {
        id: workDetailsData.id,
        description: workDetailsData.description,
        location: location?.location || "",
        pic: workDetailsData.pic,
        planned_start_date: workDetailsData.planned_start_date,
        target_close_date: workDetailsData.target_close_date,
        period_close_target: workDetailsData.period_close_target,
        work_order: {
          id: workOrder.id,
          shipyard_wo_number: workOrder.shipyard_wo_number,
          shipyard_wo_date: workOrder.shipyard_wo_date,
          vessel: vessel,
        },
      };

      navigate(`/add-work-progress/${workDetailsId}`, {
        state: {
          workDetails: transformedData,
          currentProgress: progressItem.progress_percentage,
          lastReportDate: progressItem.report_date,
          returnTo,
          prefillData: {
            vesselId: transformedData.work_order.vessel.id,
            vesselName: transformedData.work_order.vessel.name,
            vesselType: transformedData.work_order.vessel.type,
            vesselCompany: transformedData.work_order.vessel.company,
            workOrderId: transformedData.work_order.id,
            workOrderNumber: transformedData.work_order.shipyard_wo_number,
            workOrderDate: transformedData.work_order.shipyard_wo_date,
            workDetailsId: workDetailsId,
            workDescription: transformedData.description,
            location: transformedData.location,
            pic: transformedData.pic,
            plannedStartDate: transformedData.planned_start_date,
            targetCloseDate: transformedData.target_close_date,
            periodCloseTarget: transformedData.period_close_target,
            currentProgressPercentage:
              maxProgressByWorkDetail[workDetailsId] ||
              progressItem.progress_percentage,
            lastProgressPercentage: progressItem.progress_percentage,
            suggestedNextProgress: Math.min(
              (maxProgressByWorkDetail[workDetailsId] ||
                progressItem.progress_percentage) + 10,
              100,
            ),
            fromProgressTable: true,
          },
        },
      });
    } catch (err) {
      console.error("Error fetching work details:", err);
      alert("Failed to load work details. Please try again.");
    }
  };

  const handleAddProgressFromNoResults = () => {
    if (!canWriteProgress) {
      alert("❌ You don't have permission to add progress reports.");
      return;
    }
    navigate("/add-work-progress", {
      state: { returnTo: location.state?.returnTo },
    });
  };

  // ==================== UTILITY FUNCTIONS ====================

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleEvidenceClick = async (storagePath?: string) => {
    if (!storagePath) {
      alert("No evidence file path available");
      return;
    }

    try {
      await openProgressEvidence(storagePath);
    } catch (error) {
      console.error("Error opening evidence:", error);
      alert("Could not open evidence file. Please try again later.");
    }
  };

  // ==================== EFFECTS ====================

  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  useEffect(() => {
    fetchWorkProgress();
  }, [fetchWorkProgress]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    vesselFilter,
    projectFilter,
    shipyardWoFilter,
    customerWoFilter,
    kaproFilter,
    workLocationFilter,
    workTypeFilter,
    additionalWoFilter,
    workDetailsSearchTerm,
  ]);

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
        shipyardWoDropdownRef.current &&
        !shipyardWoDropdownRef.current.contains(event.target as Node)
      ) {
        setShowShipyardWoDropdown(false);
      }
      if (
        customerWoDropdownRef.current &&
        !customerWoDropdownRef.current.contains(event.target as Node)
      ) {
        setShowCustomerWoDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Restore filters handed back by the Edit page when the user returns here,
  // so clicking "Edit" and then going back doesn't reset the whole list.
  useEffect(() => {
    const returnFilters = (location.state as any)?.returnFilters;
    if (!returnFilters) return;

    if (returnFilters.vesselFilter) setVesselFilter(returnFilters.vesselFilter);
    if (returnFilters.vesselSearchTerm)
      setVesselSearchTerm(returnFilters.vesselSearchTerm);
    if (returnFilters.projectFilter)
      setProjectFilter(returnFilters.projectFilter);
    if (returnFilters.projectSearchTerm)
      setProjectSearchTerm(returnFilters.projectSearchTerm);
    if (returnFilters.shipyardWoFilter) {
      setShipyardWoFilter(returnFilters.shipyardWoFilter);
      setShipyardWoSearchTerm(returnFilters.shipyardWoFilter);
    }
    if (returnFilters.customerWoFilter) {
      setCustomerWoFilter(returnFilters.customerWoFilter);
      setCustomerWoSearchTerm(returnFilters.customerWoFilter);
    }
    if (returnFilters.kaproFilter) setKaproFilter(returnFilters.kaproFilter);
    if (returnFilters.workLocationFilter)
      setWorkLocationFilter(returnFilters.workLocationFilter);
    if (returnFilters.workTypeFilter)
      setWorkTypeFilter(returnFilters.workTypeFilter);
    if (returnFilters.additionalWoFilter)
      setAdditionalWoFilter(returnFilters.additionalWoFilter);
    if (returnFilters.workDetailsSearchTerm)
      setWorkDetailsSearchTerm(returnFilters.workDetailsSearchTerm);
    if (returnFilters.currentPage) setCurrentPage(returnFilters.currentPage);
    if (returnFilters.showFilters) setShowFilters(true);

    // Clear the navigation state so a later refresh doesn't re-apply it.
    window.history.replaceState({ ...window.history.state, usr: undefined }, "");
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==================== RENDER FUNCTIONS ====================

  const activeFilterCount = [
    vesselFilter,
    projectFilter,
    shipyardWoFilter,
    customerWoFilter,
    kaproFilter,
    workLocationFilter,
    workTypeFilter,
    additionalWoFilter,
    workDetailsSearchTerm,
  ].filter(Boolean).length;
  const anyFilter = hasActiveFilters || hasSearchTerm;

  const renderFilterSection = () => {
    if (workDetailsId) return null;

    const countHint = (shown: number, all: number) =>
      shown < all ? ` (${shown} of ${all})` : "";

    return (
      <section
        aria-label="Find progress reports"
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
      >
        <form role="search" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="wp-search" className={labelClass}>
            Search progress reports
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
              aria-hidden="true"
            />
            <input
              id="wp-search"
              type="search"
              value={workDetailsSearchTerm}
              onChange={(e) => setWorkDetailsSearchTerm(e.target.value)}
              placeholder="Work detail description, PIC or notes"
              className={`${fieldClass} pl-9`}
            />
          </div>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-controls="wp-filters"
            className={secondaryButton}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {showFilters ? "Hide filters" : "More filters"}
            {activeFilterCount > 0 && (
              <span className="rounded bg-blue-950 px-1.5 text-xs font-semibold tabular-nums text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          {anyFilter && (
            <button
              type="button"
              onClick={handleClearFilters}
              className={secondaryButton}
            >
              Clear filters
            </button>
          )}
        </div>

        {showFilters && (
          <div
            id="wp-filters"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <FilterCombo
              label={`Vessel${countHint(availableVessels.length, allVessels.length)}`}
              placeholder="Search vessel"
              value={vesselSearchTerm}
              onInputChange={handleVesselSearch}
              onClear={handleClearVesselSearch}
              options={filteredVesselsForSearch.map((vessel) => ({
                key: vessel.id,
                label: vessel.name,
                detail: `${vessel.type} · ${vessel.company}`,
                selected: vesselFilter === vessel.id.toString(),
              }))}
              onSelect={(key) => {
                const vessel = allVessels.find((v) => v.id === key);
                if (vessel) handleVesselSelectFromDropdown(vessel);
              }}
              open={showVesselDropdown}
              onOpenChange={setShowVesselDropdown}
              emptyText="No vessels found"
              containerRef={vesselDropdownRef}
            />

            <FilterCombo
              label={`Project${countHint(availableProjects.length, allProjects.length)}`}
              placeholder="Search project"
              value={projectSearchTerm}
              onInputChange={handleProjectSearch}
              onClear={handleClearProjectSearch}
              options={filteredProjectsForSearch.map((project) => ({
                key: project.id,
                label: project.project_name,
                selected: projectFilter === project.id.toString(),
              }))}
              onSelect={(key) => {
                const project = allProjects.find((p) => p.id === key);
                if (project) handleProjectSelectFromDropdown(project);
              }}
              open={showProjectDropdown}
              onOpenChange={setShowProjectDropdown}
              emptyText="No projects found"
              containerRef={projectDropdownRef}
            />

            <FilterCombo
              label="Shipyard WO number"
              placeholder={
                availableShipyardWoNumbers.length === 0
                  ? "No work order available"
                  : "Search shipyard WO"
              }
              value={shipyardWoSearchTerm}
              onInputChange={handleShipyardWoSearch}
              onClear={handleClearShipyardWoSearch}
              options={filteredShipyardWoForSearch.map((wo) => ({
                key: wo,
                label: wo,
                selected: shipyardWoFilter === wo,
              }))}
              onSelect={(key) => handleShipyardWoSelectFromDropdown(String(key))}
              open={showShipyardWoDropdown}
              onOpenChange={setShowShipyardWoDropdown}
              disabled={availableShipyardWoNumbers.length === 0}
              emptyText="No shipyard WO found"
              containerRef={shipyardWoDropdownRef}
            />

            <FilterCombo
              label="Customer WO number"
              placeholder={
                availableCustomerWoNumbers.length === 0
                  ? "No customer WO available"
                  : "Search customer WO"
              }
              value={customerWoSearchTerm}
              onInputChange={handleCustomerWoSearch}
              onClear={handleClearCustomerWoSearch}
              options={filteredCustomerWoForSearch.map((wo) => ({
                key: wo,
                label: wo,
                selected: customerWoFilter === wo,
              }))}
              onSelect={(key) => handleCustomerWoSelectFromDropdown(String(key))}
              open={showCustomerWoDropdown}
              onOpenChange={setShowCustomerWoDropdown}
              disabled={availableCustomerWoNumbers.length === 0}
              emptyText="No customer WO found"
              containerRef={customerWoDropdownRef}
            />

            <div>
              <label htmlFor="wp-type" className={labelClass}>
                Work type
              </label>
              <select
                id="wp-type"
                value={workTypeFilter}
                onChange={(e) => setWorkTypeFilter(e.target.value)}
                disabled={availableWorkTypes.length === 0}
                className={fieldClass}
              >
                <option value="">
                  {availableWorkTypes.length === 0
                    ? "No types available"
                    : "All types"}
                </option>
                {availableWorkTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="wp-location" className={labelClass}>
                Work location
              </label>
              <select
                id="wp-location"
                value={workLocationFilter}
                onChange={(e) => setWorkLocationFilter(e.target.value)}
                disabled={availableWorkLocations.length === 0}
                className={fieldClass}
              >
                <option value="">
                  {availableWorkLocations.length === 0
                    ? "No locations available"
                    : "All locations"}
                </option>
                {availableWorkLocations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="wp-kapro" className={labelClass}>
                Kapro
              </label>
              <select
                id="wp-kapro"
                value={kaproFilter}
                onChange={(e) => setKaproFilter(e.target.value)}
                disabled={
                  availableKapros.kapros.length === 0 &&
                  !availableKapros.hasUnassigned
                }
                className={fieldClass}
              >
                <option value="">
                  {availableKapros.kapros.length === 0 &&
                  !availableKapros.hasUnassigned
                    ? "No kapros available"
                    : "All kapros"}
                </option>
                {availableKapros.hasUnassigned && (
                  <option value="unassigned">Unassigned</option>
                )}
                {availableKapros.kapros.map((kapro) => (
                  <option key={kapro.id} value={kapro.id.toString()}>
                    {kapro.kapro_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="wp-additional" className={labelClass}>
                Additional WO
              </label>
              <select
                id="wp-additional"
                value={additionalWoFilter}
                onChange={(e) => setAdditionalWoFilter(e.target.value)}
                className={fieldClass}
              >
                <option value="">All</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>
        )}

        {anyFilter && (
          <ul aria-label="Active filters" className="flex flex-wrap gap-2">
            {vesselFilter && (
              <FilterChip
                label="Vessel"
                value={
                  allVessels.find((v) => v.id.toString() === vesselFilter)
                    ?.name || vesselFilter
                }
                onRemove={handleClearVesselSearch}
              />
            )}
            {projectFilter && (
              <FilterChip
                label="Project"
                value={
                  allProjects.find((p) => p.id.toString() === projectFilter)
                    ?.project_name || projectFilter
                }
                onRemove={handleClearProjectSearch}
              />
            )}
            {shipyardWoFilter && (
              <FilterChip
                label="Shipyard WO"
                value={shipyardWoFilter}
                onRemove={handleClearShipyardWoSearch}
              />
            )}
            {customerWoFilter && (
              <FilterChip
                label="Customer WO"
                value={customerWoFilter}
                onRemove={handleClearCustomerWoSearch}
              />
            )}
            {workTypeFilter && (
              <FilterChip
                label="Type"
                value={workTypeFilter}
                onRemove={() => setWorkTypeFilter("")}
              />
            )}
            {workLocationFilter && (
              <FilterChip
                label="Location"
                value={workLocationFilter}
                onRemove={() => setWorkLocationFilter("")}
              />
            )}
            {kaproFilter && (
              <FilterChip
                label="Kapro"
                value={
                  kaproFilter === "unassigned"
                    ? "Unassigned"
                    : allKapros.find((k) => k.id.toString() === kaproFilter)
                        ?.kapro_name || kaproFilter
                }
                onRemove={() => setKaproFilter("")}
              />
            )}
            {additionalWoFilter && (
              <FilterChip
                label="Additional"
                value={additionalWoFilter === "yes" ? "Yes" : "No"}
                onRemove={() => setAdditionalWoFilter("")}
              />
            )}
            {workDetailsSearchTerm && (
              <FilterChip
                label="Search"
                value={workDetailsSearchTerm}
                onRemove={() => setWorkDetailsSearchTerm("")}
              />
            )}
          </ul>
        )}

        <p role="status" className="text-sm text-slate-600">
          {loading
            ? "Loading progress reports"
            : `${totalCount} progress report${totalCount === 1 ? "" : "s"}`}
        </p>
      </section>
    );
  };

  const renderContent = () => {
    if (error) {
      return (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-red-900">
            <span className="font-semibold">
              Progress reports could not load.
            </span>{" "}
            {error}
          </p>
          <button
            type="button"
            onClick={fetchWorkProgress}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-red-700 bg-white px-4 text-sm font-medium text-red-800 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      );
    }

    if (loading) {
      return <TableSkeleton label="Loading work progress..." />;
    }

    if (workProgress.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
          <BarChart3
            className="mx-auto h-8 w-8 text-slate-500"
            aria-hidden="true"
          />
          <p className="mt-2 text-sm font-medium text-slate-900">
            No progress reports found
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {anyFilter
              ? "No progress reports match these filters."
              : "No progress reports have been recorded yet."}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {anyFilter && (
              <button
                type="button"
                onClick={handleClearFilters}
                className={secondaryButton}
              >
                Show all progress reports
              </button>
            )}
            {canWriteProgress && (
              <button
                type="button"
                onClick={handleAddProgressFromNoResults}
                className={primaryButton}
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Add progress
                report
              </button>
            )}
          </div>
        </div>
      );
    }

    const heading = (label: string) => (
      <th
        scope="col"
        className="whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-slate-700"
      >
        {label}
      </th>
    );

    return (
      <>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="table-stack min-w-full divide-y divide-slate-200">
              <caption className="sr-only">
                Progress reports, newest first
              </caption>
              <thead className="bg-slate-50">
                <tr>
                  {heading("Progress")}
                  {heading("Work detail")}
                  {heading("Vessel and work order")}
                  {heading("Report date")}
                  {heading("Notes")}
                  {heading("Reported by")}
                  {heading("Evidence")}
                  {canWriteProgress && heading("Actions")}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {workProgress.map((item) => {
                  const itemDetailId = item.work_details.id;
                  const isCompleted = !canAddProgress(itemDetailId);
                  const maxProgress =
                    maxProgressByWorkDetail[itemDetailId] ||
                    item.progress_percentage;

                  return (
                    <tr
                      key={item.id}
                      className="align-top transition-colors hover:bg-slate-50"
                    >
                      <td className="px-4 py-3">
                        <ProgressCell
                          item={item}
                          isCompleted={isCompleted}
                          maxProgress={maxProgress}
                          onAddProgress={handleAddProgressFromCurrent}
                          readOnly={!canWriteProgress}
                        />
                      </td>
                      <td data-label="Description" className="px-4 py-3">
                        <WorkDetailsCell
                          workDetails={item.work_details}
                          isCompleted={isCompleted}
                          needsRework={needsReworkByWorkDetail[itemDetailId]}
                        />
                      </td>
                      <td data-label="Vessel and work order" className="px-4 py-3">
                        <VesselWorkOrderCell
                          vessel={item.work_details.work_order.vessel}
                          shipyardWoNumber={
                            item.work_details.work_order.shipyard_wo_number
                          }
                        />
                      </td>
                      <td
                        data-label="Report date"
                        className="whitespace-nowrap px-4 py-3 text-sm text-slate-900"
                      >
                        {formatDate(item.report_date)}
                      </td>
                      <td data-label="Notes" className="px-4 py-3 text-sm">
                        <NotesCell notes={item.notes} />
                      </td>
                      <td data-label="Reported by" className="px-4 py-3 text-sm">
                        <div className="text-slate-900">
                          {item.profiles?.name || "Unknown user"}
                        </div>
                        <div className="whitespace-nowrap text-slate-600">
                          {formatDateTime(item.created_at)}
                        </div>
                      </td>
                      <td data-label="Evidence" className="px-4 py-3 text-sm">
                        <EvidenceCell
                          storagePath={item.storage_path}
                          onClick={handleEvidenceClick}
                        />
                      </td>
                      {canWriteProgress && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end md:justify-start">
                            <button
                              type="button"
                              onClick={() =>
                                navigate(`/work-progress/edit/${item.id}`, {
                                  state: {
                                    returnFilters: buildReturnFilters(),
                                    returnTo: location.state?.returnTo,
                                  },
                                })
                              }
                              title="Edit this progress report"
                              aria-label={`Edit progress report of ${item.work_details.description}`}
                              className={`${iconButton} text-blue-800`}
                            >
                              <Edit className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <Pagination
          page={currentPage}
          totalItems={totalCount}
          pageSize={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      </>
    );
  };

  // ==================== MAIN RENDER ====================

  return (
    <div className={`${embedded ? "" : pageShell} space-y-6`}>
      {!embedded && (
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              Work Progress
            </h1>
            <p className="mt-1 text-sm text-slate-600 sm:text-base">
              {workDetailsId
                ? "Every progress report of one work detail."
                : `Progress reports of ${isNewBuilding ? "new building" : "docking and repair"} work, newest first.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={fetchWorkProgress}
              className={secondaryButton}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
            </button>
            {canWriteProgress && (
              <button
                type="button"
                onClick={() =>
                  navigate("/add-work-progress", {
                    state: { returnTo: location.state?.returnTo },
                  })
                }
                className={primaryButton}
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Add progress
                report
              </button>
            )}
          </div>
        </header>
      )}

      {renderFilterSection()}
      {renderContent()}
    </div>
  );
}

// ==================== HELPER COMPONENTS ====================

function FilterChip({
  label,
  value,
  onRemove,
}: {
  label: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <li className="inline-flex min-h-10 items-center gap-1 rounded-md border border-slate-300 bg-slate-50 pl-3 text-sm text-slate-900">
      <span>
        <span className="text-slate-600">{label}:</span> {value}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-200"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
}

// The percent this report recorded, as a bar. A work detail that is not yet at
// 100% offers "Add report", which starts the next report from this one.
function ProgressCell({
  item,
  isCompleted,
  maxProgress,
  onAddProgress,
  readOnly,
}: {
  item: WorkProgressWithDetails;
  isCompleted: boolean;
  maxProgress: number;
  onAddProgress: (item: WorkProgressWithDetails) => void;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-1">
      <ProgressMeter
        value={item.progress_percentage}
        label={`Progress recorded by this report for ${item.work_details.description}`}
      />
      {maxProgress > item.progress_percentage && (
        <p className="text-xs text-slate-600">Latest report: {maxProgress}%</p>
      )}
      {!isCompleted && !readOnly && (
        <button
          type="button"
          onClick={() => onAddProgress(item)}
          title={`Add a new progress report (latest is ${maxProgress}%)`}
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-blue-800 hover:bg-blue-50 sm:min-h-10"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add report
        </button>
      )}
    </div>
  );
}

function WorkDetailsCell({
  workDetails,
  isCompleted,
  needsRework,
}: {
  workDetails: WorkProgressWithDetails["work_details"];
  isCompleted: boolean;
  needsRework?: boolean;
}) {
  const locationText = workDetails.location
    ? typeof workDetails.location === "string"
      ? workDetails.location
      : (workDetails.location as { id: number; location: string }).location
    : "";

  return (
    <div>
      <p className="text-sm font-medium text-slate-900">
        {workDetails.description}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {isCompleted && (
          <span className={`${tagBase} bg-emerald-50 text-emerald-800`}>
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Complete
          </span>
        )}
        {needsRework && (
          <span className={`${tagBase} bg-red-50 text-red-800`}>
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            Needs rework
          </span>
        )}
        {locationText && (
          <span className={`${tagBase} bg-slate-100 text-slate-800`}>
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {locationText}
          </span>
        )}
        {workDetails.work_location && (
          <span className={`${tagBase} bg-slate-100 text-slate-800`}>
            <Pin className="h-3.5 w-3.5" aria-hidden="true" />
            {workDetails.work_location}
          </span>
        )}
      </div>
    </div>
  );
}

function VesselWorkOrderCell({
  vessel,
  shipyardWoNumber,
}: {
  vessel: { name: string; type: string };
  shipyardWoNumber: string;
}) {
  return (
    <div className="text-sm">
      <div className="font-medium text-slate-900">{vessel.name}</div>
      <div className="text-slate-900">{shipyardWoNumber}</div>
      <div className="text-slate-600">{vessel.type}</div>
    </div>
  );
}

function NotesCell({ notes }: { notes?: string }) {
  const [open, setOpen] = useState(false);

  if (!notes) {
    return <span className="whitespace-nowrap text-slate-600">No notes</span>;
  }

  return (
    <div className="max-w-xs">
      <p className="line-clamp-2 text-slate-900" title={notes}>
        {notes}
      </p>
      {notes.length > 60 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-ml-2 inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-blue-800 hover:bg-blue-50 sm:min-h-10"
        >
          Read all
        </button>
      )}
      {open && (
        <Dialog
          title="Progress note"
          onClose={() => setOpen(false)}
          footer={
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={secondaryButton}
            >
              Close
            </button>
          }
        >
          <p className="whitespace-pre-line text-sm text-slate-900">{notes}</p>
        </Dialog>
      )}
    </div>
  );
}

function EvidenceCell({
  storagePath,
  onClick,
}: {
  storagePath?: string;
  onClick: (storagePath?: string) => void;
}) {
  if (!storagePath) {
    return <span className="whitespace-nowrap text-slate-600">No evidence</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onClick(storagePath)}
      className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-blue-800 hover:bg-blue-50 sm:min-h-10"
    >
      <Camera className="h-4 w-4" aria-hidden="true" /> View evidence
    </button>
  );
}
