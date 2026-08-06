import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";

interface RawActivityLog {
  user_id: number;
  user_name: string;
  action: "create" | "update" | "delete";
  created_at: string;
}

interface DayCell {
  total: number;
  create: number;
  update: number;
  delete: number;
}

interface UserRow {
  name: string;
  total: number;
  days: Map<string, DayCell>;
}

// The only roles this breakdown tracks — excludes MASTER/MANAGER (see
// comments below) as well as OP_HEAD/ADMIN, which aren't relevant here.
const INCLUDED_ROLES = [
  "PPIC",
  "PRODUCTION",
  "FINANCE",
  "HSSE",
  "ADMIN_SHIPPING",
];

// Monday-start week containing the given date, at local midnight.
const startOfWeek = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const pad = (n: number) => String(n).padStart(2, "0");
const dayKeyOf = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Groups by local calendar day (not UTC) so "today" lines up with what the
// person viewing the dashboard actually considers today.
const dayKey = (iso: string) => dayKeyOf(new Date(iso));

const dayLabel = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

const formatDate = (d: Date, includeYear: boolean) =>
  d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  });

// e.g. "Jul 27 – Aug 2, 2026", or "Dec 29, 2025 – Jan 4, 2026" across a
// year boundary.
const formatRange = (start: Date, end: Date) => {
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${formatDate(start, !sameYear)} – ${formatDate(end, true)}`;
};

// The Monday of the selected week, `offset` weeks back from the current
// week (offset 0 = this week).
const selectedMonday = (offset: number): Date => {
  const monday = startOfWeek(new Date());
  monday.setDate(monday.getDate() - offset * 7);
  return monday;
};

// The 7 day keys (Monday through Sunday) of the selected week.
const buildDays = (offset: number): string[] => {
  const monday = selectedMonday(offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return dayKeyOf(d);
  });
};

// [start, end) bounds covering exactly the selected week.
const fetchDateRange = (offset: number) => {
  const monday = selectedMonday(offset);
  const end = new Date(monday);
  end.setDate(monday.getDate() + 7);
  return { start: monday, end };
};

export default function UserActivitySummary() {
  const { canAccess } = useAuth();
  // Master/Manager see every user's activity here (per the activity_logs RLS
  // policy); everyone else only gets their own row back, same scoping as
  // ActivityLogPage.tsx — but the section itself is no longer hidden from them.
  const seesEveryone = canAccess("activityLogs");

  // Which week is selected, in weeks back from the current week.
  const [offset, setOffset] = useState(0);
  const [logs, setLogs] = useState<RawActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Profile ids in one of INCLUDED_ROLES — this view is scoped to that set
  // of tracked-employee roles, not the owner's master account, manager
  // oversight accounts, or roles like OP_HEAD/ADMIN that aren't relevant
  // here. Only fetched when the viewer can see everyone's logs in the first
  // place (admin_list_all_profiles itself is MASTER/MANAGER-only; for
  // anyone else, activity_logs RLS already limits results to their own row,
  // which is never one of INCLUDED_ROLES's concern to filter further).
  const [includedIds, setIncludedIds] = useState<Set<number>>(new Set());
  // Every active user in INCLUDED_ROLES — seeded as a zero-activity row so
  // someone who did nothing in the selected week still shows up, instead of
  // silently disappearing from the table.
  const [roster, setRoster] = useState<string[]>([]);
  // Gates the logs fetch until the role lookup (if needed) has resolved, so
  // out-of-scope rows never flash in before being filtered out.
  const [rolesReady, setRolesReady] = useState(!seesEveryone);

  useEffect(() => {
    if (!seesEveryone) {
      setRolesReady(true);
      return;
    }
    setRolesReady(false);
    supabase
      .rpc("admin_list_all_profiles")
      .then(({ data, error: rpcError }) => {
        if (!rpcError && data) {
          const profiles = data as {
            id: number;
            name: string;
            role: string;
            deleted_at: string | null;
          }[];
          const included = profiles.filter((p) =>
            INCLUDED_ROLES.includes(p.role),
          );
          setIncludedIds(new Set(included.map((p) => p.id)));
          setRoster(included.filter((p) => !p.deleted_at).map((p) => p.name));
        }
        setRolesReady(true);
      });
  }, [seesEveryone]);

  useEffect(() => {
    if (!rolesReady) return;

    const fetchLogs = async () => {
      try {
        setLoading(true);
        setError(null);

        const { start, end } = fetchDateRange(offset);

        const { data, error: fetchError } = await supabase
          .from("activity_logs")
          .select("user_id, user_name, action, created_at")
          .gte("created_at", start.toISOString())
          .lt("created_at", end.toISOString());

        if (fetchError) throw fetchError;
        const rows = (data || []) as RawActivityLog[];
        // Non-privileged viewers only ever get their own row back from RLS
        // regardless of their role, so the INCLUDED_ROLES filter only
        // applies to the admin ("sees everyone") view.
        setLogs(
          seesEveryone
            ? rows.filter((row) => includedIds.has(row.user_id))
            : rows,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [offset, includedIds, rolesReady, seesEveryone]);

  const { days, users, maxCell } = useMemo(() => {
    const dayList = buildDays(offset);

    const byUser = new Map<string, Map<string, DayCell>>();
    roster.forEach((name) => {
      if (!byUser.has(name)) byUser.set(name, new Map());
    });
    logs.forEach((log) => {
      const key = dayKey(log.created_at);
      if (!byUser.has(log.user_name)) byUser.set(log.user_name, new Map());
      const dayMap = byUser.get(log.user_name)!;
      if (!dayMap.has(key)) {
        dayMap.set(key, { total: 0, create: 0, update: 0, delete: 0 });
      }
      const cell = dayMap.get(key)!;
      cell.total++;
      cell[log.action]++;
    });

    const userList: UserRow[] = Array.from(byUser.entries())
      .map(([name, dayMap]) => ({
        name,
        days: dayMap,
        total: Array.from(dayMap.values()).reduce((s, c) => s + c.total, 0),
      }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    let max = 0;
    userList.forEach((u) =>
      u.days.forEach((c) => {
        if (c.total > max) max = c.total;
      }),
    );

    return { days: dayList, users: userList, maxCell: max };
  }, [logs, offset, roster]);

  const rangeLabel = useMemo(() => {
    const monday = selectedMonday(offset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return formatRange(monday, sunday);
  }, [offset]);

  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            User Activity
          </h2>
          <p className="text-sm text-gray-600">
            {seesEveryone
              ? "Create / update / delete actions logged per user, per day"
              : "Your create / update / delete actions, per day"}
          </p>
        </div>
        <div className="flex items-center gap-1 self-start">
          <button
            onClick={() => setOffset((o) => o + 1)}
            title="Previous week"
            className="p-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600 whitespace-nowrap px-2">
            {rangeLabel}
          </span>
          <button
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={offset === 0}
            title="Next week"
            className="p-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 overflow-x-auto">
        {loading ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            Loading activity...
          </div>
        ) : error ? (
          <div className="text-red-600 text-sm">{error}</div>
        ) : users.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No activity logged in this period.
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="text-left font-medium text-gray-500 pb-2 pr-4 sticky left-0 bg-white">
                  User
                </th>
                {days.map((d) => (
                  <th
                    key={d}
                    className="text-center font-medium text-gray-500 pb-2 px-2 whitespace-nowrap"
                  >
                    {dayLabel(d)}
                  </th>
                ))}
                <th className="text-center font-medium text-gray-500 pb-2 pl-4">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.name} className="border-t border-gray-100">
                  <td className="py-2 pr-4 font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white">
                    {u.name}
                  </td>
                  {days.map((d) => {
                    const cell = u.days.get(d);
                    const count = cell?.total || 0;
                    const intensity = maxCell > 0 ? count / maxCell : 0;
                    return (
                      <td key={d} className="text-center px-2 py-2">
                        {count > 0 ? (
                          <span
                            className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded-md text-xs font-semibold text-blue-900"
                            style={{
                              backgroundColor: `rgba(42, 120, 214, ${
                                0.12 + intensity * 0.55
                              })`,
                            }}
                            title={`Create: ${cell?.create || 0}, Update: ${
                              cell?.update || 0
                            }, Delete: ${cell?.delete || 0}`}
                          >
                            {count}
                          </span>
                        ) : (
                          <span className="text-gray-300">–</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="text-center pl-4 font-semibold text-gray-900">
                    {u.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
