import { useMemo, useState } from "react";
import {
  Activity,
  Users,
  UserX,
  FileStack,
  Gauge,
  ChevronDown,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ActivityLog } from "../../lib/supabase";
import type { TrackedProfile } from "./activityLogTypes";
import {
  CHART_COLORS,
  MAX_CHART_SERIES,
  OTHERS_COLOR,
  eachDayInRange,
  dayLabelShort,
  localDayKey,
  type PeriodRange,
} from "./activityLogShared";

interface Props {
  logs: ActivityLog[];
  range: PeriodRange;
  seesEveryone: boolean;
  trackedProfiles: TrackedProfile[];
  // The viewer's own role. When !seesEveryone, RLS guarantees every log
  // visible here belongs to a user sharing this same role, so it doubles
  // as a role-badge fallback for peers the (Master/Manager-only) roster
  // lookup doesn't know about.
  viewerRole?: string;
}

interface UserAgg {
  userId: number;
  name: string;
  role: string;
  total: number;
  activeDays: Set<string>;
  docs: Set<string>;
}

function StatCard({
  icon: Icon,
  iconClass,
  label,
  value,
  sub,
  onClick,
  expanded,
}: {
  icon: typeof Activity;
  iconClass: string;
  label: string;
  value: string | number;
  sub?: string;
  onClick?: () => void;
  expanded?: boolean;
}) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg shadow-sm border p-4 flex items-start gap-3 ${
        clickable ? "cursor-pointer hover:border-blue-300" : ""
      } ${expanded ? "border-blue-400 ring-1 ring-blue-200" : "border-gray-200"}`}
    >
      <div className={`p-2 rounded-lg ${iconClass}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
          {label}
          {clickable && (
            <ChevronDown
              className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          )}
        </div>
        <div className="text-2xl font-bold text-gray-900 mt-0.5">{value}</div>
        {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function ActivityDashboardTab({
  logs,
  range,
  seesEveryone,
  trackedProfiles,
  viewerRole,
}: Props) {
  const [expandedPanel, setExpandedPanel] = useState<
    "active" | "idle" | null
  >(null);

  const days = useMemo(
    () => eachDayInRange(range.start, range.end),
    [range],
  );

  const activeTracked = useMemo(
    () => trackedProfiles.filter((p) => !p.deleted_at),
    [trackedProfiles],
  );

  const { userAggs, totalDocs, activeUserIds } = useMemo(() => {
    const byUser = new Map<number, UserAgg>();
    const nameByProfileId = new Map(
      trackedProfiles.map((p) => [p.id, { name: p.name, role: p.role }]),
    );
    const docSet = new Set<string>();

    logs.forEach((log) => {
      docSet.add(`${log.table_name}:${log.record_id}`);
      if (!byUser.has(log.user_id)) {
        const known = nameByProfileId.get(log.user_id);
        byUser.set(log.user_id, {
          userId: log.user_id,
          name: known?.name ?? log.user_name,
          role: known?.role ?? viewerRole ?? "",
          total: 0,
          activeDays: new Set(),
          docs: new Set(),
        });
      }
      const agg = byUser.get(log.user_id)!;
      agg.total++;
      agg.activeDays.add(localDayKey(log.created_at));
      agg.docs.add(`${log.table_name}:${log.record_id}`);
    });

    return {
      userAggs: Array.from(byUser.values()).sort((a, b) => b.total - a.total),
      totalDocs: docSet.size,
      activeUserIds: new Set(byUser.keys()),
    };
  }, [logs, trackedProfiles, viewerRole]);

  const idleTracked = useMemo(
    () => activeTracked.filter((p) => !activeUserIds.has(p.id)),
    [activeTracked, activeUserIds],
  );

  const avgPerDay = days.length > 0 ? logs.length / days.length : 0;

  // ── Chart data: top N users by total actions get their own line; the
  // rest are summed into a single dashed "Others" line.
  const { chartData, series } = useMemo(() => {
    const top = userAggs.slice(0, MAX_CHART_SERIES);
    const topIds = new Set(top.map((u) => u.userId));
    const hasOthers = userAggs.length > top.length;

    const perDayPerUser = new Map<string, Map<number, number>>();
    days.forEach((d) => perDayPerUser.set(d, new Map()));

    logs.forEach((log) => {
      const key = localDayKey(log.created_at);
      const dayMap = perDayPerUser.get(key);
      if (!dayMap) return;
      const bucket = topIds.has(log.user_id) ? log.user_id : -1;
      dayMap.set(bucket, (dayMap.get(bucket) || 0) + 1);
    });

    const data = days.map((d) => {
      const dayMap = perDayPerUser.get(d)!;
      const row: Record<string, string | number> = {
        day: dayLabelShort(d),
      };
      top.forEach((u) => {
        row[`u${u.userId}`] = dayMap.get(u.userId) || 0;
      });
      if (hasOthers) {
        row.others = dayMap.get(-1) || 0;
      }
      return row;
    });

    const seriesDefs = top.map((u, i) => ({
      key: `u${u.userId}`,
      name: u.name,
      color: CHART_COLORS[i % CHART_COLORS.length],
      dashed: false,
    }));
    if (hasOthers) {
      seriesDefs.push({
        key: "others",
        name: `Lainnya (${userAggs.length - top.length} user)`,
        color: OTHERS_COLOR,
        dashed: true,
      });
    }

    return { chartData: data, series: seriesDefs };
  }, [logs, days, userAggs]);

  // Avoid an unreadable wall of x-axis labels on a 30-day range.
  const tickInterval = days.length > 14 ? Math.ceil(days.length / 12) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          icon={Activity}
          iconClass="bg-blue-50 text-blue-600"
          label="Total Aksi"
          value={logs.length}
          sub={`${days.length} hari`}
        />
        {seesEveryone && (
          <>
            <StatCard
              icon={Users}
              iconClass="bg-green-50 text-green-600"
              label="User Aktif"
              value={userAggs.length}
              sub={`dari ${activeTracked.length} pegawai terdaftar`}
              onClick={() =>
                setExpandedPanel(expandedPanel === "active" ? null : "active")
              }
              expanded={expandedPanel === "active"}
            />
            <StatCard
              icon={UserX}
              iconClass="bg-red-50 text-red-600"
              label="User Tanpa Aksi"
              value={idleTracked.length}
              sub="pada periode ini"
              onClick={() =>
                setExpandedPanel(expandedPanel === "idle" ? null : "idle")
              }
              expanded={expandedPanel === "idle"}
            />
          </>
        )}
        <StatCard
          icon={FileStack}
          iconClass="bg-purple-50 text-purple-600"
          label="Dokumen Disentuh"
          value={totalDocs}
          sub="dokumen unik"
        />
        <StatCard
          icon={Gauge}
          iconClass="bg-amber-50 text-amber-600"
          label="Rata-rata Aksi/Hari"
          value={avgPerDay.toFixed(1)}
          sub="seluruh sistem"
        />
      </div>

      {expandedPanel === "active" && seesEveryone && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm font-semibold text-gray-700 mb-3">
            User Aktif ({userAggs.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {userAggs.map((u) => (
              <span
                key={u.userId}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-800 border border-green-200"
              >
                {u.name}
                {u.role && (
                  <span className="text-green-600 font-normal">
                    · {u.role}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {expandedPanel === "idle" && seesEveryone && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm font-semibold text-gray-700 mb-3">
            User Tanpa Aksi ({idleTracked.length})
          </div>
          {idleTracked.length === 0 ? (
            <div className="text-sm text-gray-500">
              Semua pegawai terdaftar sudah beraktivitas pada periode ini.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {idleTracked.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-800 border border-red-200"
                >
                  {p.name}
                  <span className="text-red-600 font-normal">
                    · {p.role}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="text-sm font-semibold text-gray-700 mb-4">
          Pergerakan aksi harian per user
        </div>
        {chartData.length === 0 || logs.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-500">
            Tidak ada aktivitas pada periode ini.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ left: 0, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                interval={tickInterval}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#6b7280" }}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.dashed ? "4 3" : undefined}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {seesEveryone && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-700">
              Rekap per user
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">
                      User
                    </th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-700">
                      Aksi
                    </th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-700">
                      Hari Aktif
                    </th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-700">
                      Dokumen
                    </th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-700">
                      Rata-rata/Hari
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {userAggs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-center text-gray-500"
                      >
                        Belum ada aktivitas pada periode ini
                      </td>
                    </tr>
                  ) : (
                    userAggs.map((u) => (
                      <tr key={u.userId} className="hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <div className="font-medium text-gray-900">
                            {u.name}
                          </div>
                          {u.role && (
                            <div className="text-xs text-gray-500">
                              {u.role}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-900">
                          {u.total}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-700">
                          {u.activeDays.size}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-700">
                          {u.docs.size}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-700">
                          {(u.total / days.length).toFixed(1)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-700">
                User tanpa aksi
              </div>
              <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                {idleTracked.length}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Pegawai terdaftar yang tidak tercatat satu aksi pun pada
              periode ini.
            </p>
            {idleTracked.length === 0 ? (
              <div className="text-sm text-gray-500 py-4 text-center">
                Tidak ada.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
                {idleTracked.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700"
                  >
                    {p.role}
                    <span className="text-gray-500 font-normal">
                      {p.name}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
