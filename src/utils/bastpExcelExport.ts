import ExcelJS from "exceljs";
import type { BASTPWithDetails } from "../types/bastp.types";
import {
  calcDays,
  formatBastpDate as formatDate,
  getBastpDocument,
} from "./bastpDocument";
import { isTonService, sortServices } from "./generalServices";
import { formatMaterialDimensionDisplay } from "./materialCalculations";

// Same content and order as the printed BASTP (BASTPPrint), laid out as one
// editable sheet. Quantities sit in their own numeric cells so they can be
// summed or corrected in Excel.

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
const CATEGORY_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF3F4F6" }, // gray-100
};
const LAST_COL = 5; // A..E: No | Description | Qty | Unit | Remarks
// Rendered width of columns A..E in pixels — the header/footer images are
// scaled to span it.
const SHEET_WIDTH_PX = 820;

// Same company header/footer images the printed BASTP uses (public/images).
// Returns null if one can't be loaded, so the export still works without it.
async function loadImage(
  path: string,
): Promise<{ base64: string; width: number; height: number } | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const size = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const img = new Image();
        img.onload = () =>
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = reject;
        img.src = base64;
      },
    );
    return { base64, ...size };
  } catch {
    return null;
  }
}

export async function buildBastpWorkbook(
  bastp: BASTPWithDetails,
): Promise<Uint8Array> {
  const { noDisplay, firstWorkOrder, hasDockingDates, categories } =
    getBastpDocument(bastp);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Daily Report Shipyard";
  wb.created = new Date();
  const ws = wb.addWorksheet("BASTP", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { width: 7 },
    { width: 60 },
    { width: 11 },
    { width: 9 },
    { width: 28 },
  ];

  const merged = (text: string, opts?: Partial<ExcelJS.Style>) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, LAST_COL);
    const cell = row.getCell(1);
    cell.alignment = { wrapText: true, vertical: "top", ...(opts?.alignment || {}) };
    if (opts?.font) cell.font = opts.font;
    return row;
  };
  const blank = () => ws.addRow([]);

  // Places an image across columns A..E on a spacer row tall enough for it.
  // Row heights are in points (0.75 pt per pixel).
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

  const [headerImage, footerImage] = await Promise.all([
    loadImage("/images/invoice-header.png"),
    loadImage("/images/invoice-footer.png"),
  ]);

  // ── Title ────────────────────────────────────────────────────────────
  merged("FM-OPS-04-06", { alignment: { horizontal: "right" }, font: { size: 8, bold: true } });
  if (headerImage) addBanner(headerImage);
  else
    merged("PT BAROKAH GALANGAN PERKASA", {
      alignment: { horizontal: "center" },
      font: { bold: true, size: 12 },
    });
  blank();
  merged("BERITA ACARA SERAH TERIMA PEKERJAAN", {
    alignment: { horizontal: "center" },
    font: { bold: true, size: 13, underline: true },
  });
  blank();

  // ── Header info (label | value pairs, two per row) ────────────────────
  const left: [string, string][] = [
    ["To", [bastp.to_name, bastp.to_role].filter(Boolean).join(" — ") || "-"],
    ["Name of Vessel", bastp.vessel?.name || "-"],
  ];
  if (hasDockingDates) {
    const docked =
      bastp.tanggal_naik_docking && bastp.tanggal_turun_docking
        ? ` (${calcDays(bastp.tanggal_naik_docking, bastp.tanggal_turun_docking)} Hari)`
        : "";
    const moored = bastp.tanggal_tambat_setelah_turun_dock
      ? ` (${calcDays(bastp.tanggal_tambat_setelah_turun_dock, bastp.date)} Hari)`
      : "";
    left.push(
      ["Tanggal Sandar", formatDate(bastp.tanggal_sandar)],
      ["Tanggal Naik Docking", formatDate(bastp.tanggal_naik_docking)],
      ["Tanggal Turun Docking", formatDate(bastp.tanggal_turun_docking) + docked],
      [
        "Tanggal Tambat Setelah Turun Dock",
        formatDate(bastp.tanggal_tambat_setelah_turun_dock) + moored,
      ],
    );
  }
  const right: [string, string][] = [
    ["Date", formatDate(bastp.date)],
    ["No.", noDisplay],
    ["No. Handover", bastp.number || "-"],
    ["Lokasi", firstWorkOrder?.work_location || "-"],
    ["Project Leader", firstWorkOrder?.kapro?.kapro_name || "-"],
    ["WO No. Customer", firstWorkOrder?.customer_wo_number || "-"],
    ["WO No. PPIC", firstWorkOrder?.shipyard_wo_number || "-"],
  ];
  // Left pair in A:B, right pair in C:E (label C, value D:E).
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const row = ws.addRow([
      left[i]?.[0] ? `${left[i][0]}:` : "",
      left[i]?.[1] ?? "",
      right[i]?.[0] ? `${right[i][0]}:` : "",
      right[i]?.[1] ?? "",
    ]);
    ws.mergeCells(row.number, 4, row.number, 5);
    row.getCell(1).font = { color: { argb: "FF4B5563" } };
    row.getCell(3).font = { color: { argb: "FF4B5563" } };
    row.getCell(2).font = { bold: true };
    row.getCell(4).font = { bold: true };
    [1, 2, 3, 4].forEach((c) => (row.getCell(c).alignment = { wrapText: true, vertical: "top" }));
  }
  blank();

  merged(
    `Pada tanggal ${formatDate(bastp.date)} telah di selesaikan pekerjaan ${
      firstWorkOrder?.work_type || ""
    } ${bastp.vessel?.name || ""} yang telah dilaksanakan di PT Barokah Galangan Perkasa, adapun detail pekerjaannya adalah sebagai berikut :`,
  ).height = 32;
  blank();

  const tableHeader = (labels: string[]) => {
    const row = ws.addRow(labels);
    row.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
      cell.border = BORDER;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
    return row;
  };
  const bordered = (row: ExcelJS.Row) => {
    for (let c = 1; c <= LAST_COL; c++) {
      const cell = row.getCell(c);
      cell.border = BORDER;
      cell.alignment = { vertical: "top", wrapText: true, ...(cell.alignment || {}) };
    }
    row.getCell(1).alignment = { horizontal: "center", vertical: "top" };
    row.getCell(3).alignment = { horizontal: "right", vertical: "top" };
    row.getCell(4).alignment = { horizontal: "center", vertical: "top" };
    return row;
  };

  // ── General services ──────────────────────────────────────────────────
  const services = sortServices(bastp.general_services || []);
  if (services.length > 0) {
    tableHeader(["No", "General Services", "Jumlah", "Satuan", "Remarks"]);
    services.forEach((service, index) => {
      const ton = isTonService(service);
      const date = ton
        ? formatDate(service.start_date)
        : service.start_date && service.close_date
          ? `${formatDate(service.start_date)} — ${formatDate(service.close_date)}`
          : "";
      const row = ws.addRow([
        index + 1,
        `${service.service_type?.service_name || "-"}${date ? `\n${date}` : ""}`,
        ton ? Number(service.quantity) || 0 : Number(service.total_days) || 0,
        ton ? "Ton" : "Hari",
        service.remarks || "",
      ]);
      bordered(row);
      if (ton) row.getCell(3).numFmt = "#,##0.##";
    });
    blank();
  }

  // ── Work items with their materials ─────────────────────────────────
  tableHeader(["No", "Work Order Description / Uraian Perintah Kerja", "QTY", "UOM", "Remarks"]);
  categories.forEach((category, categoryIndex) => {
    const catRow = bordered(
      ws.addRow([categoryIndex + 1, category.scopeName.toUpperCase(), "", "", ""]),
    );
    catRow.font = { bold: true };
    for (let c = 1; c <= LAST_COL; c++) catRow.getCell(c).fill = CATEGORY_FILL;

    category.items.forEach((item, itemIndex) => {
      bordered(
        ws.addRow([
          `${categoryIndex + 1}.${itemIndex + 1}`,
          item.description,
          Number(item.quantity) || 0,
          item.uom || "",
          "",
        ]),
      );
      (item.material_control || [])
        .filter((mc) => !mc.deleted_at)
        .forEach((mc) => {
          const name = [mc.material_list?.material || "Material", mc.material_list?.specification]
            .filter(Boolean)
            .join(" ");
          const row = bordered(
            ws.addRow([
              "",
              `   - ${name} (${formatMaterialDimensionDisplay(mc)})`,
              // Same 2-decimal rounding as the print's formatMaterialTotal
              Math.round((Number(mc.total_amount ?? mc.amount) || 0) * 100) / 100,
              mc.uom || "",
              "",
            ]),
          );
          row.getCell(2).font = { italic: true, color: { argb: "FF374151" } };
          row.getCell(3).numFmt = "#,##0.##";
        });
    });
  });
  blank();

  // ── Closing, place/date, signatories ─────────────────────────────────
  merged(
    "Demikian Berita Acara Serah Terima Pekerjaan ini dibuat sesuai dengan pekerjaan di kapal, dengan di tanda tanganinya BASTP ini maka kedua belah pihak menyatakan seluruh pekerjaan kapal telah selesai dan dengan ini Pihak galangan menyerahkan kembali kapal kepada pemilik kapal atau perwakilan yang telah ditunjuk, Terima kasih atas kepercayaan dan kerjasama yang telah terjalin,",
  ).height = 48;
  blank();
  merged(`Samarinda, ${formatDate(bastp.date)}`);
  blank();

  // Signatory blocks in B, C:D, E — mirrors the print's three columns.
  const signRow = (values: [string, string, string], font?: Partial<ExcelJS.Font>) => {
    const row = ws.addRow(["", values[0], values[1], "", values[2]]);
    ws.mergeCells(row.number, 3, row.number, 4);
    [2, 3, 5].forEach((c) => {
      row.getCell(c).alignment = { horizontal: "center", wrapText: true };
      if (font) row.getCell(c).font = font;
    });
    return row;
  };
  signRow(["Di Serahkan Oleh,", "Di Terima Oleh,", "Di Saksikan Oleh,"]);
  signRow(["Submitted by,", "Received By,", "Witnessed by,"], { italic: true });
  ws.addRow([]).height = 45; // space to sign
  signRow(["Hendra Muzaki", bastp.to_name || "-", "Prasetya Abdillah"], {
    bold: true,
    underline: true,
  });
  signRow(["Marketing & PPIC Department Head", "Operation Head", "General Manager"]);

  if (footerImage) {
    blank();
    addBanner(footerImage);
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

export function downloadBastpWorkbook(buffer: Uint8Array, bastpNumber: string) {
  const safeName = (bastpNumber || "BASTP").replace(/[^0-9A-Za-z-]+/g, "_");
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `BASTP_${safeName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
