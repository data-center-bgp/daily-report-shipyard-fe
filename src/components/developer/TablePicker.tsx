import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { SENSITIVE_TABLES } from "./apiDocsContent";

export default function TablePicker({
  available,
  selected,
  onChange,
}: {
  available: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const chosen = useMemo(() => new Set(selected), [selected]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? available.filter((t) => t.toLowerCase().includes(q)) : available;
  }, [available, query]);

  const toggle = (table: string) => {
    const next = new Set(chosen);
    if (next.has(table)) next.delete(table);
    else next.add(table);
    onChange(available.filter((t) => next.has(t)));
  };

  const withoutSensitive = available.filter((t) => !SENSITIVE_TABLES.includes(t));

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tables…"
            aria-label="Search tables"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={() => onChange(available)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          Clear
        </button>
      </div>

      <button
        type="button"
        onClick={() => onChange(withoutSensitive)}
        className="mt-2 text-xs font-semibold text-blue-700 hover:underline"
      >
        Everything except staff and activity data ({SENSITIVE_TABLES.join(", ")})
      </button>

      <div className="mt-3 grid max-h-64 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
        {visible.map((table) => (
          <label
            key={table}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
              chosen.has(table) ? "border-blue-300 bg-blue-50 text-blue-900" : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            <input
              type="checkbox"
              checked={chosen.has(table)}
              onChange={() => toggle(table)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="min-w-0 break-all font-mono text-[12.5px]">{table}</span>
            {SENSITIVE_TABLES.includes(table) && (
              <span className="ml-auto shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                sensitive
              </span>
            )}
          </label>
        ))}
        {visible.length === 0 && <p className="py-2 text-sm text-gray-500">No tables match.</p>}
      </div>

      <p className="mt-2 text-xs text-gray-500">
        {selected.length} of {available.length} tables selected
      </p>
    </div>
  );
}
