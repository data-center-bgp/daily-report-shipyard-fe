import { forwardRef, Fragment } from "react";
import type { WorkOrderWithDetails, WorkDetailsWithProgress } from "../../lib/supabase";
import { terbilang } from "../../utils/terbilang";

interface WorkOrderPrintWorkDetail extends WorkDetailsWithProgress {
  work_scope?: { id: number; work_scope: string } | null;
}

interface WorkOrderPrintProps {
  workOrder: Omit<WorkOrderWithDetails, "work_details"> & {
    work_details: WorkOrderPrintWorkDetail[];
  };
  printNumber: number;
}

// Fixed display order matching the paper form's category sequence. Any
// work_scope not listed here (older/unused master-data entries) still shows
// up, just appended after these in alphabetical order — nothing is dropped.
const CATEGORY_ORDER = [
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

function calcDays(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const diff =
    Math.ceil(
      (new Date(end).getTime() - new Date(start).getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1;
  return diff > 0 ? diff : 0;
}

const WorkOrderPrint = forwardRef<HTMLDivElement, WorkOrderPrintProps>(
  ({ workOrder, printNumber }, ref) => {
    const formatDate = (dateString: string | null | undefined) => {
      if (!dateString) return "-";
      return new Date(dateString).toLocaleDateString("id-ID", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    };

    const activeDetails = (workOrder.work_details || []).filter(
      (d) => !d.cancelled_at,
    );

    // Group by work_scope name, preserving CATEGORY_ORDER first, then any
    // unrecognized scopes appended alphabetically.
    const scopeNames = Array.from(
      new Set(
        activeDetails
          .map((d) => d.work_scope?.work_scope)
          .filter((name): name is string => !!name),
      ),
    );
    const orderedScopeNames = [
      ...CATEGORY_ORDER.filter((name) => scopeNames.includes(name)),
      ...scopeNames
        .filter((name) => !CATEGORY_ORDER.includes(name))
        .sort((a, b) => a.localeCompare(b)),
    ];

    const categories = orderedScopeNames.map((scopeName) => {
      const items = activeDetails.filter(
        (d) => d.work_scope?.work_scope === scopeName,
      );
      const totalDays = items.reduce(
        (sum, item) =>
          sum + calcDays(item.planned_start_date, item.target_close_date),
        0,
      );
      return { scopeName, items, totalDays };
    });

    // Overall duration: earliest planned start to latest target close across
    // all active work details, inclusive — same "earliest start to latest
    // close" convention used for BASTP general services totals.
    const startDates = activeDetails
      .map((d) => d.planned_start_date)
      .filter(Boolean);
    const endDates = activeDetails
      .map((d) => d.target_close_date)
      .filter(Boolean);
    const earliestStart =
      startDates.length > 0
        ? startDates.reduce((min, d) => (d < min ? d : min))
        : null;
    const latestEnd =
      endDates.length > 0
        ? endDates.reduce((max, d) => (d > max ? d : max))
        : null;
    const totalDays = calcDays(earliestStart, latestEnd);

    const printNumberDisplay = String(printNumber).padStart(3, "0");

    return (
      <div ref={ref} className="bg-white text-xs">
        <style>
          {`
            @media print {
              html, body {
                margin: 0;
                padding: 0;
              }

              @page {
                size: A4;
                margin: 6mm;
              }

              .print-table {
                width: 100%;
                border-collapse: collapse;
              }

              .print-table thead {
                display: table-header-group;
              }

              .print-table thead td {
                padding: 0 6mm;
                vertical-align: top;
              }

              .print-table thead .fm-code {
                text-align: right;
                font-size: 8px;
                font-weight: bold;
                padding-bottom: 1mm;
              }

              .print-table thead img {
                width: 100%;
                height: auto;
                max-height: 35mm;
                object-fit: contain;
                object-position: top center;
                display: block;
              }

              .print-table tfoot {
                display: table-footer-group;
              }

              .print-table tfoot td {
                padding: 0 6mm;
                vertical-align: bottom;
              }

              .print-table tfoot img {
                width: 100%;
                height: auto;
                max-height: 20mm;
                object-fit: contain;
                object-position: bottom center;
                display: block;
              }

              .print-table tbody {
                display: table-row-group;
              }

              .print-table tbody > tr {
                page-break-inside: avoid;
                break-inside: avoid;
              }

              .print-table tbody td {
                padding: 2mm 6mm;
                vertical-align: top;
              }

              .content-table {
                width: 100%;
                border-collapse: collapse;
              }

              .content-table thead {
                display: table-header-group;
              }

              .content-table tbody tr {
                page-break-inside: avoid;
                break-inside: avoid;
              }

              .section-block {
                page-break-inside: avoid;
                break-inside: avoid;
              }
            }

            @media screen {
              .print-table {
                width: 100%;
              }

              .print-table thead td {
                padding: 0 1.5rem;
              }

              .print-table thead .fm-code {
                text-align: right;
                font-size: 0.65rem;
                font-weight: bold;
                margin-bottom: 0.25rem;
              }

              .print-table thead img {
                width: 100%;
                height: auto;
                max-height: 35mm;
                margin-bottom: 1rem;
              }

              .print-table tfoot img {
                width: 100%;
                height: auto;
                max-height: 20mm;
                margin-top: 1rem;
              }

              .print-table tbody td {
                padding: 0.5rem 1.5rem;
              }
            }
          `}
        </style>

        <table className="print-table">
          <thead>
            <tr>
              <td>
                <div className="fm-code">FM-OPS-04-02</div>
                <img src="/images/invoice-header.png" alt="Company Header" />
              </td>
            </tr>
          </thead>
          <tfoot>
            <tr>
              <td>
                <img src="/images/invoice-footer.png" alt="Company Footer" />
              </td>
            </tr>
          </tfoot>
          <tbody>
            {/* Title */}
            <tr>
              <td>
                <div className="text-center mb-4 section-block">
                  <h1 className="text-base font-bold text-gray-900 underline">
                    PERINTAH KERJA
                  </h1>
                  <p className="text-sm font-semibold text-gray-800">
                    WORK ORDER (WO)
                  </p>
                </div>
              </td>
            </tr>

            {/* Info Block */}
            {/* A table (not CSS grid/flex) so page-break-inside: avoid is
                reliably honored when printing — Chromium's print engine
                doesn't consistently respect break-inside on grid/flex
                containers, but does on table rows. This is what was causing
                the info block to split across pages for longer work orders. */}
            <tr>
              <td>
                <table className="w-full text-xs mb-4 section-block">
                  <tbody>
                    <tr>
                      <td className="align-top w-1/2 pr-8">
                        <div className="space-y-1">
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              To:
                            </span>
                            <span className="font-semibold">
                              Team Produksi
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              Name of Vessel:
                            </span>
                            <span className="font-semibold">
                              {workOrder.vessel?.name || "-"}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              Owner:
                            </span>
                            <span className="font-medium">
                              {workOrder.vessel?.company || "-"}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              Jenis Pekerjaan:
                            </span>
                            <span className="font-medium">
                              {workOrder.work_type || "-"}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              Type:
                            </span>
                            <span className="font-medium"></span>
                          </div>
                        </div>
                      </td>
                      <td className="align-top w-1/2">
                        <div className="space-y-1">
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              Date:
                            </span>
                            <span className="font-medium">
                              {formatDate(workOrder.shipyard_wo_date)}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              No.:
                            </span>
                            <span className="font-medium">
                              {printNumberDisplay}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              No. WO PPIC:
                            </span>
                            <span className="font-medium">
                              {workOrder.shipyard_wo_number}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              Lokasi:
                            </span>
                            <span className="font-medium">
                              {workOrder.work_location || "-"}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              Project Leader:
                            </span>
                            <span className="font-medium">
                              {workOrder.kapro?.kapro_name || "-"}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              No. WO Shipping:
                            </span>
                            <span className="font-medium">
                              {workOrder.customer_wo_number || "-"}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              Serial No./Part No.:
                            </span>
                            <span className="font-medium"></span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              Target Total Hari:
                            </span>
                            <span className="font-medium">
                              {totalDays} ( {terbilang(totalDays)} ) Hari
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>

            {/* Work Item Table */}
            <tr>
              <td>
                <table className="content-table w-full border-collapse border border-gray-400 text-xs">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-400 px-2 py-1 text-center font-semibold w-8">
                        No
                      </th>
                      <th className="border border-gray-400 px-2 py-1 text-left font-semibold">
                        Work Order Description*
                        <div className="italic font-normal">
                          Uraian Perintah Kerja
                        </div>
                      </th>
                      <th className="border border-gray-400 px-2 py-1 text-center font-semibold w-20">
                        Completion
                        <div className="italic font-normal">
                          Target Hari Kerja
                        </div>
                      </th>
                      <th className="border border-gray-400 px-2 py-1 text-center font-semibold w-20">
                        QTY / VOLUME
                      </th>
                      <th className="border border-gray-400 px-2 py-1 text-left font-semibold">
                        Remarks
                        <div className="italic font-normal">Keterangan</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((category, categoryIndex) => (
                      <Fragment key={category.scopeName}>
                        <tr className="bg-gray-50">
                          <td className="border border-gray-400 px-2 py-1 font-bold align-top">
                            {categoryIndex + 1}
                          </td>
                          <td
                            className="border border-gray-400 px-2 py-1 font-bold uppercase"
                            colSpan={1}
                          >
                            {category.scopeName}
                          </td>
                          <td className="border border-gray-400 px-2 py-1 text-center font-bold">
                            {category.totalDays} Hari
                          </td>
                          <td className="border border-gray-400 px-2 py-1"></td>
                          <td className="border border-gray-400 px-2 py-1"></td>
                        </tr>
                        {category.items.map((item, itemIndex) => (
                          <tr key={item.id}>
                            <td className="border border-gray-400 px-2 py-1 text-center">
                              {categoryIndex + 1}.{itemIndex + 1}
                            </td>
                            <td className="border border-gray-400 px-2 py-1">
                              {item.description}
                            </td>
                            <td className="border border-gray-400 px-2 py-1 text-center">
                              {calcDays(
                                item.planned_start_date,
                                item.target_close_date,
                              )}{" "}
                              Hari
                            </td>
                            <td className="border border-gray-400 px-2 py-1 text-center">
                              {item.quantity} {item.uom}
                            </td>
                            <td className="border border-gray-400 px-2 py-1">
                              {item.notes || ""}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                    {/* Static template row — Serah Terima isn't tracked as
                        real work_details, always printed as the final line. */}
                    <tr className="bg-gray-50">
                      <td className="border border-gray-400 px-2 py-1 font-bold">
                        {categories.length + 1}
                      </td>
                      <td className="border border-gray-400 px-2 py-1 font-bold uppercase">
                        Serah Terima
                      </td>
                      <td className="border border-gray-400 px-2 py-1 text-center font-bold">
                        1 Hari
                      </td>
                      <td className="border border-gray-400 px-2 py-1"></td>
                      <td className="border border-gray-400 px-2 py-1"></td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>

            {/* Note */}
            <tr>
              <td>
                <div className="mb-4 text-xs section-block border border-gray-400 p-2">
                  Setelah pekerjaan selesai mohon di kirim evident nya ke
                  Project Leader yang telah di tunjuk terima kasih.
                </div>
              </td>
            </tr>

            {/* Location + Date */}
            <tr>
              <td>
                <div className="mb-2 text-xs section-block">
                  {workOrder.work_location || "-"}, Samarinda,{" "}
                  {formatDate(workOrder.shipyard_wo_date)}
                </div>
              </td>
            </tr>

            {/* Signatures */}
            <tr>
              <td>
                <table className="w-full mb-4 text-center text-xs section-block">
                  <tbody>
                    <tr>
                      <td className="w-1/3">
                        <p>Dikeluarkan oleh,</p>
                        <div className="h-12"></div>
                        <p className="font-semibold underline">
                          Hendra Muzaki
                        </p>
                        <p>Marketing &amp; PPIC Department Head</p>
                      </td>
                      <td className="w-1/3">
                        <p>Di Setujui Oleh,</p>
                        <div className="h-12"></div>
                        <p className="font-semibold underline">
                          {workOrder.kapro?.kapro_name || "-"}
                        </p>
                        <p>Head Project</p>
                      </td>
                      <td className="w-1/3">
                        <p>Di ketahui Oleh,</p>
                        <div className="h-12"></div>
                        <p className="font-semibold underline">
                          Prasetya Abdillah
                        </p>
                        <p>General Manager</p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>

            {/* Disclaimer */}
            <tr>
              <td>
                <div className="text-center text-xs text-gray-600 section-block">
                  <p>
                    *) Mohon gunakan lembaran tambahan jika diperlukan /
                    Another sheet can be used if required
                  </p>
                  <p className="text-green-700 italic">
                    Go green-save trees. Print only when necessary
                  </p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  },
);

WorkOrderPrint.displayName = "WorkOrderPrint";

export default WorkOrderPrint;
