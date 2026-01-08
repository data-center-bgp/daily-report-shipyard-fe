import WorkOrderDashboard from "./WorkOrderDashboard";
import { useAuth } from "../../hooks/useAuth";

export default function WorkOrders() {
  const { isReadOnly } = useAuth();

  return (
    <div className="p-8">
      {/* Header Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Work Orders</h1>
            <p className="text-gray-600">
              {isReadOnly
                ? "View all work orders (Read-only access)"
                : "Manage all work orders"}
            </p>
          </div>

          {/* Read-Only Badge */}
          {isReadOnly && (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-full border border-yellow-200 flex items-center gap-1.5">
                🔒 Read Only Access
              </span>
            </div>
          )}
        </div>

        {/* Read-Only Info Banner */}
        {isReadOnly && (
          <div className="mt-4 bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="text-yellow-600 text-xl">ℹ️</span>
              <div>
                <p className="font-semibold text-yellow-900">Viewing Mode</p>
                <p className="text-sm text-yellow-700 mt-1">
                  You have read-only access. You can view all work orders but
                  cannot create, edit, or delete them.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Work Order Dashboard */}
      <WorkOrderDashboard />
    </div>
  );
}
