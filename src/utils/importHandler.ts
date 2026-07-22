import { supabase } from "../lib/supabase";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { WORK_TYPE_OPTIONS } from "../constants/workTypes";

// ─── Sample real work orders (for Work Details / Progress template samples) ──
//
// Description text in these samples stays clearly a placeholder even when the
// vessel/WO number are real — Work Details always inserts a new row (safe),
// but Work Progress matches and OVERWRITES by vessel+WO+description, so a
// sample row must never form a complete real triple that could silently
// clobber a real item's progress if left unedited.

async function getSampleWorkOrders(
  limit: number,
): Promise<{ vesselName: string; woNumber: string }[]> {
  const { data } = await supabase
    .from("work_order")
    .select("shipyard_wo_number, vessel:vessel_id(name)")
    .is("deleted_at", null)
    .order("id", { ascending: false })
    .limit(limit);

  return (data ?? [])
    .map((r) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vesselName: ((r.vessel as any)?.name as string) ?? "",
      woNumber: (r.shipyard_wo_number as string) ?? "",
    }))
    .filter((r) => r.vesselName && r.woNumber);
}

// ─── ExcelJS template helpers ─────────────────────────────────────────────────
//
// Reference sheets + dropdown validations referencing them. The `xlsx`
// package (used for reading uploaded files elsewhere in this module) can't
// write data validations — that's an ExcelJS-only capability, so template
// *generation* uses ExcelJS while *parsing* stays on `xlsx`, unchanged.

function addExcelRefSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  header: string,
  values: string[],
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(sheetName);
  ws.getCell("A1").value = header;
  ws.getCell("A1").font = { bold: true };
  values.forEach((v, i) => {
    ws.getCell(`A${i + 2}`).value = v;
  });
  ws.getColumn(1).width = 40;
  return ws;
}

/** Excel list-validation formula pointing at a whole reference sheet column. */
function refFormula(sheetName: string, count: number): string {
  const lastRow = Math.max(count + 1, 2);
  return `'${sheetName}'!$A$2:$A$${lastRow}`;
}

const YES_NO_FORMULA = '"yes,no"';

/** Apply the same list validation to every cell in a column across a row range. */
function applyListValidation(
  ws: ExcelJS.Worksheet,
  col: string,
  startRow: number,
  endRow: number,
  formula: string,
) {
  for (let r = startRow; r <= endRow; r++) {
    ws.getCell(`${col}${r}`).dataValidation = {
      type: "list",
      formulae: [formula],
      allowBlank: true,
      showErrorMessage: true,
      errorStyle: "warning",
      error: "Value should come from the reference list, but you can still enter free text.",
    };
  }
}

function buildInstructionsSheet(
  wb: ExcelJS.Workbook,
  title: string,
  lines: Array<[string] | [string, string]>,
) {
  const ws = wb.addWorksheet("Instructions");
  ws.getCell("A1").value = title;
  ws.getCell("A1").font = { bold: true, size: 13 };
  let row = 3;
  for (const line of lines) {
    ws.getCell(`A${row}`).value = line[0];
    if (line[1] !== undefined) ws.getCell(`B${row}`).value = line[1];
    row++;
  }
  ws.getColumn(1).width = 55;
  ws.getColumn(2).width = 50;
}

function addDataSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  headers: string[],
  colWidths: number[],
  sampleRows: (string | number)[][],
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(sheetName);
  headers.forEach((h, i) => {
    const cell = ws.getCell(1, i + 1);
    cell.value = h;
    cell.font = { bold: true };
  });
  sampleRows.forEach((row, r) => {
    row.forEach((v, c) => {
      ws.getCell(r + 2, c + 1).value = v;
    });
  });
  colWidths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  return ws;
}

// ─── Master data cache ────────────────────────────────────────────────────────
//
// Every validator used to re-fetch vessels/kapros/locations/work_scopes/
// work_orders/work_details from scratch on every upload, and template
// downloads re-fetched the same reference lists again. None of that changes
// between uploads in the same import session, so it's fetched once here and
// reused by validateWORows, validateRows, validateProgressRows, and the
// template reference sheets. Invalidated right after any successful import
// (see invalidateMasterDataCache), so a re-upload right after creating new
// Work Orders sees them immediately instead of a stale pre-import snapshot.

interface MasterData {
  vesselsByNorm: Map<string, number>;
  vesselNames: string[];
  kaprosByNorm: Map<string, number>;
  kaproNames: string[];
  locationsByNorm: Map<string, number>;
  locationNames: string[];
  workScopesByNorm: Map<string, number>;
  workScopeNames: string[];
  // "vesselId:wo_number_lower" -> id
  workOrdersByKey: Map<string, number>;
  // "workOrderId:description_lower" -> id
  workDetailsByKey: Map<string, number>;
}

let masterDataCache: MasterData | null = null;
let masterDataPromise: Promise<MasterData> | null = null;

async function getMasterData(): Promise<MasterData> {
  if (masterDataCache) return masterDataCache;
  if (masterDataPromise) return masterDataPromise;

  masterDataPromise = (async () => {
    const [vesselsRes, kaprosRes, locationsRes, workScopesRes, workOrdersRes, workDetailsRes] =
      await Promise.all([
        supabase.from("vessel").select("id, name").is("deleted_at", null),
        supabase.from("kapro").select("id, kapro_name").is("deleted_at", null),
        supabase.from("location").select("id, location").is("deleted_at", null),
        supabase.from("work_scope").select("id, work_scope").is("deleted_at", null),
        supabase
          .from("work_order")
          .select("id, vessel_id, shipyard_wo_number")
          .is("deleted_at", null),
        supabase
          .from("work_details")
          .select("id, work_order_id, description")
          .is("deleted_at", null),
      ]);

    const vesselsByNorm = new Map<string, number>();
    const vesselNames: string[] = [];
    for (const v of vesselsRes.data ?? []) {
      const name = (v.name as string) ?? "";
      if (!name.trim()) continue;
      vesselsByNorm.set(name.toLowerCase().trim(), v.id as number);
      vesselNames.push(name.trim());
    }

    const kaprosByNorm = new Map<string, number>();
    const kaproNames: string[] = [];
    for (const k of kaprosRes.data ?? []) {
      const name = (k.kapro_name as string) ?? "";
      if (!name.trim()) continue;
      kaprosByNorm.set(name.toLowerCase().trim(), k.id as number);
      kaproNames.push(name.trim());
    }

    const locationsByNorm = new Map<string, number>();
    const locationNames: string[] = [];
    for (const l of locationsRes.data ?? []) {
      const name = (l.location as string) ?? "";
      if (!name.trim()) continue;
      locationsByNorm.set(name.toLowerCase().trim(), l.id as number);
      locationNames.push(name.trim());
    }

    const workScopesByNorm = new Map<string, number>();
    const workScopeNames: string[] = [];
    for (const w of workScopesRes.data ?? []) {
      const name = (w.work_scope as string) ?? "";
      if (!name.trim()) continue;
      workScopesByNorm.set(name.toLowerCase().trim(), w.id as number);
      workScopeNames.push(name.trim());
    }

    const workOrdersByKey = new Map<string, number>();
    for (const wo of workOrdersRes.data ?? []) {
      const key = `${wo.vessel_id}:${((wo.shipyard_wo_number as string) ?? "").toLowerCase().trim()}`;
      workOrdersByKey.set(key, wo.id as number);
    }

    const workDetailsByKey = new Map<string, number>();
    for (const wd of workDetailsRes.data ?? []) {
      const key = `${wd.work_order_id}:${((wd.description as string) ?? "").toLowerCase().trim()}`;
      workDetailsByKey.set(key, wd.id as number);
    }

    const sortNames = (names: string[]) => [...names].sort((a, b) => a.localeCompare(b));

    const result: MasterData = {
      vesselsByNorm,
      vesselNames: sortNames(vesselNames),
      kaprosByNorm,
      kaproNames: sortNames(kaproNames),
      locationsByNorm,
      locationNames: sortNames(locationNames),
      workScopesByNorm,
      workScopeNames: sortNames(workScopeNames),
      workOrdersByKey,
      workDetailsByKey,
    };
    masterDataCache = result;
    return result;
  })();

  try {
    return await masterDataPromise;
  } finally {
    masterDataPromise = null;
  }
}

