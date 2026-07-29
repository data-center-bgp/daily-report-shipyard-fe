import { useEffect, useState } from "react";
import {
  Lock,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { useAuth, type UserProfile } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { ActivityLogService } from "../../services/activityLogService";

const ROLE_OPTIONS: UserProfile["role"][] = [
  "MASTER",
  "PPIC",
  "PRODUCTION",
  "OP_HEAD",
  "ADMIN",
  "FINANCE",
  "MANAGER",
  "HSSE",
  "ADMIN_SHIPPING",
];

interface AdminProfileRow {
  id: number;
  name: string;
  email: string;
  company: string | null;
  role: UserProfile["role"];
  created_at: string;
  deleted_at: string | null;
}

export default function UserManagementPage() {
  const { canAccess, profile, isReadOnly } = useAuth();

  const [users, setUsers] = useState<AdminProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");

  const canManage = canAccess("userManagement");
  // MANAGER can view this page (canManage) but never change a role or
  // activation status — those stay MASTER-only, matching the RPCs
  // (admin_update_user_role/admin_set_user_active) that also enforce this
  // server-side.
  const canEditUsers = canManage && !isReadOnly;

  useEffect(() => {
    if (canManage) loadUsers();
  }, [canManage]);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc("admin_list_all_profiles");
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (user: AdminProfileRow, newRole: UserProfile["role"]) => {
    if (newRole === user.role) return;
    if (
      !window.confirm(
        `Change ${user.name}'s role from ${user.role} to ${newRole}?`,
      )
    ) {
      return;
    }
    setSavingId(user.id);
    setError(null);
    try {
      const { error } = await supabase.rpc("admin_update_user_role", {
        p_target_id: user.id,
        p_new_role: newRole,
      });
      if (error) throw error;
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u)),
      );
      await ActivityLogService.logActivity({
        action: "update",
        tableName: "profiles",
        recordId: user.id,
        description: `changed ${user.name}'s role from ${user.role} to ${newRole}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change role");
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleActive = async (user: AdminProfileRow) => {
    const willActivate = !!user.deleted_at;
    const confirmMsg = willActivate
      ? `Reactivate ${user.name}? They'll regain access with their previous role.`
      : `Deactivate ${user.name}? They'll immediately lose access until reactivated.`;
    if (!window.confirm(confirmMsg)) return;

    setSavingId(user.id);
    setError(null);
    try {
      const { error } = await supabase.rpc("admin_set_user_active", {
        p_target_id: user.id,
        p_is_active: willActivate,
      });
      if (error) throw error;
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, deleted_at: willActivate ? null : new Date().toISOString() }
            : u,
        ),
      );
      await ActivityLogService.logActivity({
        action: "update",
        tableName: "profiles",
        recordId: user.id,
        description: `${willActivate ? "reactivated" : "deactivated"} ${user.name}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSavingId(null);
    }
  };

  if (!canManage) {
    return (
      <div className="p-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 flex items-start gap-3">
          <Lock className="w-6 h-6 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="text-yellow-900 font-medium">
              You don't have permission to manage users.
            </p>
            <p className="text-sm text-yellow-700 mt-1">
              This page is restricted to the Master and Manager roles.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter((u) => {
    if (statusFilter === "active" && u.deleted_at) return false;
    if (statusFilter === "inactive" && !u.deleted_at) return false;
    if (roleFilter && u.role !== roleFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="text-gray-600 mt-1">
          View every user, change roles, and deactivate/reactivate accounts.
        </p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700 text-sm">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Roles</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Company
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No users found
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelf = u.id === profile?.id;
                    const isSaving = savingId === u.id;
                    const isActive = !u.deleted_at;
                    return (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-900">
                          {u.name}
                          {isSelf && (
                            <span className="ml-2 text-xs text-gray-400">(you)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{u.email}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {u.company || <em className="text-gray-400">—</em>}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={u.role}
                            disabled={
                              !canEditUsers ||
                              isSaving ||
                              (isSelf && u.role === "MASTER")
                            }
                            onChange={(e) =>
                              handleRoleChange(u, e.target.value as UserProfile["role"])
                            }
                            title={
                              !canEditUsers
                                ? "View only — role changes require the Master role"
                                : isSelf && u.role === "MASTER"
                                  ? "You cannot change your own role away from Master"
                                  : undefined
                            }
                            className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              isActive
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-200 text-gray-600"
                            }`}
                          >
                            {isActive ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}
                            {isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {canEditUsers ? (
                            <button
                              onClick={() => handleToggleActive(u)}
                              disabled={isSaving || isSelf}
                              title={
                                isSelf
                                  ? "You cannot deactivate your own account"
                                  : undefined
                              }
                              className={`px-3 py-1 text-xs font-medium rounded-md border disabled:opacity-50 disabled:cursor-not-allowed ${
                                isActive
                                  ? "border-red-300 text-red-700 hover:bg-red-50"
                                  : "border-green-300 text-green-700 hover:bg-green-50"
                              }`}
                            >
                              {isSaving ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : isActive ? (
                                "Deactivate"
                              ) : (
                                "Reactivate"
                              )}
                            </button>
                          ) : (
                            <span
                              className="text-xs text-gray-400"
                              title="View only — activation changes require the Master role"
                            >
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 text-xs text-gray-500">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        You can't change your own role away from Master, or deactivate your own
        account — another Master must do that for you.
      </div>
    </div>
  );
}
