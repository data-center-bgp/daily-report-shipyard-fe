import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { supabase } from "../lib/supabase";
import { ActivityLogService } from "../services/activityLogService";
import { PLAN_UOM_OPTIONS } from "../constants/planUnits";
import type { PlanRow } from "../types/dockingPlan.types";
import {
  addDataSheet,
  addExcelRefSheet,
  applyListValidation,
  buildInstructionsSheet,
  normaliseHeader,
  refFormula,
} from "./importHandler";

// Excel import for a docking plan: a "Work Orders" sheet and a "Work Details"
// sheet, laid out like the combined import template. A plan already knows its
// vessel and docking type, so those columns are gone; instead each work detail
// names its work order with a short reference ("WO-1") from the first sheet.

export interface PlanLookup {
  id: number;
  label: string;
}

export const PLAN_IMPORT_MAX_ROWS = 500;

const WO_HEADER_LABELS: Record<string, string> = {
  work_order_ref: "Work Order Ref *",
  work_location: "Work Location",
  customer_wo_number: "Customer WO Number",
  notes: "Notes",
};
const WO_HEADERS = Object.keys(WO_HEADER_LABELS);

const WD_HEADER_LABELS: Record<string, string> = {
  work_order_ref: "Work Order Ref *",
  description: "Description *",
  location: "Location *",
  work_scope: "Work Scope *",
  quantity: "Quantity *",
  uom: "UOM *",
  planned_start_date: "Planned Start Date (YYYY-MM-DD)",
  target_close_date: "Target Close Date (YYYY-MM-DD)",
  notes: "Notes",
};
const WD_HEADERS = Object.keys(WD_HEADER_LABELS);

// ─── Template ────────────────────────────────────────────────────────────────

export async function generatePlanTemplateXLSX(
  scopes: PlanLookup[],
  locations: PlanLookup[],
): Promise<Uint8Array> {
  const scopeNames = scopes.map((s) => s.label);
  const locationNames = locations.map((l) => l.label);
  const scope = (i: number) => scopeNames[i] ?? scopeNames[0] ?? "";
  const loc = (i: number) => locationNames[i] ?? locationNames[0] ?? "";

  const wb = new ExcelJS.Workbook();

  addDataSheet(
    wb,
    "Work Orders",
    WO_HEADERS.map((h) => WO_HEADER_LABELS[h]),
    [18, 24, 24, 40],
    [
      ["WO-1", "Shipyard dock", "CUST-WO-001", "Example. Replace with your own work order"],
      ["WO-2", "Shipyard dock", "", ""],
    ],
  );

  const wdWs = addDataSheet(
    wb,
    "Work Details",
    WD_HEADERS.map((h) => WD_HEADER_LABELS[h]),
    [18, 44, 20, 22, 10, 8, 30, 30, 30],
    [
      ["WO-1", "Example. Hull blasting and repainting, underwater area", loc(0), scope(0), 1, "Ls", "2027-02-16", "2027-02-24", ""],
      ["WO-1", "Example. Steel plate renewal, shell plating", loc(1), scope(1), 12, "Pcs", "2027-02-17", "2027-02-26", "Plates supplied by owner"],
      ["WO-2", "Example. Sea chest overhaul", loc(2), scope(2), 4, "Unit", "", "", ""],
    ],
  );
  applyListValidation(wdWs, "C", 2, 300, refFormula("Ref - Locations", locationNames.length));
  applyListValidation(wdWs, "D", 2, 300, refFormula("Ref - Work Scopes", scopeNames.length));
  applyListValidation(wdWs, "F", 2, 300, refFormula("Ref - UOM", PLAN_UOM_OPTIONS.length));

  buildInstructionsSheet(wb, "IMPORT TEMPLATE: DOCKING PLAN WORK ORDERS & WORK DETAILS", [
    ["HOW TO USE"],
    ["1. Fill in the 'Work Orders' sheet first, from row 2. Give each work order a short reference, like WO-1."],
    ["2. Fill in the 'Work Details' sheet next, from row 2. Put the reference of its work order in the first column."],
    ["3. Location, Work Scope and UOM have dropdowns. Pick a value from the list."],
    ["4. Dates are optional. Use YYYY-MM-DD (for example 2027-02-16)."],
    ["5. Everything in the file is added to the plan. Work orders already in the plan are not changed."],
    ["6. Delete the example rows before you upload."],
    [""],
    ["WORK ORDER COLUMNS"],
    ["Work Order Ref *", "Your own label. Must be unique in this file. Not saved in the plan."],
    ["Work Location", "Optional. Where the work is done"],
    ["Customer WO Number", "Optional"],
    ["Notes", "Optional"],
    [""],
    ["WORK DETAIL COLUMNS"],
    ["Work Order Ref *", "Must match a Work Order Ref on the 'Work Orders' sheet"],
    ["Description *", "What the work is"],
    ["Location *", "Must match an existing Location"],
    ["Work Scope *", "Must match an existing Work Scope"],
    ["Quantity *", "A number, 0 or more"],
    ["UOM *", `One of: ${PLAN_UOM_OPTIONS.join(", ")}`],
    ["Planned Start Date", "Optional. YYYY-MM-DD"],
    ["Target Close Date", "Optional. YYYY-MM-DD, not before the start date"],
    ["Notes", "Optional"],
  ]);

  addExcelRefSheet(wb, "Ref - Locations", "Location", locationNames);
  addExcelRefSheet(wb, "Ref - Work Scopes", "Work Scope", scopeNames);
  addExcelRefSheet(wb, "Ref - UOM", "UOM", PLAN_UOM_OPTIONS);

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

interface RawRow {
  rowNumber: number;
  values: Record<string, string>;
}

function readSheet(wb: XLSX.WorkBook, name: string, fallbackIndex: number): RawRow[] | null {
  const sheetName =
    wb.SheetNames.find((n) => n.trim().toLowerCase() === name.toLowerCase()) ??
    wb.SheetNames[fallbackIndex];
  const ws = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!ws) return null;
  const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "", raw: false });
  if (raw.length === 0) return [];
  const headers = (raw[0] as string[]).map(normaliseHeader);
  const rows: RawRow[] = [];
  for (let i = 1; i < raw.length; i++) {
    const cells = raw[i] as string[];
    if (cells.every((v) => String(v).trim() === "")) continue;
    const values: Record<string, string> = {};
    headers.forEach((h, idx) => {
      values[h] = String(cells[idx] ?? "").trim();
    });
    rows.push({ rowNumber: i + 1, values });
  }
  return rows;
}