/** Call after any successful import so the next validation sees fresh data. */
export function invalidateMasterDataCache() {
  masterDataCache = null;
  masterDataPromise = null;
}

// ─── Template Data ────────────────────────────────────────────────────────────

export const WORK_DETAILS_TEMPLATE_HEADERS = [
  "vessel_name",
  "work_order_number",
  "description",
  "location",
  "work_scope",
  "quantity",
  "uom",
  "is_additional_wo_details",
  "planned_start_date",
  "target_close_date",
  "period_close_target",
  "progress_percentage",
  "progress_report_date",
  "progress_notes",
];

// Friendly display labels shown as the first row in XLSX (row 1 = labels, row 2+ = data)
const HEADER_LABELS: Record<string, string> = {
  vessel_name: "Vessel Name *",
  work_order_number: "Work Order Number *",
  description: "Description *",
  location: "Location *",
  work_scope: "Work Scope *",
  quantity: "Quantity *",
  uom: "UOM *",
  is_additional_wo_details: "Is Additional WO Details (yes/no)",
  planned_start_date: "Planned Start Date * (YYYY-MM-DD)",
  target_close_date: "Target Close Date * (YYYY-MM-DD)",
  period_close_target: "Period Close Target *",
  progress_percentage: "Progress Percentage (optional)",
  progress_report_date: "Progress Report Date (optional, YYYY-MM-DD)",
  progress_notes: "Progress Notes (optional)",
};

export const WORK_DETAILS_TEMPLATE_SAMPLE: string[][] = [
  [
    "KM. Mawar Laut",
    "SY-2024-001",
    "Hull cleaning and anti-fouling painting",
    "Main Deck",
    "Hull Works",
    "1",
    "LS",
    "no",
    "2024-06-01",
    "2024-07-15",
    "Jul 2024",
    "25",
    "2024-06-05",
    "Started per site report",
  ],
  [
    "KM. Mawar Laut",
    "SY-2024-001",
    "Main engine overhaul and bearing replacement",
    "Engine Room",
    "Machinery",
    "1",
    "Set",
    "no",
    "2024-06-05",
    "2024-07-30",
    "Jul 2024",
    "",
    "",
    "",
  ],
  [
    "KM. Mawar Laut",
    "SY-2024-001",
    "Rudder repair and alignment",
    "Stern",
    "Hull Works",
    "1",
    "LS",
    "no",
    "2024-06-10",
    "2024-07-10",
    "Jul 2024",
    "",
    "",
    "",
  ],
  [
    "KM. Mawar Laut",
    "SY-2024-001",
    "Steel plate renewal (bottom shell)",
    "Bottom",
    "Steel Works",
    "12.5",
    "M2",
    "no",
    "2024-06-15",
    "2024-08-01",
    "Aug 2024",
    "",
    "",
    "",
  ],
  [
    "KM. Sinar Bahari",
    "SY-2024-002",
    "Propeller polishing and balancing",
    "Stern",
    "Hull Works",
    "1",
    "LS",
    "no",
    "2024-07-01",
    "2024-07-20",
    "Jul 2024",
    "",
    "",
    "",
  ],
  [
    "KM. Sinar Bahari",
    "SY-2024-002",
    "Anchor chain renewal (port side)",
    "Forecastle Deck",
    "Deck Outfitting",
    "1",
    "Set",
    "yes",
    "2024-07-05",
    "2024-07-25",
    "Jul 2024",
    "",
    "",
    "",
  ],
];

// ─── CSV Template ─────────────────────────────────────────────────────────────

export function generateTemplateCSV(): string {
  const lines: string[] = [WORK_DETAILS_TEMPLATE_HEADERS.join(",")];
  for (const row of WORK_DETAILS_TEMPLATE_SAMPLE) {
    lines.push(row.map((v) => (v.includes(",") ? `"${v}"` : v)).join(","));
  }
  return lines.join("\n");
}

// ─── XLSX Template ────────────────────────────────────────────────────────────

