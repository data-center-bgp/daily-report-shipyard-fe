import { useAuth } from "../../hooks/useAuth";
import ActivityLogList from "./ActivityLog";

export default function ActivityLogPage() {
  const { canAccess } = useAuth();
  const seesEveryone = canAccess("activityLogs");

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Activity Logs</h1>
        <p className="text-gray-600 mt-1">
          {seesEveryone
            ? "View all system activities and changes"
            : "View your own activity history"}
        </p>
      </div>

      <ActivityLogList showFilters={true} />
    </div>
  );
}
