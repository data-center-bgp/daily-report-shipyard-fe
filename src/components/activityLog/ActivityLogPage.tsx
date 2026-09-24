import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  ListTree,
  Users,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { ActivityLogService } from "../../services/activityLogService";
import type { ActivityLog } from "../../lib/supabase";
import type { TrackedProfile } from "./activityLogTypes";
import {
  TRACKED_ROLES,
  computePeriodRange,
  periodQueryBounds,
  type PeriodPreset,
} from "./activityLogShared";
import ActivityDashboardTab from "./ActivityDashboardTab";
import ActivityPerUserTab from "./ActivityPerUserTab";
import ActivityRincianTab from "./ActivityRincianTab";

type TabKey = "dashboard" | "perUser" | "rincian";

const PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: "7d", label: "7 hari" },
  { key: "14d", label: "14 hari" },
  { key: "30d", label: "30 hari" },
  { key: "month", label: "Bulan Ini" },
];

export default function ActivityLogPage() {
  const { canAccess, profile } = useAuth();
  const seesEveryone = canAccess("activityLogs");

  const [tab, setTab] = useState<TabKey>("dashboard");
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [offset, setOffset] = useState(0);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [trackedProfiles, setTrackedProfiles] = useState<TrackedProfile[]>(
    [],
  );
  const [loading, setLoading] = useState(true);

  const range = useMemo(
    () => computePeriodRange(preset, offset, customStart, customEnd),
    [preset, offset, customStart, customEnd],
  );

  // Fetch the tracked-employee roster once per privilege level — same
  // admin_list_all_profiles RPC UserActivitySummary uses, restricted to
  // MASTER/MANAGER by that RPC itself.
  useEffect(() => {
    if (!seesEveryone) {
      setTrackedProfiles([]);
      return;
    }
    supabase
      .rpc("admin_list_all_profiles")
      .then(({ data, error }) => {
        if (error || !data) return;
        const rows = data as {
          id: number;
          name: string;
          role: string;
          deleted_at: string | null;
        }[];
        setTrackedProfiles(
          rows
            .filter((p) => TRACKED_ROLES.includes(p.role))
            .map((p) => ({
              id: p.id,
              name: p.name,
              role: p.role,
              deleted_at: p.deleted_at,
            })),
        );
      });
  }, [seesEveryone]);

  useEffect(() => {
    // No client-side user_id filter here — the real scoping boundary is the
    // "Master/Manager read all, others read only same-role logs" RLS policy
    // on activity_logs (MASTER/MANAGER see everyone; everyone else only
    // sees logs from users sharing their own current role). Wait for the
    // profile to resolve first so a non-privileged viewer's own role is
    // known to Postgres before the query runs.
    if (!profile?.id) {
      setLogs([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const { startISO, endISO } = periodQueryBounds(range);
    ActivityLogService.getAllLogsInRange(startISO, endISO).then((data) => {
      if (!cancelled) {
        setLogs(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [range, profile?.id]);

  const handlePreset = (p: PeriodPreset) => {
    setPreset(p);
    setOffset(0);
    setShowCustomPicker(false);
  };

  const handleApplyCustomRange = () => {
    if (customStart && customEnd) {
      setPreset("custom");
      setOffset(0);
      setShowCustomPicker(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Log Aktivitas User
          </h1>
          <p className="text-gray-600 mt-1 text-sm">
            {seesEveryone
              ? "Pencatatan aktivitas seluruh user pada sistem"
              : `Riwayat aktivitas user dengan role ${profile?.role ?? ""}`}
          </p>
        </div>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
          <button
            onClick={() => setTab("dashboard")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md ${
              tab === "dashboard"
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </button>
          <button
            onClick={() => setTab("perUser")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md ${
              tab === "perUser"
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Users className="w-4 h-4" />
            Per User
          </button>
          <button
            onClick={() => setTab("rincian")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md ${
              tab === "rincian"
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <ListTree className="w-4 h-4" />
            Rincian
          </button>
        </div>
      </div>

      <div className="mb-6 bg-white border border-gray-200 rounded-lg p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => handlePreset(p.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                preset === p.key
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "text-gray-600 hover:bg-gray-50 border border-transparent"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setOffset((o) => o + 1)}
            title="Periode sebelumnya"
            className="p-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowCustomPicker((s) => !s)}
            className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 whitespace-nowrap"
          >
            {range.label}
          </button>
          <button
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={offset === 0}
            title="Periode berikutnya"
            className="p-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {showCustomPicker && (
          <div className="w-full flex flex-wrap items-end gap-3 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Dari
              </label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Sampai
              </label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md"
              />
            </div>
            <button
              onClick={handleApplyCustomRange}
              disabled={!customStart || !customEnd}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Terapkan
            </button>
          </div>
        )}
      </div>

      <div className="bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-gray-500 text-sm">Loading activity...</div>
          </div>
        ) : (
          <>
            {tab === "dashboard" && (
              <ActivityDashboardTab
                logs={logs}
                range={range}
                seesEveryone={seesEveryone}
                trackedProfiles={trackedProfiles}
                viewerRole={profile?.role}
              />
            )}
            {tab === "perUser" && (
              <ActivityPerUserTab
                logs={logs}
                range={range}
                seesEveryone={seesEveryone}
                trackedProfiles={trackedProfiles}
                viewerRole={profile?.role}
              />
            )}
            {tab === "rincian" && (
              <ActivityRincianTab
                logs={logs}
                range={range}
                seesEveryone={seesEveryone}
                trackedProfiles={trackedProfiles}
                viewerRole={profile?.role}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