export async function generateTemplateXLSX(): Promise<Uint8Array> {
  const md = await getMasterData();
  const wos = await getSampleWorkOrders(2);
  const v1 = wos[0]?.vesselName ?? md.vesselNames[0] ?? "Example Vessel";
  const wo1 = wos[0]?.woNumber ?? "SY-2024-001";
  const v2 = wos[1]?.vesselName ?? v1;
  const wo2 = wos[1]?.woNumber ?? wo1;
  const loc = md.locationNames;
  const scope = md.workScopeNames;

  const sampleRows: (string | number)[][] = [
    [
      v1, wo1, "Example — replace with the real work description",
      loc[0] ?? "Main Deck", scope[0] ?? "Hull Works", 1, "LS", "no",
      "2024-06-01", "2024-07-15", "Jul 2024",
      25, "2024-06-05", "Example — optional starting progress",
    ],
    [
      v1, wo1, "Example — another item under the same work order",
      loc[1] ?? loc[0] ?? "Engine Room", scope[1] ?? scope[0] ?? "Machinery", 12.5, "M2", "no",
      "2024-06-15", "2024-08-01", "Aug 2024",
      "", "", "",
    ],
    [
      v2, wo2, "Example — an additional (not originally planned) item",
      loc[2] ?? loc[0] ?? "Forecastle Deck", scope[2] ?? scope[0] ?? "Deck Outfitting", 1, "Set", "yes",
      "2024-07-05", "2024-07-25", "Jul 2024",
      "", "", "",
    ],
  ];

  const wb = new ExcelJS.Workbook();
  const headers = WORK_DETAILS_TEMPLATE_HEADERS.map((h) => HEADER_LABELS[h] ?? h);
  const ws = addDataSheet(
    wb,
    "Work Details",
    headers,
    [22, 18, 42, 18, 18, 10, 8, 22, 28, 28, 22, 20, 28, 30],
    sampleRows,
  );

  applyListValidation(ws, "A", 2, 300, refFormula("Ref - Vessels", md.vesselNames.length));
  applyListValidation(ws, "D", 2, 300, refFormula("Ref - Locations", md.locationNames.length));
  applyListValidation(ws, "E", 2, 300, refFormula("Ref - Work Scopes", md.workScopeNames.length));
  applyListValidation(ws, "H", 2, 300, YES_NO_FORMULA);

  buildInstructionsSheet(wb, "IMPORT TEMPLATE — WORK DETAILS", [
    ["INSTRUCTIONS"],
    ["1. Fill in the 'Work Details' sheet starting from row 2 (do not change row 1 headers)."],
    ["2. Fields marked with * are required."],
    ["3. vessel_name, location, and work_scope have dropdowns — click the cell to pick a valid value."],
    ["4. work_order_number must match an existing WO for that vessel (Shipyard WO Number)."],
    ["5. quantity must be a positive number."],
    ["6. Dates must be in YYYY-MM-DD format (e.g. 2024-06-15)."],
    ["7. is_additional_wo_details: pick 'yes' or 'no' from the dropdown."],
    ["8. period_close_target: free text (e.g. 'Jul 2024')."],
    ["9. progress_percentage / progress_report_date are OPTIONAL and only set the INITIAL progress for this new work item — leave both blank if not needed."],
    ["10. If you fill in progress_percentage, progress_report_date is also required (and vice versa)."],
    ["11. To UPDATE progress later (on this or any other work item), use the separate Work Progress tab — this column only applies once, when the work item is first created."],
    [""],
    ["COLUMN REFERENCE"],
    ["vessel_name", "Name of the vessel — must match exactly"],
    ["work_order_number", "Shipyard WO number for the vessel"],
    ["description", "Full description of the work item"],
    ["location", "Location on vessel (e.g. Engine Room, Main Deck)"],
    ["work_scope", "Work scope category (e.g. Hull Works, Machinery)"],
    ["quantity", "Numeric quantity (e.g. 1, 2.5, 12)"],
    ["uom", "Unit of measure (e.g. LS, M2, Unit, Set)"],
    ["is_additional_wo_details", "yes = additional work; no = planned work"],
    ["planned_start_date", "Format: YYYY-MM-DD"],
    ["target_close_date", "Format: YYYY-MM-DD (must be ≥ planned_start_date)"],
    ["period_close_target", "Target period label (e.g. Jul 2024, Q3 2024)"],
    ["progress_percentage", "Optional — 0 to 100, sets this new item's starting progress"],
    ["progress_report_date", "Optional — YYYY-MM-DD, required together with progress_percentage"],
    ["progress_notes", "Optional free text for the initial progress entry"],
  ]);

  addExcelRefSheet(wb, "Ref - Vessels", "Vessel Name", md.vesselNames);
  addExcelRefSheet(wb, "Ref - Locations", "Location", md.locationNames);
  addExcelRefSheet(wb, "Ref - Work Scopes", "Work Scope", md.workScopeNames);

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

// ─── Work Order Template ──────────────────────────────────────────────────────

export const WORK_ORDER_TEMPLATE_HEADERS = [
  "vessel_name",
  "shipyard_wo_number",
  "shipyard_wo_date",
  "customer_wo_number",
  "customer_wo_date",
  "is_additional_wo",
  "kapro_name",
  "work_location",
  "work_type",
];

const WO_HEADER_LABELS: Record<string, string> = {
  vessel_name: "Vessel Name *",
  shipyard_wo_number: "Shipyard WO Number *",
  shipyard_wo_date: "Shipyard WO Date * (YYYY-MM-DD)",
  customer_wo_number: "Customer WO Number",
  customer_wo_date: "Customer WO Date (YYYY-MM-DD)",
  is_additional_wo: "Is Additional WO (yes/no)",
  kapro_name: "Kapro Name",
  work_location: "Work Location",
  work_type: "Work Type",
};

const WO_TEMPLATE_SAMPLE: string[][] = [
  [
    "KM. Mawar Laut",
    "SY-2024-001",
    "2024-05-10",
    "CUST-WO-001",
    "2024-05-05",
    "no",
    "Elbas Rojali",
    "Samarinda",
    "Repair",
  ],
  [
    "KM. Mawar Laut",
    "SY-2024-002",
    "2024-06-01",
    "",
    "",
    "yes",
    "",
    "Samarinda",
    "Repair",
  ],
  [
    "KM. Sinar Bahari",
    "SY-2024-003",
    "2024-06-15",
    "CUST-WO-003",
    "2024-06-10",
    "no",
    "Elbas Rojali",
    "Balikpapan",
    "Maintenance",
  ],
];

/** Generate an XLSX template that covers Work Orders AND Work Details in two sheets. */
export async function generateCombinedTemplateXLSX(): Promise<Uint8Array> {
  const md = await getMasterData();
  const wos = await getSampleWorkOrders(2);
  const v1 = wos[0]?.vesselName ?? md.vesselNames[0] ?? "Example Vessel";
  const v2 = md.vesselNames[1] ?? v1;
  const kapro1 = md.kaproNames[0] ?? "";
  const loc = md.locationNames;
  const scope = md.workScopeNames;

  const wb = new ExcelJS.Workbook();

  // ── Sheet 1: Work Orders ──
  const woSampleRows: (string | number)[][] = [
    [v1, "SY-2024-001", "2024-05-10", "CUST-WO-001", "2024-05-05", "no", kapro1, "Samarinda", "Repair"],
    [v1, "SY-2024-002", "2024-06-01", "", "", "yes", "", "Samarinda", "Repair"],
    [v2, "SY-2024-003", "2024-06-15", "CUST-WO-003", "2024-06-10", "no", kapro1, "Balikpapan", "Maintenance"],
  ];
  const woHeaders = WORK_ORDER_TEMPLATE_HEADERS.map((h) => WO_HEADER_LABELS[h] ?? h);
  const woWs = addDataSheet(
    wb,
    "Work Orders",
    woHeaders,
    [22, 20, 26, 22, 24, 20, 18, 16, 16],
    woSampleRows,
  );
  applyListValidation(woWs, "A", 2, 300, refFormula("Ref - Vessels", md.vesselNames.length));
  applyListValidation(woWs, "F", 2, 300, YES_NO_FORMULA);
  applyListValidation(woWs, "G", 2, 300, refFormula("Ref - Kapro", md.kaproNames.length));
  applyListValidation(woWs, "I", 2, 300, refFormula("Ref - Work Types", WORK_TYPE_OPTIONS.length));

  // ── Sheet 2: Work Details ──
  const wdSampleRows: (string | number)[][] = [
    [
      v1, "SY-2024-001", "Example — replace with the real work description",
      loc[0] ?? "Main Deck", scope[0] ?? "Hull Works", 1, "LS", "no",
      "2024-06-01", "2024-07-15", "Jul 2024", 25, "2024-06-05", "Example — optional starting progress",
    ],
    [
      v1, "SY-2024-001", "Example — another item under the same work order",
      loc[1] ?? loc[0] ?? "Engine Room", scope[1] ?? scope[0] ?? "Machinery", 12.5, "M2", "no",
      "2024-06-15", "2024-08-01", "Aug 2024", "", "", "",
    ],
    [
      v2, "SY-2024-003", "Example — an additional (not originally planned) item",
      loc[2] ?? loc[0] ?? "Forecastle Deck", scope[2] ?? scope[0] ?? "Deck Outfitting", 1, "Set", "yes",
      "2024-07-05", "2024-07-25", "Jul 2024", "", "", "",
    ],
  ];
  const wdHeaders = WORK_DETAILS_TEMPLATE_HEADERS.map((h) => HEADER_LABELS[h] ?? h);
  const wdWs = addDataSheet(
    wb,
    "Work Details",
    wdHeaders,
    [22, 18, 42, 18, 18, 10, 8, 22, 28, 28, 22, 20, 28, 30],
    wdSampleRows,
  );
  applyListValidation(wdWs, "A", 2, 300, refFormula("Ref - Vessels", md.vesselNames.length));
  applyListValidation(wdWs, "D", 2, 300, refFormula("Ref - Locations", md.locationNames.length));
  applyListValidation(wdWs, "E", 2, 300, refFormula("Ref - Work Scopes", md.workScopeNames.length));
  applyListValidation(wdWs, "H", 2, 300, YES_NO_FORMULA);

  // ── Sheet 3: Instructions ──
  buildInstructionsSheet(wb, "IMPORT TEMPLATE — WORK ORDERS & WORK DETAILS", [
    ["HOW TO USE"],
    ["1. Fill in the 'Work Orders' sheet first (starting from row 2)."],
    ["2. Fill in the 'Work Details' sheet next (starting from row 2)."],
    ["3. vessel_name, kapro_name, work_type, location, and work_scope have dropdowns — click the cell to pick a valid value."],
    ["4. work_order_number in 'Work Details' must match a shipyard_wo_number in 'Work Orders' sheet OR an existing WO in the system."],
    ["5. Dates: YYYY-MM-DD format (e.g. 2024-06-15)."],
    ["6. is_additional_wo / is_additional_wo_details: pick 'yes' or 'no' from the dropdown."],
    [""],
    ["WORK ORDER COLUMNS"],
    ["vessel_name *", "Must match an existing vessel"],
    ["shipyard_wo_number *", "Unique WO number for the vessel"],
    ["shipyard_wo_date *", "YYYY-MM-DD"],
    ["customer_wo_number", "Optional"],
    ["customer_wo_date", "Optional — YYYY-MM-DD"],
    ["is_additional_wo", "yes or no"],
    ["kapro_name", "Optional — must match existing Kapro record"],
    ["work_location", "Optional — city of the work (e.g. Samarinda, Balikpapan)"],
    ["work_type", "Optional — pick from the dropdown"],
    [""],
    ["WORK DETAILS COLUMNS"],
    ["vessel_name *", "Must match an existing vessel"],
    ["work_order_number *", "Must match shipyard_wo_number for that vessel"],
    ["description *", "Full description of the work item"],
    ["location *", "Must match an existing Location record"],
    ["work_scope *", "Must match an existing Work Scope record"],
    ["quantity *", "Positive number"],
    ["uom *", "Unit of measure (LS, M2, Unit, Set…)"],
    ["is_additional_wo_details", "yes or no"],
    ["planned_start_date *", "YYYY-MM-DD"],
    ["target_close_date *", "YYYY-MM-DD (must be ≥ planned_start_date)"],
    ["period_close_target *", "e.g. Jul 2024"],
    ["progress_percentage", "Optional — 0 to 100, sets a new item's starting progress"],
    ["progress_report_date", "Optional — YYYY-MM-DD, required together with progress_percentage"],
    ["progress_notes", "Optional free text for the initial progress entry"],
  ]);

  addExcelRefSheet(wb, "Ref - Vessels", "Vessel Name", md.vesselNames);
  addExcelRefSheet(wb, "Ref - Kapro", "Kapro Name", md.kaproNames);
  addExcelRefSheet(wb, "Ref - Locations", "Location", md.locationNames);
  addExcelRefSheet(wb, "Ref - Work Scopes", "Work Scope", md.workScopeNames);
  addExcelRefSheet(wb, "Ref - Work Types", "Work Type", WORK_TYPE_OPTIONS);

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

/** Generate a CSV template for Work Orders only. */
export function generateWorkOrderTemplateCSV(): string {
  const lines: string[] = [WORK_ORDER_TEMPLATE_HEADERS.join(",")];
  for (const row of WO_TEMPLATE_SAMPLE) {
    lines.push(row.map((v) => (v.includes(",") ? `"${v}"` : v)).join(","));
  }
  return lines.join("\n");
}

// ─── CSV Parsing ─────────────────────────────────────────────────────────────

export interface ParsedImportRow {
  rowNumber: number;
  vessel_name: string;
  work_order_number: string;
  description: string;
  location: string;
  work_scope: string;
  quantity: string;
  uom: string;
  is_additional_wo_details: string;
  planned_start_date: string;
  target_close_date: string;
  period_close_target: string;
  progress_percentage: string;
  progress_report_date: string;
  progress_notes: string;
}

export interface ValidatedImportRow extends ParsedImportRow {
  errors: string[];
  vessel_id?: number;
  work_order_id?: number;
  location_id?: number;
  work_scope_id?: number;
  hasInitialProgress?: boolean;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCSV(csvText: string): ParsedImportRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, "_"),
  );

  const rows: ParsedImportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] ?? "";
    });

    rows.push({
      rowNumber: i + 1,
      vessel_name: rowObj["vessel_name"] ?? "",
      work_order_number: rowObj["work_order_number"] ?? "",
      description: rowObj["description"] ?? "",
      location: rowObj["location"] ?? "",
      work_scope: rowObj["work_scope"] ?? "",
      quantity: rowObj["quantity"] ?? "",
      uom: rowObj["uom"] ?? "",
      is_additional_wo_details: rowObj["is_additional_wo_details"] ?? "no",
      planned_start_date: rowObj["planned_start_date"] ?? "",
      target_close_date: rowObj["target_close_date"] ?? "",
      period_close_target: rowObj["period_close_target"] ?? "",
      progress_percentage: rowObj["progress_percentage"] ?? "",
      progress_report_date: rowObj["progress_report_date"] ?? "",
      progress_notes: rowObj["progress_notes"] ?? "",
    });
  }

  return rows;
}

