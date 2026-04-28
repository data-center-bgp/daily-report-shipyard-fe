import { supabase } from "../lib/supabase";
import * as XLSX from "xlsx";

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
  is_additional_wo_details: "Additional WO? (yes/no)",
  planned_start_date: "Planned Start Date * (YYYY-MM-DD)",
  target_close_date: "Target Close Date * (YYYY-MM-DD)",
  period_close_target: "Period Close Target *",
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

export function generateTemplateXLSX(): Uint8Array {
  const wb = XLSX.utils.book_new();

  // Build rows: header labels row + data rows
  const labelRow = WORK_DETAILS_TEMPLATE_HEADERS.map(
    (h) => HEADER_LABELS[h] ?? h,
  );
  const dataRows = WORK_DETAILS_TEMPLATE_SAMPLE.map((row) =>
    WORK_DETAILS_TEMPLATE_HEADERS.map((_, i) => row[i] ?? ""),
  );

  const wsData = [labelRow, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws["!cols"] = [
    { wch: 22 }, // vessel_name
    { wch: 18 }, // work_order_number
    { wch: 42 }, // description
    { wch: 18 }, // location
    { wch: 18 }, // work_scope
    { wch: 10 }, // quantity
    { wch: 8 }, // uom
    { wch: 22 }, // is_additional_wo_details
    { wch: 28 }, // planned_start_date
    { wch: 28 }, // target_close_date
    { wch: 22 }, // period_close_target
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Work Details");

  // Instructions sheet
  const instructions = [
    ["IMPORT TEMPLATE — WORK DETAILS"],
    [""],
    ["INSTRUCTIONS"],
    [
      "1. Fill in the 'Work Details' sheet starting from row 2 (do not change row 1 headers).",
    ],
    ["2. Fields marked with * are required."],
    [
      "3. vessel_name must exactly match a vessel in the system (case-insensitive).",
    ],
    [
      "4. work_order_number must match an existing WO for that vessel (Shipyard WO Number).",
    ],
    ["5. location must match an existing Location record (case-insensitive)."],
    [
      "6. work_scope must match an existing Work Scope record (case-insensitive).",
    ],
    ["7. quantity must be a positive number."],
    ["8. Dates must be in YYYY-MM-DD format (e.g. 2024-06-15)."],
    ["9. is_additional_wo_details: enter 'yes' or 'no'."],
    ["10. period_close_target: free text (e.g. 'Jul 2024')."],
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
  ];

  const wsInfo = XLSX.utils.aoa_to_sheet(instructions);
  wsInfo["!cols"] = [{ wch: 50 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, "Instructions");

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
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
  is_additional_wo: "Additional WO? (yes/no)",
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
export function generateCombinedTemplateXLSX(): Uint8Array {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Work Orders ──
  const woLabelRow = WORK_ORDER_TEMPLATE_HEADERS.map(
    (h) => WO_HEADER_LABELS[h] ?? h,
  );
  const woWs = XLSX.utils.aoa_to_sheet([woLabelRow, ...WO_TEMPLATE_SAMPLE]);
  woWs["!cols"] = [
    { wch: 22 }, { wch: 20 }, { wch: 26 }, { wch: 22 }, { wch: 24 },
    { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, woWs, "Work Orders");

  // ── Sheet 2: Work Details ──
  const wdLabelRow = WORK_DETAILS_TEMPLATE_HEADERS.map(
    (h) => HEADER_LABELS[h] ?? h,
  );
  const wdWs = XLSX.utils.aoa_to_sheet([wdLabelRow, ...WORK_DETAILS_TEMPLATE_SAMPLE]);
  wdWs["!cols"] = [
    { wch: 22 }, { wch: 18 }, { wch: 42 }, { wch: 18 }, { wch: 18 },
    { wch: 10 }, { wch: 8 }, { wch: 22 }, { wch: 28 }, { wch: 28 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wdWs, "Work Details");

  // ── Sheet 3: Instructions ──
  const instructions = [
    ["IMPORT TEMPLATE — WORK ORDERS & WORK DETAILS"],
    [""],
    ["HOW TO USE"],
    ["1. Fill in the 'Work Orders' sheet first (starting from row 2)."],
    ["2. Fill in the 'Work Details' sheet next (starting from row 2)."],
    ["3. vessel_name must match an existing vessel exactly (case-insensitive)."],
    ["4. work_order_number in 'Work Details' must match a shipyard_wo_number in 'Work Orders' sheet OR an existing WO in the system."],
    ["5. kapro_name, location, and work_scope must match existing records (case-insensitive). Leave kapro_name blank if not applicable."],
    ["6. Dates: YYYY-MM-DD format (e.g. 2024-06-15)."],
    ["7. is_additional_wo / is_additional_wo_details: enter 'yes' or 'no'."],
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
    ["work_type", "Optional free text (e.g. Repair, Maintenance)"],
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
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(instructions);
  wsInfo["!cols"] = [{ wch: 52 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, "Instructions");

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
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
}

export interface ValidatedImportRow extends ParsedImportRow {
  errors: string[];
  vessel_id?: number;
  work_order_id?: number;
  location_id?: number;
  work_scope_id?: number;
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

  // Normalise header: strip asterisks, parenthesised hints, extra spaces → snake_case
  const normaliseHeader = (h: string) =>
    String(h)
      .replace(/\*|\(.*?\)/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");

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
  const [vesselsRes, workOrdersRes, locationsRes, workScopesRes] =
    await Promise.all([
      supabase.from("vessel").select("id, name").is("deleted_at", null),
      supabase
        .from("work_order")
        .select("id, vessel_id, shipyard_wo_number")
        .is("deleted_at", null),
      supabase.from("location").select("id, location").is("deleted_at", null),
      supabase
        .from("work_scope")
        .select("id, work_scope")
        .is("deleted_at", null),
    ]);

  const vessels = new Map<string, number>();
  for (const v of vesselsRes.data ?? []) {
    vessels.set((v.name as string).toLowerCase().trim(), v.id as number);
  }

  // Build vessel id lookup first for work orders key
  const workOrders = new Map<string, number>();
  for (const wo of workOrdersRes.data ?? []) {
    const key = `${wo.vessel_id}:${(wo.shipyard_wo_number as string).toLowerCase().trim()}`;
    workOrders.set(key, wo.id as number);
  }

  const locations = new Map<string, number>();
  for (const l of locationsRes.data ?? []) {
    locations.set((l.location as string).toLowerCase().trim(), l.id as number);
  }

  const workScopes = new Map<string, number>();
  for (const ws of workScopesRes.data ?? []) {
    workScopes.set(
      (ws.work_scope as string).toLowerCase().trim(),
      ws.id as number,
    );
  }

  return { vessels, workOrders, locations, workScopes };
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

    return {
      ...row,
      errors,
      vessel_id,
      work_order_id,
      location_id,
      work_scope_id,
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

  const { error } = await supabase.from("work_details").insert(insertData);

  if (error) {
    // If bulk insert fails, report all rows as failed
    for (const row of validRows) {
      failedRows.push({ rowNumber: row.rowNumber, error: error.message });
    }
    return { successCount: 0, failedRows };
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
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim()); current = "";
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
    headers.forEach((h, idx) => { obj[h] = values[idx] ?? ""; });
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
  const wb = XLSX.read(buffer, { type: "array", cellText: true, cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "", raw: false });
  if (raw.length < 2) return [];

  const norm = (h: string) =>
    String(h).replace(/\*|\(.*?\)/g, "").trim().toLowerCase().replace(/\s+/g, "_");
  const headers = (raw[0] as string[]).map(norm);

  const rows: ParsedWORow[] = [];
  for (let i = 1; i < raw.length; i++) {
    const values = raw[i] as string[];
    if (values.every((v) => String(v).trim() === "")) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = String(values[idx] ?? "").trim(); });
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

export async function validateWORows(rows: ParsedWORow[]): Promise<ValidatedWORow[]> {
  const [vesselsRes, kaprosRes] = await Promise.all([
    supabase.from("vessel").select("id, name").is("deleted_at", null),
    supabase.from("kapro").select("id, kapro_name").is("deleted_at", null),
  ]);

  const vessels = new Map<string, number>();
  for (const v of vesselsRes.data ?? []) {
    vessels.set((v.name as string).toLowerCase().trim(), v.id as number);
  }
  const kapros = new Map<string, number>();
  for (const k of kaprosRes.data ?? []) {
    kapros.set((k.kapro_name as string).toLowerCase().trim(), k.id as number);
  }

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
        errors.push(`Duplicate WO number in this file: "${row.shipyard_wo_number}"`);
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
  const wb = XLSX.read(buffer, { type: "array", cellText: true, cellDates: false });

  const norm = (h: string) =>
    String(h).replace(/\*|\(.*?\)/g, "").trim().toLowerCase().replace(/\s+/g, "_");

  const parseSheet = <T>(
    sheetName: string,
    buildRow: (obj: Record<string, string>, rowNumber: number) => T,
  ): T[] => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return [];
    const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "", raw: false });
    if (raw.length < 2) return [];
    const headers = (raw[0] as string[]).map(norm);
    const rows: T[] = [];
    for (let i = 1; i < raw.length; i++) {
      const values = raw[i] as string[];
      if (values.every((v) => String(v).trim() === "")) continue;
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = String(values[idx] ?? "").trim(); });
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
    }),
  );

  return { woRows, wdRows };
}

