import { forwardRef } from "react";
import type { Invoice } from "../../types/invoiceTypes";
import { CheckCircle2 } from "lucide-react";

interface InvoicePrintProps {
  invoice: Invoice;
}

const InvoicePrint = forwardRef<HTMLDivElement, InvoicePrintProps>(
  ({ invoice }, ref) => {
    const formatDate = (dateString: string | null | undefined) => {
      if (!dateString) return "-";
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    };

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0,
      }).format(amount);
    };

    const calculateWorkDetailsTotal = () => {
      return (
        invoice.invoice_work_details?.reduce(
          (sum, item) => sum + (item.payment_price || 0),
          0,
        ) || 0
      );
    };

    const calculateGeneralServicesTotal = () => {
      return (
        invoice.bastp?.general_services?.reduce(
          (sum, service) => sum + (service.payment_price || 0),
          0,
        ) || 0
      );
    };

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
              
              /* Main wrapper table */
              .print-table {
                width: 100%;
                border-collapse: collapse;
              }
              
              /* Header repeats on every page */
              .print-table thead {
                display: table-header-group;
              }
              
              .print-table thead td {
                padding: 0 6mm;
                vertical-align: top;
              }
              
              .print-table thead img {
                width: 100%;
                height: auto;
                max-height: 35mm;
                object-fit: contain;
                object-position: top center;
                display: block;
              }
              
              /* Body content */
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
              
              /* Inner tables */
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
              
              .print-table thead img {
                width: 100%;
                height: auto;
                max-height: 35mm;
                margin-bottom: 1rem;
              }
              
              .print-table tbody td {
                padding: 0.5rem 1.5rem;
              }
            }
          `}
        </style>

        {/* Main table structure - thead repeats on every page */}
        <table className="print-table">
          <thead>
            <tr>
              <td>
                <img src="/images/invoice-header.jpeg" alt="Company Header" />
              </td>
            </tr>
          </thead>
          <tbody>
            {/* Invoice Title */}
            <tr>
              <td>
                <div className="text-center mb-4 section-block">
                  <h1 className="text-2xl font-bold text-gray-900">INVOICE</h1>
                  <p className="text-sm text-gray-600 mt-1">
                    {invoice.invoice_number || "Draft Invoice"}
                  </p>
                </div>
              </td>
            </tr>

            {/* Invoice Info */}
            <tr>
              <td>
                <div className="mb-4 text-xs section-block">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="flex gap-2">
                        <span className="text-gray-600 w-32">
                          Client Company:
                        </span>
                        <span className="font-medium">
                          {invoice.company || "-"}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-gray-600 w-32">UP:</span>
                        <span className="font-medium">ACCOUNTING</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-gray-600 w-32">
                          Invoice Date:
                        </span>
                        <span className="font-medium">
                          {formatDate(invoice.created_at)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="flex justify-end gap-2">
                        <span className="text-gray-600">Vessel Name:</span>
                        <span className="font-medium">
                          {invoice.bastp?.vessel?.name || "-"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </td>
            </tr>

            {/* General Services Table */}
            {invoice.bastp?.general_services &&
              invoice.bastp.general_services.length > 0 && (
                <tr>
                  <td>
                    <div className="mb-4">
                      <h3 className="font-semibold text-gray-900 mb-2 text-xs">
                        General Services
                      </h3>
                      <table className="content-table w-full border-collapse border border-gray-300 text-xs">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border border-gray-300 px-2 py-1 text-left font-semibold">
                              No.
                            </th>
                            <th className="border border-gray-300 px-2 py-1 text-left font-semibold">
                              Service Name
                            </th>
                            <th className="border border-gray-300 px-2 py-1 text-center font-semibold">
                              Total Days
                            </th>
                            <th className="border border-gray-300 px-2 py-1 text-right font-semibold">
                              Unit Price (IDR)
                            </th>
                            <th className="border border-gray-300 px-2 py-1 text-right font-semibold">
                              Amount (IDR)
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoice.bastp.general_services
                            .sort(
                              (a, b) =>
                                (a.service_type?.display_order || 0) -
                                (b.service_type?.display_order || 0),
                            )
                            .map((service, index) => (
                              <tr key={service.id}>
                                <td className="border border-gray-300 px-2 py-1">
                                  {index + 1}
                                </td>
                                <td className="border border-gray-300 px-2 py-1">
                                  <div className="font-medium">
                                    {service.service_type?.service_name || "-"}
                                  </div>
                                  {service.remarks && (
                                    <div className="text-gray-600 mt-0.5">
                                      {service.remarks}
                                    </div>
                                  )}
                                </td>
                                <td className="border border-gray-300 px-2 py-1 text-center">
                                  {service.total_days}
                                </td>
                                <td className="border border-gray-300 px-2 py-1 text-right">
                                  {formatCurrency(service.unit_price || 0)}
                                </td>
                                <td className="border border-gray-300 px-2 py-1 text-right font-medium">
                                  {formatCurrency(service.payment_price || 0)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-50">
                            <td
                              colSpan={4}
                              className="border border-gray-300 px-2 py-1.5 text-right font-semibold"
                            >
                              Subtotal General Services:
                            </td>
                            <td className="border border-gray-300 px-2 py-1.5 text-right font-bold">
                              {formatCurrency(calculateGeneralServicesTotal())}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </td>
                </tr>
              )}

            {/* Work Details Table */}
            {invoice.invoice_work_details &&
              invoice.invoice_work_details.length > 0 && (
                <tr>
                  <td>
                    <div className="mb-4">
                      <h3 className="font-semibold text-gray-900 mb-2 text-xs">
                        Work Details
                      </h3>
                      <table className="content-table w-full border-collapse border border-gray-300 text-xs">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border border-gray-300 px-2 py-1 text-left font-semibold">
                              No.
                            </th>
                            <th className="border border-gray-300 px-2 py-1 text-left font-semibold">
                              Description
                            </th>
                            <th className="border border-gray-300 px-2 py-1 text-left font-semibold">
                              Location
                            </th>
                            <th className="border border-gray-300 px-2 py-1 text-center font-semibold">
                              Qty
                            </th>
                            <th className="border border-gray-300 px-2 py-1 text-right font-semibold">
                              Unit Price (IDR)
                            </th>
                            <th className="border border-gray-300 px-2 py-1 text-right font-semibold">
                              Amount (IDR)
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoice.invoice_work_details.map((item, index) => (
                            <tr key={item.id}>
                              <td className="border border-gray-300 px-2 py-1">
                                {index + 1}
                              </td>
                              <td className="border border-gray-300 px-2 py-1">
                                <div className="font-medium">
                                  {item.work_details?.description}
                                </div>
                                {item.work_details?.work_scope && (
                                  <div className="text-gray-600 mt-0.5">
                                    {item.work_details.work_scope.work_scope}
                                  </div>
                                )}
                                {item.work_details?.work_order && (
                                  <div className="text-gray-500 mt-0.5">
                                    WO:{" "}
                                    {
                                      item.work_details.work_order
                                        .shipyard_wo_number
                                    }
                                  </div>
                                )}
                              </td>
                              <td className="border border-gray-300 px-2 py-1">
                                {item.work_details?.location?.location || "-"}
                              </td>
                              <td className="border border-gray-300 px-2 py-1 text-center">
                                {item.work_details?.quantity}{" "}
                                {item.work_details?.uom}
                              </td>
                              <td className="border border-gray-300 px-2 py-1 text-right">
                                {formatCurrency(item.unit_price || 0)}
                              </td>
                              <td className="border border-gray-300 px-2 py-1 text-right font-medium">
                                {formatCurrency(item.payment_price || 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-50">
                            <td
                              colSpan={5}
                              className="border border-gray-300 px-2 py-1.5 text-right font-semibold"
                            >
                              Subtotal Work Details:
                            </td>
                            <td className="border border-gray-300 px-2 py-1.5 text-right font-bold">
                              {formatCurrency(calculateWorkDetailsTotal())}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </td>
                </tr>
              )}

            {/* Total Calculations */}
            <tr>
              <td>
                <div className="mb-4 section-block">
                  <table className="w-full border-collapse border border-gray-300 text-xs">
                    <tbody>
                      <tr className="bg-blue-50">
                        <td className="border border-gray-300 px-2 py-2 text-right font-semibold">
                          Subtotal (Before Tax):
                        </td>
                        <td className="border border-gray-300 px-2 py-2 text-right font-bold text-sm">
                          {formatCurrency(invoice.total_price_before || 0)}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 px-2 py-1.5 text-right">
                          PPN (11%):
                        </td>
                        <td className="border border-gray-300 px-2 py-1.5 text-right font-medium">
                          + {formatCurrency(invoice.ppn || 0)}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 px-2 py-1.5 text-right">
                          PPh 23 (2% - Withholding Tax):
                        </td>
                        <td className="border border-gray-300 px-2 py-1.5 text-right font-medium">
                          - {formatCurrency(invoice.pph_23 || 0)}
                        </td>
                      </tr>
                      <tr className="bg-green-50">
                        <td className="border border-gray-300 px-2 py-2 text-right font-bold">
                          Grand Total (After Tax):
                        </td>
                        <td className="border border-gray-300 px-2 py-2 text-right font-bold text-base">
                          {formatCurrency(invoice.total_price_after || 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>

            {/* Payment Status */}
            {invoice.payment_status && (
              <tr>
                <td>
                  <div className="bg-green-50 border border-green-200 rounded p-3 mb-4 text-xs section-block">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="font-semibold text-green-900">
                          Payment Received
                        </p>
                        {invoice.payment_date && (
                          <p className="text-green-700">
                            Paid on: {formatDate(invoice.payment_date)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            )}

            {/* Remarks */}
            {invoice.remarks && (
              <tr>
                <td>
                  <div className="mb-4 section-block">
                    <h3 className="font-semibold text-gray-900 mb-1 text-xs">
                      Remarks:
                    </h3>
                    <p className="text-xs text-gray-700 whitespace-pre-wrap border border-gray-300 rounded p-2">
                      {invoice.remarks}
                    </p>
                  </div>
                </td>
              </tr>
            )}

            {/* Footer - Payment Info and Signature Section */}
            <tr>
              <td>
                <div className="mt-2 pt-2 border-t border-gray-300 section-block">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-0.5 text-xs">
                        INVOICE PAYMENT CAN BE SENT TO:
                      </h3>
                      <table className="text-xs">
                        <tbody>
                          <tr>
                            <td className="text-gray-600 pr-1 py-0 align-top whitespace-nowrap">
                              ON BEHALF OF:
                            </td>
                            <td className="font-medium py-0">
                              PT BAROKAH GALANGAN PERKASA
                            </td>
                          </tr>
                          <tr>
                            <td className="text-gray-600 pr-1 py-0 align-top whitespace-nowrap">
                              ACCOUNT NUMBER:
                            </td>
                            <td className="font-medium py-0">
                              148-00-0025258-8
                            </td>
                          </tr>
                          <tr>
                            <td className="text-gray-600 pr-1 py-0 align-top whitespace-nowrap">
                              BANK:
                            </td>
                            <td className="font-medium py-0">MANDIRI</td>
                          </tr>
                          <tr>
                            <td className="text-gray-600 pr-1 py-0 align-top whitespace-nowrap">
                              ADDRESS:
                            </td>
                            <td className="font-medium py-0">
                              MULAWARMAN, SAMARINDA, INDONESIA
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="flex justify-end">
                      <div className="text-center">
                        <p className="font-semibold text-xs mb-0.5">
                          PT BAROKAH GALANGAN PERKASA
                        </p>
                        <div className="h-12 mb-1"></div>
                        <div className="border-t border-gray-400 pt-1 inline-block min-w-[180px]">
                          <p className="font-medium text-xs">
                            KHUSNUL KHOTIMAH
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </td>
            </tr>

            {/* Print Date */}
            <tr>
              <td>
                <div className="mt-4 text-center text-xs text-gray-500">
                  Printed on:{" "}
                  {new Date().toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  },
);

InvoicePrint.displayName = "InvoicePrint";

export default InvoicePrint;
