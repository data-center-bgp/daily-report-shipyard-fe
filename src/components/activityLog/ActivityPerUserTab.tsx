import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ActivityLog } from "../../lib/supabase";
import type { TrackedProfile } from "./activityLogTypes";
import {
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
  // The viewer's own role — see ActivityDashboardTab's Props for why this
  // doubles as a role-badge fallback when !seesEveryone.
  viewerRole?: string;
}

interface DayCell {
  total: number;
  create: number;
  update: number;
  delete: number;
}

interface UserRow {
  userId: number;
  name: string;
  role: string;
  total: number;
  days: Map<string, DayCell>;
}

export default function ActivityPerUserTab({
  logs,
  range,
  seesEveryone,
  trackedProfiles,
  viewerRole,
}: Props) {
  const [search, setSearch] = useState("");

  const days = useMemo(
    () => eachDayInRange(range.start, range.end),
    [range],
  );

  const activeTracked = useMemo(
    () => trackedProfiles.filter((p) => !p.deleted_at),
    [trackedProfiles],
  );

  const { users, maxCell } = useMemo(() => {
    const nameByProfileId = new Map(
      trackedProfiles.map((p) => [p.id, { name: p.name, role: p.role }]),
    );
    const byUser = new Map<number, UserRow>();

    // Seed every currently-active tracked employee as a zero-activity row
    // so someone with nothing logged this period still shows up, instead
    // of silently disappearing from the grid.
    if (seesEveryone) {
      activeTracked.forEach((p) => {
        byUser.set(p.id, {
          userId: p.id,
          name: p.name,
          role: p.role,
          total: 0,
          days: new Map(),
        });
      });
    }

    logs.forEach((log) => {
      if (!byUser.has(log.user_id)) {
        const known = nameByProfileId.get(log.user_id);
        byUser.set(log.user_id, {
          userId: log.user_id,
          name: known?.name ?? log.user_name,
          role: known?.role ?? viewerRole ?? "",
          total: 0,
          days: new Map(),
        });
      }
      const row = byUser.get(log.user_id)!;
      const key = localDayKey(log.created_at);
      if (!row.days.has(key)) {
        row.days.set(key, { total: 0, create: 0, update: 0, delete: 0 });
      }
      const cell = row.days.get(key)!;
      cell.total++;
      cell[log.action]++;
      row.total++;
    });

    let max = 0;
    byUser.forEach((row) =>
      row.days.forEach((c) => {
        if (c.total > max) max = c.total;
      }),
    );

    const list = Array.from(byUser.values()).sort(
      (a, b) => b.total - a.total || a.name.localeCompare(b.name),
    );

    return { users: list, maxCell: max };
  }, [logs, activeTracked, trackedProfiles, seesEveryone, viewerRole]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.trim().toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q),
    );
  }, [users, search]);

  return (
    <div className="space-y-4">
      {seesEveryone && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama user..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        {filteredUsers.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-500">
            Tidak ada aktivitas pada periode ini.
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left font-semibold text-gray-700 py-2 px-4 sticky left-0 bg-white">
                  User
                </th>
                {days.map((d) => (
                  <th
                    key={d}
                    className="text-center font-medium text-gray-500 py-2 px-2 whitespace-nowrap"
                  >
                    {dayLabelShort(d)}
                  </th>
                ))}
                <th className="text-center font-semibold text-gray-700 py-2 px-4">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr
                  key={u.userId}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="py-2 px-4 sticky left-0 bg-white">
                    <div className="font-medium text-gray-900 whitespace-nowrap">
                      {u.name}
                    </div>
                    {u.role && (
                      <div className="text-xs text-gray-500">{u.role}</div>
                    )}
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
                  <td className="text-center px-4 font-semibold text-gray-900">
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
