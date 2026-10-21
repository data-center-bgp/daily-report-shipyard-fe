import { useCallback, useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { AlertTriangle, Check, Copy, KeySquare, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { ActivityLogService } from "../../services/activityLogService";
import { KEY_DURATIONS, SCHEMA, type KeyDurationId } from "./apiDocsContent";

interface ApiKeyRow {
  id: number;
  key_id: string;
  name: string;
  schemas: string[];
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

const STATUS_STYLE: Record<ApiKeyRow["status"], string> = {
  active: "bg-emerald-100 text-emerald-800",
  expired: "bg-gray-200 text-gray-700",
  revoked: "bg-red-100 text-red-800",
};

export default function KeyManager() {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [duration, setDuration] = useState<KeyDurationId>("30d");
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
      const res = await callKeys<{ keys: ApiKeyRow[] }>({ action: "list" });
      setKeys(res.keys);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load keys");
      setKeys((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const durationLabel = (id: KeyDurationId) => KEY_DURATIONS.find((d) => d.id === id)?.label ?? id;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await callKeys<{ token: string; key: ApiKeyRow }>({
        action: "create",
        name: name.trim(),
        duration,
        schemas: [SCHEMA],
      });
      setFresh(res);
      setCopied(false);
      setName("");
      // The token is deliberately left out of the log — only who/what/how long.
      await ActivityLogService.logActivity({
        action: "create",
        tableName: "api_keys",
        recordId: res.key.id,
        newData: { name: res.key.name, schemas: res.key.schemas, expires_at: res.key.expires_at },
        description: `Created API key "${res.key.name}" (${durationLabel(duration)})`,
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

          <div className="text-sm text-gray-600">
            Can read: <code className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[12.5px]">{SCHEMA}</code>
          </div>

          {createError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{createError}</div>
          )}

          <button
            type="submit"
            disabled={!name.trim() || creating}
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
            {fresh.key.expires_at ? `Works until ${formatDate(fresh.key.expires_at)}.` : "Never expires."} Send it in the{" "}
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
                  {["Name", "Created", "Expires", "Status", "Actions"].map((h) => (
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
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
