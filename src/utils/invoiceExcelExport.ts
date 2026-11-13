import ExcelJS from "exceljs";
import type { Invoice } from "../types/invoiceTypes";
import {
  UOM_LABEL,
  formatTons,
  groupServicesForInvoice,
  isTonService,
  serviceUom,
} from "./generalServices";
import {
  formatMaterialDimensionDisplay,
  formatMaterialTotal,
} from "./materialCalculations";
import { downloadXlsx, loadImage } from "./excelShared";

// Same content and order as the printed invoice (InvoicePrint), laid out as
// one editable sheet. Amounts and quantities sit in their own numeric cells
// so Finance can sum or correct them in Excel; the two subtotals are live
// SUM formulas over their tables.

const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE5E7EB" }, // gray-200
};
const SUBTOTAL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF9FAFB" }, // gray-50
};
const BEFORE_TAX_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEFF6FF" }, // blue-50
};
const GRAND_TOTAL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF0FDF4" }, // green-50
};

// A..G: No | Description | Location | Qty | Unit | Unit Price | Amount
const COLUMN_WIDTHS = [6, 52, 20, 10, 9, 18, 20];
const LAST_COL = COLUMN_WIDTHS.length;
const AMOUNT_COL = LAST_COL;
// Rendered width of the sheet in pixels — the header/footer images are scaled
// to span it (about 7px per character of column width).
const SHEET_WIDTH_PX = COLUMN_WIDTHS.reduce((a, b) => a + b, 0) * 7 + 40;
const MONEY_FORMAT = "#,##0";

const GRAY = { color: { argb: "FF4B5563" } };