// ─── XLSX Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse an XLSX/XLS ArrayBuffer into ParsedImportRow[].
 * Reads the first sheet and uses row 1 as the header.
 * The header row can use either the raw column key (e.g. "vessel_name") or
 * the friendly label (e.g. "Vessel Name *") — both are normalised.
 */
export function parseXLSX(buffer: ArrayBuffer): ParsedImportRow[] {
  const wb = XLSX.read(buffer, {
    type: "array",
    cellText: true,
    cellDates: false,
  });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];

  const ws = wb.Sheets[sheetName];
  // sheet_to_json with header:1 gives us rows as string[][]
  const raw = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    defval: "",
    raw: false, // always use formatted string values
  });

  if (raw.length < 2) return [];

  const headers = (raw[0] as string[]).map(normaliseHeader);

  const rows: ParsedImportRow[] = [];
  for (let i = 1; i < raw.length; i++) {
    const values = raw[i] as string[];
    // Skip completely empty rows
    if (values.every((v) => String(v).trim() === "")) continue;

    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = String(values[idx] ?? "").trim();
    });

    rows.push({
      rowNumber: i + 1,
      vessel_name: rowObj["vessel_name"] ?? "",
      work_order_number: rowObj["work_order_number"] ?? "",
      description: rowObj["description"] ?? "",
      location: rowObj["location"] ?? "",
      work_scope: rowObj["work_scope"] ?? "",
      quantity: rowObj["quantity"] ?? "",
      uom: rowObj["uom"] ?? "",
      is_additional_wo_details: rowObj["is_additional_wo_details"] ?? "no",
      planned_start_date: rowObj["planned_start_date"] ?? "",
      target_close_date: rowObj["target_close_date"] ?? "",
      period_close_target: rowObj["period_close_target"] ?? "",
      progress_percentage: rowObj["progress_percentage"] ?? "",
      progress_report_date: rowObj["progress_report_date"] ?? "",
      progress_notes: rowObj["progress_notes"] ?? "",
    });
  }

  return rows;
}