export interface PlanImportWorkOrder {
  rowNumber: number;
  ref: string;
  work_location: string | null;
  customer_wo_number: string | null;
  notes: string | null;
}

export interface PlanImportWorkDetail {
  rowNumber: number;
  ref: string;
  description: string;
  work_scope_id: number;
  location_id: number;
  quantity: number;
  uom: string;
  planned_start_date: string | null;
  target_close_date: string | null;
  notes: string | null;
}

export interface PlanImportIssue {
  sheet: "Work Orders" | "Work Details" | "File";
  row: number | null;
  message: string;
}

export interface PlanImportPreview {
  workOrders: PlanImportWorkOrder[];
  details: PlanImportWorkDetail[];
  errors: PlanImportIssue[];
  warnings: PlanImportIssue[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (value: string) => {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};
const norm = (s: string) => s.trim().toLowerCase();

export function readPlanWorkbook(
  buffer: ArrayBuffer,
  scopes: PlanLookup[],
  locations: PlanLookup[],
): PlanImportPreview {
  const errors: PlanImportIssue[] = [];
  const warnings: PlanImportIssue[] = [];
  const workOrders: PlanImportWorkOrder[] = [];
  const details: PlanImportWorkDetail[] = [];

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array", cellText: true, cellDates: false });
  } catch {
    return {
      workOrders,
      details,
      errors: [{ sheet: "File", row: null, message: "This file could not be read. Upload the .xlsx template." }],
      warnings,
    };
  }

  const woRaw = readSheet(wb, "Work Orders", 0);
  const wdRaw = readSheet(wb, "Work Details", 1);
  if (woRaw === null || wdRaw === null) {
    errors.push({
      sheet: "File",
      row: null,
      message: "The file needs a 'Work Orders' sheet and a 'Work Details' sheet. Download the template to see the layout.",
    });
    return { workOrders, details, errors, warnings };
  }
  if (woRaw.length === 0) {
    errors.push({ sheet: "Work Orders", row: null, message: "The sheet has no work orders." });
  }
  if (woRaw.length > PLAN_IMPORT_MAX_ROWS || wdRaw.length > PLAN_IMPORT_MAX_ROWS) {
    errors.push({
      sheet: "File",
      row: null,
      message: `A file can hold at most ${PLAN_IMPORT_MAX_ROWS} rows per sheet.`,
    });
    return { workOrders, details, errors, warnings };
  }

  const scopeByName = new Map(scopes.map((s) => [norm(s.label), s.id]));
  const locationByName = new Map(locations.map((l) => [norm(l.label), l.id]));
  const uomByName = new Map(PLAN_UOM_OPTIONS.map((u) => [norm(u), u]));

  // Work orders
  const refs = new Map<string, number>();
  woRaw.forEach(({ rowNumber, values }) => {
    const ref = values["work_order_ref"] ?? "";
    if (!ref) {
      errors.push({ sheet: "Work Orders", row: rowNumber, message: "Work Order Ref is required." });
      return;
    }
    if (refs.has(norm(ref))) {
      errors.push({
        sheet: "Work Orders",
        row: rowNumber,
        message: `Work Order Ref "${ref}" is already used on row ${refs.get(norm(ref))}.`,
      });
      return;
    }
    refs.set(norm(ref), rowNumber);
    workOrders.push({
      rowNumber,
      ref,
      work_location: values["work_location"] || null,
      customer_wo_number: values["customer_wo_number"] || null,
      notes: values["notes"] || null,
    });
  });

  // Work details
  const detailCount = new Map<string, number>();
  wdRaw.forEach(({ rowNumber, values }) => {
    const problems: string[] = [];
    const ref = values["work_order_ref"] ?? "";
    if (!ref) {
      problems.push("Work Order Ref is required.");
    } else if (!refs.has(norm(ref))) {
      problems.push(`Work Order Ref "${ref}" is not on the 'Work Orders' sheet.`);
    }

    const description = values["description"] ?? "";
    if (!description) problems.push("Description is required.");

    const locationName = values["location"] ?? "";
    const location_id = locationByName.get(norm(locationName));
    if (!locationName) problems.push("Location is required.");
    else if (!location_id) problems.push(`Location not found: "${locationName}".`);

    const scopeName = values["work_scope"] ?? "";
    const work_scope_id = scopeByName.get(norm(scopeName));
    if (!scopeName) problems.push("Work Scope is required.");
    else if (!work_scope_id) problems.push(`Work Scope not found: "${scopeName}".`);

    const quantityText = values["quantity"] ?? "";
    const quantity = Number(quantityText.replace(/,/g, ""));
    if (quantityText === "" || Number.isNaN(quantity) || quantity < 0) {
      problems.push("Quantity must be a number, 0 or more.");
    }

    const uomText = values["uom"] ?? "";
    const uom = uomByName.get(norm(uomText));
    if (!uomText) problems.push("UOM is required.");
    else if (!uom) problems.push(`UOM "${uomText}" is not one of ${PLAN_UOM_OPTIONS.join(", ")}.`);

    const start = values["planned_start_date"] ?? "";
    const close = values["target_close_date"] ?? "";
    if (start && !isRealDate(start)) problems.push("Planned Start Date must be YYYY-MM-DD.");
    if (close && !isRealDate(close)) problems.push("Target Close Date must be YYYY-MM-DD.");
    if (isRealDate(start) && isRealDate(close) && close < start) {
      problems.push("Target Close Date cannot be before the Planned Start Date.");
    }

    if (problems.length > 0) {
      problems.forEach((message) => errors.push({ sheet: "Work Details", row: rowNumber, message }));
      return;
    }

    detailCount.set(norm(ref), (detailCount.get(norm(ref)) ?? 0) + 1);
    details.push({
      rowNumber,
      ref,
      description,
      work_scope_id: work_scope_id as number,
      location_id: location_id as number,
      quantity,
      uom: uom as string,
      planned_start_date: start || null,
      target_close_date: close || null,
      notes: values["notes"] || null,
    });
  });

  workOrders.forEach((wo) => {
    if (!detailCount.get(norm(wo.ref))) {
      warnings.push({
        sheet: "Work Orders",
        row: wo.rowNumber,
        message: `Work order "${wo.ref}" has no work details. It must get some before the plan can be submitted.`,
      });
    }
  });

  return { workOrders, details, errors, warnings };
}

// ─── Saving ──────────────────────────────────────────────────────────────────

// Adds the file's work orders and details after the ones already in the plan.
// Work orders go in first; if the details then fail, those work orders are
// taken out again so the plan is not left with empty ones.
export async function importIntoPlan(
  plan: PlanRow,
  preview: PlanImportPreview,
  existingWorkOrderCount: number,
): Promise<{ workOrders: number; details: number }> {
  const { workOrders, details } = preview;

  const { data: created, error: woError } = await supabase
    .from("docking_plan_work_orders")
    .insert(
      workOrders.map((wo, i) => ({
        plan_id: plan.id,
        work_location: wo.work_location,
        customer_wo_number: wo.customer_wo_number,
        notes: wo.notes,
        sort_order: existingWorkOrderCount + i,
      })),
    )
    .select("id, sort_order");
  if (woError) throw woError;

  const idBySort = new Map((created || []).map((r) => [r.sort_order as number, r.id as number]));
  const indexByRef = new Map(workOrders.map((wo, i) => [norm(wo.ref), i]));
  const nextDetailSort = new Map<number, number>();

  const detailRows = details.map((d) => {
    const index = indexByRef.get(norm(d.ref)) as number;
    const sort = nextDetailSort.get(index) ?? 0;
    nextDetailSort.set(index, sort + 1);
    return {
      plan_work_order_id: idBySort.get(existingWorkOrderCount + index),
      description: d.description,
      work_scope_id: d.work_scope_id,
      location_id: d.location_id,
      quantity: d.quantity,
      uom: d.uom,
      planned_start_date: d.planned_start_date,
      target_close_date: d.target_close_date,
      notes: d.notes,
      sort_order: sort,
    };
  });

  if (detailRows.length > 0) {
    const { error: wdError } = await supabase.from("docking_plan_work_details").insert(detailRows);
    if (wdError) {
      await supabase
        .from("docking_plan_work_orders")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", [...idBySort.values()]);
      throw wdError;
    }
  }

  await ActivityLogService.logActivity({
    action: "create",
    tableName: "docking_plans",
    recordId: plan.id,
    newData: { work_orders: workOrders.length, work_details: details.length },
    description: `Imported ${workOrders.length} work order${workOrders.length === 1 ? "" : "s"} and ${details.length} work detail${details.length === 1 ? "" : "s"} into plan ${plan.plan_name}`,
  });

  return { workOrders: workOrders.length, details: details.length };
}
