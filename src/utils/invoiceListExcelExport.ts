import ExcelJS from "exceljs";
import type { Invoice } from "../types/invoiceTypes";
import { downloadXlsx } from "./excelShared";

// The overall invoice data, for Finance to filter, sum and pivot in Excel:
//  - "Invoices": one row per invoice. Amounts, dates and counts are real
//    numbers/dates; the totals row uses SUBTOTAL, so it follows whatever filter
//    is applied in Excel.
//  - "Ready to Invoice": the BASTPs that are ready but not invoiced yet.
//  - "Summary": paid / unpaid / waiting, overall, per vessel and per client
//    company, as formulas over the two sheets above.

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE5E7EB" }, // gray-200
};
const TOTAL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF3F4F6" }, // gray-100
};
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

const MONEY = "#,##0";
const DATE = "dd mmm yyyy";

type ColumnKind = "text" | "date" | "money" | "count";
interface Column {
  header: string;
  width: number;
  kind: ColumnKind;
}

const COLUMNS: Column[] = [
  { header: "No", width: 5, kind: "count" },
  { header: "Invoice Number", width: 26, kind: "text" },
  { header: "Invoice Date", width: 13, kind: "date" },
  { header: "Client Company", width: 30, kind: "text" },
  { header: "Vessel", width: 28, kind: "text" },
  { header: "Vessel Type", width: 9, kind: "text" },
  { header: "BASTP Number", width: 30, kind: "text" },
  { header: "BASTP Date", width: 13, kind: "date" },
  { header: "Faktur Number", width: 24, kind: "text" },
  { header: "Due Date", width: 13, kind: "date" },
  { header: "Delivery Date", width: 13, kind: "date" },
  { header: "Collection Date", width: 13, kind: "date" },
  { header: "Receiver", width: 20, kind: "text" },
  { header: "Payment Status", width: 12, kind: "text" },
  { header: "Payment Date", width: 13, kind: "date" },
  { header: "General Services (IDR)", width: 19, kind: "money" },
  { header: "Work Details (IDR)", width: 19, kind: "money" },
  { header: "Subtotal Before Tax (IDR)", width: 21, kind: "money" },
  { header: "PPN (IDR)", width: 14, kind: "money" },
  { header: "PPh 23 (IDR)", width: 15, kind: "money" },
  { header: "Grand Total After Tax (IDR)", width: 23, kind: "money" },
  { header: "Work Details (count)", width: 11, kind: "count" },
  { header: "Remarks", width: 34, kind: "text" },
];

const colIndex = (header: string) =>
  COLUMNS.findIndex((c) => c.header === header) + 1;

// An Excel date for a "YYYY-MM-DD" value (or a timestamp's local date), built
// in UTC so it is not shifted a day by the viewer's time zone. Anything that
// isn't a date is kept as text, so nothing typed into a text column is lost.
function toExcelDate(value: string | null | undefined): Date | string | null {
  if (!value) return null;
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (plain) return new Date(Date.UTC(+plain[1], +plain[2] - 1, +plain[3]));
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
  );
}

const sum = (values: (number | null | undefined)[]) =>
  values.reduce<number>((total, v) => total + (Number(v) || 0), 0);

// e.g. "13 November 2026 at 17:22 GMT+8" — local time, with its offset.
const formatExportMoment = (date: Date) =>
  date.toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

// A BASTP that is ready for invoicing but has no invoice yet.
export interface ReadyBastp {
  number: string;
  date: string;
  ready_for_invoice_date?: string | null;
  form_penawaran_storage_path?: string | null;
  total_work_details?: number | null;
  vessel?: { name: string; type: string; company: string } | null;
}

