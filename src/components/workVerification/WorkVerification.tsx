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
  is_in_bastp?: boolean;
  bastp_id?: number;
  bastp_added_date?: string;
}

interface WorkVerification {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  verification_date: string;
  work_details_id: number;
  user_id: number;
  verification_notes?: string;
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

  const [completedWorkDetails, setCompletedWorkDetails] = useState<
    WorkDetailsWithProgress[]
  >([]);
  const [verifications, setVerifications] = useState<VerificationWithDetails[]>(
    []
  );
  const [bastps, setBastps] = useState<BASTPs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<
    "pending" | "pendingWithBastp" | "verified"
  >("pending");

  // Filter states
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [selectedVesselId, setSelectedVesselId] = useState<number>(0);

  // Search dropdown states
  const [vesselSearchTerm, setVesselSearchTerm] = useState("");
  const [showVesselDropdown, setShowVesselDropdown] = useState(false);
  const vesselDropdownRef = useRef<HTMLDivElement>(null);

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
  `
        )
        .is("deleted_at", null)
        .order("date", { ascending: false });

      if (bastpError) throw bastpError;
      setBastps(
        (bastpData || []).map((b: any) => ({
          ...b,
          vessel_id: b.vessel?.id ?? null,
          vessel: Array.isArray(b.vessel) ? b.vessel[0] : b.vessel,
        }))
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

  // Split pending work details for tabs
  const pendingNotInBASTP = filteredPending.filter(
    (wd) => !wd.is_in_bastp || !wd.bastp_id
  );
  const pendingWithBASTP = filteredPending.filter(
    (wd) => wd.is_in_bastp && wd.bastp_id
  );

  // Group pendingWithBASTP by BASTP
  const groupedPendingWithBASTP: {
    bastp: BASTPs | null;
    workDetails: WorkDetailsWithProgress[];
  }[] = [];
  const pendingBastpMap = new Map<number, WorkDetailsWithProgress[]>();
  pendingWithBASTP.forEach((wd) => {
    const id = wd.bastp_id!;
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

  // Group verified by BASTP
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

  const groupedVerified: {
    bastp: BASTPs | null;
    verifications: VerificationWithDetails[];
  }[] = [];
  const verifiedBastpMap = new Map<number, VerificationWithDetails[]>();
  filteredVerified
    .filter((v) => v.work_details?.is_in_bastp && v.work_details?.bastp_id)
    .forEach((verification) => {
      const bastpId = verification.work_details.bastp_id!;
      if (!verifiedBastpMap.has(bastpId)) verifiedBastpMap.set(bastpId, []);
      verifiedBastpMap.get(bastpId)!.push(verification);
    });
  verifiedBastpMap.forEach((verifications, bastpId) => {
    const bastp = bastps.find((b) => b.id === bastpId);
    if (bastp) {
      groupedVerified.push({
        bastp,
        verifications,
      });
    }
  });
  groupedVerified.sort((a, b) => {
    if (a.bastp === null) return -1;
    if (b.bastp === null) return 1;
    return new Date(b.bastp.date).getTime() - new Date(a.bastp.date).getTime();
  });

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      { bg: string; text: string; icon: string }
    > = {
      DRAFT: { bg: "bg-gray-100", text: "text-gray-700", icon: "📝" },
      PENDING_VERIFICATION: {
        bg: "bg-yellow-100",
        text: "text-yellow-700",
        icon: "⏳",
      },
      VERIFIED: { bg: "bg-blue-100", text: "text-blue-700", icon: "✅" },
      DOCUMENT_UPLOADED: {
        bg: "bg-purple-100",
        text: "text-purple-700",
        icon: "📄",
      },
      READY_FOR_INVOICE: {
        bg: "bg-green-100",
        text: "text-green-700",
        icon: "💰",
      },
      INVOICED: { bg: "bg-emerald-100", text: "text-emerald-700", icon: "✓" },
    };
    const config = statusConfig[status] || statusConfig.DRAFT;
    return (
      <span
        className={`px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}
      >
        {config.icon} {status.replace(/_/g, " ")}
      </span>
    );
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
            Verify completed work details (100% progress) • Grouped by BASTP
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
                {pendingNotInBASTP.length}
              </p>
            </div>
            <span className="text-yellow-500 text-2xl">⏳</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Pending Verification with BASTP
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {pendingWithBASTP.length}
              </p>
            </div>
            <span className="text-purple-500 text-2xl">📋</span>
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
              Pending Verification ({pendingNotInBASTP.length})
            </button>
            <button
              onClick={() => setActiveTab("pendingWithBastp")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "pendingWithBastp"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Pending Verification with BASTP ({pendingWithBASTP.length})
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Action
                      </th>
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
                          <div className="text-sm text-gray-500">
                            👤 {wd.pic || "-"}
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
                          📍 {wd.location?.location || "-"}
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
                                    wd.latest_progress_date
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
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() =>
                              navigate(`/work-verification/verify/${wd.id}`)
                            }
                            className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                          >
                            Verify
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <span className="text-gray-400 text-4xl mb-4 block">🔍</span>
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
                            <svg
                              className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
                                isExpanded ? "rotate-90" : ""
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
                            {group.bastp ? (
                              <div className="text-left">
                                <div className="flex items-center gap-3">
                                  <h3 className="text-lg font-bold text-gray-900">
                                    📋 BASTP: {group.bastp.number}
                                  </h3>
                                  {getStatusBadge(group.bastp.status)}
                                </div>
                                <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                                  <span>🚢 {group.bastp.vessel?.name}</span>
                                  <span>📅 {formatDate(group.bastp.date)}</span>
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
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Action
                                </th>
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
                                    <div className="text-sm text-gray-500">
                                      👤 {wd.pic || "-"}
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
                                    📍 {wd.location?.location || "-"}
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
                                              wd.latest_progress_date
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
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <button
                                      onClick={() =>
                                        navigate(
                                          `/work-verification/verify/${wd.id}`
                                        )
                                      }
                                      className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                                    >
                                      Verify
                                    </button>
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
                <span className="text-gray-400 text-4xl mb-4 block">🔍</span>
                <p className="text-gray-500 text-lg mb-2">
                  No pending verifications with BASTP found matching your
                  filters
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
                            <svg
                              className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
                                isExpanded ? "rotate-90" : ""
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
                            {group.bastp ? (
                              <div className="text-left">
                                <div className="flex items-center gap-3">
                                  <h3 className="text-lg font-bold text-gray-900">
                                    📋 BASTP: {group.bastp.number}
                                  </h3>
                                  {getStatusBadge(group.bastp.status)}
                                </div>
                                <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                                  <span>🚢 {group.bastp.vessel?.name}</span>
                                  <span>📅 {formatDate(group.bastp.date)}</span>
                                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-medium">
                                    {group.verifications.length} item
                                    {group.verifications.length > 1 ? "s" : ""}
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
                                  Verified By
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                  Verification Date
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
                                    <div className="text-sm text-gray-500">
                                      👤 {verification.work_details?.pic || "-"}
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
                                    📍{" "}
                                    {verification.work_details?.location
                                      ?.location || "-"}
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
                <span className="text-gray-400 text-4xl mb-4 block">✅</span>
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
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
