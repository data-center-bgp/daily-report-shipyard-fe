// Shared constants/utilities for the Activity Log page (Dashboard / Per User
// / Rincian tabs) and the smaller UserActivitySummary dashboard widget.

// Roles this feature tracks as "employees" for the User Aktif / User Tanpa
// Aksi counts, the Per User grid rows, and the Dashboard recap table.
// Deliberately excludes MASTER/MANAGER (oversight/admin accounts, not
// day-to-day data entry) and OP_HEAD/ADMIN, matching the roster
// UserActivitySummary already tracked before this feature existed.
export const TRACKED_ROLES = [
  "PPIC",
  "PRODUCTION",
  "FINANCE",
  "HSSE",
  "ADMIN_SHIPPING",
];

export const TABLE_LABELS: Record<string, string> = {
  work_order: "Work Order",
  work_details: "Work Details",
  work_progress: "Work Progress",
  work_verification: "Work Verification",
  material_control: "Material Control",
  material_lists: "Material List",
  bastp: "BASTP",
  bastp_work_details: "BASTP Work Details",
  invoice_details: "Invoice",
  profiles: "User Profile",
  projects: "Project",
  additional_wo_requests: "Additional WO Request",
  vessel_readiness_forms: "Readiness Form",
};

export const TABLE_SHORT_CODES: Record<string, string> = {
  work_order: "WO",
  work_details: "WD",
  work_progress: "WP",
  work_verification: "VER",
  material_control: "MAT",
  material_lists: "MTL",
  bastp: "BSTP",
  bastp_work_details: "BWD",
  invoice_details: "INV",
  profiles: "USR",
  projects: "PRJ",
  additional_wo_requests: "AWO",
  vessel_readiness_forms: "RDN",
};

export function tableLabel(tableName: string): string {
  return TABLE_LABELS[tableName] ?? tableName;
}

export function tableShortCode(tableName: string): string {
  return TABLE_SHORT_CODES[tableName] ?? tableName.slice(0, 4).toUpperCase();
}

// ── Date helpers ───────────────────────────────────────────────────────────
// All grouping is by LOCAL calendar day (not UTC), so "today" lines up with
// what the person viewing the page actually considers today — same
// convention UserActivitySummary already used.

const pad = (n: number) => String(n).padStart(2, "0");

export const dayKeyOf = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const localDayKey = (iso: string) => dayKeyOf(new Date(iso));

export const keyToDate = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const dayLabelShort = (key: string) =>
  keyToDate(key).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

export const dayLabelWeekday = (key: string) =>
  keyToDate(key).toLocaleDateString("en-US", { weekday: "long" });

export const dayLabelLong = (key: string) =>
  keyToDate(key).toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const formatDate = (d: Date, includeYear: boolean) =>
  d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  });

// e.g. "Sep 1 – Sep 30, 2026", or "Dec 29, 2025 – Jan 4, 2026" across a year
// boundary.
export function formatRangeLabel(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${formatDate(start, !sameYear)} – ${formatDate(end, true)}`;
}

// Inclusive list of local-day keys from `start` through `end` (both dates,
// not datetimes at local midnight).
export function eachDayInRange(start: Date, end: Date): string[] {
  const days: string[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cur.getTime() <= last.getTime()) {
    days.push(dayKeyOf(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// ── Period presets ──────────────────────────────────────────────────────────

export type PeriodPreset = "7d" | "14d" | "30d" | "month" | "custom";

export interface PeriodRange {
  // Local midnight of the first included day.
  start: Date;
  // Local midnight of the last included day (inclusive) — callers querying
  // Supabase should push this to end-of-day themselves.
  end: Date;
  label: string;
}

const PRESET_DAYS: Record<"7d" | "14d" | "30d", number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
};

// `offset` shifts the window back by `offset` full periods (0 = the period
// ending today / the current calendar month). Used by the "<" / ">" nav
// arrows next to the period label.
export function computePeriodRange(
  preset: PeriodPreset,
  offset: number,
  customStart?: string,
  customEnd?: string,
): PeriodRange {
  if (preset === "custom") {
    // Falls back to a single-day "today" range if custom dates aren't set
    // yet (e.g. the picker was opened but not applied) — callers should
    // avoid selecting "custom" until both dates are chosen, but this keeps
    // the function total rather than throwing.
    const start = customStart ? keyToDate(customStart) : new Date();
    const end = customEnd ? keyToDate(customEnd) : new Date();
    return { start, end, label: formatRangeLabel(start, end) };
  }

  if (preset === "month") {
    const today = new Date();
    const monthIndex = today.getMonth() - offset;
    const start = new Date(today.getFullYear(), monthIndex, 1);
    const end = new Date(today.getFullYear(), monthIndex + 1, 0);
    return { start, end, label: formatRangeLabel(start, end) };
  }

  const days = PRESET_DAYS[preset];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() - offset * days);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { start, end, label: formatRangeLabel(start, end) };
}

// [startISO, endISO] bounds suitable for Supabase gte/lte against a
// timestamptz column — end is pushed to 23:59:59.999 of the last day so the
// whole final day is included.
export function periodQueryBounds(range: PeriodRange) {
  const end = new Date(range.end);
  end.setHours(23, 59, 59, 999);
  return { startISO: range.start.toISOString(), endISO: end.toISOString() };
}

// ── Chart colors ─────────────────────────────────────────────────────────

export const CHART_COLORS = [
  "#2563eb", // blue-600
  "#7c3aed", // violet-600
  "#d97706", // amber-600
  "#16a34a", // green-600
  "#db2777", // pink-600
  "#0891b2", // cyan-600
  "#dc2626", // red-600
  "#4f46e5", // indigo-600
];
export const OTHERS_COLOR = "#9ca3af"; // gray-400, dashed "Lainnya" line

export const MAX_CHART_SERIES = CHART_COLORS.length;
