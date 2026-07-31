import { forwardRef, Fragment } from "react";
import type { BASTPWithDetails } from "../../types/bastp.types";
import { formatMaterialDimensionDisplay } from "../../utils/materialCalculations";

interface BASTPPrintProps {
  bastp: BASTPWithDetails;
}

// Same fixed display order as WorkOrderPrint's CATEGORY_ORDER — anything not
// listed still shows up, just appended after these in alphabetical order.
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

const BASTPPrint = forwardRef<HTMLDivElement, BASTPPrintProps>(
  ({ bastp }, ref) => {
    const formatDate = (dateString: string | null | undefined) => {
      if (!dateString) return "-";
      return new Date(dateString).toLocaleDateString("id-ID", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    };

    const activeItems = (bastp.bastp_work_details || [])
      .map((bwd) => bwd.work_details)
      .filter(
        (wd): wd is NonNullable<typeof wd> => !!wd && !wd.cancelled_at,
      );

    // The BASTP number itself doubles as "No. Handover"; the plain "No."
    // field on the paper form is just its leading sequence number.
    const noDisplay = bastp.number?.split("/")[0] || bastp.number || "-";

    // A BASTP can technically span multiple work orders, but in practice
    // shares one — use whichever the first item points to, same convention
    // WorkOrderPrint uses for its own single-work-order fields.
    const firstWorkOrder = activeItems.find((item) => item.work_order)
      ?.work_order;

    const hasDockingDates =
      bastp.tanggal_sandar ||
      bastp.tanggal_naik_docking ||
      bastp.tanggal_turun_docking ||
      bastp.tanggal_tambat_setelah_turun_dock;

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
    // Items with no work_scope at all still need to be printed somewhere.
    const uncategorized = activeItems.filter((item) => !item.work_scope);
    if (uncategorized.length > 0) {
      categories.push({ scopeName: "Lainnya", items: uncategorized });
    }

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
                <div className="fm-code">FM-OPS-04-06</div>
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
                    BERITA ACARA SERAH TERIMA PEKERJAAN
                  </h1>
                </div>
              </td>
            </tr>

            {/* Info Block */}
            <tr>
              <td>
                <table className="w-full text-xs mb-4 section-block">
                  <tbody>
                    <tr>
                      <td className="align-top w-1/2 pr-8">
                        <div className="space-y-1">
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-40 flex-shrink-0">
                              To:
                            </span>
                            <span>
                              <div className="font-semibold">
                                {bastp.to_name || "-"}
                              </div>
                              <div>{bastp.to_role || "-"}</div>
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-40 flex-shrink-0">
                              Name of Vessel:
                            </span>
                            <span className="font-semibold">
                              {bastp.vessel?.name || "-"}
                            </span>
                          </div>
                          {hasDockingDates && (
                            <>
                              <div className="flex gap-2">
                                <span className="text-gray-600 w-40 flex-shrink-0">
                                  Tanggal Sandar:
                                </span>
                                <span className="font-medium">
                                  {formatDate(bastp.tanggal_sandar)}
                                </span>
                              </div>
                              <div className="flex gap-2">
                                <span className="text-gray-600 w-40 flex-shrink-0">
                                  Tanggal Naik Docking:
                                </span>
                                <span className="font-medium">
                                  {formatDate(bastp.tanggal_naik_docking)}
                                </span>
                              </div>
                              <div className="flex gap-2">
                                <span className="text-gray-600 w-40 flex-shrink-0">
                                  Tanggal Turun Docking:
                                </span>
                                <span className="font-medium">
                                  {formatDate(bastp.tanggal_turun_docking)}
                                  {bastp.tanggal_naik_docking &&
                                    bastp.tanggal_turun_docking && (
                                      <>
                                        {" "}
                                        (
                                        {calcDays(
                                          bastp.tanggal_naik_docking,
                                          bastp.tanggal_turun_docking,
                                        )}{" "}
                                        Hari)
                                      </>
                                    )}
                                </span>
                              </div>
                              <div className="flex gap-2">
                                <span className="text-gray-600 w-40 flex-shrink-0">
                                  Tanggal Tambat Setelah Turun Dock:
                                </span>
                                <span className="font-medium">
                                  {formatDate(
                                    bastp.tanggal_tambat_setelah_turun_dock,
                                  )}
                                  {bastp.tanggal_tambat_setelah_turun_dock && (
                                    <>
                                      {" "}
                                      (
                                      {calcDays(
                                        bastp.tanggal_tambat_setelah_turun_dock,
                                        bastp.date,
                                      )}{" "}
                                      Hari)
                                    </>
                                  )}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="align-top w-1/2">
                        <div className="space-y-1">
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              Date:
                            </span>
                            <span className="font-medium">
                              {formatDate(bastp.date)}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              No.:
                            </span>
                            <span className="font-medium">{noDisplay}</span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              No. Handover:
                            </span>
                            <span className="font-medium">
                              {bastp.number}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              Lokasi:
                            </span>
                            <span className="font-medium">
                              {firstWorkOrder?.work_location || "-"}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              Project Leader:
                            </span>
                            <span className="font-medium">
                              {firstWorkOrder?.kapro?.kapro_name || "-"}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              WO No. Customer:
                            </span>
                            <span className="font-medium">
                              {firstWorkOrder?.customer_wo_number || "-"}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              Wo No. PPIC:
                            </span>
                            <span className="font-medium">
                              {firstWorkOrder?.shipyard_wo_number || "-"}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>

            {/* Intro */}
            <tr>
              <td>
                <p className="mb-4 text-xs section-block">
                  Pada tanggal {formatDate(bastp.date)} telah di selesaikan
                  pekerjaan {firstWorkOrder?.work_type || ""}{" "}
                  {bastp.vessel?.name || ""} yang telah dilaksanakan di PT
                  Barokah Galangan Perkasa, adapun detail pekerjaannya adalah
                  sebagai berikut :
                </p>
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
                      <th className="border border-gray-400 px-2 py-1 text-center font-semibold w-24">
                        QTY/Volume
                      </th>
                      <th className="border border-gray-400 px-2 py-1 text-left font-semibold w-32">
                        Remarks
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
                          <td className="border border-gray-400 px-2 py-1 font-bold uppercase">
                            {category.scopeName}
                          </td>
                          <td className="border border-gray-400 px-2 py-1"></td>
                          <td className="border border-gray-400 px-2 py-1"></td>
                        </tr>
                        {category.items.map((item, itemIndex) => {
                          const materials = (item.material_control || [])
                            .filter((mc) => !mc.deleted_at);
                          return (
                            <Fragment key={item.id}>
                              <tr>
                                <td className="border border-gray-400 px-2 py-1 text-center align-top">
                                  {categoryIndex + 1}.{itemIndex + 1}
                                </td>
                                <td className="border border-gray-400 px-2 py-1">
                                  {item.description}
                                </td>
                                <td className="border border-gray-400 px-2 py-1 text-center">
                                  {item.quantity} {item.uom}
                                </td>
                                <td className="border border-gray-400 px-2 py-1"></td>
                              </tr>
                              {materials.map((mc) => (
                                <tr key={mc.id}>
                                  <td className="border border-gray-400 px-2 py-1"></td>
                                  <td className="border border-gray-400 px-2 py-1 pl-4 text-gray-700">
                                    -{" "}
                                    {mc.material_list?.material || "Material"}
                                    {mc.material_list?.specification
                                      ? ` ${mc.material_list.specification}`
                                      : ""}{" "}
                                    <span className="italic">
                                      ({formatMaterialDimensionDisplay(mc)})
                                    </span>
                                  </td>
                                  <td className="border border-gray-400 px-2 py-1 text-center">
                                    {mc.total_amount ?? mc.amount} {mc.uom}
                                  </td>
                                  <td className="border border-gray-400 px-2 py-1"></td>
                                </tr>
                              ))}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </td>
            </tr>

            {/* Closing paragraph */}
            <tr>
              <td>
                <p className="mt-4 mb-4 text-xs section-block">
                  Demikian Berita Acara Serah Terima Pekerjaan ini dibuat
                  sesuai dengan pekerjaan di kapal, dengan di tanda
                  tanganinya BASTP ini maka kedua belah pihak menyatakan
                  seluruh pekerjaan kapal telah selesai dan dengan ini Pihak
                  galangan menyerahkan kembali kapal kepada pemilik kapal
                  atau perwakilan yang telah ditunjuk, Terima kasih atas
                  kepercayaan dan kerjasama yang telah terjalin,
                </p>
                <div className="text-xs section-block">
                  <span className="text-gray-600">Note:</span>
                  <div className="border border-gray-400 h-12 mt-1"></div>
                </div>
              </td>
            </tr>

            {/* Location + Date */}
            <tr>
              <td>
                <div className="mt-4 mb-2 text-xs section-block">
                  Samarinda, {formatDate(bastp.date)}
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
                        <p>Di Serahkan Oleh,</p>
                        <p className="italic">Submitted by,</p>
                        <div className="h-12"></div>
                        <p className="font-semibold underline">
                          Hendra Muzaki
                        </p>
                        <p>Marketing &amp; PPIC Department Head</p>
                      </td>
                      <td className="w-1/3">
                        <p>Di Terima Oleh,</p>
                        <p className="italic">Received By,</p>
                        <div className="h-12"></div>
                        <p className="font-semibold underline">
                          {bastp.to_name || "-"}
                        </p>
                        <p>Operation Head</p>
                      </td>
                      <td className="w-1/3">
                        <p>Di Saksikan Oleh,</p>
                        <p className="italic">Witnessed by,</p>
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

BASTPPrint.displayName = "BASTPPrint";

export default BASTPPrint;
