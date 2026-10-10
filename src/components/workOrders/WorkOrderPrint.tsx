import { forwardRef, Fragment, useEffect, useState } from "react";
import type { WorkOrderWithDetails, WorkDetailsWithProgress } from "../../lib/supabase";
import { terbilang } from "../../utils/terbilang";
import { calcWorkingDays } from "../../utils/indonesianHolidays";
import { COMPANY_STAMP, loadSignature } from "../../utils/signatures";

const ISSUER_NAME = "Hendra Muzaki";
const GENERAL_MANAGER_NAME = "Prasetya Abdillah";

// Keeps the original 48px gap in the layout, but draws the signature larger
// than that gap, centered on it — so it spills over the label above and the
// name below, the way a real signature crosses the printed name.
function SignatureImage({
  src,
  stamp,
}: {
  src: string | null;
  stamp?: string | null;
}) {
  return (
    <div className="relative h-12">
      {stamp && (
        <img
          src={stamp}
          alt=""
          className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-[95%] h-24 w-auto opacity-90 pointer-events-none"
        />
      )}
      {src && (
        <img
          src={src}
          alt=""
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 h-20 w-auto max-w-[190px] object-contain pointer-events-none"
        />
      )}
    </div>
  );
}

interface WorkOrderPrintWorkDetail extends WorkDetailsWithProgress {
  work_scope?: { id: number; work_scope: string } | null;
}

interface WorkOrderGeneralServiceEntry {
  id: number;
  start_date: string | null;
  close_date: string | null;
  total_days: number | null;
  remarks: string | null;
  service_type?: { id: number; service_name: string; display_order: number };
}

export type WorkOrderPrintDocument = "WO" | "KOM";
export type WorkOrderPrintScope =
  | "all"
  | "original"
  | "additional"
  // Hand-picked work details (see selectedWorkDetailIds).
  | "custom";