// ─── Validation & DB Resolution ──────────────────────────────────────────────

interface LookupMaps {
  vessels: Map<string, number>; // name_lower -> id
  workOrders: Map<string, number>; // "vessel_id:wo_number_lower" -> id
  locations: Map<string, number>; // name_lower -> id
  workScopes: Map<string, number>; // name_lower -> id
}

async function buildLookupMaps(): Promise<LookupMaps> {
  const md = await getMasterData();
  return {
    vessels: md.vesselsByNorm,
    workOrders: md.workOrdersByKey,
    locations: md.locationsByNorm,
    workScopes: md.workScopesByNorm,
  };
}

export async function validateRows(
  rows: ParsedImportRow[],
): Promise<ValidatedImportRow[]> {
  const maps = await buildLookupMaps();

  return rows.map((row) => {
    const errors: string[] = [];
    let vessel_id: number | undefined;
    let work_order_id: number | undefined;
    let location_id: number | undefined;
    let work_scope_id: number | undefined;

    // Required text fields
    if (!row.description.trim()) errors.push("Description is required");
    if (!row.uom.trim()) errors.push("UOM is required");
    if (!row.period_close_target.trim())
      errors.push("Period close target is required");

    // Vessel
    if (!row.vessel_name.trim()) {
      errors.push("Vessel name is required");
    } else {
      vessel_id = maps.vessels.get(row.vessel_name.toLowerCase().trim());
      if (!vessel_id) errors.push(`Vessel not found: "${row.vessel_name}"`);
    }

    // Work Order
    if (!row.work_order_number.trim()) {
      errors.push("Work order number is required");
    } else if (vessel_id) {
      const woKey = `${vessel_id}:${row.work_order_number.toLowerCase().trim()}`;
      work_order_id = maps.workOrders.get(woKey);
      if (!work_order_id)
        errors.push(
          `Work order not found: "${row.work_order_number}" for vessel "${row.vessel_name}"`,
        );
    }

    // Location
    if (!row.location.trim()) {
      errors.push("Location is required");
    } else {
      location_id = maps.locations.get(row.location.toLowerCase().trim());
      if (!location_id) errors.push(`Location not found: "${row.location}"`);
    }

    // Work Scope
    if (!row.work_scope.trim()) {
      errors.push("Work scope is required");
    } else {
      work_scope_id = maps.workScopes.get(row.work_scope.toLowerCase().trim());
      if (!work_scope_id)
        errors.push(`Work scope not found: "${row.work_scope}"`);
    }

    // Quantity
    const qty = parseFloat(row.quantity);
    if (!row.quantity.trim() || isNaN(qty) || qty <= 0) {
      errors.push("Quantity must be a number greater than 0");
    }

    // Dates
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!row.planned_start_date.trim()) {
      errors.push("Planned start date is required");
    } else if (!dateRegex.test(row.planned_start_date)) {
      errors.push("Planned start date must be YYYY-MM-DD format");
    }
    if (!row.target_close_date.trim()) {
      errors.push("Target close date is required");
    } else if (!dateRegex.test(row.target_close_date)) {
      errors.push("Target close date must be YYYY-MM-DD format");
    }
    if (
      dateRegex.test(row.planned_start_date) &&
      dateRegex.test(row.target_close_date)
    ) {
      if (new Date(row.planned_start_date) > new Date(row.target_close_date)) {
        errors.push("Target close date must be on or after planned start date");
      }
    }

    // Optional initial progress — both fields blank is fine (no progress set
    // for this new work item); if either is filled, both must be valid.
    const hasPct = row.progress_percentage.trim() !== "";
    const hasDate = row.progress_report_date.trim() !== "";
    let hasInitialProgress = false;
    if (hasPct || hasDate) {
      if (!hasPct) {
        errors.push("progress_report_date is set but progress_percentage is missing");
      } else {
        const pct = parseFloat(row.progress_percentage);
        if (isNaN(pct) || pct < 0 || pct > 100) {
          errors.push("progress_percentage must be a number between 0 and 100");
        }
      }
      if (!hasDate) {
        errors.push("progress_percentage is set but progress_report_date is missing");
      } else if (!dateRegex.test(row.progress_report_date)) {
        errors.push("progress_report_date must be YYYY-MM-DD format");
      }
      hasInitialProgress = hasPct && hasDate;
    }

    return {
      ...row,
      errors,
      vessel_id,
      work_order_id,
      location_id,
      work_scope_id,
      hasInitialProgress,
    };
  });
}

// ─── Import ──────────────────────────────────────────────────────────────────

export interface ImportResult {
  successCount: number;
  failedRows: Array<{ rowNumber: number; error: string }>;
}

export async function importWorkDetails(
  validatedRows: ValidatedImportRow[],
  userId: number,
): Promise<ImportResult> {
  const validRows = validatedRows.filter((r) => r.errors.length === 0);
  const failedRows: ImportResult["failedRows"] = [];

  if (validRows.length === 0) {
    return { successCount: 0, failedRows };
  }

  const insertData = validRows.map((row) => ({
    work_order_id: row.work_order_id!,
    description: row.description.trim(),
    location_id: row.location_id!,
    work_scope_id: row.work_scope_id!,
    quantity: parseFloat(row.quantity),
    uom: row.uom.trim(),
    is_additional_wo_details:
      row.is_additional_wo_details.toLowerCase() === "yes" ||
      row.is_additional_wo_details.toLowerCase() === "true",
    planned_start_date: row.planned_start_date,
    target_close_date: row.target_close_date,
    period_close_target: row.period_close_target.trim(),
    user_id: userId,
    pic: "",
    spk_number: null,
    spkk_number: null,
    work_permit_url: null,
    storage_path: null,
    notes: null,
    actual_start_date: null,
    actual_close_date: null,
    ptw_number: null,
  }));

  const { data: inserted, error } = await supabase
    .from("work_details")
    .insert(insertData)
    .select("id");

  if (error) {
    // If bulk insert fails, report all rows as failed
    for (const row of validRows) {
      failedRows.push({ rowNumber: row.rowNumber, error: error.message });
    }
    return { successCount: 0, failedRows };
  }

  // Each newly created work item can optionally carry an initial progress
  // entry (progress_percentage + progress_report_date). These are brand-new
  // work_details rows, so there's no existing is_imported row to reconcile
  // against — always a plain insert.
  const progressRows = validRows
    .map((row, i) => ({ row, workDetailsId: inserted?.[i]?.id as number | undefined }))
    .filter(({ row, workDetailsId }) => row.hasInitialProgress && workDetailsId);

  if (progressRows.length > 0) {
    const progressInsertData = progressRows.map(({ row, workDetailsId }) => ({
      work_details_id: workDetailsId!,
      progress_percentage: parseFloat(row.progress_percentage),
      report_date: row.progress_report_date,
      notes: row.progress_notes.trim() || null,
      user_id: userId,
      is_imported: true,
    }));
    const { error: progressError } = await supabase
      .from("work_progress")
      .insert(progressInsertData);
    if (progressError) {
      failedRows.push({
        rowNumber: 0,
        error: `Work details were imported successfully, but ${progressRows.length} initial progress entr${progressRows.length === 1 ? "y" : "ies"} failed: ${progressError.message}`,
      });
    }
  }

  return { successCount: validRows.length, failedRows };
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORK ORDER IMPORT
// ═══════════════════════════════════════════════════════════════════════════════

export interface ParsedWORow {
  rowNumber: number;
  vessel_name: string;
  shipyard_wo_number: string;
  shipyard_wo_date: string;
  customer_wo_number: string;
  customer_wo_date: string;
  is_additional_wo: string;
  kapro_name: string;
  work_location: string;
  work_type: string;
}

export interface ValidatedWORow extends ParsedWORow {
  errors: string[];
  vessel_id?: number;
  kapro_id?: number | null;
}

// ─── WO CSV Parser ────────────────────────────────────────────────────────────

export function parseWorkOrderCSV(csvText: string): ParsedWORow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const parseCSVLineFn = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseCSVLineFn(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, "_"),
  );
  const rows: ParsedWORow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLineFn(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] ?? "";
    });
    rows.push({
      rowNumber: i + 1,
      vessel_name: obj["vessel_name"] ?? "",
      shipyard_wo_number: obj["shipyard_wo_number"] ?? "",
      shipyard_wo_date: obj["shipyard_wo_date"] ?? "",
      customer_wo_number: obj["customer_wo_number"] ?? "",
      customer_wo_date: obj["customer_wo_date"] ?? "",
      is_additional_wo: obj["is_additional_wo"] ?? "no",
      kapro_name: obj["kapro_name"] ?? "",
      work_location: obj["work_location"] ?? "",
      work_type: obj["work_type"] ?? "",
    });
  }
  return rows;
}

