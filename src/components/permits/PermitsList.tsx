import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  supabase,
  type PermitToWork,
  type WorkOrder,
} from "../../lib/supabase";
import {
  getPermitFileUrl,
  downloadPermitFile,
  openPermitFile,
} from "../../utils/urlHandler";

export default function PermitsList() {
  const [permits, setPermits] = useState<
    (PermitToWork & { work_order?: WorkOrder })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewingPermit, setViewingPermit] = useState<number | null>(null);
  const [downloadingPermit, setDownloadingPermit] = useState<number | null>(
    null
  );

  const navigate = useNavigate();

  const fetchPermits = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("permit_to_work")
        .select(
          `
          *,
          work_order:work_order_id (
            id,
            customer_wo_number,
            shipyard_wo_number,
            vessel:vessel_id (
              name,
              type,
              company
            )
          )
        `
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setPermits(data || []);
    } catch (err) {
      console.error("Error fetching permits:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermits();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleViewPermit = async (
    permit: PermitToWork & { work_order?: WorkOrder }
  ) => {
    if (!permit.storage_path) {
      setError("No file path found for this permit");
      return;
    }

    try {
      setViewingPermit(permit.id ?? null);
      setError(null);

      console.log("Opening permit file:", permit.storage_path);
      await openPermitFile(permit.storage_path);
    } catch (err) {
      console.error("Error viewing permit:", err);
      setError("Failed to view permit file. Please try again.");
    } finally {
      setViewingPermit(null);
    }
  };

  const handleDownloadPermit = async (
    permit: PermitToWork & { work_order?: WorkOrder }
  ) => {
    if (!permit.storage_path) {
      setError("No file path found for this permit");
      return;
    }

    try {
      setDownloadingPermit(permit.id ?? null);
      setError(null);

      const fileName = `permit_${
        permit.work_order?.customer_wo_number || permit.work_order_id
      }.pdf`;
      console.log(
        "Downloading permit file:",
        permit.storage_path,
        "as",
        fileName
      );

      await downloadPermitFile(permit.storage_path, fileName);
    } catch (err) {
      console.error("Error downloading permit:", err);
      setError("Failed to download permit file. Please try again.");
    } finally {
      setDownloadingPermit(null);
    }
  };

  const handleCopyFileUrl = async (
    permit: PermitToWork & { work_order?: WorkOrder }
  ) => {
    if (!permit.storage_path) {
      setError("No file path found for this permit");
      return;
    }

    try {
      const signedUrl = await getPermitFileUrl(permit.storage_path, 3600); // 1 hour
      if (signedUrl) {
        await navigator.clipboard.writeText(signedUrl);
        // You could add a toast notification here
        console.log("Signed URL copied to clipboard");
      } else {
        throw new Error("Failed to generate signed URL");
      }
    } catch (err) {
      console.error("Error copying URL:", err);
      setError("Failed to copy file URL. Please try again.");
    }
  };

  const filteredPermits = permits.filter(
    (permit) =>
      permit.work_order?.customer_wo_number
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      permit.work_order?.shipyard_wo_number
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      permit.work_order?.vessel?.name
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading permits...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Permits to Work</h1>
        <p className="text-gray-600">Manage work permits and documents</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <span className="text-red-400 text-xl">⚠️</span>
            </div>
            <div className="ml-3">
              <p className="text-red-600">{error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-2 text-red-600 hover:text-red-800 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search permits..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchPermits}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            🔄 Refresh
          </button>
          <button
            onClick={() => navigate("/upload-permit")}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            📤 Upload Permit
          </button>
        </div>
      </div>

      {/* Results Count */}
      <div className="text-sm text-gray-600 mb-4">
        Showing {filteredPermits.length} of {permits.length} permits
      </div>

      {/* Permits Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Work Order
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vessel
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Document
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPermits.length > 0 ? (
                filteredPermits.map((permit) => (
                  <tr key={permit.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {permit.work_order?.customer_wo_number}
                        </div>
                        <div className="text-sm text-gray-500">
                          {permit.work_order?.shipyard_wo_number}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm text-gray-900">
                          {permit.work_order?.vessel?.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {permit.work_order?.vessel?.type} -{" "}
                          {permit.work_order?.vessel?.company}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          permit.is_uploaded
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {permit.is_uploaded ? "✅ Uploaded" : "❌ Pending"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {permit.is_uploaded && permit.storage_path ? (
                        <div className="flex items-center space-x-2">
                          <span className="text-green-600">📄 Available</span>
                          <span className="text-xs text-gray-400">
                            (
                            {permit.storage_path
                              .split("_")
                              .pop()
                              ?.split(".")[0] || "file"}
                            )
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">No document</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(permit.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center space-x-2">
                        {permit.is_uploaded && permit.storage_path ? (
                          <>
                            {/* View Button */}
                            <button
                              onClick={() => handleViewPermit(permit)}
                              disabled={viewingPermit === permit.id}
                              className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm text-gray-700 bg-white hover:bg-gray-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              title="View Document"
                            >
                              {viewingPermit === permit.id ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-1"></div>
                                  Opening...
                                </>
                              ) : (
                                <>👁️ View</>
                              )}
                            </button>

                            {/* Download Button */}
                            <button
                              onClick={() => handleDownloadPermit(permit)}
                              disabled={downloadingPermit === permit.id}
                              className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm text-gray-700 bg-white hover:bg-gray-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              title="Download Document"
                            >
                              {downloadingPermit === permit.id ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-1"></div>
                                  Downloading...
                                </>
                              ) : (
                                <>⬇️ Download</>
                              )}
                            </button>

                            {/* Copy URL Button */}
                            <button
                              onClick={() => handleCopyFileUrl(permit)}
                              className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm text-gray-700 bg-white hover:bg-gray-50 rounded-md transition-colors"
                              title="Copy Secure Link"
                            >
                              🔗 Copy Link
                            </button>
                          </>
                        ) : (
                          /* Upload Button */
                          <button
                            onClick={() =>
                              navigate(
                                `/upload-permit?work_order_id=${permit.work_order_id}`
                              )
                            }
                            className="inline-flex items-center px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                            title="Upload Document"
                          >
                            📤 Upload
                          </button>
                        )}

                        {/* View Work Order Button */}
                        <button
                          onClick={() => navigate(`/work-orders`)}
                          className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm text-gray-700 bg-white hover:bg-gray-50 rounded-md transition-colors"
                          title="View Work Order"
                        >
                          📋 Work Order
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="text-gray-500">
                      <p className="text-lg mb-2">No permits found</p>
                      <p className="text-sm mb-4">
                        {searchTerm
                          ? "Try clearing your search"
                          : "Upload your first permit to work"}
                      </p>
                      {searchTerm ? (
                        <button
                          onClick={() => setSearchTerm("")}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          Clear search
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate("/upload-permit")}
                          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors inline-flex items-center gap-2"
                        >
                          📤 Upload First Permit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Section */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <span className="text-blue-400 text-xl">ℹ️</span>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-900">
              Secure File Access
            </h3>
            <div className="mt-1 text-sm text-blue-800">
              <ul className="list-disc list-inside space-y-1">
                <li>All files are stored in private, secure storage</li>
                <li>View links are temporary and expire automatically</li>
                <li>Only authorized users can access permit documents</li>
                <li>Downloaded files maintain original names and formatting</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
