import { supabase } from "../lib/supabase";

export interface ExportOptions {
  format: "csv";
  filters?: {
    vesselIds?: number[];
  };
  /** Invoice prices, PPN, PPh 23 and totals (MASTER, FINANCE, MANAGER). */
  includeFinancialData?: boolean;
  /** The PPIC price of each work detail (MASTER and PPIC only). */
  includePpicPrice?: boolean;
}

export interface ExportData {
  data: ExportRow[];
  filename: string;
  totalRecords: number;
}

type Cell = string | number | boolean | null;
export type ExportRow = Record<string, Cell>;

// ── What comes back from the query ─────────────────────────────────────
// Every nested table is read with its deleted_at, and soft-deleted rows are
// dropped below: a nested filter on the query would only blank the embed.

interface SupabaseInvoice {
  id: number;
  deleted_at: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  created_at: string;
  faktur_number: string | null;
  due_date: string | null;
  delivery_date: string | null;
  collection_date: string | null;
  receiver_name: string | null;
  payment_status: boolean | null;
  payment_date: string | null;
  remarks: string | null;
  total_price_before?: number | null;
  ppn?: number | null;
  pph_23?: number | null;
  total_price_after?: number | null;
}

interface SupabaseBastp {
  id: number;
  deleted_at: string | null;
  number: string;
  date: string;
  status: string;
  invoice_details: SupabaseInvoice[] | null;
}

interface SupabaseBastpLink {
  id: number;
  deleted_at: string | null;
  materials_status: string | null;
  bastp: SupabaseBastp | null;
}

interface SupabaseInvoiceLine {
  deleted_at: string | null;
  invoice_details_id: number;
  unit_price?: number | null;
  payment_price?: number | null;
}

interface SupabaseProgress {
  id: number;
  deleted_at: string | null;
  progress_percentage: number;
  report_date: string | null;
  notes: string | null;
  is_imported: boolean | null;
  evidence_url: string | null;
}

interface SupabaseVerification {
  id: number;
  deleted_at: string | null;
  created_at: string;
  status: string | null;
  verification_date: string | null;
  verification_notes: string | null;
  is_auto_verified: boolean | null;
}

interface SupabaseWorkDetail {
  id: number;
  deleted_at: string | null;
  description: string;
  quantity: number | null;
  uom: string | null;
  is_additional_wo_details: boolean | null;
  spk_number: string | null;
  spkk_number: string | null;
  ptw_number: string | null;
  pic: string | null;
  planned_start_date: string | null;
  target_close_date: string | null;
  period_close_target: string | null;
  actual_start_date: string | null;
  actual_close_date: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  ppic_price?: number | null;
  location: { location: string } | null;
  work_scope: { work_scope: string } | null;
  work_progress: SupabaseProgress[] | null;
  work_verification: SupabaseVerification[] | null;
  bastp_work_details: SupabaseBastpLink[] | null;
  invoice_work_details: SupabaseInvoiceLine[] | null;
}

interface SupabaseWorkOrder {
  id: number;
  deleted_at: string | null;
  shipyard_wo_number: string | null;
  customer_wo_number: string | null;
  shipyard_wo_date: string | null;
  customer_wo_date: string | null;
  is_additional_wo: boolean | null;
  work_type: string | null;
  work_location: string | null;
  wo_print_number: number | null;
  project: { project_name: string; docking_type: string | null } | null;
  kapro: { kapro_name: string } | null;
  work_details: SupabaseWorkDetail[] | null;
}

interface SupabaseVessel {
  id: number;
  name: string;
  type: string | null;
  company: string | null;
  fleet_number: number | null;
  work_order: SupabaseWorkOrder[] | null;
}

// CSV generation utility. Every row is built with the same keys in the same
// order, so the header row (taken from the first row) fits all of them.
export const generateCSV = (data: ExportRow[]): string => {
  if (!data.length) return "";

  const headers = Object.keys(data[0]);
  return [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          if (value === null || value === undefined) return "";
          const text = String(value);
          return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    ),
  ].join("\n");
};

