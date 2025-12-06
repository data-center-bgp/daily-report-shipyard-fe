import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase, type Kapro } from "../../lib/supabase";

interface WorkOrderStats {
  totalWorkOrders: number;
}

interface VesselSummary {
  id: number;
  name: string;
  type: string;
  company: string;
  totalWorkOrders: number;
  workOrders: {
    work_type?: string;
    work_location?: string;
    kapro_id?: number;
    is_additional_wo?: boolean;
  }[];
}

export default function WorkOrderDashboard() {
  const [vessels, setVessels] = useState<VesselSummary[]>([]);
  const [filteredVessels, setFilteredVessels] = useState<VesselSummary[]>([]);
  const [stats, setStats] = useState<WorkOrderStats>({
    totalWorkOrders: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  const [vesselSearchTerm, setVesselSearchTerm] = useState("");
  const [showVesselDropdown, setShowVesselDropdown] = useState(false);
  const vesselDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedVesselId, setSelectedVesselId] = useState<number | null>(null);

  // Filter states
  const [workTypeFilter, setWorkTypeFilter] = useState<string>("");
  const [workLocationFilter, setWorkLocationFilter] = useState<string>("");
  const [kaproFilter, setKaproFilter] = useState<string>("");
  const [additionalWoFilter, setAdditionalWoFilter] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  // Kapros list
  const [kapros, setKapros] = useState<Kapro[]>([]);

  // Available filter options
  const [availableWorkTypes, setAvailableWorkTypes] = useState<string[]>([]);
  const [availableWorkLocations, setAvailableWorkLocations] = useState<
    string[]
  >([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [vesselsPerPage] = useState(12);
  const [sortBy, setSortBy] = useState<"name" | "totalWorkOrders">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const navigate = useNavigate();
  const location = useLocation();

  // Close dropdown when clicking outside
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

  // Fetch Kapros
  useEffect(() => {
    const fetchKapros = async () => {
      try {
        const { data, error } = await supabase
          .from("kapro")
          .select("*")
          .is("deleted_at", null)
          .order("kapro_name", { ascending: true });

        if (error) throw error;
        setKapros(data || []);
      } catch (err) {
        console.error("Error fetching kapros:", err);
      }
    };

    fetchKapros();
  }, []);

  const fetchWorkOrders = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      setLoading(true);
      setError(null);

      console.log("🔄 Fetching work orders...");

      const { data, error: fetchError } = await supabase
        .from("work_order")
        .select(
          `
          *,
          vessel (
            id,
            name,
            type,
            company
          )
        `
        )
        .is("deleted_at", null);

      clearTimeout(timeoutId);

      if (fetchError) {
        console.error("❌ Fetch error:", fetchError);
        throw fetchError;
      }

      const workOrdersData = data || [];
      console.log("✅ Fetched work orders:", workOrdersData.length);

      // Filter out work orders without vessel data
      const validWorkOrders = workOrdersData.filter(
        (wo) => wo.vessel?.id != null
      );

      if (validWorkOrders.length < workOrdersData.length) {
        console.warn(
          `⚠️ Filtered out ${
            workOrdersData.length - validWorkOrders.length
          } work orders without vessel data`
        );
      }

      // Calculate stats
      setStats({
        totalWorkOrders: validWorkOrders.length,
      });

      // Extract unique work types and locations for filters
      const workTypes = new Set<string>();
      const workLocations = new Set<string>();

      validWorkOrders.forEach((wo) => {
        if (wo.work_type) workTypes.add(wo.work_type);
        if (wo.work_location) workLocations.add(wo.work_location);
      });

      setAvailableWorkTypes(Array.from(workTypes).sort());
      setAvailableWorkLocations(Array.from(workLocations).sort());

      // Group by vessels with work order details
      const vesselMap = new Map<
        number,
        {
          id: number;
          name: string;
          type: string;
          company: string;
          count: number;
          workOrders: {
            work_type?: string;
            work_location?: string;
            kapro_id?: number;
            is_additional_wo?: boolean;
          }[];
        }
      >();

      validWorkOrders.forEach((wo) => {
        const vesselId = wo.vessel!.id;

        if (!vesselMap.has(vesselId)) {
          vesselMap.set(vesselId, {
            id: vesselId,
            name: wo.vessel!.name,
            type: wo.vessel!.type,
            company: wo.vessel!.company,
            count: 0,
            workOrders: [],
          });
        }

        const vesselData = vesselMap.get(vesselId)!;
        vesselData.count++;
        vesselData.workOrders.push({
          work_type: wo.work_type,
          work_location: wo.work_location,
          kapro_id: wo.kapro_id,
          is_additional_wo: wo.is_additional_wo,
        });
      });

      const vesselSummaries = Array.from(vesselMap.values()).map((vessel) => ({
        id: vessel.id,
        name: vessel.name,
        type: vessel.type,
        company: vessel.company,
        totalWorkOrders: vessel.count,
        workOrders: vessel.workOrders,
      }));

      console.log("📊 Vessel summaries:", vesselSummaries.length);
      setVessels(vesselSummaries);
    } catch (err) {
      clearTimeout(timeoutId);
      console.error("💥 Error fetching work orders:", err);

      if (err instanceof Error) {
        if (err.name === "AbortError") {
          setError("Request timeout. Please try again.");
        } else if (err.message.includes("JWT")) {
          setError("Session expired. Please refresh the page and login again.");
        } else if (err.message.includes("permission")) {
          setError(
            "Permission denied. Please contact your administrator to enable RLS policies."
          );
        } else {
          setError(err.message);
        }
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Filter vessels for search dropdown
  const searchFilteredVessels = vessels.filter((vessel) => {
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
    setSelectedVesselId(null);
  };

  const handleVesselSelect = (vessel: VesselSummary) => {
    setSelectedVesselId(vessel.id);
    setVesselSearchTerm(`${vessel.name} - ${vessel.type} (${vessel.company})`);
    setShowVesselDropdown(false);
  };

  const handleClearSearch = () => {
    setVesselSearchTerm("");
    setSelectedVesselId(null);
    setShowVesselDropdown(false);
  };

  const handleClearFilters = () => {
    setWorkTypeFilter("");
    setWorkLocationFilter("");
    setKaproFilter("");
    setAdditionalWoFilter("");
  };

  const hasActiveFilters =
    workTypeFilter || workLocationFilter || kaproFilter || additionalWoFilter;

  // Filter and sort vessels based on search and filters
  useEffect(() => {
    let filtered = vessels;

    // If a vessel is selected from dropdown, show only that vessel
    if (selectedVesselId) {
      filtered = vessels.filter((vessel) => vessel.id === selectedVesselId);
    } else if (vesselSearchTerm && !showVesselDropdown) {
      // If user typed but didn't select, filter by text
      const searchLower = vesselSearchTerm.toLowerCase();
      filtered = vessels.filter(
        (vessel) =>
          vessel.name?.toLowerCase().includes(searchLower) ||
          vessel.type?.toLowerCase().includes(searchLower) ||
          vessel.company?.toLowerCase().includes(searchLower)
      );
    }

    // Apply work order filters
    if (hasActiveFilters) {
      filtered = filtered.filter((vessel) => {
        return vessel.workOrders.some((wo) => {
          // Work Type Filter
          if (workTypeFilter && wo.work_type !== workTypeFilter) {
            return false;
          }

          // Work Location Filter
          if (workLocationFilter && wo.work_location !== workLocationFilter) {
            return false;
          }

          // Kapro Filter
          if (kaproFilter) {
            if (kaproFilter === "unassigned") {
              if (wo.kapro_id != null) return false;
            } else {
              if (wo.kapro_id !== parseInt(kaproFilter)) return false;
            }
          }

          // Additional WO Filter
          if (additionalWoFilter) {
            if (additionalWoFilter === "yes" && !wo.is_additional_wo) {
              return false;
            }
            if (additionalWoFilter === "no" && wo.is_additional_wo) {
              return false;
            }
          }

          return true;
        });
      });
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortBy) {
        case "name":
          aValue = a.name;
          bValue = b.name;
          break;
        case "totalWorkOrders":
          aValue = a.totalWorkOrders;
          bValue = b.totalWorkOrders;
          break;
        default:
          aValue = a.name;
          bValue = b.name;
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortDirection === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        return sortDirection === "asc"
          ? (aValue as number) - (bValue as number)
          : (bValue as number) - (aValue as number);
      }
    });

    setFilteredVessels(filtered);
    setCurrentPage(1);
  }, [
    vessels,
    vesselSearchTerm,
    selectedVesselId,
    showVesselDropdown,
    sortBy,
    sortDirection,
    workTypeFilter,
    workLocationFilter,
    kaproFilter,
    additionalWoFilter,
    hasActiveFilters,
  ]);

  // Pagination
  const totalPages = Math.ceil(filteredVessels.length / vesselsPerPage);
  const startIndex = (currentPage - 1) * vesselsPerPage;
  const endIndex = startIndex + vesselsPerPage;
  const currentVessels = filteredVessels.slice(startIndex, endIndex);

  // Success message
  useEffect(() => {
    if (location.state?.message) {
      setShowSuccessMessage(true);
      navigate(location.pathname, { replace: true, state: {} });
      const timer = setTimeout(() => setShowSuccessMessage(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [location, navigate]);

  // Initial fetch
  useEffect(() => {
    fetchWorkOrders();
  }, [fetchWorkOrders]);

  const handleAddWorkOrder = () => {
    navigate("/add-work-order");
  };

  const handleVesselClick = (vesselId: number, vesselName: string) => {
    navigate(`/vessel/${vesselId}/work-orders`, {
      state: { vesselName },
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-medium">Error Loading Dashboard</h3>
        <p className="text-red-600 mt-1">{error}</p>
        <button
          onClick={fetchWorkOrders}
          className="mt-3 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Work Order Dashboard
          </h1>
          <p className="text-gray-600">Manage work orders by vessel</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchWorkOrders}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            🔄 Refresh
          </button>
          <button
            onClick={handleAddWorkOrder}
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            ➕ Add Work Order
          </button>
        </div>
      </div>

      {showSuccessMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-green-600 mr-2">✅</span>
            <p className="text-green-700 font-medium">
              Work order created successfully!
            </p>
          </div>
          <button
            onClick={() => setShowSuccessMessage(false)}
            className="text-green-600 hover:text-green-800"
          >
            ✕
          </button>
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Total Work Orders
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.totalWorkOrders}
              </p>
            </div>
            <span className="text-blue-500 text-2xl">📋</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Vessels</p>
              <p className="text-2xl font-bold text-gray-900">
                {vessels.length}
              </p>
            </div>
            <span className="text-purple-500 text-2xl">🚢</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Avg WO per Vessel
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {vessels.length > 0
                  ? Math.round((stats.totalWorkOrders / vessels.length) * 10) /
                    10
                  : 0}
              </p>
            </div>
            <span className="text-green-500 text-2xl">📊</span>
          </div>
        </div>
      </div>

      {/* Vessels Section with Filters */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col gap-4">
            {/* Header with Search and Sort */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Vessels</h2>
                <p className="text-gray-600 text-sm">
                  Click on a vessel to view its work orders (
                  {filteredVessels.length} of {vessels.length} vessels)
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                {/* Searchable Vessel Dropdown */}
                <div className="relative" ref={vesselDropdownRef}>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search vessels..."
                      value={vesselSearchTerm}
                      onChange={handleVesselSearch}
                      onFocus={() => setShowVesselDropdown(true)}
                      className="w-full sm:w-64 pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <span className="absolute left-3 top-2.5 text-gray-400">
                      🔍
                    </span>
                    {(vesselSearchTerm || selectedVesselId) && (
                      <button
                        onClick={handleClearSearch}
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {showVesselDropdown && searchFilteredVessels.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {searchFilteredVessels.map((vessel) => (
                        <div
                          key={vessel.id}
                          onClick={() => handleVesselSelect(vessel)}
                          className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                            selectedVesselId === vessel.id ? "bg-blue-100" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-gray-900">
                                {vessel.name}
                              </div>
                              <div className="text-sm text-gray-600">
                                {vessel.type} • {vessel.company}
                              </div>
                            </div>
                            <div className="text-sm text-blue-600 font-medium">
                              {vessel.totalWorkOrders} WO
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <select
                  value={`${sortBy}-${sortDirection}`}
                  onChange={(e) => {
                    const [field, direction] = e.target.value.split("-");
                    setSortBy(field as typeof sortBy);
                    setSortDirection(direction as "asc" | "desc");
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="name-asc">Name (A-Z)</option>
                  <option value="name-desc">Name (Z-A)</option>
                  <option value="totalWorkOrders-desc">Most Work Orders</option>
                  <option value="totalWorkOrders-asc">Least Work Orders</option>
                </select>

                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                    showFilters || hasActiveFilters
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  🔽 Filters
                  {hasActiveFilters && (
                    <span className="bg-white text-blue-600 px-2 py-0.5 rounded-full text-xs font-bold">
                      ●
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Filter Panel */}
            {showFilters && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">
                    Filter Work Orders
                  </h3>
                  {hasActiveFilters && (
                    <button
                      onClick={handleClearFilters}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Clear all filters
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Work Type Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Work Type
                    </label>
                    <select
                      value={workTypeFilter}
                      onChange={(e) => setWorkTypeFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">All Types</option>
                      {availableWorkTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Work Location Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Work Location
                    </label>
                    <select
                      value={workLocationFilter}
                      onChange={(e) => setWorkLocationFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">All Locations</option>
                      {availableWorkLocations.map((location) => (
                        <option key={location} value={location}>
                          {location}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Kapro Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Kapro
                    </label>
                    <select
                      value={kaproFilter}
                      onChange={(e) => setKaproFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">All Kapros</option>
                      <option value="unassigned">Unassigned</option>
                      {kapros.map((kapro) => (
                        <option key={kapro.id} value={kapro.id.toString()}>
                          {kapro.kapro_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Additional WO Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Additional WO
                    </label>
                    <select
                      value={additionalWoFilter}
                      onChange={(e) => setAdditionalWoFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">All</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                </div>

                {/* Active Filters Display */}
                {hasActiveFilters && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="text-sm text-gray-600">
                      Active filters:
                    </span>
                    {workTypeFilter && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                        Type: {workTypeFilter}
                        <button
                          onClick={() => setWorkTypeFilter("")}
                          className="hover:text-blue-900"
                        >
                          ✕
                        </button>
                      </span>
                    )}
                    {workLocationFilter && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                        Location: {workLocationFilter}
                        <button
                          onClick={() => setWorkLocationFilter("")}
                          className="hover:text-blue-900"
                        >
                          ✕
                        </button>
                      </span>
                    )}
                    {kaproFilter && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                        Kapro:{" "}
                        {kaproFilter === "unassigned"
                          ? "Unassigned"
                          : kapros.find((k) => k.id.toString() === kaproFilter)
                              ?.kapro_name}
                        <button
                          onClick={() => setKaproFilter("")}
                          className="hover:text-blue-900"
                        >
                          ✕
                        </button>
                      </span>
                    )}
                    {additionalWoFilter && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                        Additional:{" "}
                        {additionalWoFilter === "yes" ? "Yes" : "No"}
                        <button
                          onClick={() => setAdditionalWoFilter("")}
                          className="hover:text-blue-900"
                        >
                          ✕
                        </button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-6">
          {currentVessels.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {currentVessels.map((vessel) => (
                  <div
                    key={vessel.id}
                    onClick={() => handleVesselClick(vessel.id, vessel.name)}
                    className="border border-gray-200 rounded-lg p-6 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center">
                        <span className="text-2xl mr-3">🚢</span>
                        <div>
                          <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                            {vessel.name}
                          </h3>
                          <p className="text-sm text-gray-600">{vessel.type}</p>
                          <p className="text-sm text-gray-500">
                            {vessel.company}
                          </p>
                        </div>
                      </div>
                      <span className="text-blue-500 text-lg group-hover:text-blue-700 transition-colors">
                        →
                      </span>
                    </div>

                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-600">
                        {vessel.totalWorkOrders}
                      </p>
                      <p className="text-sm text-gray-600">Work Orders</p>
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Showing {startIndex + 1} to{" "}
                    {Math.min(endIndex, filteredVessels.length)} of{" "}
                    {filteredVessels.length} vessels
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setCurrentPage(Math.max(1, currentPage - 1))
                      }
                      disabled={currentPage === 1}
                      className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      ← Previous
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from(
                        { length: Math.min(5, totalPages) },
                        (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }

                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`px-3 py-2 rounded-lg ${
                                currentPage === pageNum
                                  ? "bg-blue-600 text-white"
                                  : "border border-gray-300 hover:bg-gray-50"
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        }
                      )}
                    </div>

                    <button
                      onClick={() =>
                        setCurrentPage(Math.min(totalPages, currentPage + 1))
                      }
                      disabled={currentPage === totalPages}
                      className="px-3 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <span className="text-gray-400 text-4xl mb-4 block">🚢</span>
              {vesselSearchTerm || selectedVesselId || hasActiveFilters ? (
                <>
                  <p className="text-gray-500 text-lg mb-2">
                    No vessels found matching your search or filters
                  </p>
                  <div className="flex gap-2 justify-center">
                    {(vesselSearchTerm || selectedVesselId) && (
                      <button
                        onClick={handleClearSearch}
                        className="text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        Clear search
                      </button>
                    )}
                    {hasActiveFilters && (
                      <button
                        onClick={handleClearFilters}
                        className="text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-gray-500 text-lg mb-2">
                    No vessels with work orders found
                  </p>
                  <p className="text-gray-400 text-sm mb-4">
                    Add some work orders to get started
                  </p>
                  <button
                    onClick={handleAddWorkOrder}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors inline-flex items-center gap-2"
                  >
                    ➕ Add Your First Work Order
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
