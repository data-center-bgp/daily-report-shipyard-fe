import { forwardRef } from "react";
import type { Invoice } from "../../types/invoiceTypes";

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

    return (
      <div ref={ref} className="p-8 bg-white">
        {/* Company Header Image */}
        <div className="mb-6">
          <img
            src="/images/invoice-header.jpeg"
            alt="Company Header"
            className="w-full h-auto"
            style={{ maxHeight: "150px", objectFit: "contain" }}
          />
        </div>

        {/* Invoice Title */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">INVOICE</h1>
          <p className="text-lg text-gray-600 mt-2">
            {invoice.invoice_number || "Draft Invoice"}
          </p>
        </div>

        {/* Invoice Info Grid */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Bill To:</h3>
            <p className="text-gray-700">{invoice.company || "-"}</p>
            {invoice.receiver_name && (
              <p className="text-gray-600 text-sm mt-1">
                Attn: {invoice.receiver_name}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="space-y-1">
              <div>
                <span className="text-gray-600 text-sm">Invoice Date:</span>
                <p className="font-medium">{formatDate(invoice.created_at)}</p>
              </div>
              {invoice.due_date && (
                <div>
                  <span className="text-gray-600 text-sm">Due Date:</span>
                  <p className="font-medium">{formatDate(invoice.due_date)}</p>
                </div>
              )}
              {invoice.faktur_number && (
                <div>
                  <span className="text-gray-600 text-sm">Faktur Number:</span>
                  <p className="font-medium">{invoice.faktur_number}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BASTP Reference */}
        <div className="bg-gray-50 border border-gray-200 rounded p-4 mb-6">
          <h3 className="font-semibold text-gray-900 mb-2">Reference:</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">BASTP Number:</span>
              <span className="ml-2 font-medium">{invoice.bastp?.number}</span>
            </div>
            <div>
              <span className="text-gray-600">Vessel:</span>
              <span className="ml-2 font-medium">
                {invoice.bastp?.vessel?.name}
              </span>
            </div>
            <div>
              <span className="text-gray-600">BASTP Date:</span>
              <span className="ml-2 font-medium">
                {formatDate(invoice.bastp?.date)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Delivery Date:</span>
              <span className="ml-2 font-medium">
                {formatDate(invoice.delivery_date)}
              </span>
            </div>
          </div>
        </div>

        {/* Work Details Table */}
        <div className="mb-6">
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">
                  No.
                </th>
                <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">
                  Description
                </th>
                <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">
                  Location
                </th>
                <th className="border border-gray-300 px-4 py-2 text-center text-sm font-semibold">
                  Qty
                </th>
                <th className="border border-gray-300 px-4 py-2 text-right text-sm font-semibold">
                  Unit Price (IDR)
                </th>
                <th className="border border-gray-300 px-4 py-2 text-right text-sm font-semibold">
                  Amount (IDR)
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.invoice_work_details?.map((item, index) => (
                <tr key={item.id}>
                  <td className="border border-gray-300 px-4 py-2 text-sm">
                    {index + 1}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-sm">
                    <div className="font-medium">
                      {item.work_details?.description}
                    </div>
                    {item.work_details?.work_scope && (
                      <div className="text-xs text-gray-600 mt-1">
                        {item.work_details.work_scope.work_scope}
                      </div>
                    )}
                    {item.work_details?.work_order && (
                      <div className="text-xs text-gray-500 mt-1">
                        WO: {item.work_details.work_order.shipyard_wo_number}
                      </div>
                    )}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-sm">
                    {item.work_details?.location?.location || "-"}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-sm text-center">
                    {item.work_details?.quantity} {item.work_details?.uom}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-sm text-right">
                    {formatCurrency(item.payment_price)}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-sm text-right font-medium">
                    {formatCurrency(item.payment_price)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50">
                <td
                  colSpan={5}
                  className="border border-gray-300 px-4 py-3 text-right font-semibold"
                >
                  Total Amount:
                </td>
                <td className="border border-gray-300 px-4 py-3 text-right font-bold text-lg">
                  {formatCurrency(invoice.total_amount || 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Payment Status */}
        {invoice.payment_status && (
          <div className="bg-green-50 border border-green-200 rounded p-4 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-green-600 text-xl">✅</span>
              <div>
                <p className="font-semibold text-green-900">Payment Received</p>
                {invoice.payment_date && (
                  <p className="text-sm text-green-700">
                    Paid on: {formatDate(invoice.payment_date)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Remarks */}
        {invoice.remarks && (
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-2">Remarks:</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap border border-gray-300 rounded p-3">
              {invoice.remarks}
            </p>
          </div>
        )}

        {/* Footer - Signature Section */}
        <div className="mt-12 pt-6 border-t border-gray-300">
          <div className="grid grid-cols-2 gap-8">
            <div className="text-center">
              <div className="h-16 mb-2"></div>
              <div className="border-t border-gray-400 pt-2">
                <p className="font-medium">Authorized Signature</p>
                <p className="text-sm text-gray-600">Company</p>
              </div>
            </div>
            <div className="text-center">
              <div className="h-16 mb-2"></div>
              <div className="border-t border-gray-400 pt-2">
                <p className="font-medium">Received By</p>
                <p className="text-sm text-gray-600">Customer</p>
              </div>
            </div>
          </div>
        </div>

        {/* Print Date */}
        <div className="mt-6 text-center text-xs text-gray-500">
          Printed on:{" "}
          {new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    );
  }
);

InvoicePrint.displayName = "InvoicePrint";

export default InvoicePrint;
