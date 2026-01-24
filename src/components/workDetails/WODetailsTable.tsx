import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  Ship,
  FileText,
  User,
  MapPin,
  Edit,
  Trash2,
  ChevronRight,
  CheckCircle2,
  Circle,
  AlertTriangle,
  X,
  Clock,
  RefreshCw,
  Plus,
  Wrench,
  HardHat,
  BarChart3,
  Calendar,
  ClipboardList,
  ArrowLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  FileCheck,
} from "lucide-react";

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

export default function WODetailsTable({
  workOrderId,
  onRefresh,
  embedded = false,
}: WorkDetailsTableProps) {
  const { profile, isReadOnly } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // State Management
  const [workDetails, setWorkDetails] = useState<WorkDetailsWithWorkOrder[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sorting & Pagination
  const [sortField, setSortField] = useState<
    "planned_start_date" | "target_close_date" | "created_at" | "description"
  >(
    ():
      | "planned_start_date"
      | "target_close_date"
      | "created_at"
      | "description" => {
      const sort = searchParams.get("sortField");
      return (
        (sort as
          | "planned_start_date"
          | "target_close_date"
          | "created_at"
          | "description") || "planned_start_date"
      );
    },
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(() => {
    const direction = searchParams.get("sortDirection");
    return (direction as "asc" | "desc") || "asc";
  });
  const [currentPage, setCurrentPage] = useState(() => {
    const page = searchParams.get("page");
    return page ? parseInt(page) : 1;
  });
  const itemsPerPage = 10;

  // UI State
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [detailToDelete, setDetailToDelete] =
    useState<WorkDetailsWithWorkOrder | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter State
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [selectedVesselId, setSelectedVesselId] = useState<number>(() => {
    const vesselId = searchParams.get("vesselId");
    return vesselId ? parseInt(vesselId) : workOrderId || 0;
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
  const [workOrderSearchTerm, setWorkOrderSearchTerm] = useState(
    () => searchParams.get("woSearch") || "",
  );
  const [workDetailsSearchTerm, setWorkDetailsSearchTerm] = useState(
    () => searchParams.get("search") || "",
  );

  // Dropdown State
  const [showVesselDropdown, setShowVesselDropdown] = useState(false);
  const [showWorkOrderDropdown, setShowWorkOrderDropdown] = useState(false);
  const [loadingVessels, setLoadingVessels] = useState(false);
  const [loadingWorkOrders, setLoadingWorkOrders] = useState(false);

  // Refs
  const vesselDropdownRef = useRef<HTMLDivElement>(null);
  const workOrderDropdownRef = useRef<HTMLDivElement>(null);

  // ==================== COMPUTED VALUES ====================

  // ✅ FIXED: Added customer_wo_number to search filter
  const filteredWorkDetailsForDisplay = useMemo(() => {
    if (!workDetailsSearchTerm) return workDetails;

    const searchLower = workDetailsSearchTerm.toLowerCase();
    return workDetails.filter((wd) => {
      return (
        wd.description?.toLowerCase().includes(searchLower) ||
        wd.location?.location?.toLowerCase().includes(searchLower) ||
        wd.pic?.toLowerCase().includes(searchLower) ||
        wd.work_order?.shipyard_wo_number
          ?.toLowerCase()
          .includes(searchLower) ||
        wd.work_order?.customer_wo_number
          ?.toLowerCase()
          .includes(searchLower) || // ✅ ADDED
        wd.spk_number?.toLowerCase().includes(searchLower) ||
        wd.spkk_number?.toLowerCase().includes(searchLower) ||
        wd.ptw_number?.toLowerCase().includes(searchLower) ||
        wd.work_scope?.work_scope?.toLowerCase().includes(searchLower)
      );
    });
  }, [workDetails, workDetailsSearchTerm]);

  // Pagination calculations
  const totalItems = filteredWorkDetailsForDisplay.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentWorkDetails = filteredWorkDetailsForDisplay.slice(
    startIndex,
    endIndex,
  );

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

  // ==================== DATA FETCHING ====================

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

  const fetchWorkOrdersForVessel = useCallback(async (vesselId: number) => {
    try {
      setLoadingWorkOrders(true);
      const { data, error } = await supabase
        .from("work_order")
        .select("*")
        .eq("vessel_id", vesselId)
        .is("deleted_at", null)
        .order("shipyard_wo_number", { ascending: true });

      if (error) throw error;
      setWorkOrders(data || []);
    } catch (err) {
      console.error("Error fetching work orders:", err);
    } finally {
      setLoadingWorkOrders(false);
    }
  }, []);

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

  const fetchWorkDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let baseQuery = supabase
        .from("work_details")
        .select(
          `
          *,
          work_order (
            id,
            shipyard_wo_number,
            customer_wo_number,
            vessel (id, name, type, company)
          ),
          profiles (id, name, email),
          work_progress (id, progress_percentage, report_date, created_at),
          location:location_id (id, location),
          work_scope:work_scope_id (id, work_scope)
        `,
        )
        .is("deleted_at", null);

      // Apply filters
      if (workOrderId) {
        baseQuery = baseQuery.eq("work_order_id", workOrderId);
      } else if (selectedWorkOrderId > 0) {
        baseQuery = baseQuery.eq("work_order_id", selectedWorkOrderId);
      } else if (selectedVesselId > 0) {
        const { data: vesselWorkOrders } = await supabase
          .from("work_order")
          .select("id")
          .eq("vessel_id", selectedVesselId)
          .is("deleted_at", null);

        if (vesselWorkOrders && vesselWorkOrders.length > 0) {
          const workOrderIds = vesselWorkOrders.map((wo) => wo.id);
          baseQuery = baseQuery.in("work_order_id", workOrderIds);
        } else {
          setWorkDetails([]);
          setLoading(false);
          return;
        }
      }

      // Add sorting
      const query = baseQuery.order(sortField, {
        ascending: sortDirection === "asc",
      });

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      // Process work details with progress data
      const workDetailsWithProgress = (data || []).map((detail) => {
        const progressRecords = detail.work_progress || [];

        if (progressRecords.length === 0) {
          return {
            ...detail,
            current_progress: 0,
            latest_progress_date: undefined,
            progress_count: 0,
          };
        }

        const sortedProgress = [...progressRecords].sort(
          (a, b) =>
            new Date(b.report_date).getTime() -
            new Date(a.report_date).getTime(),
        );

        return {
          ...detail,
          current_progress: sortedProgress[0]?.progress_percentage || 0,
          latest_progress_date: sortedProgress[0]?.report_date,
          progress_count: progressRecords.length,
        };
      });

      setWorkDetails(workDetailsWithProgress);
    } catch (err) {
      console.error("Error in fetchWorkDetails:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [
    selectedVesselId,
    selectedWorkOrderId,
    workOrderId,
    sortField,
    sortDirection,
  ]);

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

  const handleVesselSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVesselSearchTerm(e.target.value);
    setShowVesselDropdown(true);
    if (selectedVesselId) {
      setSelectedVesselId(0);
      setSelectedWorkOrderId(0);
      setWorkOrders([]);
    }
  };

  const updateUrlParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      const newParams = new URLSearchParams(searchParams);

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "" || value === 0) {
          newParams.delete(key);
        } else {
          newParams.set(key, String(value));
        }
      });

      setSearchParams(newParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleVesselSelectFromDropdown = (vessel: Vessel) => {
    const vesselDisplayText = `${vessel.name} - ${vessel.type} (${vessel.company})`;

    setSelectedVesselId(vessel.id);
    setVesselSearchTerm(vesselDisplayText);
    setShowVesselDropdown(false);
    setSelectedWorkOrderId(0);
    setWorkOrderSearchTerm("");
    setCurrentPage(1);

    // ✅ Persist to URL
    updateUrlParams({
      vesselId: vessel.id,
      vesselSearch: vesselDisplayText,
      workOrderId: null,
      woSearch: null,
      page: 1,
    });

    fetchWorkOrdersForVessel(vessel.id);
  };

  const handleClearVesselSearch = () => {
    setVesselSearchTerm("");
    setSelectedVesselId(0);
    setShowVesselDropdown(false);
    setSelectedWorkOrderId(0);
    setWorkOrderSearchTerm("");
    setWorkOrders([]);
    setCurrentPage(1);
    setSelectedWorkOrderDetails(null);

    // ✅ Clear URL params
    updateUrlParams({
      vesselId: null,
      vesselSearch: null,
      workOrderId: null,
      woSearch: null,
      page: 1,
    });
  };

  const handleWorkOrderSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWorkOrderSearchTerm(e.target.value);
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

    // ✅ Persist to URL
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

    // ✅ Clear URL params
    updateUrlParams({
      workOrderId: null,
      woSearch: null,
      page: 1,
    });
  };

  const handleSort = (field: typeof sortField) => {
    const newDirection =
      sortField === field && sortDirection === "asc" ? "desc" : "asc";
    setSortField(field);
    setSortDirection(newDirection);
    setCurrentPage(1);

    // ✅ Persist to URL
    updateUrlParams({
      sortField: field,
      sortDirection: newDirection,
      page: 1,
    });
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);

    // ✅ Persist to URL
    updateUrlParams({ page });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleAddWorkDetails = () => {
    // ✅ FIX: Save current filter state before navigating
    const filterState = {
      vesselId: selectedVesselId,
      vesselSearch: vesselSearchTerm,
      workOrderId: selectedWorkOrderId,
      woSearch: workOrderSearchTerm,
      search: workDetailsSearchTerm,
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
      workOrderId: selectedWorkOrderId,
      woSearch: workOrderSearchTerm,
      search: workDetailsSearchTerm,
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
      const { error } = await supabase
        .from("work_details")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", detailToDelete.id);

      if (error) throw error;

      const newTotalItems = totalItems - 1;
      const newTotalPages = Math.ceil(newTotalItems / itemsPerPage);
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

    // ✅ Persist to URL with debounce
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

  const getStatus = (detail: WorkDetailsWithWorkOrder) => {
    if (detail.actual_close_date) {
      return {
        text: "Completed",
        color: "bg-green-100 text-green-800 border-green-200",
        icon: <CheckCircle2 className="w-4 h-4" />,
      };
    } else if (detail.actual_start_date) {
      return {
        text: "In Progress",
        color: "bg-blue-100 text-blue-800 border-blue-200",
        icon: <Clock className="w-4 h-4" />,
      };
    } else {
      // ✅ REMOVED: storage_path check
      return {
        text: "Not Ready",
        color: "bg-red-100 text-red-600 border-red-200",
        icon: <Circle className="w-4 h-4 text-red-600 fill-red-600" />,
      };
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return "bg-green-500";
    if (progress >= 75) return "bg-blue-500";
    if (progress >= 50) return "bg-yellow-500";
    if (progress >= 25) return "bg-orange-500";
    return "bg-red-500";
  };

  const getProgressIcon = (progress: number) => {
    if (progress >= 100)
      return <CheckCircle2 className="w-4 h-4 text-green-600" />;
    if (progress >= 75)
      return <Circle className="w-4 h-4 text-blue-600 fill-blue-600" />;
    if (progress >= 50)
      return <Circle className="w-4 h-4 text-yellow-600 fill-yellow-600" />;
    if (progress >= 25)
      return <Circle className="w-4 h-4 text-orange-600 fill-orange-600" />;
    return <Circle className="w-4 h-4 text-red-600 fill-red-600" />;
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field)
      return <ArrowUpDown className="w-4 h-4 inline ml-1" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="w-4 h-4 inline ml-1" />
    ) : (
      <ArrowDown className="w-4 h-4 inline ml-1" />
    );
  };

  // ==================== EFFECTS ====================

  // ✅ IMPROVED: Better click outside handling with proper cleanup
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
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ✅ IMPROVED: Added ESC key to close dropdowns
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowVesselDropdown(false);
        setShowWorkOrderDropdown(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  useEffect(() => {
    if (!workOrderId) {
      fetchVessels();
    }
  }, [workOrderId, fetchVessels]);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [workDetailsSearchTerm]);

  useEffect(() => {
    // Check if we're returning from edit with saved filters
    const navigationState = window.history.state?.usr?.returnFilters;

    if (navigationState) {
      console.log("🔄 Restoring filters from navigation:", navigationState);

      // Create an async function to restore filters in sequence
      const restoreFiltersAndFetch = async () => {
        try {
          // Step 1: Restore simple filters immediately
          if (navigationState.search) {
            setWorkDetailsSearchTerm(navigationState.search);
          }
          if (navigationState.sortField) {
            setSortField(navigationState.sortField);
            setSortDirection(navigationState.sortDirection);
          }
          if (navigationState.page) {
            setCurrentPage(navigationState.page);
          }

          // Step 2: Restore vessel and work order filters
          if (navigationState.vesselId) {
            console.log("Restoring vessel:", navigationState.vesselId);
            setSelectedVesselId(navigationState.vesselId);
            setVesselSearchTerm(navigationState.vesselSearch || "");

            // Fetch work orders for the vessel
            await fetchWorkOrdersForVessel(navigationState.vesselId);

            if (navigationState.workOrderId) {
              console.log("Restoring work order:", navigationState.workOrderId);
              setSelectedWorkOrderId(navigationState.workOrderId);
              setWorkOrderSearchTerm(navigationState.woSearch || "");

              // Fetch work order details
              await fetchWorkOrderDetails(navigationState.workOrderId);
            }
          }

          // Step 3: Update URL params to match restored state
          const newParams = new URLSearchParams();
          Object.entries(navigationState).forEach(([key, value]) => {
            if (value && value !== 0) {
              newParams.set(key, String(value));
            }
          });
          setSearchParams(newParams, { replace: true });

          // Step 4: Clear navigation state to prevent re-triggering
          window.history.replaceState(
            { ...window.history.state, usr: undefined },
            "",
          );

          console.log("✅ Filters restored, now fetching work details...");

          // Step 5: Wait for state updates then fetch with a longer delay
          setTimeout(() => {
            // Force refetch by directly calling the fetch with the restored values
            fetchWorkDetailsWithFilters(
              navigationState.vesselId || 0,
              navigationState.workOrderId || 0,
              navigationState.sortField || "planned_start_date",
              navigationState.sortDirection || "asc",
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
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedVesselId,
    selectedWorkOrderId,
    sortField,
    sortDirection,
    fetchWorkDetails,
  ]);

  const fetchWorkDetailsWithFilters = useCallback(
    async (
      vesselIdParam: number,
      workOrderIdParam: number,
      sortFieldParam: typeof sortField,
      sortDirectionParam: "asc" | "desc",
    ) => {
      try {
        setLoading(true);
        setError(null);

        let baseQuery = supabase
          .from("work_details")
          .select(
            `
        *,
        work_order (
          id,
          shipyard_wo_number,
          customer_wo_number,
          vessel (id, name, type, company)
        ),
        profiles (id, name, email),
        work_progress (id, progress_percentage, report_date, created_at),
        location:location_id (id, location),
        work_scope:work_scope_id (id, work_scope)
      `,
          )
          .is("deleted_at", null);

        // Apply filters using the parameters
        if (workOrderId) {
          baseQuery = baseQuery.eq("work_order_id", workOrderId);
        } else if (workOrderIdParam > 0) {
          baseQuery = baseQuery.eq("work_order_id", workOrderIdParam);
        } else if (vesselIdParam > 0) {
          const { data: vesselWorkOrders } = await supabase
            .from("work_order")
            .select("id")
            .eq("vessel_id", vesselIdParam)
            .is("deleted_at", null);

          if (vesselWorkOrders && vesselWorkOrders.length > 0) {
            const workOrderIds = vesselWorkOrders.map((wo) => wo.id);
            baseQuery = baseQuery.in("work_order_id", workOrderIds);
          } else {
            setWorkDetails([]);
            setLoading(false);
            return;
          }
        }

        // Add sorting using the parameters
        const query = baseQuery.order(sortFieldParam, {
          ascending: sortDirectionParam === "asc",
        });

        const { data, error: queryError } = await query;

        if (queryError) throw queryError;

        // Process work details with progress data
        const workDetailsWithProgress = (data || []).map((detail) => {
          const progressRecords = detail.work_progress || [];

          if (progressRecords.length === 0) {
            return {
              ...detail,
              current_progress: 0,
              latest_progress_date: undefined,
              progress_count: 0,
            };
          }

          const sortedProgress = [...progressRecords].sort(
            (a, b) =>
              new Date(b.report_date).getTime() -
              new Date(a.report_date).getTime(),
          );

          return {
            ...detail,
            current_progress: sortedProgress[0]?.progress_percentage || 0,
            latest_progress_date: sortedProgress[0]?.report_date,
            progress_count: progressRecords.length,
          };
        });

        setWorkDetails(workDetailsWithProgress);
      } catch (err) {
        console.error("Error in fetchWorkDetailsWithFilters:", err);
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    },
    [workOrderId],
  );

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

    if (selectedVesselId > 0 && workOrders.length === 0) {
      fetchWorkOrdersForVessel(selectedVesselId);
    }

    if (selectedWorkOrderId > 0 && !selectedWorkOrderDetails) {
      fetchWorkOrderDetails(selectedWorkOrderId);
    }
  }, [
    selectedVesselId,
    selectedWorkOrderId,
    vessels.length,
    workOrders.length,
    selectedWorkOrderDetails,
    vesselSearchTerm,
    fetchVessels,
    fetchWorkOrdersForVessel,
    fetchWorkOrderDetails,
  ]);

  // ==================== RENDER COMPONENTS ====================

  const renderTableHeader = () => (
    <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
      <tr>
        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
          Details
        </th>
        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
          Work Scope
        </th>
        <th
          onClick={() => handleSort("description")}
          className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition-colors"
        >
          Description {getSortIcon("description")}
        </th>
        {/* ✅ MERGED: SPK & SPKK Column */}
        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
          SPK & SPKK
        </th>
        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
          Quantity
        </th>
        <th
          onClick={() => handleSort("target_close_date")}
          className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition-colors"
        >
          Start / Target {getSortIcon("target_close_date")}
        </th>
        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
          Progress
        </th>
        {!isReadOnly && (
          <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
            Actions
          </th>
        )}
      </tr>
    </thead>
  );

  const renderTableRow = (detail: WorkDetailsWithWorkOrder) => {
    const status = getStatus(detail);
    const isExpanded = expandedRows.has(detail.id);

    return (
      <>
        <tr key={detail.id} className="hover:bg-gray-50 transition-colors">
          <td className="px-6 py-4">
            <button
              onClick={() => toggleRowExpansion(detail.id)}
              className="flex items-center gap-2 text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors"
              aria-label={isExpanded ? "Hide details" : "Show details"} // ✅ ADDED
            >
              <ChevronRight
                className={`w-5 h-5 transform transition-transform duration-200 ${
                  isExpanded ? "rotate-90" : ""
                }`}
              />
              <span className="text-xs text-gray-500">
                {isExpanded ? "Hide" : "Show"}
              </span>
            </button>
          </td>

          <td className="px-6 py-4 whitespace-nowrap">
            <div className="text-sm">
              <div className="font-medium text-gray-900">
                {detail.work_scope?.work_scope || "N/A"}
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${status.color}`}
                >
                  {status.icon} {status.text}
                </span>
              </div>
            </div>
          </td>

          <td className="px-6 py-4">
            <div className="max-w-md">
              <div className="text-sm text-gray-900" title={detail.description}>
                {detail.description.length > 80
                  ? `${detail.description.substring(0, 80)}...`
                  : detail.description}
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                  <User className="w-3 h-3" /> {detail.pic || "Not assigned"}
                </span>
                {detail.location && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    <MapPin className="w-3 h-3" /> {detail.location.location}
                  </span>
                )}
              </div>
            </div>
          </td>

          <td className="px-6 py-4">
            <div className="text-sm space-y-1">
              {detail.spk_number && (
                <div className="flex items-baseline gap-1">
                  <span className="text-xs text-gray-500 min-w-[40px]">
                    SPK:
                  </span>
                  <span className="font-medium text-gray-900">
                    {detail.spk_number}
                  </span>
                </div>
              )}
              {detail.spkk_number && (
                <div className="flex items-baseline gap-1">
                  <span className="text-xs text-gray-500 min-w-[40px]">
                    SPKK:
                  </span>
                  <span className="font-medium text-gray-900">
                    {detail.spkk_number}
                  </span>
                </div>
              )}
              {!detail.spk_number && !detail.spkk_number && (
                <span className="text-gray-400 text-xs">Not set</span>
              )}
            </div>
          </td>

          <td className="px-6 py-4 whitespace-nowrap">
            <div className="text-sm">
              <div className="font-bold text-blue-900 text-base">
                {detail.quantity || 0}
              </div>
              <div className="text-xs text-blue-700 font-medium">
                {detail.uom || "N/A"}
              </div>
            </div>
          </td>

          <td className="px-6 py-4 whitespace-nowrap">
            <div className="text-sm">
              <div className="font-bold text-blue-900 text-base">
                {detail.quantity || 0}
              </div>
              <div className="text-xs text-blue-700 font-medium">
                {detail.uom || "N/A"}
              </div>
            </div>
          </td>

          <td className="px-6 py-4 whitespace-nowrap">
            <div className="text-sm space-y-1">
              <div className="flex items-center gap-1 text-gray-900">
                <span className="text-xs text-gray-500">Start:</span>
                <span className="font-medium">
                  {formatDate(detail.planned_start_date)}
                </span>
              </div>
              <div className="flex items-center gap-1 text-gray-900">
                <span className="text-xs text-gray-500">Target:</span>
                <span className="font-medium">
                  {formatDate(detail.target_close_date)}
                </span>
              </div>
            </div>
          </td>

          <td className="px-6 py-4 whitespace-nowrap">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-[80px]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">
                    {detail.current_progress || 0}%
                  </span>
                  <span className="text-xs">
                    {getProgressIcon(detail.current_progress || 0)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(
                      detail.current_progress || 0,
                    )}`}
                    style={{ width: `${detail.current_progress || 0}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </td>

          {!isReadOnly && (
            <td className="px-6 py-4 whitespace-nowrap text-center">
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => handleEditWorkDetails(detail.id)}
                  className="text-blue-600 hover:text-blue-900 transition-colors p-1 rounded hover:bg-blue-50"
                  title="Edit"
                  aria-label={`Edit ${detail.description}`}
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteWorkDetails(detail)}
                  className="text-red-600 hover:text-red-900 transition-colors p-1 rounded hover:bg-red-50"
                  title="Delete"
                  aria-label={`Delete ${detail.description}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </td>
          )}
        </tr>

        {isExpanded && (
          <tr className="bg-gray-50 animate-in fade-in slide-in-from-top-2 duration-300">
            <td colSpan={isReadOnly ? 8 : 9} className="px-0 py-0">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-t border-b border-blue-200">
                <div className="px-6 py-4 transition-all duration-300 ease-in-out">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Full Description */}
                    <div className="lg:col-span-2">
                      <label className="flex items-center gap-1 text-xs font-semibold text-gray-600 uppercase mb-2">
                        <ClipboardList className="w-4 h-4" /> Full Description
                      </label>
                      <p className="text-sm text-gray-900 bg-white p-3 rounded-lg border border-gray-200">
                        {detail.description}
                      </p>
                    </div>

                    {/* Work Order Info */}
                    <div>
                      <label className="flex items-center gap-1 text-xs font-semibold text-gray-600 uppercase mb-2">
                        <FileText className="w-4 h-4" /> Work Order
                      </label>
                      <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-1">
                        <div className="text-sm font-medium text-gray-900">
                          {detail.work_order?.shipyard_wo_number || "N/A"}
                        </div>
                        {detail.work_order?.customer_wo_number && (
                          <div className="text-xs text-gray-600">
                            Customer: {detail.work_order.customer_wo_number}
                          </div>
                        )}
                        {detail.work_order?.vessel && (
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <Ship className="w-3 h-3" />{" "}
                            {detail.work_order.vessel.name}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Document Numbers */}
                    <div>
                      <label className="flex items-center gap-1 text-xs font-semibold text-gray-600 uppercase mb-2">
                        <FileCheck className="w-4 h-4" /> Document Numbers
                      </label>
                      <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-2">
                        {detail.spk_number && (
                          <div className="text-sm">
                            <span className="text-xs text-gray-500">SPK:</span>{" "}
                            <span className="font-medium text-gray-900">
                              {detail.spk_number}
                            </span>
                          </div>
                        )}
                        {detail.spkk_number && (
                          <div className="text-sm">
                            <span className="text-xs text-gray-500">SPKK:</span>{" "}
                            <span className="font-medium text-gray-900">
                              {detail.spkk_number}
                            </span>
                          </div>
                        )}
                        {detail.ptw_number && (
                          <div className="text-sm">
                            <span className="text-xs text-gray-500">PTW:</span>{" "}
                            <span className="font-medium text-gray-900">
                              {detail.ptw_number}
                            </span>
                          </div>
                        )}
                        {!detail.spk_number &&
                          !detail.spkk_number &&
                          !detail.ptw_number && (
                            <div className="text-sm text-gray-500">
                              No documents
                            </div>
                          )}
                      </div>
                    </div>

                    {/* Dates */}
                    <div>
                      <label className="flex items-center gap-1 text-xs font-semibold text-gray-600 uppercase mb-2">
                        <Calendar className="w-4 h-4" /> Schedule
                      </label>
                      <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-2">
                        <div className="text-sm">
                          <span className="text-xs text-gray-500">
                            Planned Start:
                          </span>{" "}
                          <span className="font-medium text-gray-900">
                            {formatDate(detail.planned_start_date)}
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="text-xs text-gray-500">
                            Target Close:
                          </span>{" "}
                          <span className="font-medium text-gray-900">
                            {formatDate(detail.target_close_date)}
                          </span>
                        </div>
                        {detail.actual_start_date && (
                          <div className="text-sm">
                            <span className="text-xs text-gray-500">
                              Actual Start:
                            </span>{" "}
                            <span className="font-medium text-green-700">
                              {formatDate(detail.actual_start_date)}
                            </span>
                          </div>
                        )}
                        {detail.actual_close_date && (
                          <div className="text-sm">
                            <span className="text-xs text-gray-500">
                              Actual Close:
                            </span>{" "}
                            <span className="font-medium text-green-700">
                              {formatDate(detail.actual_close_date)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress Info */}
                    <div>
                      <label className="flex items-center gap-1 text-xs font-semibold text-gray-600 uppercase mb-2">
                        <BarChart3 className="w-4 h-4" /> Progress Status
                      </label>
                      <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-2">
                        <div className="text-sm">
                          <span className="text-xs text-gray-500">
                            Current:
                          </span>{" "}
                          <span className="font-bold text-blue-700">
                            {detail.current_progress || 0}%
                          </span>
                        </div>
                        {detail.latest_progress_date && (
                          <div className="text-sm">
                            <span className="text-xs text-gray-500">
                              Last Update:
                            </span>{" "}
                            <span className="font-medium text-gray-900">
                              {formatDate(detail.latest_progress_date)}
                            </span>
                          </div>
                        )}
                        <div className="text-sm">
                          <span className="text-xs text-gray-500">
                            Reports:
                          </span>{" "}
                          <span className="font-medium text-gray-900">
                            {detail.progress_count || 0} entries
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-6 pt-4 border-t border-blue-200 flex flex-wrap gap-2">
                    {detail.storage_path && (
                      <button
                        onClick={() => handleViewPermit(detail)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
                      >
                        <FileCheck className="w-4 h-4" /> View Work Permit
                      </button>
                    )}
                    <button
                      onClick={() => handleViewProgress(detail.id)}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm"
                    >
                      <BarChart3 className="w-4 h-4" /> View Progress (
                      {detail.progress_count || 0})
                    </button>
                    {!isReadOnly && (
                      <button
                        onClick={() => handleAddProgress(detail.id)}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm"
                      >
                        <Plus className="w-4 h-4" /> Add Progress
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </td>
          </tr>
        )}
      </>
    );
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div className="flex items-center justify-between px-6 py-3 bg-white border-t border-gray-200">
        <div className="flex-1 flex justify-between sm:hidden">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>

        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-700">
              Showing <span className="font-medium">{startIndex + 1}</span> to{" "}
              <span className="font-medium">
                {Math.min(endIndex, totalItems)}
              </span>{" "}
              of <span className="font-medium">{totalItems}</span> results
              {workDetailsSearchTerm && (
                <span className="ml-2 text-blue-600 font-medium">
                  (filtered from {workDetails.length} total)
                </span>
              )}
            </p>
          </div>

          <div>
            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              {startPage > 1 && (
                <>
                  <button
                    onClick={() => handlePageChange(1)}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    1
                  </button>
                  {startPage > 2 && (
                    <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                      ...
                    </span>
                  )}
                </>
              )}

              {pages.map((page) => (
                <button
                  key={page}
                  onClick={() => handlePageChange(page)}
                  className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                    page === currentPage
                      ? "z-10 bg-blue-50 border-blue-500 text-blue-600"
                      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {page}
                </button>
              ))}

              {endPage < totalPages && (
                <>
                  {endPage < totalPages - 1 && (
                    <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                      ...
                    </span>
                  )}
                  <button
                    onClick={() => handlePageChange(totalPages)}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {totalPages}
                  </button>
                </>
              )}

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </nav>
          </div>
        </div>
      </div>
    );
  };

  const renderDeleteModal = () => {
    if (!showDeleteModal || !detailToDelete) return null;

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity"
          onClick={cancelDelete}
        ></div>

        <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full transform transition-all">
            <div className="bg-red-600 px-6 py-4 rounded-t-lg">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-white" />
                <h3 className="text-xl font-bold text-white">Confirm Delete</h3>
              </div>
            </div>

            <div className="px-6 py-6">
              <p className="text-gray-700 text-base">
                Are you sure you want to delete this work detail?
              </p>
              <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
                <p className="text-sm font-medium text-gray-900 line-clamp-2">
                  {detailToDelete.description}
                </p>
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 rounded-b-lg flex gap-3 justify-end">
              <button
                onClick={cancelDelete}
                disabled={isDeleting}
                className="px-5 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" /> Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderFilters = () => {
    if (workOrderId) return null;

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Vessel Filter */}
            <div className="flex-1 relative" ref={vesselDropdownRef}>
              <label className="flex items-center gap-1 text-xs font-medium text-gray-600 mb-1">
                <Ship className="w-4 h-4" /> Vessel
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={vesselSearchTerm}
                  onChange={handleVesselSearch}
                  onFocus={() => setShowVesselDropdown(true)}
                  placeholder="Search vessel..."
                  disabled={loadingVessels}
                  className="w-full px-3 py-2 pr-8 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
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

            {/* Work Order Filter */}
            <div className="flex-1 relative" ref={workOrderDropdownRef}>
              <label className="flex items-center gap-1 text-xs font-medium text-gray-600 mb-1">
                <FileText className="w-4 h-4" /> Work Order
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
                  className="w-full px-3 py-2 pr-8 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                        {workOrder.customer_wo_number && (
                          <div className="text-xs text-gray-600">
                            Customer: {workOrder.customer_wo_number}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>

          {/* Work Details Search */}
          <div>
            <label className="flex items-center gap-1 text-xs font-medium text-gray-600 mb-1">
              <Search className="w-4 h-4" /> Search Work Details
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search by description, location, PIC, WO number, SPK, SPKK, PTW, work scope..."
                value={workDetailsSearchTerm}
                onChange={(e) => handleWorkDetailsSearchChange(e.target.value)}
                className="w-full px-3 py-2 pr-8 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {workDetailsSearchTerm && (
                <button
                  onClick={() => handleWorkDetailsSearchChange("")}
                  className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {workDetailsSearchTerm && (
              <p className="text-xs text-blue-600 mt-1">
                Found {filteredWorkDetailsForDisplay.length} work detail(s)
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderEmptyState = () => (
    <div className="text-center py-16">
      <Wrench className="w-16 h-16 text-gray-400 mx-auto mb-4" />
      <h3 className="text-xl font-semibold text-gray-900 mb-2">
        No work details found
      </h3>
      <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto leading-relaxed">
        {workDetailsSearchTerm
          ? `No work details match your search "${workDetailsSearchTerm}"`
          : workOrderId
            ? "Add work details to break down this work order into manageable tasks."
            : selectedWorkOrderId > 0
              ? "No work details found for the selected work order."
              : selectedVesselId > 0
                ? "No work details found for the selected vessel."
                : "Create work details to track and manage work tasks."}
      </p>
      {!workDetailsSearchTerm && !isReadOnly && (
        <button
          onClick={handleAddWorkDetails}
          className="bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-3 rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 inline-flex items-center gap-2 shadow-md"
        >
          <Plus className="w-5 h-5" /> Add Work Details
        </button>
      )}
    </div>
  );

  // ==================== MAIN RENDER ====================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading work details...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-medium">Error Loading Work Details</h3>
        <p className="text-red-600 mt-1">{error}</p>
        <button
          onClick={fetchWorkDetails}
          className="mt-3 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-4" : "space-y-6"}>
      {renderDeleteModal()}

      {/* Header */}
      {!embedded && (
        <div className="flex justify-between items-center">
          <div className="flex gap-3">
            <button
              onClick={fetchWorkDetails}
              className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-all duration-200 flex items-center gap-2 shadow-sm"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            {!isReadOnly &&
              (profile?.role === "PPIC" || profile?.role === "MASTER") && (
                <button
                  onClick={handleAddWorkDetails}
                  className="bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-2 rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 flex items-center gap-2 shadow-md"
                >
                  <Plus className="w-4 h-4" /> Add Work Details
                </button>
              )}
          </div>
        </div>
      )}

      {/* Filters */}
      {renderFilters()}

      {/* Work Order Details Card */}
      {(selectedWorkOrderId > 0 || workOrderId) && selectedWorkOrderDetails && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-sm border border-blue-200 p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 text-white rounded-full w-12 h-12 flex items-center justify-center">
                <HardHat className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Work Order Details
                </h3>
                <p className="text-sm text-gray-600">
                  Selected work order information
                </p>
              </div>
            </div>
            {!workOrderId && (
              <button
                onClick={() =>
                  navigate(`/work-order/${selectedWorkOrderDetails.id}`)
                }
                className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
              >
                View Full Details →
              </button>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-gray-200">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Ship className="w-5 h-5 text-blue-600" />
                  <span className="text-xs font-semibold text-gray-500 uppercase">
                    Vessel
                  </span>
                </div>
                <div className="font-bold text-gray-900 text-base">
                  {selectedWorkOrderDetails.vessel?.name || "N/A"}
                </div>
                <div className="text-sm text-gray-600">
                  {selectedWorkOrderDetails.vessel?.type || "N/A"}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {selectedWorkOrderDetails.vessel?.company || "N/A"}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <span className="text-xs font-semibold text-gray-500 uppercase">
                    Work Order Numbers
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-gray-500 min-w-[80px]">
                      Shipyard WO:
                    </span>
                    <span className="font-bold text-gray-900">
                      {selectedWorkOrderDetails.shipyard_wo_number}
                    </span>
                  </div>
                  {selectedWorkOrderDetails.customer_wo_number && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs text-gray-500 min-w-[80px]">
                        Customer WO:
                      </span>
                      <span className="font-medium text-gray-700">
                        {selectedWorkOrderDetails.customer_wo_number}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-blue-200">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                Total Work Details:{" "}
                <span className="font-bold text-gray-900">{totalItems}</span>
              </span>
              {totalItems > 0 && (
                <span className="text-gray-600">
                  Showing page{" "}
                  <span className="font-bold text-gray-900">{currentPage}</span>{" "}
                  of{" "}
                  <span className="font-bold text-gray-900">{totalPages}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={`${sortField}-${sortDirection}`}
                onChange={(e) => {
                  const [field, direction] = e.target.value.split("-");
                  setSortField(field as typeof sortField);
                  setSortDirection(direction as "asc" | "desc");
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
              >
                <option value="planned_start_date-asc">
                  Start Date (Earliest)
                </option>
                <option value="planned_start_date-desc">
                  Start Date (Latest)
                </option>
                <option value="target_close_date-asc">
                  Target Date (Earliest)
                </option>
                <option value="target_close_date-desc">
                  Target Date (Latest)
                </option>
                <option value="description-asc">Description (A-Z)</option>
                <option value="description-desc">Description (Z-A)</option>
                <option value="created_at-desc">Recently Added</option>
                <option value="created_at-asc">Oldest First</option>
              </select>

              {embedded &&
                !isReadOnly &&
                (profile?.role === "PPIC" || profile?.role === "MASTER") && (
                  <button
                    onClick={handleAddWorkDetails}
                    className="bg-gradient-to-r from-green-600 to-green-700 text-white px-4 py-2 rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 flex items-center gap-2 shadow-sm text-sm"
                  >
                    <Plus className="w-4 h-4" /> Add Work Details
                  </button>
                )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {currentWorkDetails.length > 0 ? (
            <>
              <table className="min-w-full divide-y divide-gray-200">
                {renderTableHeader()}
                <tbody className="bg-white divide-y divide-gray-200">
                  {currentWorkDetails.map((detail) => renderTableRow(detail))}
                </tbody>
              </table>
              {renderPagination()}
            </>
          ) : (
            renderEmptyState()
          )}
        </div>
      </div>
    </div>
  );
}
