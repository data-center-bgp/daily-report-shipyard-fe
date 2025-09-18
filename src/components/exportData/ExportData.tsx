import { useState, useEffect } from "react";
import {
  exportVesselData,
  generateCSV,
  downloadFile,
  type ExportOptions,
} from "../../utils/exportHandler";
import { supabase } from "../../lib/supabase";

interface Vessel {
  id: number;
  name: string;
  company: string;
}

interface UserProfile {
  id: number;
  name: string;
  email: string;
  role: string;
}

export default function ExportData() {
  const [loading, setLoading] = useState(false);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [selectedVessels, setSelectedVessels] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Check user profile and role
  const loadUserProfile = async () => {
    try {
      setProfileLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error("User not authenticated:", userError);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, name, email, role")
        .eq("auth_user_id", user.id)
        .single();

      if (profileError) {
        console.error("Error fetching user profile:", profileError);
        return;
      }

      setUserProfile(profile);
    } catch (error) {
      console.error("Error loading user profile:", error);
    } finally {
      setProfileLoading(false);
    }
  };

  // Load vessels for filtering
  const loadVessels = async () => {
    const { data } = await supabase
      .from("vessel")
      .select("id, name, company")
      .is("deleted_at", null)
      .order("name");

    setVessels(data || []);
  };

  useEffect(() => {
    loadUserProfile();
    loadVessels();
  }, []);

  const handleExport = async () => {
    if (!userProfile) {
      alert("User profile not loaded. Please refresh the page.");
      return;
    }

    setLoading(true);
    try {
      // Determine if user has access to financial data
      const hasFinancialAccess = ["MASTER", "FINANCE"].includes(
        userProfile.role.toUpperCase()
      );

      const exportOptions: ExportOptions = {
        format: "csv",
        filters:
          selectedVessels.length > 0
            ? { vesselIds: selectedVessels }
            : undefined,
        includeFinancialData: hasFinancialAccess,
      };

      const exportResult = await exportVesselData(exportOptions);
      const content = generateCSV(exportResult.data);

      downloadFile(content, exportResult.filename, "text/csv");

      const vesselText =
        selectedVessels.length > 0
          ? `${selectedVessels.length} selected vessel(s)`
          : "all vessels";

      const accessLevel = hasFinancialAccess
        ? "with financial data"
        : "with operational data only";

      // Better success notification
      const notification = document.createElement("div");
      notification.className =
        "fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 transform transition-all duration-500";
      notification.innerHTML = `
        <div class="flex items-center space-x-2">
          <span class="text-lg">✅</span>
          <span>Successfully exported ${exportResult.totalRecords} records for ${vesselText} (${accessLevel})</span>
        </div>
      `;
      document.body.appendChild(notification);

      setTimeout(() => {
        notification.classList.add("-translate-y-2", "opacity-0");
        setTimeout(() => document.body.removeChild(notification), 500);
      }, 4000);
    } catch (error) {
      console.error("Export error:", error);

      // Better error notification with proper typing
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      const notification = document.createElement("div");
      notification.className =
        "fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50";
      notification.innerHTML = `
        <div class="flex items-center space-x-2">
          <span class="text-lg">❌</span>
          <span>Export failed: ${errorMessage}</span>
        </div>
      `;
      document.body.appendChild(notification);

      setTimeout(() => {
        notification.classList.add("-translate-y-2", "opacity-0");
        setTimeout(() => document.body.removeChild(notification), 500);
      }, 4000);
    } finally {
      setLoading(false);
    }
  };

  const handleVesselSelect = (vesselId: number) => {
    setSelectedVessels((prev) => {
      if (prev.includes(vesselId)) {
        return prev.filter((id) => id !== vesselId);
      } else {
        return [...prev, vesselId];
      }
    });
  };

  const handleSelectAllVessels = () => {
    const filteredVessels = vessels.filter(
      (vessel) =>
        vessel.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        vessel.company.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (selectedVessels.length === filteredVessels.length) {
      setSelectedVessels([]);
    } else {
      setSelectedVessels(filteredVessels.map((v) => v.id));
    }
  };

  // Filter vessels based on search term
  const filteredVessels = vessels.filter(
    (vessel) =>
      vessel.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vessel.company.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedCount = selectedVessels.length;
  const isAllSelected =
    selectedCount === filteredVessels.length && filteredVessels.length > 0;

  // Check if user has financial access
  const hasFinancialAccess =
    userProfile &&
    ["MASTER", "FINANCE"].includes(userProfile.role.toUpperCase());

  if (profileLoading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading user profile...</span>
        </div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center">
            <span className="text-red-600 mr-2">⚠️</span>
            <div>
              <h3 className="text-red-800 font-medium">Access Error</h3>
              <p className="text-red-700">
                Unable to load user profile. Please refresh the page or contact
                support.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header - Same pattern as other pages */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Export Data</h1>
        <p className="text-gray-600">
          Export comprehensive vessel data including work orders, progress, and
          invoices
        </p>

        {/* User Role Info */}
        <div className="mt-4 flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">Logged in as:</span>
            <span className="text-sm font-medium text-gray-900">
              {userProfile.name}
            </span>
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium ${
                hasFinancialAccess
                  ? "bg-green-100 text-green-800"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              {userProfile.role}
            </span>
          </div>

          {/* Access Level Indicator */}
          <div
            className={`flex items-center space-x-1 text-xs ${
              hasFinancialAccess ? "text-green-600" : "text-orange-600"
            }`}
          >
            <span>{hasFinancialAccess ? "🔓" : "🔒"}</span>
            <span>
              {hasFinancialAccess
                ? "Full access (including financial data)"
                : "Operational access (financial data excluded)"}
            </span>
          </div>
        </div>
      </div>

      {/* Access Level Alert */}
      {!hasFinancialAccess && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start">
            <span className="text-amber-500 mr-2 mt-0.5">ℹ️</span>
            <div>
              <h4 className="text-amber-800 font-medium">
                Limited Export Access
              </h4>
              <p className="text-amber-700 text-sm mt-1">
                Your role ({userProfile.role}) has operational access only.
                Financial data such as payment amounts will be excluded from
                exports. Contact your administrator if you need access to
                financial information.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="bg-white rounded-lg shadow p-6">
        {/* Export Summary Card */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between text-white">
            <div>
              <h2 className="text-xl font-bold mb-1">Vessel Data Export</h2>
              <p className="text-blue-100">
                Select vessels and export{" "}
                {hasFinancialAccess ? "comprehensive" : "operational"} data in
                CSV format
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{selectedCount}</div>
              <div className="text-sm text-blue-100">
                {selectedCount === 0 ? "All vessels" : "vessels selected"}
              </div>
            </div>
          </div>
        </div>

        {/* Search and Selection Controls */}
        <div className="mb-6">
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            {/* Search Input */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Vessels
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                  🔍
                </span>
                <input
                  type="text"
                  placeholder="Search by vessel name or company..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Select All Button */}
            <div className="md:self-end">
              <button
                onClick={handleSelectAllVessels}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isAllSelected
                    ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
                    : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                }`}
              >
                {isAllSelected ? "Deselect All" : "Select All"}
              </button>
            </div>
          </div>

          {/* Selection Summary */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
              <span className="text-sm font-medium text-gray-700">
                {selectedCount > 0
                  ? `${selectedCount} vessel${
                      selectedCount > 1 ? "s" : ""
                    } selected`
                  : "All vessels will be exported"}
              </span>
            </div>
            <span className="text-sm text-gray-500">
              {filteredVessels.length} total vessels
            </span>
          </div>
        </div>

        {/* Vessel List */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Available Vessels
          </h3>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="max-h-80 overflow-y-auto">
              {filteredVessels.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <span className="text-4xl mb-4 block">🔍</span>
                  <p>No vessels found matching your search criteria</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {filteredVessels.map((vessel) => (
                    <label
                      key={vessel.id}
                      className={`flex items-center p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                        selectedVessels.includes(vessel.id) ? "bg-blue-50" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedVessels.includes(vessel.id)}
                        onChange={() => handleVesselSelect(vessel.id)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <div className="ml-3 flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {vessel.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {vessel.company}
                            </div>
                          </div>
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-blue-600 text-sm">🚢</span>
                          </div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Export Actions */}
        <div className="border-t pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            {/* Export Info */}
            <div className="text-sm text-gray-600">
              <p>
                Export will include: vessel information, work orders, work
                details, progress records, verification status
                {hasFinancialAccess
                  ? ", and invoice data including payment amounts"
                  : ", and invoice data (excluding payment amounts)"}
                .
              </p>
            </div>

            {/* Export Button */}
            <button
              onClick={handleExport}
              disabled={loading}
              className={`inline-flex items-center px-6 py-3 rounded-lg font-medium transition-all ${
                loading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg"
              } text-white`}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Exporting...
                </>
              ) : (
                <>
                  <span className="mr-2">📊</span>
                  Export {hasFinancialAccess ? "Full" : "Operational"} Data
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
