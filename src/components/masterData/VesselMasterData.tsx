import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Loader2, XCircle, X } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import Pagination, { PAGE_SIZE } from "./Pagination";

interface VesselRow {
  id: number;
  name: string;
  type: string | null;
  company: string | null;
  fleet: string | null;
  fleet_number: number | null;
  deleted_at: string | null;
}

const emptyForm = { name: "", type: "", company: "", fleet: "", fleet_number: "" };

export default function VesselMasterData() {
  const { isReadOnly } = useAuth();
  const canEdit = !isReadOnly;

  const [vessels, setVessels] = useState<VesselRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const loadVessels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("vessel")
        .select("id, name, type, company, fleet, fleet_number, deleted_at")
        .order("name", { ascending: true });
      if (fetchError) throw fetchError;
      setVessels((data as VesselRow[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vessels");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVessels();
  }, [loadVessels]);

  const openAddModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (v: VesselRow) => {
    setEditingId(v.id);
    setForm({
      name: v.name,
      type: v.type || "",
      company: v.company || "",
      fleet: v.fleet || "",
      fleet_number: v.fleet_number != null ? String(v.fleet_number) : "",
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      setFormError("Vessel name is required");
      return;
    }
    const duplicate = vessels.some(
      (v) =>
        v.id !== editingId &&
        !v.deleted_at &&
        v.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      setFormError("An active vessel with this name already exists");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name,
        type: form.type.trim() || null,
        company: form.company.trim() || null,
        fleet: form.fleet.trim() || null,
        fleet_number: form.fleet_number.trim() ? Number(form.fleet_number.trim()) : null,
      };
      if (editingId) {
        const { error: updateError } = await supabase
          .from("vessel")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from("vessel").insert(payload);
        if (insertError) throw insertError;
      }
      setShowModal(false);
      await loadVessels();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save vessel");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (v: VesselRow) => {
    const willActivate = !!v.deleted_at;
    const msg = willActivate
      ? `Restore ${v.name}? It'll be selectable again when creating work orders/projects.`
      : `Remove ${v.name} from active master data? It stays intact on existing work orders/projects — this only hides it from new-entry pickers.`;
    if (!window.confirm(msg)) return;

    setTogglingId(v.id);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("vessel")
        .update({
          deleted_at: willActivate ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", v.id);
      if (updateError) throw updateError;
      await loadVessels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update vessel");
    } finally {
      setTogglingId(null);
    }
  };

  const filtered = vessels.filter((v) => {
    if (statusFilter === "active" && v.deleted_at) return false;
    if (statusFilter === "inactive" && !v.deleted_at) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !v.name.toLowerCase().includes(q) &&
        !(v.company || "").toLowerCase().includes(q) &&
        !(v.type || "").toLowerCase().includes(q)
      ) {
        return false;
      }
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
            placeholder="Search name, company, or type"
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
            <Plus className="w-4 h-4" /> Add Vessel
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
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Company</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Fleet</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Fleet #</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No vessels found
                  </td>
                </tr>
              ) : (
                paginated.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{v.name}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {v.type || <em className="text-gray-400">—</em>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {v.company || <em className="text-gray-400">—</em>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {v.fleet || <em className="text-gray-400">—</em>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {v.fleet_number != null ? v.fleet_number : <em className="text-gray-400">—</em>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          v.deleted_at
                            ? "bg-gray-200 text-gray-600"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {v.deleted_at ? "Inactive" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditModal(v)}
                            className="px-3 py-1 text-xs font-medium rounded-md border border-blue-300 text-blue-700 hover:bg-blue-50 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleToggleActive(v)}
                            disabled={togglingId === v.id}
                            className={`px-3 py-1 text-xs font-medium rounded-md border disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                              v.deleted_at
                                ? "border-green-300 text-green-700 hover:bg-green-50"
                                : "border-red-300 text-red-700 hover:bg-red-50"
                            }`}
                          >
                            {togglingId === v.id
                              ? "..."
                              : v.deleted_at
                                ? "Restore"
                                : "Remove"}
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
                {editingId ? "Edit Vessel" : "Add Vessel"}
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
                  Name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <input
                  type="text"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  placeholder="e.g. MT, TB, SPOB"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Company
                </label>
                <input
                  type="text"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Fleet
                  </label>
                  <input
                    type="text"
                    value={form.fleet}
                    onChange={(e) => setForm({ ...form, fleet: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Fleet Number
                  </label>
                  <input
                    type="number"
                    value={form.fleet_number}
                    onChange={(e) => setForm({ ...form, fleet_number: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
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
                {editingId ? "Save Changes" : "Add Vessel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