interface WorkOrderPrintProps {
  workOrder: Omit<WorkOrderWithDetails, "work_details"> & {
    work_details: WorkOrderPrintWorkDetail[];
    work_order_general_services?: WorkOrderGeneralServiceEntry[];
  };
  printNumber: number;
  // "WO" = Perintah Kerja (FM-OPS-04-02); "KOM" = Kick Off Meeting
  // (FM-OPS-04-04), which carries the same work items under its own header,
  // numbering and unsigned signature block.
  documentType?: WorkOrderPrintDocument;
  // Which work details to list: everything, only the original scope, or only
  // the additional work details.
  scope?: WorkOrderPrintScope;
  // Used when scope === "custom": the ids of the work details to list.
  selectedWorkDetailIds?: number[];
  // Docking Planning is the schedule of the work order as a whole, so a
  // custom selection leaves it out unless asked for.
  includeDockingPlanning?: boolean;
  // Date printed on the document (YYYY-MM-DD). Defaults to the work order's
  // own date; a batch issued later (e.g. additional work) passes its own.
  documentDate?: string | null;
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

// "Hari" on this document counts working days, not calendar days — Sundays
// and Indonesian national holidays don't count toward a job's duration,
// per the shipyard's own scheduling convention.
function calcDays(start?: string | null, end?: string | null): number {
  return calcWorkingDays(start, end);
}

const WorkOrderPrint = forwardRef<HTMLDivElement, WorkOrderPrintProps>(
  (
    {
      workOrder,
      printNumber,
      documentType = "WO",
      scope = "all",
      selectedWorkDetailIds = [],
      includeDockingPlanning = false,
      documentDate = null,
    },
    ref,
  ) => {
    const isKom = documentType === "KOM";
    const kaproName = workOrder.kapro?.kapro_name;
    const [signatures, setSignatures] = useState<{
      issuer: string | null;
      kapro: string | null;
      generalManager: string | null;
      stamp: string | null;
    }>({ issuer: null, kapro: null, generalManager: null, stamp: null });

    useEffect(() => {
      let cancelled = false;
      Promise.all([
        loadSignature(ISSUER_NAME),
        loadSignature(kaproName),
        loadSignature(GENERAL_MANAGER_NAME),
        loadSignature(COMPANY_STAMP),
      ]).then(([issuer, kapro, generalManager, stamp]) => {
        if (!cancelled) setSignatures({ issuer, kapro, generalManager, stamp });
      });
      return () => {
        cancelled = true;
      };
    }, [kaproName]);

    const formatDate = (dateString: string | null | undefined) => {
      if (!dateString) return "-";
      return new Date(dateString).toLocaleDateString("id-ID", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    };

    const komNumber = workOrder.shipyard_wo_number
      ? workOrder.shipyard_wo_number.replace(/\/WO-/i, "/KOM-")
      : "-";

    const activeDetails = (workOrder.work_details || []).filter(
      (d) =>
        !d.cancelled_at &&
        (scope === "all" ||
          (scope === "custom"
            ? selectedWorkDetailIds.includes(d.id)
            : scope === "additional"
              ? !!d.is_additional_wo_details
              : !d.is_additional_wo_details)),
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
      // Category duration is the span from its earliest planned start to its
      // latest target close (same convention as the overall totalDays
      // below) — NOT the sum of each item's own days. Work items within a
      // category routinely overlap (e.g. dozens of Steelwork jobs running
      // in parallel across the same few months), so summing counted the
      // same calendar days over and over and wildly inflated the total.
      const categoryStartDates = items
        .map((d) => d.planned_start_date)
        .filter(Boolean);
      const categoryEndDates = items
        .map((d) => d.target_close_date)
        .filter(Boolean);
      const categoryStart =
        categoryStartDates.length > 0
          ? categoryStartDates.reduce((min, d) => (d < min ? d : min))
          : null;
      const categoryEnd =
        categoryEndDates.length > 0
          ? categoryEndDates.reduce((max, d) => (d > max ? d : max))
          : null;
      const totalDays = calcDays(categoryStart, categoryEnd);
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

    // Docking Planning rendered as its own leading category in the Work
    // Item Table, sub-items just like every other work_scope category. The
    // Docking Planning form itself stores calendar days, but this document's
    // column is "Target Hari Kerja", so the figures printed here are working
    // days like everything else in it.
    const dockingPlanningEntries =
      scope === "additional" || (scope === "custom" && !includeDockingPlanning)
        ? []
        : workOrder.work_order_general_services || [];
    const hasDockingPlanning = dockingPlanningEntries.length > 0;
    const dockingPlanningSorted = [...dockingPlanningEntries].sort(
      (a, b) => (a.service_type?.display_order || 0) - (b.service_type?.display_order || 0),
    );
    const dockingStartDates = dockingPlanningSorted
      .map((d) => d.start_date)
      .filter((d): d is string => !!d);
    const dockingEndDates = dockingPlanningSorted
      .map((d) => d.close_date)
      .filter((d): d is string => !!d);
    const dockingCategoryStart =
      dockingStartDates.length > 0
        ? dockingStartDates.reduce((min, d) => (d < min ? d : min))
        : null;
    const dockingCategoryEnd =
      dockingEndDates.length > 0
        ? dockingEndDates.reduce((max, d) => (d > max ? d : max))
        : null;
    // Every "Hari" figure in this column is working days (Sundays and
    // national holidays excluded). The Docking Planning category covers the
    // same timeline as the overall "Target Total Hari", so both use this one
    // number — and once Docking Planning has dates it IS the authoritative
    // total. Until it's been filled in, fall back to the work details' span.
    const dockingTotalDays = calcWorkingDays(
      dockingCategoryStart,
      dockingCategoryEnd,
    );
    const overallTotalDays =
      dockingTotalDays > 0 ? dockingTotalDays : totalDays;
    // Every other category/Serah Terima number shifts down by one when this
    // leading category is present.
    const categoryNumberOffset = hasDockingPlanning ? 2 : 1;

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
                <div className="fm-code">{isKom ? "FM-OPS-04-04" : "FM-OPS-04-02"}</div>
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
                    {isKom ? "MEETING AWAL PEKERJAAN" : "PERINTAH KERJA"}
                  </h1>
                  <p className="text-sm font-semibold text-gray-800">
                    {isKom ? "Kick Off Meeting (KOM)" : "WORK ORDER (WO)"}
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
                          {!isKom && (
                            <div className="flex gap-2">
                              <span className="text-gray-600 w-32 flex-shrink-0">
                                To:
                              </span>
                              <span className="font-semibold">
                                Team Produksi
                              </span>
                            </div>
                          )}
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
                              {formatDate(documentDate || workOrder.shipyard_wo_date)}
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
                              {isKom ? "No. Kick Off Meeting:" : "No. WO PPIC:"}
                            </span>
                            <span className="font-medium">
                              {isKom ? komNumber : workOrder.shipyard_wo_number}
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
                          {isKom && (
                            <div className="flex gap-2">
                              <span className="text-gray-600 w-32 flex-shrink-0">
                                No. WO PPIC:
                              </span>
                              <span className="font-medium">
                                {workOrder.shipyard_wo_number}
                              </span>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              No. WO Shipping:
                            </span>
                            <span className="font-medium">
                              {workOrder.customer_wo_number || "-"}
                            </span>
                          </div>
                          {!isKom && (
                            <div className="flex gap-2">
                              <span className="text-gray-600 w-32 flex-shrink-0">
                                Serial No./Part No.:
                              </span>
                              <span className="font-medium"></span>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <span className="text-gray-600 w-32 flex-shrink-0">
                              Target Total Hari:
                            </span>
                            <span className="font-medium">
                              {overallTotalDays} ( {terbilang(overallTotalDays)} ) Hari
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
                    {/* Docking Planning — a schedule estimate (see
                        DockingPlanning.tsx), rendered as its own leading
                        category with its planned stages as sub-items, same
                        pattern as every other work_scope category below.
                        Omitted entirely when nothing's been planned yet. */}
                    {hasDockingPlanning && (
                      <Fragment>
                        <tr className="bg-gray-50">
                          <td className="border border-gray-400 px-2 py-1 font-bold align-top">
                            1
                          </td>
                          <td className="border border-gray-400 px-2 py-1 font-bold uppercase">
                            Docking
                          </td>
                          <td className="border border-gray-400 px-2 py-1 text-center font-bold">
                            {dockingTotalDays} Hari
                          </td>
                          <td className="border border-gray-400 px-2 py-1"></td>
                          <td className="border border-gray-400 px-2 py-1"></td>
                        </tr>
                        {dockingPlanningSorted.map((entry, itemIndex) => (
                          <tr key={`docking-${entry.id}`}>
                            <td className="border border-gray-400 px-2 py-1 text-center">
                              1.{itemIndex + 1}
                            </td>
                            <td className="border border-gray-400 px-2 py-1">
                              {entry.service_type?.service_name || "-"}
                              {entry.start_date && entry.close_date && (
                                <div className="text-gray-500">
                                  {formatDate(entry.start_date)} —{" "}
                                  {formatDate(entry.close_date)}
                                </div>
                              )}
                            </td>
                            <td className="border border-gray-400 px-2 py-1 text-center">
                              {calcWorkingDays(entry.start_date, entry.close_date)} Hari
                            </td>
                            <td className="border border-gray-400 px-2 py-1"></td>
                            <td className="border border-gray-400 px-2 py-1">
                              {entry.remarks || ""}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    )}
                    {categories.map((category, categoryIndex) => (
                      <Fragment key={category.scopeName}>
                        <tr className="bg-gray-50">
                          <td className="border border-gray-400 px-2 py-1 font-bold align-top">
                            {categoryIndex + categoryNumberOffset}
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
                              {categoryIndex + categoryNumberOffset}.{itemIndex + 1}
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
                        {categories.length + categoryNumberOffset}
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

            {/* Note + Location/Date + Signatures + Disclaimer — kept as one
                atomic block (single outer tr/section-block) instead of four
                separate rows. Each row individually satisfying
                page-break-inside: avoid only stops IT from splitting; it
                doesn't stop the browser from placing Note/Location at the
                bottom of one page and pushing just the Signatures onto the
                next, which is what left the signature table stranded right
                under the header with barely any room to actually sign.
                Grouping them means if any one doesn't fit, the whole group
                — signatures included — moves to a fresh page together. */}
            <tr>
              <td>
                <div className="section-block pt-2">
                  {!isKom && (
                    <div className="mb-4 text-xs border border-gray-400 p-2">
                      Setelah pekerjaan selesai mohon di kirim evident nya ke
                      Project Leader yang telah di tunjuk terima kasih.
                    </div>
                  )}

                  <div className="mb-2 text-xs">
                    {workOrder.work_location || "-"}, Samarinda,{" "}
                    {formatDate(documentDate || workOrder.shipyard_wo_date)}
                  </div>

                  {isKom ? (
                    // Kick Off Meeting: names and roles only — the signature
                    // spaces are left blank to be signed on paper.
                    <table className="w-full mb-4 text-center text-xs">
                      <tbody>
                        <tr>
                          <td className="w-1/4">
                            <p>Disusun oleh,</p>
                            <div className="h-12" />
                            <p className="font-semibold underline">
                              {ISSUER_NAME}
                            </p>
                            <p>Marketing &amp; PPIC Department Head</p>
                          </td>
                          <td className="w-1/4">
                            <p>Di Setujui Oleh,</p>
                            <div className="h-12" />
                            <p className="font-semibold underline">
                              {kaproName || "-"}
                            </p>
                            <p>Head Project</p>
                          </td>
                          <td className="w-1/4">
                            <p>Di Setujui Oleh,</p>
                            <div className="h-12" />
                            {/* Owner's surveyor differs per job — name is
                                written in by hand, so only a blank line. */}
                            <div className="mx-auto h-4 w-40 border-b border-gray-800" />
                            <p>Owner Surveyor</p>
                          </td>
                          <td className="w-1/4">
                            <p>Di ketahui Oleh,</p>
                            <div className="h-12" />
                            <p className="font-semibold underline">
                              {GENERAL_MANAGER_NAME}
                            </p>
                            <p>General Manager</p>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  ) : (
                  <table className="w-full mb-4 text-center text-xs">
                    <tbody>
                      <tr>
                        <td className="w-1/3">
                          <p>Dikeluarkan oleh,</p>
                          <SignatureImage src={signatures.issuer} />
                          <p className="font-semibold underline">
                            {ISSUER_NAME}
                          </p>
                          <p>Marketing &amp; PPIC Department Head</p>
                        </td>
                        <td className="w-1/3">
                          <p>Di Setujui Oleh,</p>
                          <SignatureImage src={signatures.kapro} />
                          <p className="font-semibold underline">
                            {kaproName || "-"}
                          </p>
                          <p>Head Project</p>
                        </td>
                        <td className="w-1/3">
                          <p>Di ketahui Oleh,</p>
                          {/* Company stamp sits under the left half of the
                              GM's signature, as on the stamped paper originals. */}
                          <SignatureImage
                            src={signatures.generalManager}
                            stamp={signatures.stamp}
                          />
                          <p className="font-semibold underline">
                            {GENERAL_MANAGER_NAME}
                          </p>
                          <p>General Manager</p>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  )}

                  <div className="text-center text-xs text-gray-600">
                    <p>
                      *) Mohon gunakan lembaran tambahan jika diperlukan /
                      Another sheet can be used if required
                    </p>
                    <p className="text-green-700 italic">
                      Go green-save trees. Print only when necessary
                    </p>
                  </div>
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