// ─── WO XLSX Parser ───────────────────────────────────────────────────────────

export function parseWorkOrderXLSX(buffer: ArrayBuffer): ParsedWORow[] {
  const wb = XLSX.read(buffer, {
    type: "array",
    cellText: true,
    cellDates: false,
  });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    defval: "",
    raw: false,
  });
  if (raw.length < 2) return [];

  const headers = (raw[0] as string[]).map(normaliseHeader);

  const rows: ParsedWORow[] = [];
  for (let i = 1; i < raw.length; i++) {
    const values = raw[i] as string[];
    if (values.every((v) => String(v).trim() === "")) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = String(values[idx] ?? "").trim();
    });
    rows.push({
      rowNumber: i + 1,
      vessel_name: obj["vessel_name"] ?? "",
      shipyard_wo_number: obj["shipyard_wo_number"] ?? "",
      shipyard_wo_date: obj["shipyard_wo_date"] ?? "",
      customer_wo_number: obj["customer_wo_number"] ?? "",
      customer_wo_date: obj["customer_wo_date"] ?? "",
      is_additional_wo: obj["is_additional_wo"] ?? "no",
      kapro_name: obj["kapro_name"] ?? "",
      work_location: obj["work_location"] ?? "",
      work_type: obj["work_type"] ?? "",
    });
  }
  return rows;
}

// ─── WO Validation ────────────────────────────────────────────────────────────

export async function validateWORows(
  rows: ParsedWORow[],
): Promise<ValidatedWORow[]> {
  const md = await getMasterData();
  const vessels = md.vesselsByNorm;
  const kapros = md.kaprosByNorm;

  // Check for duplicate shipyard_wo_number within this import batch per vessel
  const batchKeys = new Set<string>();

  return rows.map((row) => {
    const errors: string[] = [];
    let vessel_id: number | undefined;
    let kapro_id: number | null = null;

    // Vessel
    if (!row.vessel_name.trim()) {
      errors.push("Vessel name is required");
    } else {
      vessel_id = vessels.get(row.vessel_name.toLowerCase().trim());
      if (!vessel_id) errors.push(`Vessel not found: "${row.vessel_name}"`);
    }

    // Shipyard WO Number
    if (!row.shipyard_wo_number.trim()) {
      errors.push("Shipyard WO number is required");
    } else if (vessel_id) {
      const batchKey = `${vessel_id}:${row.shipyard_wo_number.toLowerCase().trim()}`;
      if (batchKeys.has(batchKey)) {
        errors.push(
          `Duplicate WO number in this file: "${row.shipyard_wo_number}"`,
        );
      } else {
        batchKeys.add(batchKey);
      }
    }

    // Shipyard WO Date
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!row.shipyard_wo_date.trim()) {
      errors.push("Shipyard WO date is required");
    } else if (!dateRegex.test(row.shipyard_wo_date)) {
      errors.push("Shipyard WO date must be YYYY-MM-DD format");
    }

    // Optional customer WO date
    if (row.customer_wo_date.trim() && !dateRegex.test(row.customer_wo_date)) {
      errors.push("Customer WO date must be YYYY-MM-DD format");
    }

    // Kapro (optional)
    if (row.kapro_name.trim()) {
      kapro_id = kapros.get(row.kapro_name.toLowerCase().trim()) ?? null;
      if (kapro_id === null)
        errors.push(`Kapro not found: "${row.kapro_name}"`);
    }

    return { ...row, errors, vessel_id, kapro_id };
  });
}

// ─── WO Import ────────────────────────────────────────────────────────────────

export async function importWorkOrders(
  validatedRows: ValidatedWORow[],
  userId: number,
): Promise<ImportResult> {
  const validRows = validatedRows.filter((r) => r.errors.length === 0);
  const failedRows: ImportResult["failedRows"] = [];
  if (validRows.length === 0) return { successCount: 0, failedRows };

  const insertData = validRows.map((row) => ({
    vessel_id: row.vessel_id!,
    shipyard_wo_number: row.shipyard_wo_number.trim(),
    shipyard_wo_date: row.shipyard_wo_date,
    customer_wo_number: row.customer_wo_number.trim() || null,
    customer_wo_date: row.customer_wo_date.trim() || null,
    is_additional_wo:
      row.is_additional_wo.toLowerCase() === "yes" ||
      row.is_additional_wo.toLowerCase() === "true",
    kapro_id: row.kapro_id ?? null,
    work_location: row.work_location.trim() || null,
    work_type: row.work_type.trim() || null,
    user_id: userId,
  }));

  const { error } = await supabase.from("work_order").insert(insertData);
  if (error) {
    for (const row of validRows)
      failedRows.push({ rowNumber: row.rowNumber, error: error.message });
    return { successCount: 0, failedRows };
  }
  return { successCount: validRows.length, failedRows };
}

// ─── Combined XLSX Import (WO + Work Details in one file) ────────────────────

/**
 * Parse a combined XLSX file that has "Work Orders" as sheet 1 and
 * "Work Details" as sheet 2.  Returns both parsed result sets.
 */
