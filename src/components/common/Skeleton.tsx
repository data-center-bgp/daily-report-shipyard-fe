/**
 * Skeleton placeholders for data-heavy pages (lists, tables, dashboards):
 * they hold the page's real shape while its first query runs, so the
 * content swaps in without the layout jumping. Forms and detail pages keep
 * the branded LoadingState instead — a skeleton adds little there.
 */

/** One shimmering placeholder block; size/shape it with Tailwind classes. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} />;
}

// Cycled per row/column so a table skeleton reads like real, uneven text
// rather than a grid of identical bars.
const CELL_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-5/6", "w-2/5", "w-3/5"];

// Literal class names (not built strings) so Tailwind picks them up.
// Two per row on phones, matching the real pages; a lone last card spans.
const STAT_GRID: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 md:grid-cols-3 [&>*:last-child:nth-child(odd)]:col-span-2 md:[&>*:last-child:nth-child(odd)]:col-span-1",
  4: "grid-cols-2 md:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-5 [&>*:last-child:nth-child(odd)]:col-span-2 md:[&>*:last-child:nth-child(odd)]:col-span-1",
};

function SrLabel({ label }: { label: string }) {
  return <span className="sr-only">{label}</span>;
}

function StatCards({ count, size }: { count: number; size: "sm" | "lg" }) {
  return (
    <div className={`grid ${STAT_GRID[count] ?? "grid-cols-2 md:grid-cols-4"} gap-3 sm:gap-4`}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`bg-white rounded-lg shadow border-l-4 border-gray-200 ${
            size === "lg" ? "p-3 sm:p-6 flex items-center justify-between" : "p-3 sm:p-4"
          }`}
        >
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className={size === "lg" ? "h-7 w-14" : "h-6 w-10"} />
          </div>
          {size === "lg" && <Skeleton className="h-8 w-8 rounded-full" />}
        </div>
      ))}
    </div>
  );
}

function Tabs({ count, boxed }: { count: number; boxed?: boolean }) {
  return (
    <div className={`flex gap-6 overflow-hidden border-b border-gray-200 ${boxed ? "px-4 sm:px-6" : ""}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="pb-3 pt-3">
          <Skeleton className={`h-4 ${i % 2 ? "w-28" : "w-36"}`} />
        </div>
      ))}
    </div>
  );
}

function TableRows({ rows, columns }: { rows: number; columns: number }) {
  return (
    <div className="overflow-hidden">
      <div className="flex gap-4 bg-gray-50 px-4 sm:px-6 py-3 border-b border-gray-200">
        {Array.from({ length: columns }, (_, c) => (
          <div key={c} className={`flex-1 ${c >= 3 ? "hidden sm:block" : ""}`}>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 sm:px-6 py-4">
            {Array.from({ length: columns }, (_, c) => (
              <div key={c} className={`flex-1 ${c >= 3 ? "hidden sm:block" : ""}`}>
                <Skeleton
                  className={`h-4 ${CELL_WIDTHS[(r + c * 2) % CELL_WIDTHS.length]}`}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CardRows({ rows }: { rows: number }) {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="p-6 flex items-start justify-between gap-6">
          <div className="flex-1 space-y-3">
            <Skeleton className={`h-5 ${r % 2 ? "w-1/3" : "w-2/5"}`} />
            <Skeleton className={`h-3 ${CELL_WIDTHS[r % CELL_WIDTHS.length]}`} />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function FilterBar() {
  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-gray-200">
      <Skeleton className="h-10 w-full sm:w-80 rounded-lg" />
      <Skeleton className="h-10 w-32 rounded-lg" />
      <Skeleton className="h-10 w-32 rounded-lg" />
    </div>
  );
}

function GridCards({ rows }: { rows: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className={`h-5 ${i % 2 ? "w-1/2" : "w-3/5"}`} />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

interface PageSkeletonProps {
  /** Read to screen readers in place of the old "Loading ..." text. */
  label: string;
  /** Match the page's own outer padding so nothing shifts on swap. */
  padding?: "p-4 sm:p-6" | "p-4 sm:p-6 lg:p-8" | "none";
  /** Title row; turn off when the page heading is already rendered (tabs). */
  header?: boolean;
  /** Show a primary button placeholder at the right of the title row. */
  action?: boolean;
  /** Number of stat cards under the header; "lg" = the tall icon cards. */
  stats?: number;
  statSize?: "sm" | "lg";
  /** Page-level tabs rendered above the stat cards (e.g. BASTP). */
  pageTabs?: number;
  /** Tabs along the top edge of the main list card (e.g. Invoices). */
  tabs?: number;
  /** Search / filter bar at the top of the list card. */
  filters?: boolean;
  /**
   * "table" = column rows; "cards" = stacked request/form cards inside one
   * panel; "grid" = separate tiles in a 1/2/3-column grid (e.g. Projects).
   */
  list?: "table" | "cards" | "grid";
  rows?: number;
  columns?: number;
}

/** Whole-page skeleton: title row, optional stats/tabs/filters, then the list. */
export function PageSkeleton({
  label,
  padding = "p-4 sm:p-6 lg:p-8",
  header = true,
  action = false,
  stats = 0,
  statSize = "sm",
  pageTabs = 0,
  tabs = 0,
  filters = false,
  list = "table",
  rows = 8,
  columns = 6,
}: PageSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={`${padding === "none" ? "" : padding} space-y-6`}
    >
      <SrLabel label={label} />
      {header && (
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          {action && <Skeleton className="h-11 w-36 rounded-lg shrink-0" />}
        </div>
      )}

      {pageTabs > 0 && <Tabs count={pageTabs} />}
      {stats > 0 && <StatCards count={stats} size={statSize} />}

      {list === "grid" ? (
        <>
          {filters && (
            <div className="bg-white rounded-lg shadow">
              <FilterBar />
            </div>
          )}
          <GridCards rows={rows} />
        </>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {tabs > 0 && <Tabs count={tabs} boxed />}
          {filters && <FilterBar />}
          {list === "table" ? (
            <TableRows rows={rows} columns={columns} />
          ) : (
            <CardRows rows={rows} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A table card on its own, for lists embedded under a page header or inside
 * a tab (the page around it is already rendered).
 */
export function TableSkeleton({
  label,
  rows = 8,
  columns = 6,
  toolbar = false,
}: {
  label: string;
  rows?: number;
  columns?: number;
  /** Button row above the table (e.g. Work Details' export/add actions). */
  toolbar?: boolean;
}) {
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <SrLabel label={label} />
      {toolbar && (
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-6 w-48" />
          <div className="flex gap-3">
            <Skeleton className="h-10 w-28 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>
      )}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <TableRows rows={rows} columns={columns} />
      </div>
    </div>
  );
}

/** Mirrors Dashboard: header, stat sections, filter bar, chart panels. */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-busy="true" className="p-8 space-y-8">
      <SrLabel label="Loading dashboard..." />
      <div className="space-y-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <StatCards count={3} size="lg" />
      </div>
      <div className="bg-white rounded-lg shadow p-4 flex flex-wrap items-center gap-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-9 w-40 rounded-lg" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-6 w-52" />
        <StatCards count={3} size="lg" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="bg-white rounded-lg shadow p-6 space-y-4">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
