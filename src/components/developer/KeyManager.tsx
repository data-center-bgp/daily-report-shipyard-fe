import { useCallback, useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { AlertTriangle, Check, Copy, KeySquare, Loader2, Plus, RefreshCw, Table2, Trash2, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { ActivityLogService } from "../../services/activityLogService";
import { KEY_DURATIONS, SCHEMA, type KeyDurationId } from "./apiDocsContent";
import TablePicker from "./TablePicker";

interface ApiKeyRow {
  id: number;
  key_id: string;
  name: string;
  schemas: string[];
  /** The only tables the key may read; null = every table. */
  tables: string[] | null;
  created_at: string;
  created_by_name: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by_name: string | null;
  status: "active" | "expired" | "revoked";
}

// The functions answer errors with { error: "..." }; supabase-js hands back the raw response.
async function callKeys<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("shipyard-report-keys", { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detail = await error.context.json().catch(() => null);
      throw new Error(detail?.error ?? "The key service returned an error");
    }
    throw new Error("Couldn't reach the key service. Check your connection and try again.");
  }
  return data as T;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

const describeTables = (tables: string[] | null) =>
  tables === null ? "all tables" : `${tables.length} table${tables.length === 1 ? "" : "s"}`;

const STATUS_STYLE: Record<ApiKeyRow["status"], string> = {
  active: "bg-emerald-100 text-emerald-800",
  expired: "bg-gray-200 text-gray-700",
  revoked: "bg-red-100 text-red-800",
};

export default function KeyManager() {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [available, setAvailable] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [duration, setDuration] = useState<KeyDurationId>("30d");
  const [access, setAccess] = useState<"all" | "choose">("all");
  const [chosen, setChosen] = useState<string[]>([]);

  // Changing the tables of a key that already exists.
  const [editing, setEditing] = useState<ApiKeyRow | null>(null);
  const [editAccess, setEditAccess] = useState<"all" | "choose">("all");
  const [editChosen, setEditChosen] = useState<string[]>([]);
  const [savingTables, setSavingTables] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ token: string; key: ApiKeyRow } | null>(null);
  const [copied, setCopied] = useState(false);

  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await callKeys<{ keys: ApiKeyRow[]; available_tables?: string[] }>({ action: "list" });
      setKeys(res.keys);
      if (res.available_tables) setAvailable(res.available_tables);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load keys");
      setKeys((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const durationLabel = (id: KeyDurationId) => KEY_DURATIONS.find((d) => d.id === id)?.label ?? id;

  const needsTables = access === "choose" && chosen.length === 0;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || creating || needsTables) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await callKeys<{ token: string; key: ApiKeyRow }>({
        action: "create",
        name: name.trim(),
        duration,
        schemas: [SCHEMA],
        // Left out = every table.
        ...(access === "choose" ? { tables: chosen } : {}),
      });
      setFresh(res);
      setCopied(false);
      setName("");
      setAccess("all");
      setChosen([]);
      // The token is deliberately left out of the log — only who/what/how long/which tables.
      await ActivityLogService.logActivity({
        action: "create",
        tableName: "api_keys",
        recordId: res.key.id,
        newData: { name: res.key.name, schemas: res.key.schemas, tables: res.key.tables, expires_at: res.key.expires_at },
        description: `Created API key "${res.key.name}" (${durationLabel(duration)}, ${describeTables(res.key.tables)})`,
      });
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Couldn't create the key");
    } finally {
      setCreating(false);
    }
  };

  const copyToken = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.token);
    } catch {
      const area = document.createElement("textarea");
      area.value = fresh.token;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(true);
  };

  const openEdit = (row: ApiKeyRow) => {
    setEditing(row);
    setEditAccess(row.tables === null ? "all" : "choose");
    setEditChosen(row.tables ?? []);
    setEditError(null);
  };

  const saveTables = async () => {
    if (!editing) return;
    setSavingTables(true);
    setEditError(null);
    try {
      const tables = editAccess === "choose" ? editChosen : null;
      const res = await callKeys<{ key: ApiKeyRow }>({ action: "set_tables", id: editing.id, tables });
      await ActivityLogService.logActivity({
        action: "update",
        tableName: "api_keys",
        recordId: editing.id,
        oldData: { tables: editing.tables },
        newData: { tables: res.key.tables },
        description: `Changed which tables API key "${editing.name}" can read (${describeTables(editing.tables)} → ${describeTables(res.key.tables)})`,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Couldn't change the tables");
    } finally {
      setSavingTables(false);
    }
  };

  const revoke = async (row: ApiKeyRow) => {
    setRevokingId(row.id);
    setRevokeError(null);
    try {
      await callKeys({ action: "revoke", id: row.id });
      await ActivityLogService.logActivity({
        action: "update",
        tableName: "api_keys",
        recordId: row.id,
        oldData: { status: row.status },
        newData: { status: "revoked" },
        description: `Revoked API key "${row.name}"`,
      });
      setConfirmId(null);
      await load();
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : "Couldn't revoke the key");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-4 shadow sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900">Create an access key</h2>
        <p className="mb-4 text-sm text-gray-600">
          Keys only let someone <strong>read</strong> {SCHEMA} data through the API — nothing can be changed with them. Choose how long
          the key should work.
        </p>

        <form onSubmit={create} className="space-y-4">
          <div>
            <label htmlFor="key-name" className="mb-1 block text-sm font-medium text-gray-700">
              Who or what is it for? <span className="text-red-500">*</span>
            </label>
            <input
              id="key-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="e.g. Supervisor dashboard, Vendor X audit"
              className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <fieldset>
            <legend className="mb-1 block text-sm font-medium text-gray-700">Valid for</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {KEY_DURATIONS.map((d) => (
                <label
                  key={d.id}
                  className={`cursor-pointer rounded-lg border px-3 py-2.5 text-center text-sm font-semibold transition-colors ${
                    duration === d.id
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-300 bg-white text-gray-700 hover:border-blue-400"
                  }`}
                >
                  <input
                    type="radio"
                    name="key-duration"
                    value={d.id}
                    checked={duration === d.id}
                    onChange={() => setDuration(d.id)}
                    className="sr-only"
                  />
                  {d.label}
                </label>
              ))}
            </div>
            {duration === "permanent" && (
              <p className="mt-2 flex items-center gap-2 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />A permanent key never expires on its own — you'll need to revoke it
                here when it's no longer needed.
              </p>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-1 block text-sm font-medium text-gray-700">
              Which tables can it read? <span className="font-normal text-gray-500">(in {SCHEMA})</span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["all", "All tables", "Everything, including staff and activity data"],
                  ["choose", "Only tables I choose", "Limit it to what the site or person actually needs"],
                ] as const
              ).map(([id, title, hint]) => (
                <label
                  key={id}
                  className={`cursor-pointer rounded-lg border px-3 py-2.5 transition-colors ${
                    access === id ? "border-blue-600 bg-blue-50" : "border-gray-300 bg-white hover:border-blue-400"
                  }`}
                >
                  <input
                    type="radio"
                    name="key-access"
                    value={id}
                    checked={access === id}
                    onChange={() => setAccess(id)}
                    className="sr-only"
                  />
                  <span className={`block text-sm font-semibold ${access === id ? "text-blue-700" : "text-gray-800"}`}>{title}</span>
                  <span className="block text-xs text-gray-500">{hint}</span>
                </label>
              ))}
            </div>
            {access === "choose" && (
              <div className="mt-3">
                <TablePicker available={available} selected={chosen} onChange={setChosen} />
                {needsTables && <p className="mt-2 text-xs text-red-600">Choose at least one table.</p>}
              </div>
            )}
          </fieldset>

          {createError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{createError}</div>
          )}

          <button
            type="submit"
            disabled={!name.trim() || creating || needsTables}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Generate key
          </button>
        </form>
      </div>

      {fresh && (
        <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4 shadow sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-emerald-900">
            <KeySquare className="h-5 w-5" /> Key created for "{fresh.key.name}"
          </h2>
          <p className="mt-1 flex items-start gap-2 text-sm font-medium text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Copy it now. For security it can't be shown again — if you lose it, create a new one and revoke this one.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-100">{fresh.token}</code>
            <button
              type="button"
              onClick={copyToken}
              className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy key"}
            </button>
          </div>
          <p className="mt-3 text-sm text-emerald-900">
            {fresh.key.expires_at ? `Works until ${formatDate(fresh.key.expires_at)}.` : "Never expires."} Can read{" "}
            {fresh.key.tables === null ? "all tables" : `only ${describeTables(fresh.key.tables)}`}. Send it in the{" "}
            <code className="rounded border border-emerald-200 bg-white px-1.5 py-0.5 font-mono text-[12.5px]">x-api-key</code> header.
          </p>
          <button
            type="button"
            onClick={() => setFresh(null)}
            className="mt-3 text-sm font-medium text-emerald-800 underline hover:text-emerald-950"
          >
            I've copied it — hide
          </button>
        </div>
      )}

      <div className="rounded-lg bg-white p-4 shadow sm:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Keys you've created</h2>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
        <p className="mb-3 text-xs text-gray-500">
          Revoking a key stops it working straight away. Keys set up before this page existed aren't listed here.
        </p>

        {(loadError || revokeError) && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{loadError ?? revokeError}</div>
        )}

        {keys === null ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading keys…
          </div>
        ) : keys.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">No keys yet. Create one above.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="table-stack min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["Name", "Created", "Expires", "Can read", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-gray-900">{k.name}</div>
                      <div className="font-mono text-[11px] text-gray-400">id {k.key_id}</div>
                    </td>
                    <td className="px-4 py-3 align-top text-gray-700">
                      {formatDate(k.created_at)}
                      {k.created_by_name && <div className="text-xs text-gray-500">by {k.created_by_name}</div>}
                    </td>
                    <td className="px-4 py-3 align-top text-gray-700">{k.expires_at ? formatDate(k.expires_at) : "Never"}</td>
                    <td className="px-4 py-3 align-top text-gray-700">
                      <span className="capitalize">{describeTables(k.tables)}</span>
                      {k.tables && (
                        <div className="mt-0.5 max-w-[14rem] break-words font-mono text-[11px] text-gray-400" title={k.tables.join(", ")}>
                          {k.tables.slice(0, 3).join(", ")}
                          {k.tables.length > 3 ? ` +${k.tables.length - 3} more` : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[k.status]}`}>
                        {k.status}
                      </span>
                      {k.revoked_at && k.revoked_by_name && (
                        <div className="mt-1 text-xs text-gray-500">by {k.revoked_by_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {k.status === "revoked" ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : confirmId === k.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => revoke(k)}
                            disabled={revokingId === k.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                          >
                            {revokingId === k.id && <Loader2 className="h-3 w-3 animate-spin" />}
                            Yes, revoke
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmId(null)}
                            disabled={revokingId === k.id}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(k)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            <Table2 className="h-3.5 w-3.5" /> Tables
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRevokeError(null);
                              setConfirmId(k.id);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Revoke
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => !savingTables && setEditing(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Change which tables the key can read"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 p-4">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Table2 className="h-5 w-5" /> Tables for "{editing.name}"
              </h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={savingTables}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              <p className="text-sm text-gray-600">
                The key itself doesn't change — whoever already has it simply sees the new list from their very next request.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["all", "All tables"],
                    ["choose", "Only tables I choose"],
                  ] as const
                ).map(([id, title]) => (
                  <label
                    key={id}
                    className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold ${
                      editAccess === id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-300 bg-white text-gray-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="edit-access"
                      value={id}
                      checked={editAccess === id}
                      onChange={() => setEditAccess(id)}
                      className="sr-only"
                    />
                    {title}
                  </label>
                ))}
              </div>
              {editAccess === "choose" && (
                <>
                  <TablePicker available={available} selected={editChosen} onChange={setEditChosen} />
                  {editChosen.length === 0 && <p className="text-xs text-red-600">Choose at least one table.</p>}
                </>
              )}
              {editError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{editError}</div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 p-4">
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={savingTables}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveTables}
                disabled={savingTables || (editAccess === "choose" && editChosen.length === 0)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingTables && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
