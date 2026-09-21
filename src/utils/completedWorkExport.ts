import ExcelJS from "exceljs";

// Structural subset of CompletedWorkDetails.tsx's own row shape — kept
// separate (not imported from the component) so this util stays a plain
// data-in, file-out function with no component dependency.
export interface CompletedWorkDetailExportRow {
  description: string;
  quantity: number;
  uom: string;
  vesselName: string;
  vesselCompany: string;
  shipyardWoNumber: string | null;
  customerWoNumber: string | null;
  completedOn: string | null;
  inBastp: boolean;
  bastpNumber: string | null;
}

type GroupStatus = "Fully in BASTP" | "Partially in BASTP" | "Not in BASTP";

function statusFor(items: { inBastp: boolean }[]): GroupStatus {
  const inCount = items.filter((i) => i.inBastp).length;
  if (inCount === 0) return "Not in BASTP";
  if (inCount === items.length) return "Fully in BASTP";
  return "Partially in BASTP";
}

const STATUS_COLORS: Record<GroupStatus, { fill: string; font: string }> = {
  "Fully in BASTP": { fill: "FFDCFCE7", font: "FF166534" }, // green-100 / green-800
  "Partially in BASTP": { fill: "FFFEF3C7", font: "FF92400E" }, // amber-100 / amber-800
  "Not in BASTP": { fill: "FFFEE2E2", font: "FF991B1B" }, // red-100 / red-800
};

function styleHeaderRow(ws: ExcelJS.Worksheet, row = 1) {
  const headerRow = ws.getRow(row);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1D4ED8" }, // blue-700
  };
  headerRow.alignment = { vertical: "middle" };
}

function styleStatusCell(cell: ExcelJS.Cell, status: GroupStatus) {
  cell.value = status;
  const colors = STATUS_COLORS[status];
  cell.font = { bold: true, color: { argb: colors.font } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.fill } };
}

interface WoGroup {
  vessel: string;
  shipyardWo: string;
  customerWo: string;
  items: CompletedWorkDetailExportRow[];
}

interface VesselGroup {
  vessel: string;
  company: string;
  items: CompletedWorkDetailExportRow[];
}

function groupByWorkOrder(
  rows: CompletedWorkDetailExportRow[],
): WoGroup[] {
  const groups = new Map<string, WoGroup>();
  rows.forEach((r) => {
    // Two work_order rows (e.g. an original + an "additional WO") can share
    // the same shipyard WO number — grouped together here on purpose, since
    // that's the single human-facing WO number this summary is meant to
    // answer "is it done in BASTP" for.
    const woLabel = r.shipyardWoNumber || r.customerWoNumber || "(no WO number)";
    const key = `${r.vesselName}::${woLabel}`;
    if (!groups.has(key)) {
      groups.set(key, {
        vessel: r.vesselName,
        shipyardWo: r.shipyardWoNumber ?? "-",
        customerWo: r.customerWoNumber ?? "-",
        items: [],
      });
    }
    groups.get(key)!.items.push(r);
  });
  return Array.from(groups.values()).sort(
    (a, b) =>
      a.vessel.localeCompare(b.vessel) || a.shipyardWo.localeCompare(b.shipyardWo),
  );
}

function groupByVessel(rows: CompletedWorkDetailExportRow[]): VesselGroup[] {
  const groups = new Map<string, VesselGroup>();
  rows.forEach((r) => {
    if (!groups.has(r.vesselName)) {
      groups.set(r.vesselName, {
        vessel: r.vesselName,
        company: r.vesselCompany,
        items: [],
      });
    }
    groups.get(r.vesselName)!.items.push(r);
  });
  return Array.from(groups.values()).sort((a, b) =>
    a.vessel.localeCompare(b.vessel),
  );
}