export function parseCombinedXLSX(buffer: ArrayBuffer): {
  woRows: ParsedWORow[];
  wdRows: ParsedImportRow[];
} {
  const wb = XLSX.read(buffer, {
    type: "array",
    cellText: true,
    cellDates: false,
  });

  const parseSheet = <T>(
    sheetName: string,
    buildRow: (obj: Record<string, string>, rowNumber: number) => T,
  ): T[] => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return [];
    const raw = XLSX.utils.sheet_to_json<string[]>(ws, {
      header: 1,
      defval: "",
      raw: false,
    });
    if (raw.length < 2) return [];
    const headers = (raw[0] as string[]).map(normaliseHeader);
    const rows: T[] = [];
    for (let i = 1; i < raw.length; i++) {
      const values = raw[i] as string[];
      if (values.every((v) => String(v).trim() === "")) continue;
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = String(values[idx] ?? "").trim();
      });
      rows.push(buildRow(obj, i + 1));
    }
    return rows;
  };

  const woRows = parseSheet<ParsedWORow>(
    wb.SheetNames[0] ?? "Work Orders",
    (obj, rowNumber) => ({
      rowNumber,
      vessel_name: obj["vessel_name"] ?? "",
      shipyard_wo_number: obj["shipyard_wo_number"] ?? "",
      shipyard_wo_date: obj["shipyard_wo_date"] ?? "",
      customer_wo_number: obj["customer_wo_number"] ?? "",
      customer_wo_date: obj["customer_wo_date"] ?? "",
      is_additional_wo: obj["is_additional_wo"] ?? "no",
      kapro_name: obj["kapro_name"] ?? "",
      work_location: obj["work_location"] ?? "",
      work_type: obj["work_type"] ?? "",
    }),
  );

  const wdRows = parseSheet<ParsedImportRow>(
    wb.SheetNames[1] ?? "Work Details",
    (obj, rowNumber) => ({
      rowNumber,
      vessel_name: obj["vessel_name"] ?? "",
      work_order_number: obj["work_order_number"] ?? "",
      description: obj["description"] ?? "",
      location: obj["location"] ?? "",
      work_scope: obj["work_scope"] ?? "",
      quantity: obj["quantity"] ?? "",
      uom: obj["uom"] ?? "",
      is_additional_wo_details: obj["is_additional_wo_details"] ?? "no",
      planned_start_date: obj["planned_start_date"] ?? "",
      target_close_date: obj["target_close_date"] ?? "",
      period_close_target: obj["period_close_target"] ?? "",
      progress_percentage: obj["progress_percentage"] ?? "",
      progress_report_date: obj["progress_report_date"] ?? "",
      progress_notes: obj["progress_notes"] ?? "",
    }),
  );

  return { woRows, wdRows };
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORK PROGRESS IMPORT
// ═══════════════════════════════════════════════════════════════════════════════
//
// Unlike Work Orders/Work Details, work_progress is an open history table —
// every manual entry is its own dated row. Bulk import instead keeps at most
// ONE row per work item (marked is_imported = true) and updates it in place
// on every re-upload, so re-importing an evolving tracking sheet doesn't
// pile up duplicate rows. Manual entries (is_imported = false) are never
// read or written by this import path.

export const WORK_PROGRESS_TEMPLATE_HEADERS = [
  "vessel_name",
  "work_order_number",
  "description",
  "progress_percentage",
  "report_date",
  "notes",
];

const WP_HEADER_LABELS: Record<string, string> = {
  vessel_name: "Vessel Name *",
  work_order_number: "Work Order Number *",
  description: "Description *",
  progress_percentage: "Progress Percentage (%) *",
  report_date: "Report Date * (YYYY-MM-DD)",
  notes: "Notes",
};

export async function generateProgressTemplateXLSX(): Promise<Uint8Array> {
  const md = await getMasterData();
  const wos = await getSampleWorkOrders(1);
  const v1 = wos[0]?.vesselName ?? md.vesselNames[0] ?? "Example Vessel";
  const wo1 = wos[0]?.woNumber ?? "SY-2024-001";

  // description stays a placeholder even though vessel/WO are real — this
  // import UPDATES a matched item's progress in place, so a sample row must
  // never form a complete real triple that could silently overwrite a real
  // item's progress if left unedited.
  const sampleRows: (string | number)[][] = [
    [v1, wo1, "Example — replace with a real work item's exact description", 75, "2024-06-20", "Progress per weekly site report"],
    [v1, wo1, "Example — another real work item's exact description", 40, "2024-06-20", ""],
  ];

  const wb = new ExcelJS.Workbook();
  const headers = WORK_PROGRESS_TEMPLATE_HEADERS.map((h) => WP_HEADER_LABELS[h] ?? h);
  const ws = addDataSheet(wb, "Work Progress", headers, [22, 18, 42, 12, 24, 32], sampleRows);
  applyListValidation(ws, "A", 2, 300, refFormula("Ref - Vessels", md.vesselNames.length));

  buildInstructionsSheet(wb, "IMPORT TEMPLATE — WORK PROGRESS", [
    ["HOW THIS IS DIFFERENT FROM WORK ORDER / WORK DETAILS IMPORT"],
    ["Each work item (matched by vessel + work order number + description) keeps only ONE imported progress row."],
    ["Re-uploading this file later updates that same row instead of adding a new one."],
    ["If a row's report_date is OLDER than what's already stored for that work item, it is skipped — the newer value is kept."],
    ["Manually-entered progress (via the Add Progress screen) is separate history and is never changed by this import."],
    [""],
    ["COLUMN REFERENCE"],
    ["vessel_name *", "Has a dropdown — must match an existing vessel"],
    ["work_order_number *", "Must match an existing Shipyard WO Number for that vessel"],
    ["description *", "Must match an existing Work Details description for that work order"],
    ["progress_percentage *", "0–100"],
    ["report_date *", "YYYY-MM-DD"],
    ["notes", "Optional free text"],
  ]);

  // Work order numbers and work-detail descriptions are existing-data
  // lookups, not small fixed dropdowns — only the vessel list gets one, to
  // keep the sheet a manageable size.
  addExcelRefSheet(wb, "Ref - Vessels", "Vessel Name", md.vesselNames);

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

// CSV has no dropdowns/reference sheets to speak of, so this sample stays a
// plain illustrative placeholder (unlike the XLSX generator above, which
// pulls real names).
const WP_CSV_TEMPLATE_SAMPLE: string[][] = [
  [
    "KM. Mawar Laut",
    "SY-2024-001",
    "Hull cleaning and anti-fouling painting",
    "75",
    "2024-06-20",
    "Progress per weekly site report",
  ],
  [
    "KM. Mawar Laut",
    "SY-2024-001",
    "Main engine overhaul and bearing replacement",
    "40",
    "2024-06-20",
    "",
  ],
];

export function generateProgressTemplateCSV(): string {
  const lines: string[] = [WORK_PROGRESS_TEMPLATE_HEADERS.join(",")];
  for (const row of WP_CSV_TEMPLATE_SAMPLE) {
    lines.push(row.map((v) => (v.includes(",") ? `"${v}"` : v)).join(","));
  }
  return lines.join("\n");
}

export interface ParsedProgressRow {
  rowNumber: number;
  vessel_name: string;
  work_order_number: string;
  description: string;
  progress_percentage: string;
  report_date: string;
  notes: string;
}

export type ProgressRowAction = "insert" | "update" | "skip_older";

export interface ValidatedProgressRow extends ParsedProgressRow {
  errors: string[];
  work_details_id?: number;
  action?: ProgressRowAction;
  existing_progress_id?: number;
  existing_progress_percentage?: number;
  existing_report_date?: string;
}

/**
 * Normalise an XLSX header cell into snake_case for matching against the
 * template's raw column keys: strips parenthesised hints (e.g. "(optional)"),
 * then any other stray punctuation (e.g. "*", "?", "%"), before lowercasing
 * and joining words with underscores.
 */
function normaliseHeader(h: string): string {
  return String(h)
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function parseProgressCSV(csvText: string): ParsedProgressRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, "_"),
  );
  const rows: ParsedProgressRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] ?? "";
    });
    rows.push({
      rowNumber: i + 1,
      vessel_name: obj["vessel_name"] ?? "",
      work_order_number: obj["work_order_number"] ?? "",
      description: obj["description"] ?? "",
      progress_percentage: obj["progress_percentage"] ?? "",
      report_date: obj["report_date"] ?? "",
      notes: obj["notes"] ?? "",
    });
  }
  return rows;
}

