import { useState, useEffect } from "react";
import { ActivityLogService } from "../../services/activityLogService";
import type { ActivityLog } from "../../lib/supabase";

interface ActivityLogListProps {
  tableName?: string;
  recordId?: number;
  showFilters?: boolean;
}

export default function ActivityLogList({
  tableName,
  recordId,
  showFilters = true,
}: ActivityLogListProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({
    action: "",
    startDate: "",
    endDate: "",
  });

  const pageSize = 20;

  useEffect(() => {
    loadLogs();
  }, [page, tableName, recordId, filters]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      if (tableName && recordId) {
        // Get logs for specific record
        const data = await ActivityLogService.getActivityLogs(
          tableName,
          recordId
        );
        setLogs(data);
        setTotalCount(data.length);
      } else {
        // Get all logs with pagination
        const { data, count } = await ActivityLogService.getAllActivityLogs(
          page,
          pageSize,
          {
            tableName: filters.action ? undefined : tableName,
            action: filters.action || undefined,
            startDate: filters.startDate || undefined,
            endDate: filters.endDate || undefined,
          }
        );
        setLogs(data);
        setTotalCount(count);
      }
    } catch (error) {
      console.error("Failed to load activity logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case "create":
        return "bg-green-100 text-green-800";
      case "update":
        return "bg-blue-100 text-blue-800";
      case "delete":
        return "bg-red-100 text-red-800";
      case "restore":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500">Loading activity logs...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      {showFilters && (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Action
              </label>
              <select
                value={filters.action}
                onChange={(e) =>
                  setFilters({ ...filters, action: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Actions</option>
                <option value="create">Create</option>
                <option value="update">Update</option>
                <option value="delete">Delete</option>
                <option value="restore">Restore</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters({ ...filters, startDate: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters({ ...filters, endDate: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Activity Log List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  Date & Time
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  User
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  Action
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  Table
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  Record ID
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  Changes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    No activity logs found
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900 font-medium">
                        {log.user_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {log.user_email}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionBadgeColor(
                          log.action
                        )}`}
                      >
                        {log.action.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {log.table_name}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{log.record_id}</td>
                    <td className="px-4 py-3">
                      {log.changes && Object.keys(log.changes).length > 0 ? (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                            View {Object.keys(log.changes).length} changes
                          </summary>
                          <div className="mt-2 space-y-1">
                            {Object.entries(log.changes).map(([key, value]) => (
                              <div key={key} className="text-gray-700">
                                <span className="font-medium">{key}:</span>
                                <div className="ml-2">
                                  <span className="text-red-600">
                                    {JSON.stringify(value.old)}
                                  </span>
                                  {" → "}
                                  <span className="text-green-600">
                                    {JSON.stringify(value.new)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : (
                        <span className="text-gray-400">No changes</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing {(page - 1) * pageSize + 1} to{" "}
              {Math.min(page * pageSize, totalCount)} of {totalCount} results
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
