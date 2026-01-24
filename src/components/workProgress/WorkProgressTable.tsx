/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { openProgressEvidence } from "../../utils/progressEvidenceHandler";
import type { WorkProgressWithDetails } from "../../types/progressTypes";
import { useAuth } from "../../hooks/useAuth";
import {
  Search,
  RefreshCw,
  Ship,
  FileText,
  File,
  Wrench,
  MapPin,
  HardHat,
  AlertTriangle,
  X,
  Plus,
  BarChart3,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Calendar,
  Edit,
  Camera,
  Pin,
} from "lucide-react";

// ==================== INTERFACES ====================

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

interface WorkOrderFullData {
  id: number;
  vessel_id: number;
  shipyard_wo_number: string;
  customer_wo_number?: string;
  work_type?: string;
  work_location?: string;
  is_additional_wo?: boolean;
  kapro_id?: number;
}

// ==================== MAIN COMPONENT ====================

export default function WorkProgressTable({
  workDetailsId,
  embedded = false,
}: WorkProgressTableProps) {
  const navigate = useNavigate();
  const { isReadOnly } = useAuth();

  // ==================== STATE - Data ====================
  const [workProgress, setWorkProgress] = useState<WorkProgressWithDetails[]>(
    [],
  );
  const [totalCount, setTotalCount] = useState(0);
  const [maxProgressByWorkDetail, setMaxProgressByWorkDetail] = useState<
    Record<number, number>
  >({});

  // ==================== STATE - Filters ====================
  const [showFilters, setShowFilters] = useState(false);
  const [vesselFilter, setVesselFilter] = useState("");
  const [vesselSearchTerm, setVesselSearchTerm] = useState("");
  const [showVesselDropdown, setShowVesselDropdown] = useState(false);
  const [shipyardWoFilter, setShipyardWoFilter] = useState("");
  const [customerWoFilter, setCustomerWoFilter] = useState("");
  const [kaproFilter, setKaproFilter] = useState("");
  const [workLocationFilter, setWorkLocationFilter] = useState("");
  const [workTypeFilter, setWorkTypeFilter] = useState("");
  const [additionalWoFilter, setAdditionalWoFilter] = useState("");

  // ==================== STATE - Filter Options ====================
  const [allVessels, setAllVessels] = useState<VesselInfo[]>([]);
  const [allWorkOrders, setAllWorkOrders] = useState<WorkOrderFullData[]>([]);
  const [allKapros, setAllKapros] = useState<Kapro[]>([]);
  const vesselDropdownRef = useRef<HTMLDivElement>(null);

  // ==================== STATE - UI ====================
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ==================== CONSTANTS ====================
  const itemsPerPage = 10;
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage + 1;
  const endIndex = Math.min(currentPage * itemsPerPage, totalCount);

  // ==================== COMPUTED VALUES ====================
  const hasActiveFilters =
    vesselFilter ||
    shipyardWoFilter ||
    customerWoFilter ||
    kaproFilter ||
    workLocationFilter ||
    workTypeFilter ||
    additionalWoFilter;

  // ✅ Dynamically filter work orders based on active filters
  const filteredWorkOrders = useMemo(() => {
    let filtered = allWorkOrders;

    // Filter by vessel
    if (vesselFilter) {
      filtered = filtered.filter(
        (wo) => wo.vessel_id === parseInt(vesselFilter),
      );
    }

    // Filter by kapro
    if (kaproFilter) {
      if (kaproFilter === "unassigned") {
        filtered = filtered.filter((wo) => !wo.kapro_id);
      } else {
        filtered = filtered.filter(
          (wo) => wo.kapro_id === parseInt(kaproFilter),
        );
      }
    }

    // Filter by work type
    if (workTypeFilter) {
      filtered = filtered.filter((wo) => wo.work_type === workTypeFilter);
    }

    // Filter by work location
    if (workLocationFilter) {
      filtered = filtered.filter(
        (wo) => wo.work_location === workLocationFilter,
      );
    }

    // Filter by additional WO
    if (additionalWoFilter) {
      const isAdditional = additionalWoFilter === "yes";
      filtered = filtered.filter((wo) => wo.is_additional_wo === isAdditional);
    }

    // Filter by shipyard WO number
    if (shipyardWoFilter) {
      filtered = filtered.filter(
        (wo) => wo.shipyard_wo_number === shipyardWoFilter,
      );
    }

    // Filter by customer WO number
    if (customerWoFilter) {
      filtered = filtered.filter(
        (wo) => wo.customer_wo_number === customerWoFilter,
      );
    }

    return filtered;
  }, [
    allWorkOrders,
    vesselFilter,
    kaproFilter,
    workTypeFilter,
    workLocationFilter,
    additionalWoFilter,
    shipyardWoFilter,
    customerWoFilter,
  ]);

  // ✅ Available vessels based on filtered work orders
  const availableVessels = useMemo(() => {
    if (!hasActiveFilters) return allVessels;

    const vesselIds = new Set(filteredWorkOrders.map((wo) => wo.vessel_id));
    return allVessels.filter((vessel) => vesselIds.has(vessel.id));
  }, [allVessels, filteredWorkOrders, hasActiveFilters]);

  // ✅ Available shipyard WO numbers based on filtered work orders
  const availableShipyardWoNumbers = useMemo(() => {
    const numbers = filteredWorkOrders
      .map((wo) => wo.shipyard_wo_number)
      .filter((num): num is string => !!num);
    return Array.from(new Set(numbers)).sort();
  }, [filteredWorkOrders]);

  // ✅ Available customer WO numbers based on filtered work orders
  const availableCustomerWoNumbers = useMemo(() => {
    const numbers = filteredWorkOrders
      .map((wo) => wo.customer_wo_number)
      .filter((num): num is string => !!num);
    return Array.from(new Set(numbers)).sort();
  }, [filteredWorkOrders]);

  // ✅ Available work types based on filtered work orders
  const availableWorkTypes = useMemo(() => {
    const types = filteredWorkOrders
      .map((wo) => wo.work_type)
      .filter((type): type is string => !!type);
    return Array.from(new Set(types)).sort();
  }, [filteredWorkOrders]);

  // ✅ Available work locations based on filtered work orders
  const availableWorkLocations = useMemo(() => {
    const locations = filteredWorkOrders
      .map((wo) => wo.work_location)
      .filter((loc): loc is string => !!loc);
    return Array.from(new Set(locations)).sort();
  }, [filteredWorkOrders]);

  // ✅ FIXED: Available kapros based on filtered work orders
  const availableKapros = useMemo(() => {
    if (!hasActiveFilters) {
      return {
        kapros: allKapros,
        hasUnassigned: allWorkOrders.some((wo) => !wo.kapro_id),
      };
    }

    const kaproIds = new Set(
      filteredWorkOrders
        .map((wo) => wo.kapro_id)
        .filter((id): id is number => id !== null && id !== undefined),
    );

    const filteredKapros = allKapros.filter((kapro) => kaproIds.has(kapro.id));
    const hasUnassigned = filteredWorkOrders.some((wo) => !wo.kapro_id);

    return { kapros: filteredKapros, hasUnassigned };
  }, [allKapros, filteredWorkOrders, hasActiveFilters, allWorkOrders]);

  // ✅ Filtered vessels for search dropdown
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

      // Fetch ALL Kapros
      const { data: kaproData, error: kaproError } = await supabase
        .from("kapro")
        .select("id, kapro_name")
        .is("deleted_at", null)
        .order("kapro_name", { ascending: true });

      if (kaproError) throw kaproError;
      setAllKapros(kaproData || []);

      // Fetch ALL work orders with all fields
      const { data: woData, error: woError } = await supabase
        .from("work_order")
        .select(
          "id, vessel_id, shipyard_wo_number, customer_wo_number, work_type, work_location, is_additional_wo, kapro_id",
        )
        .is("deleted_at", null);

      if (woError) throw woError;
      setAllWorkOrders(woData || []);
    } catch (err) {
      console.error("Error fetching filter options:", err);
    }
  }, []);

  const fetchWorkProgress = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // ✅ STEP 1: Fetch all profiles first using RPC function
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

      // ✅ STEP 2: Fetch work progress WITHOUT profiles join
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

      // Apply filters only if any filter is active
      if (hasActiveFilters) {
        if (filteredWorkOrders.length === 0) {
          setWorkProgress([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }

        const workOrderIds = filteredWorkOrders.map((wo) => wo.id);
        const { data: workDetailsInOrders, error: wdError } = await supabase
          .from("work_details")
          .select("id")
          .in("work_order_id", workOrderIds)
          .is("deleted_at", null);

        if (wdError) throw wdError;

        if (!workDetailsInOrders || workDetailsInOrders.length === 0) {
          setWorkProgress([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }

        const workDetailsIds = workDetailsInOrders.map((wd) => wd.id);
        query = query.in("work_details_id", workDetailsIds);
      }

      // Apply pagination
      const startIdx = (currentPage - 1) * itemsPerPage;
      query = query
        .order("report_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(startIdx, startIdx + itemsPerPage - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      // ✅ STEP 3: Transform data and attach profiles from map
      const progressData = (data || []).map((item: any) => {
        const workDetails = Array.isArray(item.work_details)
          ? item.work_details[0]
          : item.work_details;

        // ✅ Get profile from map using user_id
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
          profiles: profile, // ✅ Now properly mapped from profilesMap
        } as WorkProgressWithDetails;
      });

      setWorkProgress(progressData);
      setTotalCount(count || 0);

      await calculateMaxProgress(progressData);
    } catch (err) {
      console.error("Error fetching work progress:", err);
      setError("Failed to load work progress data");
    } finally {
      setLoading(false);
    }
  }, [currentPage, hasActiveFilters, filteredWorkOrders]);

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
        .select("work_details_id, progress_percentage")
        .in("work_details_id", workDetailIds)
        .order("progress_percentage", { ascending: false });

      if (error) {
        console.error("Error fetching max progress:", error);
        return;
      }

      const maxProgressMap: Record<number, number> = {};

      if (maxProgressData) {
        workDetailIds.forEach((workDetailId) => {
          const progressReports = maxProgressData.filter(
            (item) => item.work_details_id === workDetailId,
          );
          if (progressReports.length > 0) {
            maxProgressMap[workDetailId] = Math.max(
              ...progressReports.map((item) => item.progress_percentage),
            );
          }
        });
      }

      setMaxProgressByWorkDetail(maxProgressMap);
    } catch (err) {
      console.error("Error calculating max progress:", err);
    }
  };

  // ==================== FILTER HANDLERS ====================

  const handleClearFilters = () => {
    setVesselFilter("");
    setVesselSearchTerm("");
    setShipyardWoFilter("");
    setCustomerWoFilter("");
    setKaproFilter("");
    setWorkLocationFilter("");
    setWorkTypeFilter("");
    setAdditionalWoFilter("");
    setCurrentPage(1);
  };

  const clearAllFilters = () => {
    handleClearFilters();
  };

  const handleVesselSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVesselSearchTerm(e.target.value);
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

  // ==================== NAVIGATION HANDLERS ====================

  const canAddProgress = (workDetailsId: number): boolean => {
    const maxProgress = maxProgressByWorkDetail[workDetailsId] || 0;
    return maxProgress < 100;
  };

  const handleAddProgressFromCurrent = async (
    progressItem: WorkProgressWithDetails,
  ) => {
    if (isReadOnly) {
      alert("❌ You don't have permission to add progress reports.");
      return;
    }
    const workDetailsId = progressItem.work_details.id;

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

      // ✅ FIX: Transform the data inline instead of using deleted function
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
    if (isReadOnly) {
      alert("❌ You don't have permission to add progress reports.");
      return;
    }
    navigate("/add-work-progress");
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

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return "bg-green-100 text-green-800 border-green-200";
    if (progress >= 75) return "bg-blue-100 text-blue-800 border-blue-200";
    if (progress >= 50)
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    if (progress >= 25)
      return "bg-orange-100 text-orange-800 border-orange-200";
    return "bg-red-100 text-red-800 border-red-200";
  };

  const getProgressIcon = (progress: number) => {
    if (progress >= 100)
      return <CheckCircle2 className="w-5 h-5 text-green-600" />;
    if (progress >= 75) return <Circle className="w-5 h-5 text-blue-600" />;
    if (progress >= 50) return <Circle className="w-5 h-5 text-yellow-600" />;
    if (progress >= 25) return <Circle className="w-5 h-5 text-orange-600" />;
    return <Circle className="w-5 h-5 text-red-600" />;
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
    shipyardWoFilter,
    customerWoFilter,
    kaproFilter,
    workLocationFilter,
    workTypeFilter,
    additionalWoFilter,
  ]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        vesselDropdownRef.current &&
        !vesselDropdownRef.current.contains(event.target as Node)
      ) {
        setShowVesselDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // ==================== RENDER FUNCTIONS ====================

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-1 justify-between sm:hidden">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            onClick={() =>
              setCurrentPage(Math.min(totalPages, currentPage + 1))
            }
            disabled={currentPage === totalPages}
            className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
        <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-700">
              Showing <span className="font-medium">{startIndex}</span> to{" "}
              <span className="font-medium">{endIndex}</span> of{" "}
              <span className="font-medium">{totalCount}</span> results
            </p>
          </div>
          <div>
            <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              {pages.map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                    page === currentPage
                      ? "z-10 bg-blue-600 text-white"
                      : "text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() =>
                  setCurrentPage(Math.min(totalPages, currentPage + 1))
                }
                disabled={currentPage === totalPages}
                className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </nav>
          </div>
        </div>
      </div>
    );
  };

  const renderFilterSection = () => {
    if (workDetailsId) return null;

    return (
      <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Search className="w-5 h-5" /> Filters
            </h3>
            {hasActiveFilters && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-bold">
                {
                  [
                    vesselFilter,
                    shipyardWoFilter,
                    customerWoFilter,
                    kaproFilter,
                    workLocationFilter,
                    workTypeFilter,
                    additionalWoFilter,
                  ].filter(Boolean).length
                }
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <RefreshCw className="w-4 h-4" /> Clear All Filters
              </button>
            )}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                showFilters || hasActiveFilters
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {showFilters ? "Hide Filters" : "Show Filters"}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Vessel Filter with Search Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <Ship className="w-4 h-4" /> Vessel
                  {availableVessels.length < allVessels.length && (
                    <span className="ml-2 text-xs text-blue-600">
                      ({availableVessels.length} of {allVessels.length})
                    </span>
                  )}
                </label>
                <div className="relative" ref={vesselDropdownRef}>
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

                  {showVesselDropdown &&
                    filteredVesselsForSearch.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredVesselsForSearch.map((vessel) => (
                          <div
                            key={vessel.id}
                            onClick={() =>
                              handleVesselSelectFromDropdown(vessel)
                            }
                            className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                              vesselFilter === vessel.id.toString()
                                ? "bg-blue-100"
                                : ""
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

                  {showVesselDropdown &&
                    filteredVesselsForSearch.length === 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3 text-center text-sm text-gray-500">
                        No vessels found
                      </div>
                    )}
                </div>
              </div>

              {/* Shipyard WO Number Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <FileText className="w-4 h-4" /> Shipyard WO Number
                  {availableShipyardWoNumbers.length > 0 && (
                    <span className="ml-2 text-xs text-blue-600">
                      ({availableShipyardWoNumbers.length})
                    </span>
                  )}
                </label>
                <select
                  value={shipyardWoFilter}
                  onChange={(e) => setShipyardWoFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  disabled={availableShipyardWoNumbers.length === 0}
                >
                  <option value="">
                    {availableShipyardWoNumbers.length === 0
                      ? "No WO available"
                      : "All Shipyard WO"}
                  </option>
                  {availableShipyardWoNumbers.map((wo) => (
                    <option key={wo} value={wo}>
                      {wo}
                    </option>
                  ))}
                </select>
              </div>

              {/* Customer WO Number Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <File className="w-4 h-4" /> Customer WO Number
                  {availableCustomerWoNumbers.length > 0 && (
                    <span className="ml-2 text-xs text-blue-600">
                      ({availableCustomerWoNumbers.length})
                    </span>
                  )}
                </label>
                <select
                  value={customerWoFilter}
                  onChange={(e) => setCustomerWoFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  disabled={availableCustomerWoNumbers.length === 0}
                >
                  <option value="">
                    {availableCustomerWoNumbers.length === 0
                      ? "No customer WO available"
                      : "All Customer WO"}
                  </option>
                  {availableCustomerWoNumbers.map((wo) => (
                    <option key={wo} value={wo}>
                      {wo}
                    </option>
                  ))}
                </select>
              </div>

              {/* Work Type Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <Wrench className="w-4 h-4" /> Work Type
                  {availableWorkTypes.length > 0 && (
                    <span className="ml-2 text-xs text-blue-600">
                      ({availableWorkTypes.length})
                    </span>
                  )}
                </label>
                <select
                  value={workTypeFilter}
                  onChange={(e) => setWorkTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  disabled={availableWorkTypes.length === 0}
                >
                  <option value="">
                    {availableWorkTypes.length === 0
                      ? "No types available"
                      : "All Types"}
                  </option>
                  {availableWorkTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Work Location Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <MapPin className="w-4 h-4" /> Work Location
                  {availableWorkLocations.length > 0 && (
                    <span className="ml-2 text-xs text-blue-600">
                      ({availableWorkLocations.length})
                    </span>
                  )}
                </label>
                <select
                  value={workLocationFilter}
                  onChange={(e) => setWorkLocationFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  disabled={availableWorkLocations.length === 0}
                >
                  <option value="">
                    {availableWorkLocations.length === 0
                      ? "No locations available"
                      : "All Locations"}
                  </option>
                  {availableWorkLocations.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
              </div>

              {/* Kapro Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <HardHat className="w-4 h-4" /> Kapro
                  {availableKapros.kapros.length > 0 && (
                    <span className="ml-2 text-xs text-blue-600">
                      ({availableKapros.kapros.length}
                      {availableKapros.hasUnassigned ? " + unassigned" : ""})
                    </span>
                  )}
                </label>
                <select
                  value={kaproFilter}
                  onChange={(e) => setKaproFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  disabled={
                    availableKapros.kapros.length === 0 &&
                    !availableKapros.hasUnassigned
                  }
                >
                  <option value="">
                    {availableKapros.kapros.length === 0 &&
                    !availableKapros.hasUnassigned
                      ? "No kapros available"
                      : "All Kapros"}
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

              {/* Additional WO Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> Additional WO
                </label>
                <select
                  value={additionalWoFilter}
                  onChange={(e) => setAdditionalWoFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>

            {/* Active Filters Display */}
            {hasActiveFilters && (
              <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200">
                <span className="text-sm text-gray-600 font-medium">
                  Active filters:
                </span>
                {vesselFilter && (
                  <FilterPill
                    label="Vessel"
                    value={
                      allVessels.find((v) => v.id.toString() === vesselFilter)
                        ?.name || vesselFilter
                    }
                    onRemove={handleClearVesselSearch}
                  />
                )}
                {shipyardWoFilter && (
                  <FilterPill
                    label="Shipyard WO"
                    value={shipyardWoFilter}
                    onRemove={() => setShipyardWoFilter("")}
                  />
                )}
                {customerWoFilter && (
                  <FilterPill
                    label="Customer WO"
                    value={customerWoFilter}
                    onRemove={() => setCustomerWoFilter("")}
                  />
                )}
                {workTypeFilter && (
                  <FilterPill
                    label="Type"
                    value={workTypeFilter}
                    onRemove={() => setWorkTypeFilter("")}
                  />
                )}
                {workLocationFilter && (
                  <FilterPill
                    label="Location"
                    value={workLocationFilter}
                    onRemove={() => setWorkLocationFilter("")}
                  />
                )}
                {kaproFilter && (
                  <FilterPill
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
                  <FilterPill
                    label="Additional"
                    value={additionalWoFilter === "yes" ? "Yes" : "No"}
                    onRemove={() => setAdditionalWoFilter("")}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error</h3>
          <p className="text-red-600 mt-1">{error}</p>
          <button
            onClick={fetchWorkProgress}
            className="mt-3 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading work progress...</span>
        </div>
      );
    }

    if (workProgress.length === 0) {
      return (
        <div className="text-center py-12">
          <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No Progress Reports Found
          </h3>
          <p className="text-gray-500 mb-4">
            {hasActiveFilters
              ? "No progress reports match your current filters."
              : "No progress reports have been recorded yet."}
          </p>

          <div className="flex gap-3 justify-center">
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
              >
                Clear Filters
              </button>
            )}
            {!isReadOnly && (
              <button
                onClick={handleAddProgressFromNoResults}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Progress Report
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Progress
                  {!isReadOnly && (
                    <div className="text-xs text-gray-400 font-normal mt-1">
                      (Click to add new)
                    </div>
                  )}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Work Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Vessel & Work Order
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Report Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Notes
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Reported By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Evidence
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Created
                </th>
                {!isReadOnly && (
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {workProgress.map((item) => {
                const workDetailsId = item.work_details.id;
                const isCompleted = !canAddProgress(workDetailsId);
                const maxProgress =
                  maxProgressByWorkDetail[workDetailsId] ||
                  item.progress_percentage;

                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <ProgressCell
                        item={item}
                        isCompleted={isCompleted}
                        maxProgress={maxProgress}
                        onAddProgress={handleAddProgressFromCurrent}
                        getProgressColor={getProgressColor}
                        getProgressIcon={getProgressIcon}
                        isReadOnly={isReadOnly}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <WorkDetailsCell
                        workDetails={item.work_details}
                        isCompleted={isCompleted}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <VesselWorkOrderCell
                        vessel={item.work_details.work_order.vessel}
                        shipyardWoNumber={
                          item.work_details.work_order.shipyard_wo_number
                        }
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />{" "}
                        {formatDate(item.report_date)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <NotesCell notes={item.notes} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <ReportedByCell profiles={item.profiles} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <EvidenceCell
                        storagePath={item.storage_path}
                        onClick={handleEvidenceClick}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                      {formatDateTime(item.created_at)}
                    </td>
                    {!isReadOnly && (
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() =>
                            navigate(`/work-progress/edit/${item.id}`)
                          }
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium inline-flex items-center gap-1 hover:underline"
                          title="Edit this progress report"
                        >
                          <Edit className="w-4 h-4" /> Edit
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {renderPagination()}
      </div>
    );
  };

  // ==================== MAIN RENDER ====================

  return (
    <div className={`${embedded ? "" : "p-8"}`}>
      {!embedded && (
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Work Progress Reports
              </h1>
              <p className="text-gray-600">
                Track detailed progress reports for work activities
              </p>
            </div>
            {!isReadOnly && (
              <button
                onClick={() => navigate("/add-work-progress")}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Progress Report
              </button>
            )}
          </div>
        </div>
      )}

      {renderFilterSection()}
      {renderContent()}
    </div>
  );
}

// ==================== HELPER COMPONENTS ====================

function FilterPill({
  label,
  value,
  onRemove,
}: {
  label: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
      {label}: {value}
      <button onClick={onRemove} className="hover:text-blue-900 font-bold">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

function ProgressCell({
  item,
  isCompleted,
  maxProgress,
  onAddProgress,
  getProgressColor,
  getProgressIcon,
  isReadOnly,
}: {
  item: WorkProgressWithDetails;
  isCompleted: boolean;
  maxProgress: number;
  onAddProgress: (item: WorkProgressWithDetails) => void;
  getProgressColor: (progress: number) => string;
  getProgressIcon: (progress: number) => React.ReactElement;
  isReadOnly: boolean;
}) {
  if (isCompleted || isReadOnly) {
    return (
      <div className="w-full text-left p-2 rounded-lg bg-gray-50 border border-gray-200 cursor-not-allowed opacity-75">
        <div className="flex items-center">
          <span className="mr-2">
            {getProgressIcon(item.progress_percentage)}
          </span>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getProgressColor(
              item.progress_percentage,
            )}`}
          >
            {item.progress_percentage}%
          </span>
          <span className="ml-2 text-xs text-gray-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Completed
          </span>
        </div>
        <div className="mt-1 w-20">
          <div className="bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-green-600 h-1.5 rounded-full"
              style={{ width: `${item.progress_percentage}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => onAddProgress(item)}
      className="w-full text-left group cursor-pointer hover:bg-blue-50 rounded-lg p-2 transition-all border border-transparent hover:border-blue-200"
      title={`Click to add new progress report (Current max: ${maxProgress}%)`}
    >
      <div className="flex items-center">
        <span className="mr-2">
          {getProgressIcon(item.progress_percentage)}
        </span>
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getProgressColor(
            item.progress_percentage,
          )} group-hover:scale-105 transition-transform`}
        >
          {item.progress_percentage}%
        </span>
        {maxProgress > item.progress_percentage && (
          <span className="ml-1 text-xs text-orange-600">
            (Max: {maxProgress}%)
          </span>
        )}
        <span className="ml-2 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <Plus className="w-3 h-3" /> Add new
        </span>
      </div>
      <div className="mt-1 w-20">
        <div className="bg-gray-200 rounded-full h-1.5">
          <div
            className="bg-blue-600 h-1.5 rounded-full transition-all group-hover:bg-blue-700"
            style={{ width: `${item.progress_percentage}%` }}
          />
        </div>
      </div>
    </button>
  );
}

function WorkDetailsCell({
  workDetails,
  isCompleted,
}: {
  workDetails: WorkProgressWithDetails["work_details"];
  isCompleted: boolean;
}) {
  const locationText = workDetails.location
    ? typeof workDetails.location === "string"
      ? workDetails.location
      : (workDetails.location as { id: number; location: string }).location
    : "";

  return (
    <div>
      <div className="flex items-center">
        <div className="text-sm font-medium text-gray-900">
          {workDetails.description}
        </div>
        {isCompleted && (
          <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle2 className="w-3 h-3" /> Complete
          </span>
        )}
      </div>
      {locationText && (
        <div className="text-sm text-gray-500 flex items-center gap-1">
          <MapPin className="w-4 h-4" /> {locationText}
        </div>
      )}
      {workDetails.work_location && (
        <div className="text-xs text-gray-600 mt-0.5 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-flex items-center gap-1">
          <Pin className="w-3 h-3" /> {workDetails.work_location}
        </div>
      )}
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
    <div>
      <div className="text-sm text-gray-900 flex items-center gap-1">
        <Ship className="w-4 h-4" /> {vessel.name}
      </div>
      <div className="text-sm text-gray-500 flex items-center gap-1">
        <FileText className="w-4 h-4" /> {shipyardWoNumber}
      </div>
      <div className="text-xs text-gray-400">{vessel.type}</div>
    </div>
  );
}

function NotesCell({ notes }: { notes?: string }) {
  if (!notes) {
    return <span className="text-gray-400 italic">No notes</span>;
  }

  return (
    <div className="max-w-xs">
      <div className="text-gray-900 line-clamp-2" title={notes}>
        {notes}
      </div>
      {notes.length > 60 && (
        <button
          onClick={() => alert(`Notes:\n\n${notes}`)}
          className="text-blue-600 hover:text-blue-800 text-xs mt-1"
        >
          Read more
        </button>
      )}
    </div>
  );
}

function ReportedByCell({ profiles }: { profiles?: { name: string } }) {
  return (
    <div>
      <div className="text-sm text-gray-900">
        {profiles?.name || "Unknown User"}
      </div>
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
    return <span className="text-gray-400">No evidence</span>;
  }

  return (
    <button
      onClick={() => onClick(storagePath)}
      className="text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline"
    >
      <Camera className="w-4 h-4" /> View Evidence
    </button>
  );
}
