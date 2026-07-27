import { Lock } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import ActivityLogList from "./ActivityLog";

export default function ActivityLogPage() {
  const { canAccess } = useAuth();

  if (!canAccess("activityLogs")) {
    return (
      <div className="p-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 flex items-start gap-3">
          <Lock className="w-6 h-6 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="text-yellow-900 font-medium">
              You don't have permission to view activity logs.
            </p>
            <p className="text-sm text-yellow-700 mt-1">
              This page is restricted to Master and Manager roles.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Activity Logs</h1>
        <p className="text-gray-600 mt-1">
          View all system activities and changes
        </p>
      </div>

      <ActivityLogList showFilters={true} />
    </div>
  );
}