export function parseProgressXLSX(buffer: ArrayBuffer): ParsedProgressRow[] {
  const wb = XLSX.read(buffer, { type: "array", cellText: true, cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    defval: "",
    raw: false,
  });
  if (raw.length < 2) return [];

  const headers = (raw[0] as string[]).map(normaliseHeader);
  const rows: ParsedProgressRow[] = [];
  for (let i = 1; i < raw.length; i++) {
    const values = raw[i] as string[];
    if (values.every((v) => String(v).trim() === "")) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = String(values[idx] ?? "").trim();
    });
    rows.push({
      rowNumber: i + 1,
      vessel_name: obj["vessel_name"] ?? "",
      work_order_number: obj["work_order_number"] ?? "",
      description: obj["description"] ?? "",
      progress_percentage: obj["progress_percentage"] ?? "",
      report_date: obj["report_date"] ?? "",
      notes: obj["notes"] ?? "",
    });
  }
  return rows;
}

export async function validateProgressRows(
  rows: ParsedProgressRow[],
): Promise<ValidatedProgressRow[]> {
  const md = await getMasterData();
  const vessels = md.vesselsByNorm;
  const workOrders = md.workOrdersByKey;
  const workDetails = md.workDetailsByKey;

  // The single is_imported row per work_details_id, if one already exists.
  // Always queried fresh (never cached) — this is exactly what "keep only
  // the latest" depends on being accurate.
  const existingImported = new Map<
    number,
    { id: number; progress_percentage: number; report_date: string }
  >();
  const wdIds = [...workDetails.values()];
  if (wdIds.length > 0) {
    const { data } = await supabase
      .from("work_progress")
      .select("id, work_details_id, progress_percentage, report_date")
      .eq("is_imported", true)
      .is("deleted_at", null)
      .in("work_details_id", wdIds);
    for (const row of data ?? []) {
      existingImported.set(row.work_details_id as number, {
        id: row.id as number,
        progress_percentage: row.progress_percentage as number,
        report_date: row.report_date as string,
      });
    }
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  return rows.map((row) => {
    const errors: string[] = [];
    let vessel_id: number | undefined;
    let work_order_id: number | undefined;
    let work_details_id: number | undefined;

    if (!row.vessel_name.trim()) {
      errors.push("Vessel name is required");
    } else {
      vessel_id = vessels.get(row.vessel_name.toLowerCase().trim());
      if (!vessel_id) errors.push(`Vessel not found: "${row.vessel_name}"`);
    }

    if (!row.work_order_number.trim()) {
      errors.push("Work order number is required");
    } else if (vessel_id) {
      work_order_id = workOrders.get(
        `${vessel_id}:${row.work_order_number.toLowerCase().trim()}`,
      );
      if (!work_order_id)
        errors.push(
          `Work order not found: "${row.work_order_number}" for vessel "${row.vessel_name}"`,
        );
    }

    if (!row.description.trim()) {
      errors.push("Description is required");
    } else if (work_order_id) {
      work_details_id = workDetails.get(
        `${work_order_id}:${row.description.toLowerCase().trim()}`,
      );
      if (!work_details_id)
        errors.push(
          `Work detail not found: "${row.description}" for work order "${row.work_order_number}"`,
        );
    }

    const pct = parseFloat(row.progress_percentage);
    if (!row.progress_percentage.trim() || isNaN(pct) || pct < 0 || pct > 100) {
      errors.push("Progress % must be a number between 0 and 100");
    }

    if (!row.report_date.trim()) {
      errors.push("Report date is required");
    } else if (!dateRegex.test(row.report_date)) {
      errors.push("Report date must be YYYY-MM-DD format");
    }

    let action: ProgressRowAction | undefined;
    let existing_progress_id: number | undefined;
    let existing_progress_percentage: number | undefined;
    let existing_report_date: string | undefined;

    if (errors.length === 0 && work_details_id !== undefined) {
      const existing = existingImported.get(work_details_id);
      if (!existing) {
        action = "insert";
      } else {
        existing_progress_id = existing.id;
        existing_progress_percentage = existing.progress_percentage;
        existing_report_date = existing.report_date;
        if (row.report_date < existing.report_date) {
          action = "skip_older";
          errors.push(
            `Skipped — existing recorded progress (${existing.report_date}, ${existing.progress_percentage}%) is newer than this row's date (${row.report_date})`,
          );
        } else {
          action = "update";
        }
      }
    }

    return {
      ...row,
      errors,
      work_details_id,
      action,
      existing_progress_id,
      existing_progress_percentage,
      existing_report_date,
    };
  });
}

export async function importWorkProgress(
  validatedRows: ValidatedProgressRow[],
  userId: number,
): Promise<ImportResult> {
  const validRows = validatedRows.filter((r) => r.errors.length === 0);
  const failedRows: ImportResult["failedRows"] = [];
  if (validRows.length === 0) return { successCount: 0, failedRows };

  const toInsert = validRows.filter((r) => r.action === "insert");
  const toUpdate = validRows.filter((r) => r.action === "update");

  let successCount = 0;

  if (toInsert.length > 0) {
    const insertData = toInsert.map((row) => ({
      work_details_id: row.work_details_id!,
      progress_percentage: parseFloat(row.progress_percentage),
      report_date: row.report_date,
      notes: row.notes.trim() || null,
      user_id: userId,
      is_imported: true,
    }));
    const { error } = await supabase.from("work_progress").insert(insertData);
    if (error) {
      for (const row of toInsert)
        failedRows.push({ rowNumber: row.rowNumber, error: error.message });
    } else {
      successCount += toInsert.length;
    }
  }

  // Each update targets a different existing row with different new values —
  // no single unique key to upsert() on, so these run individually.
  // Each update targets a different row by its own unique id, so these are
  // independent and safe to run concurrently instead of one at a time.
  const updateResults = await Promise.all(
    toUpdate.map((row) =>
      supabase
        .from("work_progress")
        .update({
          progress_percentage: parseFloat(row.progress_percentage),
          report_date: row.report_date,
          notes: row.notes.trim() || null,
          user_id: userId,
        })
        .eq("id", row.existing_progress_id!)
        .then(({ error }) => ({ row, error })),
    ),
  );
  for (const { row, error } of updateResults) {
    if (error) {
      failedRows.push({ rowNumber: row.rowNumber, error: error.message });
    } else {
      successCount += 1;
    }
  }

  return { successCount, failedRows };
}
