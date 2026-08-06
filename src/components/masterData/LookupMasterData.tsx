import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Loader2, XCircle, X } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import Pagination, { PAGE_SIZE } from "./Pagination";

interface LookupRow {
  id: number;
  value: string;
  deleted_at: string | null;
}

// Shared by Location and Work Scope — both are single-text-column lookup
// tables (id, <column>, deleted_at) with identical CRUD needs, so one
// component parameterized by table/column/label covers both instead of
// duplicating near-identical list+modal code.
export default function LookupMasterData({
  table,
  column,
  label,
  placeholder,
}: {
  table: "location" | "work_scope";
  column: "location" | "work_scope";
  label: string;
  placeholder: string;
}) {
  const { isReadOnly } = useAuth();
  const canEdit = !isReadOnly;

  const [rows, setRows] = useState<LookupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from(table)
        .select(`id, ${column}, deleted_at`)
        .order(column, { ascending: true });
      if (fetchError) throw fetchError;
      const mapped = ((data as Record<string, unknown>[]) || []).map((row) => ({
        id: row.id as number,
        value: row[column] as string,
        deleted_at: row.deleted_at as string | null,
      }));
      setRows(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load ${label.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }, [table, column, label]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const openAddModal = () => {
    setEditingId(null);
    setValue("");
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (r: LookupRow) => {
    setEditingId(r.id);
    setValue(r.value);
    setFormError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setFormError(`${label} is required`);
      return;
    }
    const duplicate = rows.some(
      (r) =>
        r.id !== editingId &&
        !r.deleted_at &&
        r.value.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) {
      setFormError(`An active ${label.toLowerCase()} with this name already exists`);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        const { error: updateError } = await supabase
          .from(table)
          .update({ [column]: trimmed, updated_at: new Date().toISOString() })
          .eq("id", editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from(table).insert({ [column]: trimmed });
        if (insertError) throw insertError;
      }
      setShowModal(false);
      await loadRows();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : `Failed to save ${label.toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (r: LookupRow) => {
    const willActivate = !!r.deleted_at;
    const msg = willActivate
      ? `Restore "${r.value}"? It'll be selectable again in Work Details.`
      : `Remove "${r.value}" from active master data? Existing work details keep it — this only hides it from new-entry pickers.`;
    if (!window.confirm(msg)) return;

    setTogglingId(r.id);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from(table)
        .update({
          deleted_at: willActivate ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      if (updateError) throw updateError;
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to update ${label.toLowerCase()}`);
    } finally {
      setTogglingId(null);
    }
  };

  const filtered = rows.filter((r) => {
    if (statusFilter === "active" && r.deleted_at) return false;
    if (statusFilter === "inactive" && !r.deleted_at) return false;
    if (search.trim() && !r.value.toLowerCase().includes(search.trim().toLowerCase())) {
      return false;
    }
    return true;
  });

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={`Search ${label.toLowerCase()}`}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setPage(1);
          }}
          className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
          <option value="all">All</option>
        </select>
        {canEdit && (
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Add {label}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700 text-sm">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">{label}</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                    No {label.toLowerCase()} entries found
                  </td>
                </tr>
              ) : (
                paginated.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.value}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          r.deleted_at
                            ? "bg-gray-200 text-gray-600"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {r.deleted_at ? "Inactive" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditModal(r)}
                            className="px-3 py-1 text-xs font-medium rounded-md border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleToggleActive(r)}
                            disabled={togglingId === r.id}
                            className={`px-3 py-1 text-xs font-medium rounded-md border disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                              r.deleted_at
                                ? "border-green-300 text-green-700 hover:bg-green-50"
                                : "border-red-300 text-red-700 hover:bg-red-50"
                            }`}
                          >
                            {togglingId === r.id ? "..." : r.deleted_at ? "Restore" : "Remove"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="px-4 pb-4">
            <Pagination page={page} totalItems={filtered.length} onPageChange={setPage} />
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingId ? `Edit ${label}` : `Add ${label}`}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {label} *
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              {formError && <p className="text-red-600 text-sm">{formError}</p>}
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? "Save Changes" : `Add ${label}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
