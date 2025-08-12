import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  supabase,
  type PermitToWork,
  type WorkOrder,
} from "../../lib/supabase";

export default function PermitsList() {
  const [permits, setPermits] = useState<
    (PermitToWork & { work_order?: WorkOrder })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

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
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchPermits}
            className="mt-2 text-red-600 hover:text-red-800 underline"
          >
            Retry
          </button>
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
                      {permit.document_url ? (
                        <a
                          href={permit.document_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 underline"
                        >
                          📄 View Document
                        </a>
                      ) : (
                        <span className="text-gray-400">No document</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(permit.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex space-x-2">
                        {!permit.is_uploaded && (
                          <button
                            onClick={() =>
                              navigate(
                                `/upload-permit?work_order_id=${permit.work_order_id}`
                              )
                            }
                            className="text-blue-600 hover:text-blue-900 transition-colors"
                            title="Upload Document"
                          >
                            📤
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/work-orders`)}
                          className="text-green-600 hover:text-green-900 transition-colors"
                          title="View Work Order"
                        >
                          👁️
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
    </div>
  );
}
