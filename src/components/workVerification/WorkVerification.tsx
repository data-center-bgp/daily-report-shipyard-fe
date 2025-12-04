import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  supabase,
  type WorkDetails,
  type WorkOrder,
  type Vessel,
} from "../../lib/supabase";

interface WorkDetailsWithProgress extends WorkDetails {
  current_progress?: number;
  has_progress_data?: boolean;
  latest_progress_date?: string;
  work_order?: WorkOrder & {
    vessel?: Vessel;
  };
  location?: {
    id: number;
    location: string;
  };
}

interface WorkVerification {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  work_verification: boolean;
  verification_date: string;
  work_details_id: number;
  user_id: string;
}

interface VerificationWithDetails extends WorkVerification {
  work_details: WorkDetailsWithProgress;
  profiles?: {
    id: number;
    name: string;
    email: string;
  };
}

interface WorkProgressItem {
  progress_percentage: number;
  report_date: string;
}

export default function WorkVerification() {
  const navigate = useNavigate();

  const [completedWorkDetails, setCompletedWorkDetails] = useState<
    WorkDetailsWithProgress[]
  >([]);
  const [verifications, setVerifications] = useState<VerificationWithDetails[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"pending" | "verified">("pending");

  // Filter states
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [selectedVesselId, setSelectedVesselId] = useState<number>(0);

  // Search dropdown states
  const [vesselSearchTerm, setVesselSearchTerm] = useState("");
  const [showVesselDropdown, setShowVesselDropdown] = useState(false);
  const vesselDropdownRef = useRef<HTMLDivElement>(null);

  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Handle click outside to close dropdown
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

  const toggleRowExpansion = (id: number) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Filter vessels for search dropdown
  const filteredVesselsForSearch = vessels.filter((vessel) => {
    const searchLower = vesselSearchTerm.toLowerCase();
    return (
      vessel.name?.toLowerCase().includes(searchLower) ||
      vessel.type?.toLowerCase().includes(searchLower) ||
      vessel.company?.toLowerCase().includes(searchLower)
    );
  });

  // Vessel search handlers
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
  `
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (wdError) throw wdError;

      // Process work details to find completed ones (100% progress)
      const workDetailsWithProgress = (workDetailsData || []).map((wd) => {
        const progressRecords = wd.work_progress || [];

        if (progressRecords.length === 0) {
          return {
            ...wd,
            current_progress: 0,
            has_progress_data: false,
          };
        }

        const sortedProgress = progressRecords.sort(
          (a: WorkProgressItem, b: WorkProgressItem) =>
            new Date(b.report_date).getTime() -
            new Date(a.report_date).getTime()
        );

        const latestProgress = sortedProgress[0]?.progress_percentage || 0;
        const latestProgressDate = sortedProgress[0]?.report_date;

        return {
          ...wd,
          current_progress: latestProgress,
          has_progress_data: true,
          latest_progress_date: latestProgressDate,
        };
      });

      // Filter only completed work details (100% progress)
      const completed = workDetailsWithProgress.filter(
        (wd) => wd.current_progress === 100
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
        )
      )
    ),
    profiles (
      id,
      name,
      email
    )
  `
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (verError) throw verError;

      setVerifications(verificationData || []);

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

  // Get pending work details (completed but not yet verified)
  const verifiedWorkDetailsIds = verifications.map((v) => v.work_details_id);
  const pendingWorkDetails = completedWorkDetails.filter(
    (wd) => !verifiedWorkDetailsIds.includes(wd.id)
  );

  // Apply vessel filter
  const filteredPending = pendingWorkDetails.filter((wd) => {
    const vesselMatch =
      selectedVesselId === 0 || wd.work_order?.vessel?.id === selectedVesselId;

    if (!vesselMatch) return false;

    if (!searchTerm) return true;

    const searchLower = searchTerm.toLowerCase();
    const safeIncludes = (value: string | null | undefined) => {
      return value?.toLowerCase().includes(searchLower) || false;
    };

    return (
      safeIncludes(wd.description) ||
      safeIncludes(wd.location?.location) ||
      safeIncludes(wd.pic) ||
      safeIncludes(wd.work_order?.customer_wo_number) ||
      safeIncludes(wd.work_order?.shipyard_wo_number) ||
      safeIncludes(wd.work_order?.vessel?.name) ||
      safeIncludes(wd.work_order?.vessel?.company)
    );
  });

  const filteredVerified = verifications.filter((verification) => {
    const vesselMatch =
      selectedVesselId === 0 ||
      verification.work_details?.work_order?.vessel?.id === selectedVesselId;

    if (!vesselMatch) return false;

    if (!searchTerm) return true;

    const searchLower = searchTerm.toLowerCase();
    const safeIncludes = (value: string | null | undefined) => {
      return value?.toLowerCase().includes(searchLower) || false;
    };

    return (
      safeIncludes(verification.work_details?.description) ||
      safeIncludes(verification.work_details?.location?.location) ||
      safeIncludes(verification.work_details?.pic) ||
      safeIncludes(verification.work_details?.work_order?.customer_wo_number) ||
      safeIncludes(verification.work_details?.work_order?.shipyard_wo_number) ||
      safeIncludes(verification.work_details?.work_order?.vessel?.name) ||
      safeIncludes(verification.work_details?.work_order?.vessel?.company)
    );
  });

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
            Verify completed work details (100% progress)
          </p>
        </div>

        <button
          onClick={() => navigate("/work-details")}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-2 transition-colors"
        >
          ← Back to Work Details
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <span className="text-red-600 mr-2">⚠️</span>
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
            <span className="text-blue-500 text-2xl">✅</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Pending Verification
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {filteredPending.length}
              </p>
            </div>
            <span className="text-yellow-500 text-2xl">⏳</span>
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
            <span className="text-green-500 text-2xl">🔍</span>
          </div>
        </div>
      </div>

      {/* Filters and Tabs */}
      <div className="bg-white rounded-lg shadow">
        {/* Filters */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Vessel Filter with Search Dropdown */}
            <div className="flex-1 relative" ref={vesselDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🚢 Filter by Vessel
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
                    ✕
                  </button>
                )}
              </div>

              {/* Vessel Dropdown */}
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

            {/* Text Search */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🔍 Search
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
          <div className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab("pending")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "pending"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Pending Verification ({filteredPending.length})
            </button>
            <button
              onClick={() => setActiveTab("verified")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
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
          {activeTab === "pending" ? (
            // Pending Verification Tab
            filteredPending.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                        {/* Expand column */}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Work Details
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Work Order
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Vessel
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Completion Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Progress
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredPending.map((wd) => (
                      <>
                        <tr key={wd.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              onClick={() => toggleRowExpansion(wd.id)}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              <svg
                                className={`w-5 h-5 transition-transform duration-200 ${
                                  expandedRows.has(wd.id) ? "rotate-90" : ""
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              <div className="text-sm font-medium text-gray-900 max-w-xs">
                                {wd.description.length > 60
                                  ? `${wd.description.substring(0, 60)}...`
                                  : wd.description}
                              </div>
                              <div className="text-sm text-gray-500">
                                📍 {wd.location?.location || "-"}
                              </div>
                              <div className="text-xs text-gray-400">
                                👤 {wd.pic}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="space-y-1">
                              <div className="text-sm font-medium text-gray-900">
                                {wd.work_order?.shipyard_wo_number || "-"}
                              </div>
                              <div className="text-sm text-gray-500">
                                {wd.work_order?.customer_wo_number || "-"}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              <div className="text-sm font-medium text-gray-900">
                                {wd.work_order?.vessel?.name || "-"}
                              </div>
                              <div className="text-sm text-gray-500">
                                {wd.work_order?.vessel?.type || "-"} •{" "}
                                {wd.work_order?.vessel?.company || "-"}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {wd.latest_progress_date
                              ? formatDate(wd.latest_progress_date)
                              : "-"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                                <div className="bg-green-600 h-2 rounded-full w-full"></div>
                              </div>
                              <span className="text-sm font-medium text-green-600">
                                100%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button
                              onClick={() =>
                                navigate(`/work-verification/verify/${wd.id}`)
                              }
                              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                            >
                              🔍 Verify
                            </button>
                          </td>
                        </tr>

                        {/* Expanded Row Content */}
                        {expandedRows.has(wd.id) && (
                          <tr>
                            <td colSpan={7} className="px-0 py-0">
                              <div className="bg-gray-50 border-l-4 border-blue-400">
                                <div className="px-6 py-4">
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Left Column - Work Details */}
                                    <div className="space-y-4">
                                      <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                        🔧 Work Details
                                      </h4>

                                      {/* Full Description */}
                                      <div className="bg-white rounded-lg border border-gray-200 p-3">
                                        <span className="text-gray-500 text-xs">
                                          Description:
                                        </span>
                                        <div className="font-medium text-gray-900 mt-1 text-sm">
                                          {wd.description}
                                        </div>
                                      </div>

                                      {/* Work Scope & Type */}
                                      <div className="bg-white rounded-lg border border-gray-200 p-3">
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                          <div>
                                            <span className="text-gray-500 text-xs">
                                              Work Scope:
                                            </span>
                                            <div className="font-medium text-gray-900 mt-0.5">
                                              {(wd as any).work_scope
                                                ?.work_scope || "N/A"}
                                            </div>
                                          </div>
                                          <div>
                                            <span className="text-gray-500 text-xs">
                                              Type:
                                            </span>
                                            <div className="font-medium text-gray-900 mt-0.5">
                                              {wd.work_type || "N/A"}
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Quantity & Location */}
                                      <div className="bg-white rounded-lg border border-gray-200 p-3">
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                          <div>
                                            <span className="text-gray-500 text-xs">
                                              Quantity:
                                            </span>
                                            <div className="font-bold text-blue-900 text-lg mt-0.5">
                                              {wd.quantity || 0}{" "}
                                              <span className="text-sm text-blue-700 font-medium">
                                                {wd.uom || ""}
                                              </span>
                                            </div>
                                          </div>
                                          <div>
                                            <span className="text-gray-500 text-xs">
                                              Location:
                                            </span>
                                            <div className="font-medium text-green-900 mt-0.5">
                                              📍{" "}
                                              {wd.location?.location || "N/A"}
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* SPK/SPKK Numbers */}
                                      {(wd.spk_number || wd.spkk_number) && (
                                        <div className="bg-white rounded-lg border border-gray-200 p-3">
                                          <div className="space-y-2 text-sm">
                                            {wd.spk_number && (
                                              <div>
                                                <span className="text-gray-500 text-xs">
                                                  SPK Number:
                                                </span>
                                                <div className="font-medium text-gray-900 mt-0.5">
                                                  {wd.spk_number}
                                                </div>
                                              </div>
                                            )}
                                            {wd.spkk_number && (
                                              <div>
                                                <span className="text-gray-500 text-xs">
                                                  SPKK Number:
                                                </span>
                                                <div className="font-medium text-gray-900 mt-0.5">
                                                  {wd.spkk_number}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Right Column - Additional Details */}
                                    <div className="space-y-4">
                                      <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                        📋 Additional Information
                                      </h4>

                                      {/* Schedule */}
                                      <div className="bg-white rounded-lg border border-gray-200 p-3">
                                        <div className="space-y-3 text-sm">
                                          <div>
                                            <span className="text-gray-500 text-xs">
                                              Planned Start:
                                            </span>
                                            <div className="font-medium text-gray-900 mt-0.5">
                                              📅{" "}
                                              {wd.planned_start_date
                                                ? formatDate(
                                                    wd.planned_start_date
                                                  )
                                                : "N/A"}
                                            </div>
                                          </div>
                                          <div>
                                            <span className="text-gray-500 text-xs">
                                              Target Close:
                                            </span>
                                            <div className="font-medium text-gray-900 mt-0.5">
                                              🎯{" "}
                                              {formatDate(wd.target_close_date)}
                                            </div>
                                          </div>
                                          <div>
                                            <span className="text-gray-500 text-xs">
                                              Period Close Target:
                                            </span>
                                            <div className="font-medium text-gray-900 mt-0.5">
                                              ⏰{" "}
                                              {wd.period_close_target || "N/A"}
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* PIC */}
                                      <div className="bg-white rounded-lg border border-gray-200 p-3">
                                        <span className="text-gray-500 text-xs">
                                          Person in Charge:
                                        </span>
                                        <div className="font-medium text-gray-900 mt-0.5 text-sm">
                                          👤 {wd.pic}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <span className="text-gray-400 text-4xl mb-4 block">🔍</span>
                {searchTerm || selectedVesselId > 0 ? (
                  <>
                    <p className="text-gray-500 text-lg mb-2">
                      No pending verifications found matching your filters
                    </p>
                    <button
                      onClick={() => {
                        setSearchTerm("");
                        setSelectedVesselId(0);
                      }}
                      className="text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      Clear filters
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-gray-500 text-lg mb-2">
                      No work details pending verification
                    </p>
                    <p className="text-gray-400 text-sm">
                      All completed work details have been verified.
                    </p>
                  </>
                )}
              </div>
            )
          ) : // Verified Tab
          filteredVerified.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                      {/* Expand column */}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Work Details
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Work Order
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vessel
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Verification Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Verified By
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredVerified.map((verification) => (
                    <>
                      <tr key={verification.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() =>
                              toggleRowExpansion(verification.work_details_id)
                            }
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <svg
                              className={`w-5 h-5 transition-transform duration-200 ${
                                expandedRows.has(verification.work_details_id)
                                  ? "rotate-90"
                                  : ""
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-gray-900 max-w-xs">
                              {verification.work_details?.description?.length >
                              60
                                ? `${verification.work_details.description.substring(
                                    0,
                                    60
                                  )}...`
                                : verification.work_details?.description}
                            </div>
                            <div className="text-sm text-gray-500">
                              📍{" "}
                              {verification.work_details?.location?.location ||
                                "-"}
                            </div>
                            <div className="text-xs text-gray-400">
                              👤 {verification.work_details?.pic}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-gray-900">
                              {verification.work_details?.work_order
                                ?.shipyard_wo_number || "-"}
                            </div>
                            <div className="text-sm text-gray-500">
                              {verification.work_details?.work_order
                                ?.customer_wo_number || "-"}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-gray-900">
                              {verification.work_details?.work_order?.vessel
                                ?.name || "-"}
                            </div>
                            <div className="text-sm text-gray-500">
                              {verification.work_details?.work_order?.vessel
                                ?.type || "-"}{" "}
                              •{" "}
                              {verification.work_details?.work_order?.vessel
                                ?.company || "-"}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(verification.verification_date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {verification.profiles?.name || "Unknown User"}
                        </td>
                      </tr>

                      {/* Expanded Row Content */}
                      {expandedRows.has(verification.work_details_id) && (
                        <tr>
                          <td colSpan={6} className="px-0 py-0">
                            <div className="bg-gray-50 border-l-4 border-green-400">
                              <div className="px-6 py-4">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                  {/* Left Column - Work Details */}
                                  <div className="space-y-4">
                                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                      🔧 Work Details
                                    </h4>

                                    {/* Full Description */}
                                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                                      <span className="text-gray-500 text-xs">
                                        Description:
                                      </span>
                                      <div className="font-medium text-gray-900 mt-1 text-sm">
                                        {verification.work_details?.description}
                                      </div>
                                    </div>

                                    {/* Work Scope & Type */}
                                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                                      <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                          <span className="text-gray-500 text-xs">
                                            Work Scope:
                                          </span>
                                          <div className="font-medium text-gray-900 mt-0.5">
                                            {(verification.work_details as any)
                                              .work_scope?.work_scope || "N/A"}
                                          </div>
                                        </div>
                                        <div>
                                          <span className="text-gray-500 text-xs">
                                            Type:
                                          </span>
                                          <div className="font-medium text-gray-900 mt-0.5">
                                            {verification.work_details
                                              ?.work_type || "N/A"}
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Quantity & Location */}
                                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                                      <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                          <span className="text-gray-500 text-xs">
                                            Quantity:
                                          </span>
                                          <div className="font-bold text-blue-900 text-lg mt-0.5">
                                            {verification.work_details
                                              ?.quantity || 0}{" "}
                                            <span className="text-sm text-blue-700 font-medium">
                                              {verification.work_details?.uom ||
                                                ""}
                                            </span>
                                          </div>
                                        </div>
                                        <div>
                                          <span className="text-gray-500 text-xs">
                                            Location:
                                          </span>
                                          <div className="font-medium text-green-900 mt-0.5">
                                            📍{" "}
                                            {verification.work_details?.location
                                              ?.location || "N/A"}
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* SPK/SPKK Numbers */}
                                    {(verification.work_details?.spk_number ||
                                      verification.work_details
                                        ?.spkk_number) && (
                                      <div className="bg-white rounded-lg border border-gray-200 p-3">
                                        <div className="space-y-2 text-sm">
                                          {verification.work_details
                                            ?.spk_number && (
                                            <div>
                                              <span className="text-gray-500 text-xs">
                                                SPK Number:
                                              </span>
                                              <div className="font-medium text-gray-900 mt-0.5">
                                                {
                                                  verification.work_details
                                                    ?.spk_number
                                                }
                                              </div>
                                            </div>
                                          )}
                                          {verification.work_details
                                            ?.spkk_number && (
                                            <div>
                                              <span className="text-gray-500 text-xs">
                                                SPKK Number:
                                              </span>
                                              <div className="font-medium text-gray-900 mt-0.5">
                                                {
                                                  verification.work_details
                                                    ?.spkk_number
                                                }
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Right Column - Additional Details */}
                                  <div className="space-y-4">
                                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                      📋 Additional Information
                                    </h4>

                                    {/* Schedule */}
                                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                                      <div className="space-y-3 text-sm">
                                        <div>
                                          <span className="text-gray-500 text-xs">
                                            Planned Start:
                                          </span>
                                          <div className="font-medium text-gray-900 mt-0.5">
                                            📅{" "}
                                            {verification.work_details
                                              ?.planned_start_date
                                              ? formatDate(
                                                  verification.work_details
                                                    ?.planned_start_date
                                                )
                                              : "N/A"}
                                          </div>
                                        </div>
                                        <div>
                                          <span className="text-gray-500 text-xs">
                                            Target Close:
                                          </span>
                                          <div className="font-medium text-gray-900 mt-0.5">
                                            🎯{" "}
                                            {verification.work_details
                                              ?.target_close_date
                                              ? formatDate(
                                                  verification.work_details
                                                    .target_close_date
                                                )
                                              : "N/A"}
                                          </div>
                                        </div>
                                        <div>
                                          <span className="text-gray-500 text-xs">
                                            Period Close Target:
                                          </span>
                                          <div className="font-medium text-gray-900 mt-0.5">
                                            ⏰{" "}
                                            {verification.work_details
                                              ?.period_close_target || "N/A"}
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* PIC */}
                                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                                      <span className="text-gray-500 text-xs">
                                        Person in Charge:
                                      </span>
                                      <div className="font-medium text-gray-900 mt-0.5 text-sm">
                                        👤 {verification.work_details?.pic}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <span className="text-gray-400 text-4xl mb-4 block">✅</span>
              {searchTerm || selectedVesselId > 0 ? (
                <>
                  <p className="text-gray-500 text-lg mb-2">
                    No verified work details found matching your filters
                  </p>
                  <button
                    onClick={() => {
                      setSearchTerm("");
                      setSelectedVesselId(0);
                    }}
                    className="text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <p className="text-gray-500 text-lg mb-2">
                    No verified work details yet
                  </p>
                  <p className="text-gray-400 text-sm">
                    Verified work details will appear here.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