// Excel does not auto-fit the height of rows with merged cells, and cannot be
// asked to from here, so rows with wrapped text get an estimated height: one
// 15pt line per line of text, each wrapping after about `charsPerLine`.
const rowHeightFor = (text: string, charsPerLine: number) => {
  const lines = text
    .split("\n")
    .reduce((n, line) => n + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  // Excel's maximum row height is 409.5pt; a taller value makes it repair the file.
  return Math.min(409, Math.max(15, lines * 15));
};

const formatLongDate = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "-";

const formatShortDate = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "-";

export async function buildInvoiceWorkbook(
  invoice: Invoice,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Daily Report Shipyard";
  wb.created = new Date();
  const ws = wb.addWorksheet("Invoice", {
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  ws.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  const blank = () => ws.addRow([]);

  // A row with one merged cell across [fromCol, toCol].
  const mergedRow = (
    text: ExcelJS.CellValue,
    fromCol: number,
    toCol: number,
    style?: Partial<ExcelJS.Style>,
  ) => {
    const row = ws.addRow([]);
    ws.mergeCells(row.number, fromCol, row.number, toCol);
    const cell = row.getCell(fromCol);
    cell.value = text;
    cell.alignment = { wrapText: true, vertical: "top", ...(style?.alignment || {}) };
    if (style?.font) cell.font = style.font;
    if (style?.fill) cell.fill = style.fill;
    return row;
  };

  const addBanner = (image: { base64: string; width: number; height: number }) => {
    const height = Math.round((SHEET_WIDTH_PX * image.height) / image.width);
    const row = ws.addRow([]);
    row.height = height * 0.75 + 2;
    const id = wb.addImage({ base64: image.base64, extension: "png" });
    ws.addImage(id, {
      tl: { col: 0, row: row.number - 1 },
      ext: { width: SHEET_WIDTH_PX, height },
      editAs: "oneCell",
    });
  };

  const tableHeader = (labels: string[], mergeBC = false) => {
    const row = ws.addRow(labels);
    if (mergeBC) ws.mergeCells(row.number, 2, row.number, 3);
    for (let c = 1; c <= LAST_COL; c++) {
      const cell = row.getCell(c);
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
      cell.border = BORDER;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }
    return row;
  };

  const borderRow = (row: ExcelJS.Row) => {
    for (let c = 1; c <= LAST_COL; c++) {
      const cell = row.getCell(c);
      cell.border = BORDER;
      cell.alignment = { vertical: "top", wrapText: true, ...(cell.alignment || {}) };
    }
  };

  // "Subtotal ...:" label across A..F and a live SUM over the table's amounts.
  const subtotalRow = (label: string, firstRow: number, lastRow: number, total: number) => {
    const row = ws.addRow([]);
    ws.mergeCells(row.number, 1, row.number, AMOUNT_COL - 1);
    const labelCell = row.getCell(1);
    labelCell.value = label;
    labelCell.font = { bold: true };
    labelCell.alignment = { horizontal: "right", vertical: "middle" };
    const amount = row.getCell(AMOUNT_COL);
    amount.value = {
      formula: `SUM(${ws.getColumn(AMOUNT_COL).letter}${firstRow}:${ws.getColumn(AMOUNT_COL).letter}${lastRow})`,
      result: total,
    };
    amount.numFmt = MONEY_FORMAT;
    amount.font = { bold: true };
    amount.alignment = { horizontal: "right", vertical: "middle" };
    for (let c = 1; c <= LAST_COL; c++) {
      row.getCell(c).border = BORDER;
      row.getCell(c).fill = SUBTOTAL_FILL;
    }
  };

  const [headerImage, footerImage] = await Promise.all([
    loadImage("/images/invoice-header.png"),
    loadImage("/images/invoice-footer.png"),
  ]);

  // ── Title ────────────────────────────────────────────────────────────
  if (headerImage) addBanner(headerImage);
  else
    mergedRow("PT BAROKAH GALANGAN PERKASA", 1, LAST_COL, {
      alignment: { horizontal: "center" },
      font: { bold: true, size: 12 },
    });
  blank();
  mergedRow("INVOICE", 1, LAST_COL, {
    alignment: { horizontal: "center" },
    font: { bold: true, size: 16 },
  });
  mergedRow(invoice.invoice_number || "Draft Invoice", 1, LAST_COL, {
    alignment: { horizontal: "center" },
    font: { size: 11, ...GRAY },
  });
  blank();

  // ── Invoice info: client on the left, vessel on the right ─────────────
  const labelled = (label: string, value: string): ExcelJS.CellRichTextValue => ({
    richText: [
      { text: `${label}: `, font: GRAY },
      { text: value, font: { bold: true } },
    ],
  });
  const info: [string, string][] = [
    ["Client Company", invoice.company || "-"],
    ["UP", "ACCOUNTING"],
    ["Invoice Date", formatLongDate(invoice.invoice_date || invoice.created_at)],
  ];
  info.forEach(([label, value], i) => {
    const row = ws.addRow([]);
    ws.mergeCells(row.number, 1, row.number, 4);
    row.getCell(1).value = labelled(label, value);
    row.getCell(1).alignment = { wrapText: true, vertical: "top" };
    if (i === 0) {
      ws.mergeCells(row.number, 5, row.number, LAST_COL);
      row.getCell(5).value = labelled("Vessel Name", invoice.bastp?.vessel?.name || "-");
      row.getCell(5).alignment = { horizontal: "right", vertical: "top", wrapText: true };
    }
  });
  blank();

  // ── General services ─────────────────────────────────────────────────
  const serviceLines = groupServicesForInvoice(invoice.bastp?.general_services || []);
  if (serviceLines.length > 0) {
    mergedRow("General Services", 1, LAST_COL, { font: { bold: true } });
    tableHeader(
      ["No.", "Service Name", "", "Qty", "Unit", "Unit Price (IDR)", "Amount (IDR)"],
      true,
    );
    let firstRow = 0;
    let lastRow = 0;
    let total = 0;
    serviceLines.forEach((line, index) => {
      const service = line.service;
      // Ton services list each delivery under the name; Kali / Ls and day
      // services show their remarks, as the printed invoice does.
      const details = isTonService(service)
        ? line.rows.map(
            (row) =>
              `${formatShortDate(row.start_date)} · ${formatTons(row.quantity)} ton${
                row.remarks ? ` · ${row.remarks}` : ""
              }`,
          )
        : service.remarks
          ? [service.remarks]
          : [];
      const name = [service.service_type?.service_name || "-", ...details].join("\n");
      const row = ws.addRow([
        index + 1,
        name,
        "",
        line.quantity,
        UOM_LABEL[serviceUom(service)],
        line.unit_price,
        line.payment_price,
      ]);
      ws.mergeCells(row.number, 2, row.number, 3);
      row.height = rowHeightFor(name, 66); // columns B:C together
      borderRow(row);
      row.getCell(1).alignment = { vertical: "top", horizontal: "left" };
      row.getCell(4).numFmt = "#,##0.##";
      row.getCell(4).alignment = { vertical: "top", horizontal: "center" };
      row.getCell(5).alignment = { vertical: "top", horizontal: "center" };
      row.getCell(6).numFmt = MONEY_FORMAT;
      row.getCell(7).numFmt = MONEY_FORMAT;
      row.getCell(7).font = { bold: true };
      if (firstRow === 0) firstRow = row.number;
      lastRow = row.number;
      total += Number(line.payment_price) || 0;
    });
    subtotalRow("Subtotal General Services:", firstRow, lastRow, total);
    blank();
  }

  // ── Work details ─────────────────────────────────────────────────────
  const workDetails = invoice.invoice_work_details || [];
  if (workDetails.length > 0) {
    mergedRow("Work Details", 1, LAST_COL, { font: { bold: true } });
    tableHeader([
      "No.",
      "Description",
      "Location",
      "Qty",
      "Unit",
      "Unit Price (IDR)",
      "Amount (IDR)",
    ]);
    let firstRow = 0;
    let lastRow = 0;
    let total = 0;
    workDetails.forEach((item, index) => {
      const wd = item.work_details;
      const lines = [
        `${wd?.description || "-"}${wd?.cancelled_at ? " (Cancelled)" : ""}`,
      ];
      if (wd?.work_scope?.work_scope) lines.push(wd.work_scope.work_scope);
      if (wd?.work_order?.shipyard_wo_number)
        lines.push(`WO: ${wd.work_order.shipyard_wo_number}`);
      (wd?.material_control || [])
        .filter((mc) => !mc.deleted_at)
        .forEach((mc) => {
          lines.push(
            `  - ${mc.material_list?.material || "Material"}${
              mc.material_list?.specification
                ? ` ${mc.material_list.specification}`
                : ""
            } (${formatMaterialDimensionDisplay(mc)}) — ${formatMaterialTotal(
              mc.total_amount ?? mc.amount,
            )} ${mc.uom}`,
          );
        });
      const row = ws.addRow([
        index + 1,
        lines.join("\n"),
        wd?.location?.location || "-",
        wd?.quantity ?? "",
        wd?.uom || "",
        item.unit_price || 0,
        item.payment_price || 0,
      ]);
      row.height = Math.max(
        rowHeightFor(lines.join("\n"), 48), // description column
        rowHeightFor(wd?.location?.location || "-", 18), // location column
      );
      borderRow(row);
      row.getCell(1).alignment = { vertical: "top", horizontal: "left" };
      row.getCell(4).numFmt = "#,##0.##";
      row.getCell(4).alignment = { vertical: "top", horizontal: "center" };
      row.getCell(5).alignment = { vertical: "top", horizontal: "center" };
      row.getCell(6).numFmt = MONEY_FORMAT;
      row.getCell(7).numFmt = MONEY_FORMAT;
      row.getCell(7).font = { bold: true };
      if (firstRow === 0) firstRow = row.number;
      lastRow = row.number;
      total += Number(item.payment_price) || 0;
    });
    subtotalRow("Subtotal Work Details:", firstRow, lastRow, total);
    blank();
  }

  // ── Totals ───────────────────────────────────────────────────────────
  const totalRow = (
    label: string,
    value: number,
    options: { fill?: ExcelJS.Fill; bold?: boolean; format?: string },
  ) => {
    const row = ws.addRow([]);
    ws.mergeCells(row.number, 1, row.number, AMOUNT_COL - 1);
    const labelCell = row.getCell(1);
    labelCell.value = label;
    labelCell.font = { bold: !!options.bold };
    labelCell.alignment = { horizontal: "right", vertical: "middle" };
    const amount = row.getCell(AMOUNT_COL);
    amount.value = value;
    amount.numFmt = options.format ?? MONEY_FORMAT;
    amount.font = { bold: !!options.bold };
    amount.alignment = { horizontal: "right", vertical: "middle" };
    for (let c = 1; c <= LAST_COL; c++) {
      row.getCell(c).border = BORDER;
      if (options.fill) row.getCell(c).fill = options.fill;
    }
  };
  totalRow("Subtotal (Before Tax):", invoice.total_price_before || 0, {
    fill: BEFORE_TAX_FILL,
    bold: true,
  });
  totalRow(
    invoice.ppn_applicable === false ? "PPN (Not Applied):" : "PPN (11%):",
    invoice.ppn || 0,
    { format: '"+ "#,##0' },
  );
  totalRow("PPh 23 (2% - Withholding Tax):", invoice.pph_23 || 0, {
    format: '"- "#,##0',
  });
  totalRow("Grand Total (After Tax):", invoice.total_price_after || 0, {
    fill: GRAND_TOTAL_FILL,
    bold: true,
  });
  blank();

  // ── Payment status and remarks ───────────────────────────────────────
  if (invoice.payment_status) {
    mergedRow(
      `Payment Received${
        invoice.payment_date ? ` — Paid on: ${formatLongDate(invoice.payment_date)}` : ""
      }`,
      1,
      LAST_COL,
      { font: { bold: true, color: { argb: "FF166534" } } },
    );
    blank();
  }
  if (invoice.remarks) {
    mergedRow("Remarks:", 1, LAST_COL, { font: { bold: true } });
    const remarks = mergedRow(invoice.remarks, 1, LAST_COL);
    remarks.height = rowHeightFor(invoice.remarks, 120);
    remarks.getCell(1).border = BORDER;
    blank();
  }

  // ── Payment details (left) and signatory (right) ─────────────────────
  const payment: ExcelJS.CellValue[] = [
    { richText: [{ text: "INVOICE PAYMENT CAN BE SENT TO:", font: { bold: true } }] },
    labelled("ON BEHALF OF", "PT BAROKAH GALANGAN PERKASA"),
    labelled("ACCOUNT NUMBER", "148-00-0025258-8"),
    labelled("BANK", "MANDIRI"),
    labelled("ADDRESS", "MULAWARMAN, SAMARINDA, INDONESIA"),
  ];
  payment.forEach((value, i) => {
    const row = ws.addRow([]);
    ws.mergeCells(row.number, 1, row.number, 4);
    row.getCell(1).value = value;
    ws.mergeCells(row.number, 5, row.number, LAST_COL);
    const right = row.getCell(5);
    right.alignment = { horizontal: "center", vertical: "bottom" };
    if (i === 0) {
      right.value = "PT BAROKAH GALANGAN PERKASA";
      right.font = { bold: true };
    }
    if (i === 3) {
      right.value = "KHUSNUL KHOTIMAH";
      right.font = { bold: true, underline: true };
    }
    // Space between the company name and the signatory's name to sign in.
    if (i === 1 || i === 2) row.height = 22;
  });
  blank();

  if (footerImage) addBanner(footerImage);
  mergedRow(
    `Printed on: ${new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`,
    1,
    LAST_COL,
    { alignment: { horizontal: "center" }, font: { size: 9, ...GRAY } },
  );

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

export function downloadInvoiceWorkbook(buffer: Uint8Array, invoiceNumber: string) {
  const safeName = (invoiceNumber || "Invoice").replace(/[^0-9A-Za-z-]+/g, "_");
  downloadXlsx(buffer, `Invoice_${safeName}.xlsx`);
}