// Download file utility. `bom` adds a UTF-8 byte-order mark, which makes Excel
// read a CSV as UTF-8 (accented or non-Latin characters show correctly); it is
// opt-in because the import templates, which share this helper, are read back
// by our own CSV parser.
export const downloadFile = (
  content: string,
  filename: string,
  mimeType: string,
  options?: { bom?: boolean },
) => {
  const blob = new Blob([options?.bom ? `\uFEFF${content}` : content], {
    type: options?.bom ? `${mimeType};charset=utf-8` : mimeType,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const live = <T extends { deleted_at: string | null }>(rows: T[] | null) =>
  (rows || []).filter((row) => !row.deleted_at);

const SELECT_VESSEL = (includePpicPrice: boolean, includeFinancial: boolean) => `
  id,
  name,
  type,
  company,
  fleet_number,
  work_order (
    id,
    deleted_at,
    shipyard_wo_number,
    customer_wo_number,
    shipyard_wo_date,
    customer_wo_date,
    is_additional_wo,
    work_type,
    work_location,
    wo_print_number,
    project:project_id ( project_name, docking_type ),
    kapro:kapro_id ( kapro_name ),
    work_details (
      id,
      deleted_at,
      description,
      quantity,
      uom,
      is_additional_wo_details,
      spk_number,
      spkk_number,
      ptw_number,
      pic,
      planned_start_date,
      target_close_date,
      period_close_target,
      actual_start_date,
      actual_close_date,
      cancelled_at,
      cancellation_reason,
      notes,
      ${includePpicPrice ? "ppic_price," : ""}
      location:location_id ( location ),
      work_scope:work_scope_id ( work_scope ),
      work_progress (
        id,
        deleted_at,
        progress_percentage,
        report_date,
        notes,
        is_imported,
        evidence_url
      ),
      work_verification (
        id,
        deleted_at,
        created_at,
        status,
        verification_date,
        verification_notes,
        is_auto_verified
      ),
      bastp_work_details (
        id,
        deleted_at,
        materials_status,
        bastp:bastp_id (
          id,
          deleted_at,
          number,
          date,
          status,
          invoice_details (
            id,
            deleted_at,
            invoice_number,
            invoice_date,
            created_at,
            faktur_number,
            due_date,
            delivery_date,
            collection_date,
            receiver_name,
            payment_status,
            payment_date,
            remarks
            ${includeFinancial ? ", total_price_before, ppn, pph_23, total_price_after" : ""}
          )
        )
      ),
      invoice_work_details (
        deleted_at,
        invoice_details_id
        ${includeFinancial ? ", unit_price, payment_price" : ""}
      )
    )
  )
`;

// The vessels are read a few at a time: all of them in one request carries
// every work detail, progress report and invoice at once, which can run past
// the database's time limit.
const BATCH_SIZE = 6;

const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : (error as { message?: string })?.message || "Unknown error occurred";

// One row per progress report of every work detail, with the work order,
// project, latest verification, BASTP and invoice that work detail belongs
// to repeated on each. Work details without progress, work orders without
// work details and vessels without work orders still get a row, so nothing
// drops out of the file.
function buildRows(
  vessel: SupabaseVessel,
  includeFinancial: boolean,
  includePpicPrice: boolean,
): ExportRow[] {
  const rows: ExportRow[] = [];

  const row = (
    workOrder: SupabaseWorkOrder | null,
    detail: SupabaseWorkDetail | null,
    progress: SupabaseProgress | null,
  ): ExportRow => {
    const verification = detail
      ? live(detail.work_verification).sort(
          (a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id,
        )[0]
      : undefined;
    const link = detail
      ? live(detail.bastp_work_details).find((l) => l.bastp && !l.bastp.deleted_at)
      : undefined;
    const bastp = link?.bastp ?? null;
    const invoice = bastp ? live(bastp.invoice_details)[0] : undefined;
    const invoiceLine =
      detail && invoice
        ? live(detail.invoice_work_details).find(
            (l) => l.invoice_details_id === invoice.id,
          )
        : undefined;

    const out: ExportRow = {
      vessel_id: vessel.id,
      vessel_name: vessel.name,
      vessel_type: vessel.type,
      vessel_company: vessel.company,
      fleet_number: vessel.fleet_number,

      project_name: workOrder?.project?.project_name ?? null,
      docking_type: workOrder?.project?.docking_type ?? null,

      work_order_id: workOrder?.id ?? null,
      shipyard_wo_number: workOrder?.shipyard_wo_number ?? null,
      customer_wo_number: workOrder?.customer_wo_number ?? null,
      shipyard_wo_date: workOrder?.shipyard_wo_date ?? null,
      customer_wo_date: workOrder?.customer_wo_date ?? null,
      is_additional_wo: workOrder?.is_additional_wo ?? null,
      work_type: workOrder?.work_type ?? null,
      work_location: workOrder?.work_location ?? null,
      project_leader: workOrder?.kapro?.kapro_name ?? null,
      wo_print_number: workOrder?.wo_print_number ?? null,

      work_detail_id: detail?.id ?? null,
      work_description: detail?.description ?? null,
      work_scope: detail?.work_scope?.work_scope ?? null,
      work_detail_location: detail?.location?.location ?? null,
      quantity: detail?.quantity ?? null,
      uom: detail?.uom ?? null,
      is_additional_work_detail: detail?.is_additional_wo_details ?? null,
      spk_number: detail?.spk_number ?? null,
      spkk_number: detail?.spkk_number ?? null,
      ptw_number: detail?.ptw_number ?? null,
      work_pic: detail?.pic ?? null,
      planned_start_date: detail?.planned_start_date ?? null,
      target_close_date: detail?.target_close_date ?? null,
      period_close_target: detail?.period_close_target ?? null,
      actual_start_date: detail?.actual_start_date ?? null,
      actual_close_date: detail?.actual_close_date ?? null,
      cancelled_at: detail?.cancelled_at ?? null,
      cancellation_reason: detail?.cancellation_reason ?? null,
      work_detail_notes: detail?.notes ?? null,

      verification_status: verification?.status ?? null,
      verification_date: verification?.verification_date ?? null,
      verification_notes: verification?.verification_notes ?? null,
      verification_auto: verification?.is_auto_verified ?? null,

      progress_id: progress?.id ?? null,
      progress_percentage: progress?.progress_percentage ?? 0,
      report_date: progress?.report_date ?? null,
      progress_notes: progress?.notes ?? null,
      progress_imported: progress?.is_imported ?? null,
      evidence_url: progress?.evidence_url ?? null,

      bastp_number: bastp?.number ?? null,
      bastp_date: bastp?.date ?? null,
      bastp_status: bastp?.status ?? null,
      materials_status: link?.materials_status ?? null,

      invoice_number: invoice?.invoice_number ?? null,
      invoice_date: invoice ? (invoice.invoice_date || invoice.created_at.slice(0, 10)) : null,
      faktur_number: invoice?.faktur_number ?? null,
      invoice_due_date: invoice?.due_date ?? null,
      delivery_date: invoice?.delivery_date ?? null,
      collection_date: invoice?.collection_date ?? null,
      receiver_name: invoice?.receiver_name ?? null,
      payment_status: invoice ? (invoice.payment_status ? "Paid" : "Unpaid") : null,
      payment_date: invoice?.payment_date ?? null,
      invoice_remarks: invoice?.remarks ?? null,
    };

    if (includePpicPrice) out.ppic_price = detail?.ppic_price ?? null;
    if (includeFinancial) {
      out.invoice_unit_price = invoiceLine?.unit_price ?? null;
      out.invoice_amount = invoiceLine?.payment_price ?? null;
      out.invoice_subtotal_before_tax = invoice?.total_price_before ?? null;
      out.invoice_ppn = invoice?.ppn ?? null;
      out.invoice_pph_23 = invoice?.pph_23 ?? null;
      out.invoice_total_after_tax = invoice?.total_price_after ?? null;
    }
    return out;
  };

  const workOrders = live(vessel.work_order);
  if (workOrders.length === 0) {
    rows.push(row(null, null, null));
    return rows;
  }
  workOrders.forEach((workOrder) => {
    const details = live(workOrder.work_details);
    if (details.length === 0) {
      rows.push(row(workOrder, null, null));
      return;
    }
    details.forEach((detail) => {
      const progress = live(detail.work_progress).sort(
        (a, b) =>
          (a.report_date || "").localeCompare(b.report_date || "") || a.id - b.id,
      );
      if (progress.length === 0) rows.push(row(workOrder, detail, null));
      else progress.forEach((p) => rows.push(row(workOrder, detail, p)));
    });
  });
  return rows;
}

// Export comprehensive vessel data with all related tables joined
export const exportVesselData = async (
  options: ExportOptions,
): Promise<ExportData> => {
  const vesselFilter = options.filters?.vesselIds || [];
  const includeFinancial = options.includeFinancialData ?? false;
  const includePpicPrice = options.includePpicPrice ?? false;

  // Which vessels: the selection, or every active vessel.
  let vesselIds = vesselFilter;
  let vesselName = "all_vessels";
  if (vesselIds.length === 0) {
    const { data, error } = await supabase
      .from("vessel")
      .select("id")
      .is("deleted_at", null)
      .order("name");
    if (error) throw new Error(errorMessage(error));
    vesselIds = (data || []).map((v) => v.id as number);
  } else if (vesselIds.length === 1) {
    const { data } = await supabase
      .from("vessel")
      .select("name")
      .eq("id", vesselIds[0])
      .single();
    vesselName =
      data?.name?.replace(/[^a-zA-Z0-9]/g, "_") || `vessel_${vesselIds[0]}`;
  } else {
    vesselName = `${vesselIds.length}_vessels`;
  }

  const batches: number[][] = [];
  for (let i = 0; i < vesselIds.length; i += BATCH_SIZE) {
    batches.push(vesselIds.slice(i, i + BATCH_SIZE));
  }

  const select = SELECT_VESSEL(includePpicPrice, includeFinancial);
  const rows: ExportRow[] = [];
  for (const ids of batches) {
    const { data, error } = await supabase
      .from("vessel")
      .select(select)
      .in("id", ids)
      .is("deleted_at", null)
      .order("name");
    if (error) {
      console.error("Supabase query error:", error);
      throw new Error(errorMessage(error));
    }
    (data as unknown as SupabaseVessel[]).forEach((vessel) =>
      rows.push(...buildRows(vessel, includeFinancial, includePpicPrice)),
    );
  }

  const now = new Date();
  const stamp = `${now.toLocaleDateString("en-CA")}_${now
    .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    .replace(":", "")}`;
  const accessSuffix = includeFinancial ? "_full" : "_operational";
  return {
    data: rows,
    filename: `vessel_data_${vesselName}${accessSuffix}_${stamp}.csv`,
    totalRecords: rows.length,
  };
};
