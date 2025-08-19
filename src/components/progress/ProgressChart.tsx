import { useEffect, useState } from "react";
import { useProgress } from "../../hooks/useProgress";
import type { ProgressChartData } from "../../types/progress";

interface ProgressChartProps {
  workOrderId: number;
  height?: number;
  showDetails?: boolean;
}

export default function ProgressChart({
  workOrderId,
  height = 300,
  showDetails = true,
}: ProgressChartProps) {
  const { getWorkOrderProgress } = useProgress();
  const [chartData, setChartData] = useState<ProgressChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchChartData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getWorkOrderProgress(workOrderId);
        setChartData(data);
      } catch (err) {
        console.error("Error fetching chart data:", err);
        setError("Failed to load progress chart");
      } finally {
        setLoading(false);
      }
    };

    fetchChartData();
  }, [workOrderId, getWorkOrderProgress]);

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return "bg-green-500 text-green-100";
    if (progress >= 75) return "bg-blue-500 text-blue-100";
    if (progress >= 50) return "bg-yellow-500 text-yellow-100";
    if (progress >= 25) return "bg-orange-500 text-orange-100";
    return "bg-red-500 text-red-100";
  };

  const getProgressChange = (
    currentProgress: number,
    previousProgress: number
  ) => {
    const change = currentProgress - previousProgress;
    if (change === 0) return null;

    return (
      <span
        className={`text-xs ml-2 font-medium ${
          change > 0 ? "text-green-600" : "text-red-600"
        }`}
      >
        ({change > 0 ? "+" : ""}
        {change}%)
      </span>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">
            Loading progress timeline...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center text-red-600">
          <p>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 text-blue-600 hover:text-blue-800 underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-2">📈</div>
          <h3 className="text-lg font-semibold mb-2">No Progress Data</h3>
          <p>No progress reports have been recorded yet for this work order.</p>
        </div>
      </div>
    );
  }

  // Sort data by date (newest first for display)
  const sortedData = [...chartData].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">
          📈 Progress Timeline
        </h3>
        <div className="text-sm text-gray-500">
          {sortedData.length} report{sortedData.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Progress Timeline */}
      <div
        className="space-y-4"
        style={{ maxHeight: `${height}px`, overflowY: "auto" }}
      >
        {sortedData.map((item, index) => {
          const previousProgress =
            index < sortedData.length - 1 ? sortedData[index + 1].progress : 0;

          const isLatest = index === 0;
          const isFirst = index === sortedData.length - 1;

          return (
            <div key={`${item.date}-${index}`} className="relative">
              {/* Timeline line */}
              {!isFirst && (
                <div className="absolute left-6 top-12 w-0.5 h-6 bg-gray-200"></div>
              )}

              <div className="flex items-start space-x-4">
                {/* Timeline dot */}
                <div
                  className={`relative flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                    isLatest ? "ring-4 ring-blue-100" : ""
                  } ${getProgressColor(item.progress)}`}
                >
                  <span className="text-sm font-bold">{item.progress}%</span>
                  {isLatest && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  )}
                </div>

                {/* Progress details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-medium text-gray-900">
                          {new Date(item.date).toLocaleDateString("en-US", {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </h4>
                        {isLatest && (
                          <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full">
                            Latest
                          </span>
                        )}
                        {isFirst && (
                          <span className="bg-gray-100 text-gray-800 text-xs font-medium px-2 py-1 rounded-full">
                            Initial
                          </span>
                        )}
                      </div>
                      {/* Removed the "Reported by" section */}
                      <div className="flex items-center text-sm text-gray-600 mt-1">
                        {getProgressChange(item.progress, previousProgress) && (
                          <span className="text-gray-500">
                            Progress change:{" "}
                            {getProgressChange(item.progress, previousProgress)}
                          </span>
                        )}
                        {!getProgressChange(item.progress, previousProgress) &&
                          isFirst && (
                            <span className="text-gray-500">
                              Initial progress entry
                            </span>
                          )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-24 ml-4">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            item.progress >= 100
                              ? "bg-green-500"
                              : item.progress >= 75
                              ? "bg-blue-500"
                              : item.progress >= 50
                              ? "bg-yellow-500"
                              : item.progress >= 25
                              ? "bg-orange-500"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${Math.min(item.progress, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary at bottom */}
      {showDetails && sortedData.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm font-medium text-gray-500">Started</div>
              <div className="text-lg font-bold text-gray-900">
                {sortedData[sortedData.length - 1]?.progress || 0}%
              </div>
              <div className="text-xs text-gray-500">
                {new Date(
                  sortedData[sortedData.length - 1]?.date
                ).toLocaleDateString()}
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-sm font-medium text-blue-600">Current</div>
              <div className="text-lg font-bold text-blue-900">
                {sortedData[0]?.progress || 0}%
              </div>
              <div className="text-xs text-blue-600">
                {new Date(sortedData[0]?.date).toLocaleDateString()}
              </div>
            </div>

            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-sm font-medium text-green-600">
                Total Gain
              </div>
              <div className="text-lg font-bold text-green-900">
                +
                {(sortedData[0]?.progress || 0) -
                  (sortedData[sortedData.length - 1]?.progress || 0)}
                %
              </div>
              <div className="text-xs text-green-600">
                {sortedData.length} updates
              </div>
            </div>

            <div className="bg-purple-50 rounded-lg p-3">
              <div className="text-sm font-medium text-purple-600">
                Remaining
              </div>
              <div className="text-lg font-bold text-purple-900">
                {Math.max(0, 100 - (sortedData[0]?.progress || 0))}%
              </div>
              <div className="text-xs text-purple-600">to completion</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
