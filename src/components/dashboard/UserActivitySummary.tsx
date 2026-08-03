import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";

interface RawActivityLog {
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

const RANGE_OPTIONS = [7, 14, 30] as const;

// The shared master account (run directly by the owner, not a tracked
// employee) dominates the counts and isn't useful in a per-user breakdown.
const EXCLUDED_USER_NAMES = ["CGA Barokah Perkasa Group"];

// Groups by local calendar day (not UTC) so "today" lines up with what the
// person viewing the dashboard actually considers today.
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

const dayLabel = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

export default function UserActivitySummary() {
  const { canAccess } = useAuth();
  const allowed = canAccess("activityLogs");

  const [rangeDays, setRangeDays] =
    useState<(typeof RANGE_OPTIONS)[number]>(7);
  const [logs, setLogs] = useState<RawActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }

    const fetchLogs = async () => {
      try {
        setLoading(true);
        setError(null);

        const start = new Date();
        start.setDate(start.getDate() - (rangeDays - 1));
        start.setHours(0, 0, 0, 0);

        const { data, error: fetchError } = await supabase
          .from("activity_logs")
          .select("user_name, action, created_at")
          .gte("created_at", start.toISOString());

        if (fetchError) throw fetchError;
        const rows = (data || []) as RawActivityLog[];
        setLogs(
          rows.filter((row) => !EXCLUDED_USER_NAMES.includes(row.user_name)),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [rangeDays, allowed]);

  const { days, users, maxCell } = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - (rangeDays - 1));
    const dayList: string[] = [];
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      dayList.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
          d.getDate(),
        ).padStart(2, "0")}`,
      );
    }

    const byUser = new Map<string, Map<string, DayCell>>();
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
      .sort((a, b) => b.total - a.total);

    let max = 0;
    userList.forEach((u) =>
      u.days.forEach((c) => {
        if (c.total > max) max = c.total;
      }),
    );

    return { days: dayList, users: userList, maxCell: max };
  }, [logs, rangeDays]);

  if (!allowed) return null;

  return (
    <div className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            User Activity
          </h2>
          <p className="text-sm text-gray-600">
            Create / update / delete actions logged per user, per day
          </p>
        </div>
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg self-start">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setRangeDays(opt)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                rangeDays === opt
                  ? "bg-white text-gray-900 shadow"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {opt}d
            </button>
          ))}
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