export async function buildInvoiceListWorkbook(
  invoices: Invoice[],
  readyBastps: ReadyBastp[] = [],
): Promise<Uint8Array> {
  const exportedAt = new Date();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Daily Report Shipyard";
  wb.created = exportedAt;

  const ws = wb.addWorksheet("Invoices", {
    views: [{ state: "frozen", ySplit: 1, xSplit: 2 }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  ws.columns = COLUMNS.map((c) => ({ width: c.width }));

  const header = ws.addRow(COLUMNS.map((c) => c.header));
  header.height = 32;
  header.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = BORDER;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });

  // Newest invoice first, like the list page.
  const dateKey = (inv: Invoice) => inv.invoice_date || inv.created_at || "";
  const sorted = [...invoices].sort(
    (a, b) =>
      dateKey(b).localeCompare(dateKey(a)) ||
      (b.invoice_number || "").localeCompare(a.invoice_number || ""),
  );

  sorted.forEach((inv, index) => {
    const generalServices = sum(
      (inv.bastp?.general_services || []).map((s) => s.payment_price),
    );
    const workDetails = sum(
      (inv.invoice_work_details || []).map((w) => w.payment_price),
    );
    const values: (string | number | Date | null)[] = [
      index + 1,
      inv.invoice_number || "",
      toExcelDate(inv.invoice_date || inv.created_at) as Date | string | null,
      inv.company || "",
      inv.bastp?.vessel?.name || "",
      inv.bastp?.vessel?.type || "",
      inv.bastp?.number || "",
      toExcelDate(inv.bastp?.date) as Date | string | null,
      inv.faktur_number || "",
      toExcelDate(inv.due_date) as Date | string | null,
      toExcelDate(inv.delivery_date) as Date | string | null,
      toExcelDate(inv.collection_date) as Date | string | null,
      inv.receiver_name || "",
      inv.payment_status ? "Paid" : "Unpaid",
      inv.payment_status
        ? (toExcelDate(inv.payment_date) as Date | string | null)
        : null,
      generalServices,
      workDetails,
      Number(inv.total_price_before) || 0,
      Number(inv.ppn) || 0,
      Number(inv.pph_23) || 0,
      Number(inv.total_price_after) || 0,
      (inv.invoice_work_details || []).length,
      inv.remarks || "",
    ];
    const row = ws.addRow(values);
    COLUMNS.forEach((column, i) => {
      const cell = row.getCell(i + 1);
      cell.border = BORDER;
      cell.alignment = { vertical: "top", wrapText: column.kind === "text" };
      if (column.kind === "money") cell.numFmt = MONEY;
      if (column.kind === "date") {
        cell.numFmt = DATE;
        cell.alignment = { vertical: "top", horizontal: "center" };
      }
      if (column.kind === "count")
        cell.alignment = { vertical: "top", horizontal: "center" };
    });
    const status = row.getCell(colIndex("Payment Status"));
    status.alignment = { vertical: "top", horizontal: "center" };
    status.font = {
      bold: true,
      color: { argb: inv.payment_status ? "FF166534" : "FF92400E" },
    };
  });

  const firstData = 2;
  const lastData = sorted.length + 1;
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(lastData, 1), column: COLUMNS.length },
  };

  // Totals follow the Excel filter (SUBTOTAL ignores hidden rows).
  const totals = ws.addRow([]);
  const letter = (header: string) => ws.getColumn(colIndex(header)).letter;
  const labelCell = totals.getCell(1);
  ws.mergeCells(totals.number, 1, totals.number, colIndex("Payment Date"));
  labelCell.value = "TOTAL (rows shown)";
  labelCell.alignment = { horizontal: "right", vertical: "middle" };
  COLUMNS.forEach((column, i) => {
    const cell = totals.getCell(i + 1);
    cell.border = BORDER;
    cell.fill = TOTAL_FILL;
    cell.font = { bold: true };
    if (column.kind === "money" || column.header === "Work Details (count)") {
      const cellLetter = letter(column.header);
      const result = sorted.reduce((total, inv) => {
        switch (column.header) {
          case "General Services (IDR)":
            return total + sum((inv.bastp?.general_services || []).map((s) => s.payment_price));
          case "Work Details (IDR)":
            return total + sum((inv.invoice_work_details || []).map((w) => w.payment_price));
          case "Subtotal Before Tax (IDR)":
            return total + (Number(inv.total_price_before) || 0);
          case "PPN (IDR)":
            return total + (Number(inv.ppn) || 0);
          case "PPh 23 (IDR)":
            return total + (Number(inv.pph_23) || 0);
          case "Grand Total After Tax (IDR)":
            return total + (Number(inv.total_price_after) || 0);
          default:
            return total + (inv.invoice_work_details || []).length;
        }
      }, 0);
      cell.value = {
        formula: `SUBTOTAL(109,${cellLetter}${firstData}:${cellLetter}${lastData})`,
        result,
      };
      cell.numFmt = column.kind === "money" ? MONEY : "0";
      cell.alignment = {
        horizontal: column.kind === "money" ? "right" : "center",
        vertical: "middle",
      };
    }
  });

  // ── Ready to Invoice sheet ───────────────────────────────────────────
  const ready = wb.addWorksheet("Ready to Invoice", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const READY_COLUMNS: { header: string; width: number }[] = [
    { header: "No", width: 5 },
    { header: "BASTP Number", width: 32 },
    { header: "BASTP Date", width: 13 },
    { header: "Ready Since", width: 13 },
    { header: "Days Waiting", width: 10 },
    { header: "Vessel", width: 28 },
    { header: "Vessel Type", width: 9 },
    { header: "Company", width: 30 },
    { header: "Work Details (count)", width: 11 },
    { header: "Form Penawaran", width: 12 },
  ];
  ready.columns = READY_COLUMNS.map((c) => ({ width: c.width }));
  const readyHead = ready.addRow(READY_COLUMNS.map((c) => c.header));
  readyHead.height = 32;
  readyHead.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = BORDER;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  // Longest-waiting first: those are the ones to invoice first.
  const readySince = (b: ReadyBastp) => b.ready_for_invoice_date || b.date || "";
  const readySorted = [...readyBastps].sort((a, b) =>
    readySince(a).localeCompare(readySince(b)),
  );
  const todayUtc = (() => {
    const now = new Date();
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  })();
  readySorted.forEach((bastp, index) => {
    const since = toExcelDate(readySince(bastp));
    const sinceMs = since instanceof Date ? since.getTime() : todayUtc;
    const rowNumber = index + 2;
    const row = ready.addRow([
      index + 1,
      bastp.number,
      toExcelDate(bastp.date),
      since,
      null,
      bastp.vessel?.name || "",
      bastp.vessel?.type || "",
      bastp.vessel?.company || "",
      bastp.total_work_details ?? 0,
      bastp.form_penawaran_storage_path ? "Yes" : "No",
    ]);
    // Live, so the count keeps growing each day the file stays open.
    row.getCell(5).value = {
      formula: `TODAY()-D${rowNumber}`,
      result: Math.round((todayUtc - sinceMs) / 86400000),
    };
    row.getCell(3).numFmt = DATE;
    row.getCell(4).numFmt = DATE;
    row.getCell(5).numFmt = "0";
    READY_COLUMNS.forEach((_, i) => {
      const cell = row.getCell(i + 1);
      cell.border = BORDER;
      cell.alignment = {
        vertical: "top",
        horizontal: [0, 2, 3, 4, 6, 8, 9].includes(i) ? "center" : "left",
      };
    });
    row.getCell(10).font = {
      bold: true,
      color: {
        argb: bastp.form_penawaran_storage_path ? "FF166534" : "FF92400E",
      },
    };
  });
  const lastReady = Math.max(readySorted.length + 1, 2);
  if (readySorted.length > 0) {
    ready.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: lastReady, column: READY_COLUMNS.length },
    };
  }

  // ── Summary sheet ────────────────────────────────────────────────────
  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { width: 38 },
    { width: 30 },
    { width: 13 },
    { width: 13 },
    { width: 13 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 16 },
  ];
  const SUMMARY_COLS = 9;
  const styleHead = (row: ExcelJS.Row, cols = SUMMARY_COLS) => {
    row.height = 32;
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
      cell.border = BORDER;
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
    }
  };
  const sectionTitle = (text: string, note?: string) => {
    const row = summary.addRow([text]);
    summary.mergeCells(row.number, 1, row.number, SUMMARY_COLS);
    row.getCell(1).font = { bold: true, size: 13 };
    if (note) {
      const noteRow = summary.addRow([note]);
      summary.mergeCells(noteRow.number, 1, noteRow.number, SUMMARY_COLS);
      noteRow.getCell(1).font = { italic: true, color: { argb: "FF6B7280" } };
    }
  };

  sectionTitle("Invoice summary");
  // When this file was made: the figures below are as of this moment, and
  // "Days Waiting" on the Ready to Invoice sheet counts up from it.
  const exportedRow = summary.addRow([
    `Exported on ${formatExportMoment(exportedAt)}`,
  ]);
  summary.mergeCells(exportedRow.number, 1, exportedRow.number, SUMMARY_COLS);
  exportedRow.getCell(1).font = { bold: true, color: { argb: "FF374151" } };
  const sourceRow = summary.addRow([
    "Data is as of that moment; invoices or payments changed afterwards are not included.",
  ]);
  summary.mergeCells(sourceRow.number, 1, sourceRow.number, SUMMARY_COLS);
  sourceRow.getCell(1).font = { italic: true, color: { argb: "FF6B7280" } };
  summary.addRow([]);

  // Ranges over the Invoices and Ready to Invoice sheets.
  const inv = (header: string) =>
    `Invoices!$${letter(header)}$${firstData}:$${letter(header)}$${lastData}`;
  const rdy = (col: string) =>
    `'Ready to Invoice'!$${col}$2:$${col}$${lastReady}`;
  const PAID = "Paid";
  const UNPAID = "Unpaid";
  const statusOf = (i: Invoice) => (i.payment_status ? PAID : UNPAID);
  const total = (list: Invoice[], pick: (i: Invoice) => number | undefined) =>
    sum(list.map(pick));
  const money = (cell: ExcelJS.Cell) => {
    cell.numFmt = MONEY;
    cell.alignment = { horizontal: "right" };
  };
  const borderAll = (row: ExcelJS.Row, cols = SUMMARY_COLS) => {
    for (let c = 1; c <= cols; c++) row.getCell(c).border = BORDER;
  };

  // ── 1. Overview ──
  sectionTitle("Overview");
  styleHead(
    summary.addRow([
      "",
      "",
      "Invoices",
      "",
      "",
      "Subtotal Before Tax (IDR)",
      "Grand Total After Tax (IDR)",
    ]),
    7,
  );
  const overviewRow = (label: string, status: string | null) => {
    const list =
      status === null ? sorted : sorted.filter((i) => statusOf(i) === status);
    const row = summary.addRow([label]);
    const crit = status === null ? null : `"${status}"`;
    const statusRange = inv("Payment Status");
    const beforeRange = inv("Subtotal Before Tax (IDR)");
    const afterRange = inv("Grand Total After Tax (IDR)");
    row.getCell(3).value = {
      formula:
        crit === null
          ? `COUNTA(${inv("Invoice Number")})`
          : `COUNTIF(${statusRange},${crit})`,
      result: list.length,
    };
    row.getCell(6).value = {
      formula:
        crit === null
          ? `SUM(${beforeRange})`
          : `SUMIF(${statusRange},${crit},${beforeRange})`,
      result: total(list, (i) => i.total_price_before),
    };
    row.getCell(7).value = {
      formula:
        crit === null
          ? `SUM(${afterRange})`
          : `SUMIF(${statusRange},${crit},${afterRange})`,
      result: total(list, (i) => i.total_price_after),
    };
    row.getCell(3).alignment = { horizontal: "center" };
    money(row.getCell(6));
    money(row.getCell(7));
    borderAll(row, 7);
    return row;
  };
  overviewRow("Paid invoices", PAID);
  overviewRow("Unpaid invoices", UNPAID);
  const allRow = overviewRow("All invoices", null);
  for (let c = 1; c <= 7; c++) {
    allRow.getCell(c).font = { bold: true };
    allRow.getCell(c).fill = TOTAL_FILL;
  }
  const readyRow = summary.addRow(["BASTP ready to invoice (no invoice yet)"]);
  readyRow.getCell(3).value = {
    formula: readySorted.length > 0 ? `COUNTA(${rdy("B")})` : "0",
    result: readySorted.length,
  };
  readyRow.getCell(3).alignment = { horizontal: "center" };
  readyRow.getCell(1).font = { bold: true, color: { argb: "FF92400E" } };
  borderAll(readyRow, 7);
  summary.addRow([]);

  // ── 2 & 3. Breakdowns (per vessel / per client company) ──
  interface Group {
    key: string;
    extra: string;
    invoices: Invoice[];
    ready: ReadyBastp[];
  }
  const breakdown = (
    title: string,
    note: string,
    keyLabel: string,
    extraLabel: string,
    groups: Group[],
    invoiceKeyHeader: string,
    readyKeyCol: string,
  ) => {
    sectionTitle(title, note);
    styleHead(
      summary.addRow([
        keyLabel,
        extraLabel,
        "Invoices",
        "Paid",
        "Unpaid",
        "Paid Amount (IDR)",
        "Unpaid Amount (IDR)",
        "Total Amount (IDR)",
        "BASTP Ready to Invoice",
      ]),
    );
    const keyRange = inv(invoiceKeyHeader);
    const statusRange = inv("Payment Status");
    const amountRange = inv("Grand Total After Tax (IDR)");
    const paidOf = (g: Group) => g.invoices.filter((i) => statusOf(i) === PAID);
    const unpaidOf = (g: Group) =>
      g.invoices.filter((i) => statusOf(i) === UNPAID);

    const firstRow = summary.rowCount + 1;
    groups.forEach((g) => {
      const row = summary.addRow([g.key, g.extra]);
      const r = row.number;
      row.getCell(3).value = {
        formula: `COUNTIF(${keyRange},$A${r})`,
        result: g.invoices.length,
      };
      row.getCell(4).value = {
        formula: `COUNTIFS(${keyRange},$A${r},${statusRange},"${PAID}")`,
        result: paidOf(g).length,
      };
      row.getCell(5).value = {
        formula: `COUNTIFS(${keyRange},$A${r},${statusRange},"${UNPAID}")`,
        result: unpaidOf(g).length,
      };
      row.getCell(6).value = {
        formula: `SUMIFS(${amountRange},${keyRange},$A${r},${statusRange},"${PAID}")`,
        result: total(paidOf(g), (i) => i.total_price_after),
      };
      row.getCell(7).value = {
        formula: `SUMIFS(${amountRange},${keyRange},$A${r},${statusRange},"${UNPAID}")`,
        result: total(unpaidOf(g), (i) => i.total_price_after),
      };
      row.getCell(8).value = {
        formula: `F${r}+G${r}`,
        result: total(g.invoices, (i) => i.total_price_after),
      };
      row.getCell(9).value = {
        formula:
          readySorted.length > 0
            ? `COUNTIF(${rdy(readyKeyCol)},$A${r})`
            : "0",
        result: g.ready.length,
      };
      [3, 4, 5, 9].forEach(
        (c) => (row.getCell(c).alignment = { horizontal: "center" }),
      );
      [6, 7, 8].forEach((c) => money(row.getCell(c)));
      if (g.ready.length > 0)
        row.getCell(9).font = { bold: true, color: { argb: "FF92400E" } };
      borderAll(row);
    });
    const lastRow = summary.rowCount;

    const totalRow = summary.addRow(["Total"]);
    const cached = [
      groups.reduce((n, g) => n + g.invoices.length, 0),
      groups.reduce((n, g) => n + paidOf(g).length, 0),
      groups.reduce((n, g) => n + unpaidOf(g).length, 0),
      groups.reduce(
        (n, g) => n + total(paidOf(g), (i) => i.total_price_after),
        0,
      ),
      groups.reduce(
        (n, g) => n + total(unpaidOf(g), (i) => i.total_price_after),
        0,
      ),
      groups.reduce(
        (n, g) => n + total(g.invoices, (i) => i.total_price_after),
        0,
      ),
      groups.reduce((n, g) => n + g.ready.length, 0),
    ];
    [3, 4, 5, 6, 7, 8, 9].forEach((c, i) => {
      const columnLetter = summary.getColumn(c).letter;
      const cell = totalRow.getCell(c);
      cell.value = {
        formula:
          groups.length > 0
            ? `SUM(${columnLetter}${firstRow}:${columnLetter}${lastRow})`
            : "0",
        result: cached[i],
      };
      if (c >= 6 && c <= 8) money(cell);
      else cell.alignment = { horizontal: "center" };
    });
    for (let c = 1; c <= SUMMARY_COLS; c++) {
      totalRow.getCell(c).font = { bold: true };
      totalRow.getCell(c).fill = TOTAL_FILL;
      totalRow.getCell(c).border = BORDER;
    }
    summary.addRow([]);
  };

  const byKey = <T,>(items: T[], keyOf: (item: T) => string) => {
    const map = new Map<string, T[]>();
    items.forEach((item) => {
      const key = keyOf(item) || "(none)";
      map.set(key, [...(map.get(key) || []), item]);
    });
    return map;
  };
  // Busiest first: most invoices plus BASTPs waiting, then by name.
  const sortGroups = (groups: Group[]) =>
    groups.sort(
      (a, b) =>
        b.invoices.length +
          b.ready.length -
          (a.invoices.length + a.ready.length) || a.key.localeCompare(b.key),
    );

  // Per vessel: the vessel's company next to it; vessels with only a BASTP
  // waiting (no invoice yet) are listed too.
  const vesselInvoices = byKey(sorted, (i) => i.bastp?.vessel?.name || "");
  const vesselReady = byKey(readySorted, (b) => b.vessel?.name || "");
  const vesselGroups: Group[] = [
    ...new Set([...vesselInvoices.keys(), ...vesselReady.keys()]),
  ].map((key) => ({
    key,
    extra:
      vesselInvoices.get(key)?.[0]?.bastp?.vessel?.company ||
      vesselReady.get(key)?.[0]?.vessel?.company ||
      "",
    invoices: vesselInvoices.get(key) || [],
    ready: vesselReady.get(key) || [],
  }));
  breakdown(
    "By vessel",
    "Invoices per vessel, paid and unpaid, and BASTPs of that vessel still waiting to be invoiced.",
    "Vessel",
    "Company",
    sortGroups(vesselGroups),
    "Vessel",
    "F",
  );

  // Per client company, as written on the invoice; a BASTP still waiting is
  // counted under its vessel's company.
  const companyOf = (i: Invoice) => i.company || i.bastp?.vessel?.company || "";
  const companyInvoices = byKey(sorted, companyOf);
  const companyReady = byKey(readySorted, (b) => b.vessel?.company || "");
  const companyGroups: Group[] = [
    ...new Set([...companyInvoices.keys(), ...companyReady.keys()]),
  ].map((key) => {
    const vessels = new Set(
      [
        ...(companyInvoices.get(key) || []).map((i) => i.bastp?.vessel?.name),
        ...(companyReady.get(key) || []).map((b) => b.vessel?.name),
      ].filter(Boolean),
    );
    return {
      key,
      extra: `${vessels.size} vessel${vessels.size === 1 ? "" : "s"}`,
      invoices: companyInvoices.get(key) || [],
      ready: companyReady.get(key) || [],
    };
  });
  breakdown(
    "By client company",
    "Invoices per client company (the company on the invoice), paid and unpaid, and BASTPs still waiting.",
    "Client Company",
    "Vessels",
    sortGroups(companyGroups),
    "Client Company",
    "H",
  );

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

// The file name carries the date and time, so several exports in a day (or
// one saved a week ago) can be told apart: Invoices_2026-11-13_1722.xlsx
export function downloadInvoiceListWorkbook(buffer: Uint8Array) {
  const now = new Date();
  const date = now.toLocaleDateString("en-CA");
  const time = now
    .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    .replace(":", "");
  downloadXlsx(buffer, `Invoices_${date}_${time}.xlsx`);
}
