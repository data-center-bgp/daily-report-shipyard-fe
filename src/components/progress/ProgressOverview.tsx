import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useProgress } from "../../hooks/useProgress";
import type { ProgressSummary } from "../../types/progress";

export default function ProgressOverview() {
  const navigate = useNavigate();
  const { progressSummaries, stats, loading, error, fetchProgressStats } =
    useProgress();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "completed" | "behind"
  >("all");

  useEffect(() => {
    fetchProgressStats();
  }, [fetchProgressStats]);

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return "text-green-600 bg-green-100";
    if (progress >= 75) return "text-blue-600 bg-blue-100";
    if (progress >= 50) return "text-yellow-600 bg-yellow-100";
    if (progress >= 25) return "text-orange-600 bg-orange-100";
    return "text-red-600 bg-red-100";
  };

  const getStatusBadge = (summary: ProgressSummary) => {
    const daysSinceLastReport = Math.floor(
      (new Date().getTime() - new Date(summary.latest_report_date).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    if (summary.current_progress >= 100) {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
          ✅ Completed
        </span>
      );
    }
    if (daysSinceLastReport > 3) {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
          ⚠️ Behind Schedule
        </span>
      );
    }
    return (
      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
        🚧 Active
      </span>
    );
  };

  // Helper function to truncate work description
  const truncateDescription = (
    description: string | null | undefined,
    maxLength: number = 100
  ) => {
    if (!description) return "No description provided";
    if (description.length <= maxLength) return description;
    return description.substring(0, maxLength).trim() + "...";
  };

  const filteredSummaries = progressSummaries.filter((summary) => {
    const matchesSearch =
      summary.work_order?.customer_wo_number
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      summary.work_order?.shipyard_wo_number
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      summary.work_order?.vessel?.name
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      summary.work_order?.vessel?.company
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      summary.work_order?.wo_description
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase());

    const daysSinceLastReport = Math.floor(
      (new Date().getTime() - new Date(summary.latest_report_date).getTime()) /
        (1000 * 60 * 60 * 24)
    );

    switch (statusFilter) {
      case "completed":
        return matchesSearch && summary.current_progress >= 100;
      case "active":
        return (
          matchesSearch &&
          summary.current_progress < 100 &&
          daysSinceLastReport <= 3
        );
      case "behind":
        return (
          matchesSearch &&
          summary.current_progress < 100 &&
          daysSinceLastReport > 3
        );
      default:
        return matchesSearch;
    }
  });

  // Group work orders by vessel
  const groupedByVessel = filteredSummaries.reduce((acc, summary) => {
    const vesselKey = summary.work_order?.vessel?.name || "Unknown Vessel";
    const vesselInfo = summary.work_order?.vessel || {
      name: "Unknown Vessel",
      type: "Unknown",
      company: "Unknown",
    };

    if (!acc[vesselKey]) {
      acc[vesselKey] = {
        vessel: vesselInfo,
        workOrders: [],
      };
    }
    acc[vesselKey].workOrders.push(summary);
    return acc;
  }, {} as Record<string, { vessel: { name: string; type: string; company: string }; workOrders: ProgressSummary[] }>);

  const getVesselProgress = (workOrders: ProgressSummary[]) => {
    const totalProgress = workOrders.reduce(
      (sum, wo) => sum + wo.current_progress,
      0
    );
    return Math.round(totalProgress / workOrders.length);
  };

  const getVesselStatus = (workOrders: ProgressSummary[]) => {
    const completed = workOrders.filter(
      (wo) => wo.current_progress >= 100
    ).length;
    const total = workOrders.length;

    if (completed === total) return "All Completed";
    if (completed > 0) return `${completed}/${total} Completed`;

    const behind = workOrders.filter((wo) => {
      const daysSinceLastReport = Math.floor(
        (new Date().getTime() - new Date(wo.latest_report_date).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      return wo.current_progress < 100 && daysSinceLastReport > 3;
    }).length;

    if (behind > 0) return `${behind} Behind Schedule`;
    return "Active";
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading progress data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Project Progress Overview
        </h1>
        <p className="text-gray-600">
          Track daily progress for all active work orders grouped by vessel
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-blue-600 text-lg">📊</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">
                  Total Projects
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.total_projects}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                  <span className="text-purple-600 text-lg">🚢</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Vessels</p>
                <p className="text-2xl font-bold text-gray-900">
                  {Object.keys(groupedByVessel).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-green-600 text-lg">✅</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Completed</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.completed_projects}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <span className="text-yellow-600 text-lg">📈</span>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">
                  Avg Progress
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.average_progress.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search vessels, work orders, or descriptions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as typeof statusFilter)
            }
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Projects</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="behind">Behind Schedule</option>
          </select>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/progress/tracker")}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            📝 Add Progress
          </button>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Results Count */}
      <div className="text-sm text-gray-600 mb-4">
        Showing {Object.keys(groupedByVessel).length} vessels with{" "}
        {filteredSummaries.length} work orders
      </div>

      {/* Vessels with Work Orders */}
      <div className="space-y-6">
        {Object.keys(groupedByVessel).length > 0 ? (
          Object.entries(groupedByVessel).map(
            ([vesselName, { vessel, workOrders }]) => {
              const vesselProgress = getVesselProgress(workOrders);
              const vesselStatus = getVesselStatus(workOrders);

              return (
                <div
                  key={vesselName}
                  className="bg-white rounded-lg shadow overflow-hidden"
                >
                  {/* Vessel Header */}
                  <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                          <span className="text-2xl">🚢</span>
                        </div>
                        <div>
                          <h2 className="text-xl font-bold">{vessel.name}</h2>
                          <p className="text-blue-100">
                            {vessel.type} • {vessel.company}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">
                          {vesselProgress}%
                        </div>
                        <div className="text-sm text-blue-100">
                          {vesselStatus}
                        </div>
                        <div className="text-xs text-blue-200 mt-1">
                          {workOrders.length} work order
                          {workOrders.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>

                    {/* Vessel Progress Bar */}
                    <div className="mt-4">
                      <div className="w-full bg-white bg-opacity-20 rounded-full h-2">
                        <div
                          className="bg-white h-2 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(vesselProgress, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  {/* Work Orders List */}
                  <div className="divide-y divide-gray-200">
                    {workOrders.map((summary) => (
                      <div
                        key={summary.work_order_id}
                        className="p-6 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() =>
                          navigate(`/progress/details/${summary.work_order_id}`)
                        }
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            {/* Work Order Header */}
                            <div className="flex items-center space-x-3 mb-3">
                              <div>
                                <h3 className="text-lg font-semibold text-gray-900">
                                  {summary.work_order?.customer_wo_number}
                                </h3>
                                <p className="text-sm text-gray-500">
                                  Shipyard:{" "}
                                  {summary.work_order?.shipyard_wo_number}
                                </p>
                              </div>
                              {getStatusBadge(summary)}
                            </div>

                            {/* Work Description */}
                            <div className="mb-4">
                              <p className="text-xs font-medium text-gray-500 mb-1">
                                Work Description:
                              </p>
                              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                <p className="text-sm text-gray-700 leading-relaxed">
                                  {truncateDescription(
                                    summary.work_order?.wo_description
                                  )}
                                </p>
                                {summary.work_order?.wo_description &&
                                  summary.work_order.wo_description.length >
                                    100 && (
                                    <p className="text-xs text-blue-600 mt-1 font-medium">
                                      Click to view full description →
                                    </p>
                                  )}
                              </div>
                            </div>

                            {/* Progress Info */}
                            <div className="flex items-center text-xs text-gray-500 space-x-4">
                              <span>
                                Last updated:{" "}
                                {new Date(
                                  summary.latest_report_date
                                ).toLocaleDateString()}
                              </span>
                              <span>{summary.total_reports} reports</span>
                              <span>
                                Location: {summary.work_order?.wo_location}
                              </span>
                            </div>
                          </div>

                          {/* Progress Section */}
                          <div className="ml-6 text-right">
                            <div className="flex items-center justify-end mb-2">
                              <span
                                className={`text-lg font-bold px-3 py-1 rounded-full ${getProgressColor(
                                  summary.current_progress
                                )}`}
                              >
                                {summary.current_progress}%
                              </span>
                            </div>
                            <div className="w-32">
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full transition-all duration-300 ${
                                    summary.current_progress >= 100
                                      ? "bg-green-600"
                                      : summary.current_progress >= 75
                                      ? "bg-blue-600"
                                      : summary.current_progress >= 50
                                      ? "bg-yellow-600"
                                      : summary.current_progress >= 25
                                      ? "bg-orange-600"
                                      : "bg-red-600"
                                  }`}
                                  style={{
                                    width: `${Math.min(
                                      summary.current_progress,
                                      100
                                    )}%`,
                                  }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
          )
        ) : (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🚢</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No Vessels Found
            </h3>
            <p className="text-gray-500 mb-4">
              {searchTerm || statusFilter !== "all"
                ? "No vessels match your current filters."
                : "No vessels with progress data yet."}
            </p>
            {searchTerm || statusFilter !== "all" ? (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("all");
                }}
                className="text-blue-600 hover:text-blue-800 transition-colors"
              >
                Clear filters
              </button>
            ) : (
              <button
                onClick={() => navigate("/progress/tracker")}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors inline-flex items-center gap-2"
              >
                📝 Add First Progress
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
