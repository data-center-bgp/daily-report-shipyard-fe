import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { ActivityLog } from "../../lib/supabase";
import type { TrackedProfile } from "./activityLogTypes";
import {
  eachDayInRange,
  dayLabelLong,
  localDayKey,
  tableLabel,
  tableShortCode,
  TABLE_LABELS,
  type PeriodRange,
} from "./activityLogShared";

interface Props {
  logs: ActivityLog[];
  range: PeriodRange;
  seesEveryone: boolean;
  trackedProfiles: TrackedProfile[];
  // The viewer's own role — see ActivityDashboardTab's Props for why this
  // doubles as a role-badge fallback when !seesEveryone.
  viewerRole?: string;
}

interface UserDayGroup {
  userId: number;
  userName: string;
  role: string;
  logs: ActivityLog[];
  byTable: Map<string, number>;
  docs: Set<string>;
  items: number;
  firstAt: string;
  lastAt: string;
}

interface DayGroup {
  dayKey: string;
  users: UserDayGroup[];
  totalActions: number;
}

const actionBadgeColor = (action: string) => {
  switch (action) {
    case "create":
      return "bg-green-100 text-green-800";
    case "update":
      return "bg-blue-100 text-blue-800";
    case "delete":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

const describeLog = (log: ActivityLog): string => {
  if (log.description) return log.description;
  const table = tableLabel(log.table_name);
  switch (log.action) {
    case "create":
      return `Created new ${table} (ID: ${log.record_id})`;
    case "update":
      return `Updated ${table} (ID: ${log.record_id})`;
    case "delete":
      return `Deleted ${table} (ID: ${log.record_id})`;
    default:
      return `${log.action} on ${table} (ID: ${log.record_id})`;
  }
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

export default function ActivityRincianTab({
  logs,
  range,
  seesEveryone,
  trackedProfiles,
  viewerRole,
}: Props) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const tablesPresent = useMemo(() => {
    const set = new Set(logs.map((l) => l.table_name));
    return Array.from(set).sort((a, b) =>
      tableLabel(a).localeCompare(tableLabel(b)),
    );
  }, [logs]);

  const activeTracked = useMemo(
    () => trackedProfiles.filter((p) => !p.deleted_at),
    [trackedProfiles],
  );

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (actionFilter && log.action !== actionFilter) return false;
      if (tableFilter && log.table_name !== tableFilter) return false;
      if (q && !log.user_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [logs, actionFilter, tableFilter, search]);

  const dayGroups = useMemo(() => {
    const days = eachDayInRange(range.start, range.end);
    const byDay = new Map<string, Map<number, UserDayGroup>>();
    days.forEach((d) => byDay.set(d, new Map()));

    filteredLogs.forEach((log) => {
      const dKey = localDayKey(log.created_at);
      if (!byDay.has(dKey)) byDay.set(dKey, new Map());
      const usersMap = byDay.get(dKey)!;
      if (!usersMap.has(log.user_id)) {
        usersMap.set(log.user_id, {
          userId: log.user_id,
          userName: log.user_name,
          role: "",
          logs: [],
          byTable: new Map(),
          docs: new Set(),
          items: 0,
          firstAt: log.created_at,
          lastAt: log.created_at,
        });
      }
      const group = usersMap.get(log.user_id)!;
      group.logs.push(log);
      group.byTable.set(
        log.table_name,
        (group.byTable.get(log.table_name) || 0) + 1,
      );
      group.docs.add(`${log.table_name}:${log.record_id}`);
      group.items += log.changes ? Object.keys(log.changes).length || 1 : 1;
      if (log.created_at < group.firstAt) group.firstAt = log.created_at;
      if (log.created_at > group.lastAt) group.lastAt = log.created_at;
    });

    const roleById = new Map(trackedProfiles.map((p) => [p.id, p.role]));

    const result: DayGroup[] = [];
    byDay.forEach((usersMap, dKey) => {
      if (usersMap.size === 0) return;
      const users = Array.from(usersMap.values())
        .map((g) => ({
          ...g,
          role: roleById.get(g.userId) ?? g.role ?? viewerRole ?? "",
        }))
        .sort((a, b) => b.logs.length - a.logs.length);
      const totalActions = users.reduce((s, u) => s + u.logs.length, 0);
      result.push({ dayKey: dKey, users, totalActions });
    });

    return result.sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
  }, [filteredLogs, range, trackedProfiles, viewerRole]);

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama user..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
          </select>
          <select
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Tables</option>
            {tablesPresent.map((t) => (
              <option key={t} value={t}>
                {TABLE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {dayGroups.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 text-center py-12 text-sm text-gray-500">
          No activity found for this period.
        </div>
      ) : (
        dayGroups.map((day) => {
          const idleCount = seesEveryone
            ? activeTracked.filter(
                (p) => !day.users.some((u) => u.userId === p.id),
              ).length
            : 0;
          return (
            <div
              key={day.dayKey}
              className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
            >
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div className="font-semibold text-gray-900 text-sm">
                  {dayLabelLong(day.dayKey)}
                </div>
                <div className="text-xs text-gray-500">
                  {day.users.length} user aktif · {day.totalActions} aksi
                  {seesEveryone && ` · ${idleCount} tanpa aksi`}
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {day.users.map((u) => {
                  const key = `${day.dayKey}-${u.userId}`;
                  const expanded = expandedKeys.has(key);
                  return (
                    <div key={key} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div className="min-w-[10rem]">
                          <div className="font-medium text-gray-900 text-sm">
                            {u.userName}
                          </div>
                          <div className="text-xs text-gray-500">
                            {u.role && `${u.role} · `}
                            {formatTime(u.firstAt)}
                            {u.firstAt !== u.lastAt &&
                              ` – ${formatTime(u.lastAt)}`}
                          </div>
                        </div>
                        <div className="font-semibold text-gray-900 text-sm">
                          {u.logs.length}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Array.from(u.byTable.entries()).map(
                            ([t, count]) => (
                              <span
                                key={t}
                                title={tableLabel(t)}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700"
                              >
                                {tableShortCode(t)} {count}
                              </span>
                            ),
                          )}
                        </div>
                        <div className="text-xs text-gray-500 ml-auto">
                          {u.docs.size} dok · {u.items} item
                        </div>
                        <button
                          onClick={() => toggleExpand(key)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                        >
                          Rincian
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform ${
                              expanded ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                      </div>

                      {expanded && (
                        <div className="mt-3 pl-2 border-l-2 border-gray-100 space-y-2">
                          {u.logs
                            .slice()
                            .sort((a, b) =>
                              a.created_at < b.created_at ? 1 : -1,
                            )
                            .map((log) => (
                              <div
                                key={log.id}
                                className="text-xs flex items-start gap-2"
                              >
                                <span className="text-gray-400 whitespace-nowrap">
                                  {formatTime(log.created_at)}
                                </span>
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${actionBadgeColor(
                                    log.action,
                                  )}`}
                                >
                                  {log.action.toUpperCase()}
                                </span>
                                <span className="text-gray-700">
                                  {describeLog(log)}
                                </span>
                                {log.changes &&
                                  Object.keys(log.changes).length > 0 && (
                                    <details className="ml-1">
                                      <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                                        {Object.keys(log.changes).length}{" "}
                                        changes
                                      </summary>
                                      <div className="mt-1 space-y-0.5">
                                        {Object.entries(log.changes).map(
                                          ([field, value]) => (
                                            <div
                                              key={field}
                                              className="text-gray-600"
                                            >
                                              <span className="font-medium">
                                                {field}:
                                              </span>{" "}
                                              <span className="text-red-600">
                                                {JSON.stringify(value.old)}
                                              </span>{" "}
                                              →{" "}
                                              <span className="text-green-600">
                                                {JSON.stringify(value.new)}
                                              </span>
                                            </div>
                                          ),
                                        )}
                                      </div>
                                    </details>
                                  )}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