// filterSummary is a human-readable line describing whichever filters were
// active on the page when this was generated (e.g. "Vessel: MT GAS
// GEMILANG | Status: Not in BASTP"), or "No filters applied" — noted at the
// top of the Detail sheet so this doesn't get mistaken for the full dataset
// once it's shared around.
export async function buildCompletedWorkDetailsWorkbook(
  rows: CompletedWorkDetailExportRow[],
  filterSummary: string,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Daily Report Shipyard";
  wb.created = new Date();

  // ── Detail sheet ──────────────────────────────────────────────────────
  const detailSheet = wb.addWorksheet("Detail");
  detailSheet.columns = [
    { header: "Work Detail", key: "description", width: 45 },
    { header: "Qty", key: "quantity", width: 8 },
    { header: "UOM", key: "uom", width: 8 },
    { header: "Vessel", key: "vesselName", width: 22 },
    { header: "Company", key: "vesselCompany", width: 26 },
    { header: "Shipyard WO", key: "shipyardWoNumber", width: 24 },
    { header: "Customer WO", key: "customerWoNumber", width: 24 },
    { header: "Completed On", key: "completedOn", width: 14 },
    { header: "BASTP Status", key: "bastpStatusLabel", width: 16 },
    { header: "BASTP Number", key: "bastpNumber", width: 24 },
  ];
  // .columns above writes headers to row 1 — insert a blank row above it for
  // a filter-summary note, so this export can't be mistaken for the full
  // dataset once it's shared around.
  detailSheet.spliceRows(1, 0, []);
  detailSheet.getCell("A1").value =
    `Exported ${new Date().toLocaleString("en-US")} — ${filterSummary}`;
  detailSheet.getCell("A1").font = { italic: true, color: { argb: "FF6B7280" } };
  detailSheet.mergeCells("A1:J1");
  styleHeaderRow(detailSheet, 2);

  rows.forEach((r) => {
    const wsRow = detailSheet.addRow({
      description: r.description,
      quantity: r.quantity,
      uom: r.uom,
      vesselName: r.vesselName,
      vesselCompany: r.vesselCompany,
      shipyardWoNumber: r.shipyardWoNumber ?? "-",
      customerWoNumber: r.customerWoNumber ?? "-",
      completedOn: r.completedOn ?? "-",
      bastpStatusLabel: r.inBastp ? "In BASTP" : "Not in BASTP",
      bastpNumber: r.bastpNumber ?? "-",
    });
    const statusCell = wsRow.getCell("bastpStatusLabel");
    const colors = r.inBastp
      ? STATUS_COLORS["Fully in BASTP"]
      : STATUS_COLORS["Not in BASTP"];
    statusCell.font = { bold: true, color: { argb: colors.font } };
    statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.fill } };
  });
  detailSheet.autoFilter = { from: "A2", to: "J2" };
  detailSheet.views = [{ state: "frozen", ySplit: 2 }];

  // ── Summary by Work Order ────────────────────────────────────────────
  const woSheet = wb.addWorksheet("Summary by Work Order");
  woSheet.columns = [
    { header: "Vessel", key: "vessel", width: 22 },
    { header: "Shipyard WO", key: "shipyardWo", width: 24 },
    { header: "Customer WO", key: "customerWo", width: 24 },
    { header: "Completed Items", key: "total", width: 16 },
    { header: "In BASTP", key: "inCount", width: 12 },
    { header: "Not in BASTP", key: "notInCount", width: 14 },
    { header: "Status", key: "status", width: 20 },
  ];
  styleHeaderRow(woSheet);
  groupByWorkOrder(rows).forEach((g) => {
    const inCount = g.items.filter((i) => i.inBastp).length;
    const wsRow = woSheet.addRow({
      vessel: g.vessel,
      shipyardWo: g.shipyardWo,
      customerWo: g.customerWo,
      total: g.items.length,
      inCount,
      notInCount: g.items.length - inCount,
    });
    styleStatusCell(wsRow.getCell("status"), statusFor(g.items));
  });
  woSheet.autoFilter = { from: "A1", to: "G1" };
  woSheet.views = [{ state: "frozen", ySplit: 1 }];

  // ── Summary by Vessel ─────────────────────────────────────────────────
  const vesselSheet = wb.addWorksheet("Summary by Vessel");
  vesselSheet.columns = [
    { header: "Vessel", key: "vessel", width: 22 },
    { header: "Company", key: "company", width: 26 },
    { header: "Completed Items", key: "total", width: 16 },
    { header: "In BASTP", key: "inCount", width: 12 },
    { header: "Not in BASTP", key: "notInCount", width: 14 },
    { header: "Status", key: "status", width: 20 },
  ];
  styleHeaderRow(vesselSheet);
  groupByVessel(rows).forEach((g) => {
    const inCount = g.items.filter((i) => i.inBastp).length;
    const wsRow = vesselSheet.addRow({
      vessel: g.vessel,
      company: g.company,
      total: g.items.length,
      inCount,
      notInCount: g.items.length - inCount,
    });
    styleStatusCell(wsRow.getCell("status"), statusFor(g.items));
  });
  vesselSheet.autoFilter = { from: "A1", to: "F1" };
  vesselSheet.views = [{ state: "frozen", ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

// Same download convention as ImportData.tsx's local downloadXLSX helper.
export function downloadWorkbookXLSX(buffer: Uint8Array, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
