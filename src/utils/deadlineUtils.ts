export interface DateRange {
  start: string | null;
  end: string | null;
}

interface WorkDetailDates {
  planned_start_date?: string | null;
  target_close_date?: string | null;
}

// Earliest planned_start_date and latest target_close_date across a set of
// work details. ISO date strings (YYYY-MM-DD) sort correctly as plain strings.
export function computeDateRange(workDetails: WorkDetailDates[]): DateRange {
  let start: string | null = null;
  let end: string | null = null;

  for (const wd of workDetails) {
    if (wd.planned_start_date && (!start || wd.planned_start_date < start)) {
      start = wd.planned_start_date;
    }
    if (wd.target_close_date && (!end || wd.target_close_date > end)) {
      end = wd.target_close_date;
    }
  }

  return { start, end };
}

export function formatDateRange(range: DateRange): string {
  if (!range.start && !range.end) return "Not yet set";
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  if (range.start && range.end) return `${fmt(range.start)} — ${fmt(range.end)}`;
  return fmt((range.start || range.end) as string);
}

// True when an additional work order's own deadline runs later than the
// project's deadline (which is computed from original work orders only).
export function exceedsDeadline(
  woRange: DateRange,
  projectRange: DateRange,
): boolean {
  if (!woRange.end || !projectRange.end) return false;
  return woRange.end > projectRange.end;
}
