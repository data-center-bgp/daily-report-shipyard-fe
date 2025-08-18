// src/components/progress/ProgressChart.tsx

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
    fetchChartData();
  }, [workOrderId]);

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

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return "#10B981"; // green-500
    if (progress >= 75) return "#3B82F6"; // blue-500
    if (progress >= 50) return "#F59E0B"; // amber-500
    if (progress >= 25) return "#F97316"; // orange-500
    return "#EF4444"; // red-500
  };

  const maxProgress = Math.max(...chartData.map((d) => d.progress), 100);
  const chartHeight = height - 80; // Reserve space for labels

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading chart...</span>
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
            onClick={fetchChartData}
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
          <p>No progress data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Progress Timeline
      </h3>

      {/* Chart Container */}
      <div className="relative" style={{ height: `${height}px` }}>
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-gray-500 pr-2">
          <span>100%</span>
          <span>75%</span>
          <span>50%</span>
          <span>25%</span>
          <span>0%</span>
        </div>

        {/* Chart area */}
        <div className="ml-8 h-full relative">
          {/* Grid lines */}
          <div className="absolute inset-0">
            {[0, 25, 50, 75, 100].map((value) => (
              <div
                key={value}
                className="absolute w-full border-t border-gray-200"
                style={{ bottom: `${(value / 100) * chartHeight}px` }}
              />
            ))}
          </div>

          {/* Progress line and points */}
          <svg
            className="absolute inset-0 w-full"
            style={{ height: `${chartHeight}px` }}
            preserveAspectRatio="none"
          >
            {/* Progress line */}
            {chartData.length > 1 && (
              <polyline
                fill="none"
                stroke="#3B82F6"
                strokeWidth="2"
                points={chartData
                  .map((point, index) => {
                    const x = (index / (chartData.length - 1)) * 100;
                    const y = 100 - (point.progress / maxProgress) * 100;
                    return `${x},${y}`;
                  })
                  .join(" ")}
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* Progress points */}
            {chartData.map((point, index) => {
              const x = (index / Math.max(chartData.length - 1, 1)) * 100;
              const y = 100 - (point.progress / maxProgress) * 100;
              return (
                <circle
                  key={index}
                  cx={`${x}%`}
                  cy={`${y}%`}
                  r="4"
                  fill={getProgressColor(point.progress)}
                  stroke="white"
                  strokeWidth="2"
                  className="cursor-pointer hover:r-6 transition-all"
                  title={`${point.formatted_date}: ${point.progress}% (${point.reporter})`}
                />
              );
            })}
          </svg>

          {/* X-axis labels */}
          <div className="absolute -bottom-6 w-full flex justify-between text-xs text-gray-500">
            {chartData.map((point, index) => {
              // Only show labels for first, last, and every few points to avoid crowding
              const shouldShow =
                index === 0 ||
                index === chartData.length - 1 ||
                index % Math.max(Math.floor(chartData.length / 5), 1) === 0;

              return shouldShow ? (
                <span
                  key={index}
                  className="transform -rotate-45 origin-left"
                  style={{
                    left: `${
                      (index / Math.max(chartData.length - 1, 1)) * 100
                    }%`,
                  }}
                >
                  {new Date(point.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              ) : null;
            })}
          </div>
        </div>
      </div>

      {/* Progress Details */}
      {showDetails && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-900 mb-3">
            Recent Progress
          </h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {chartData
              .slice(-5)
              .reverse()
              .map((point, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: getProgressColor(point.progress),
                      }}
                    />
                    <span className="text-gray-600">
                      {point.formatted_date}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-900">
                      {point.progress}%
                    </span>
                    <span className="text-xs text-gray-500">
                      by {point.reporter}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
