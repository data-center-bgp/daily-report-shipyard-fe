import type { BASTPWithDetails } from "../types/bastp.types";

// Shared by the printed BASTP (BASTPPrint) and its Excel export, so both
// documents always show the same items in the same order.

// Same fixed display order as WorkOrderPrint's CATEGORY_ORDER — anything not
// listed still shows up, just appended after these in alphabetical order.
export const CATEGORY_ORDER = [
  "Docking/Undocking",
  "Blasting/Painting",
  "Steelwork",
  "Piping",
  "Carpentry/Interior",
  "Electrical",
  "Hydraulic",
  "Inspection",
  "IT",
  "Mechanical",
  "Propulsion",
  "Cleaning",
];

export function calcDays(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const diff =
    Math.ceil(
      (new Date(end).getTime() - new Date(start).getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1;
  return diff > 0 ? diff : 0;
}

export function formatBastpDate(dateString: string | null | undefined) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function getBastpDocument(bastp: BASTPWithDetails) {
  const activeItems = (bastp.bastp_work_details || [])
    .map((bwd) => bwd.work_details)
    .filter((wd): wd is NonNullable<typeof wd> => !!wd && !wd.cancelled_at);

  // The BASTP number itself doubles as "No. Handover"; the plain "No."
  // field on the paper form is just its leading sequence number.
  const noDisplay = bastp.number?.split("/")[0] || bastp.number || "-";

  // A BASTP can technically span multiple work orders, but in practice
  // shares one — use whichever the first item points to, same convention
  // WorkOrderPrint uses for its own single-work-order fields.
  const firstWorkOrder = activeItems.find((item) => item.work_order)
    ?.work_order;

  const hasDockingDates = !!(
    bastp.tanggal_sandar ||
    bastp.tanggal_naik_docking ||
    bastp.tanggal_turun_docking ||
    bastp.tanggal_tambat_setelah_turun_dock
  );

  const scopeNames = Array.from(
    new Set(
      activeItems
        .map((item) => item.work_scope?.work_scope)
        .filter((name): name is string => !!name),
    ),
  );
  const orderedScopeNames = [
    ...CATEGORY_ORDER.filter((name) => scopeNames.includes(name)),
    ...scopeNames
      .filter((name) => !CATEGORY_ORDER.includes(name))
      .sort((a, b) => a.localeCompare(b)),
  ];
  const categories = orderedScopeNames.map((scopeName) => ({
    scopeName,
    items: activeItems.filter(
      (item) => item.work_scope?.work_scope === scopeName,
    ),
  }));
  // Items with no work_scope at all still need to appear somewhere.
  const uncategorized = activeItems.filter((item) => !item.work_scope);
  if (uncategorized.length > 0) {
    categories.push({ scopeName: "Lainnya", items: uncategorized });
  }

  return { noDisplay, firstWorkOrder, hasDockingDates, categories };
}
