import { useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { supabase } from "../../lib/supabase";
import type { BASTPWithDetails } from "../../types/bastp.types";
import BASTPPrint from "./BASTPPrint";
import {
  Printer,
  X,
  Download,
  Loader,
  FileText,
  AlertTriangle,
} from "lucide-react";

// The full, formatted BASTP document — the same "Print" capability BASTP
// Details already has, dropped in wherever else someone needs the physical
// document (e.g. Finance pulling it up from the Invoice page, since they're
// the ones who need it later for collection). Fetches the full BASTP record
// on demand rather than requiring the host page to carry all of it in its
// own query.
interface BastpPrintButtonProps {
  bastpId: number;
  label?: string;
  className?: string;
}

export default function BastpPrintButton({
  bastpId,
  label = "Print BASTP",
  className = "inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
}: BastpPrintButtonProps) {
  const [bastp, setBastp] = useState<BASTPWithDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `BASTP-${bastp?.number || bastpId}`,
    pageStyle: `
      @page { size: A4; margin: 0; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .no-print { display: none !important; }
      }
    `,
  });

  const handleOpen = async () => {
    setError(null);
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from("bastp")
        .select(
          `
    *,
    vessel:vessel_id (
      id,
      name,
      type,
      company
    ),
    bastp_work_details (
      id,
      deleted_at,
      materials_status,
      work_details:work_details_id (
        id,
        description,
        quantity,
        uom,
        cancelled_at,
        planned_start_date,
        target_close_date,
        pic,
        location:location_id (
          id,
          location
        ),
        work_scope:work_scope_id (
          id,
          work_scope
        ),
        work_verification (
          status,
          created_at,
          deleted_at
        ),
        work_order:work_order_id (
          id,
          created_at,
          updated_at,
          vessel_id,
          shipyard_wo_number,
          shipyard_wo_date,
          customer_wo_number,
          customer_wo_date,
          user_id,
          is_additional_wo,
          kapro_id,
          work_location,
          work_type,
          kapro:kapro_id (
            id,
            kapro_name
          )
        ),
        material_control (
          id,
          material_id,
          calc_mode,
          length,
          width,
          thickness,
          area,
          layers,
          diameter,
          density,
          amount,
          total_amount,
          uom,
          deleted_at,
          material_list:material_id (
            id,
            material,
            specification,
            category
          ),
          material_density:material_density_id (
            id,
            name,
            density,
            unit
          )
        )
      )
    ),
    general_services (
      id,
      service_type_id,
      start_date,
      close_date,
      total_days,
      remarks,
      service_type:service_type_id (
        id,
        service_name,
        service_code,
        display_order
      )
    )
  `,
        )
        .eq("id", bastpId)
        .is("deleted_at", null)
        .single();

      if (fetchError) throw fetchError;

      const cleanedData = {
        ...data,
        bastp_work_details: (data.bastp_work_details || []).filter(
          (bwd: { deleted_at: string | null }) => !bwd.deleted_at,
        ),
      };
      setBastp(cleanedData);
      setShowPreview(true);
    } catch (err) {
      console.error("Error loading BASTP for print:", err);
      setError(err instanceof Error ? err.message : "Failed to load BASTP");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setShowPreview(false);
    setError(null);
  };

  // Same canvas-snapshot approach as BASTPDetails.tsx's own download — see
  // that component for the tradeoffs (no repeated header/footer per page).
  const handleDownloadPdf = async () => {
    if (!printRef.current || !bastp) return;
    try {
      setDownloadingPdf(true);
      setError(null);

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
      });

      const pdf = new jsPDF({
        unit: "mm",
        format: "a4",
        orientation: "portrait",
      });
      const pageWidthMm = pdf.internal.pageSize.getWidth();
      const pageHeightMm = pdf.internal.pageSize.getHeight();
      const marginMm = 10;
      const usableWidthMm = pageWidthMm - marginMm * 2;
      const usableHeightMm = pageHeightMm - marginMm * 2;
      const pxPerMm = canvas.width / usableWidthMm;
      const pageHeightPx = usableHeightMm * pxPerMm;

      let renderedPx = 0;
      let firstPage = true;
      while (renderedPx < canvas.height) {
        const sliceHeightPx = Math.min(
          pageHeightPx,
          canvas.height - renderedPx,
        );

        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeightPx;
        const ctx = pageCanvas.getContext("2d");
        if (!ctx) throw new Error("Could not create canvas context");
        ctx.drawImage(
          canvas,
          0,
          renderedPx,
          canvas.width,
          sliceHeightPx,
          0,
          0,
          canvas.width,
          sliceHeightPx,
        );

        if (!firstPage) pdf.addPage();
        pdf.addImage(
          pageCanvas.toDataURL("image/jpeg", 0.98),
          "JPEG",
          marginMm,
          marginMm,
          usableWidthMm,
          sliceHeightPx / pxPerMm,
        );

        renderedPx += sliceHeightPx;
        firstPage = false;
      }

      pdf.save(`BASTP-${bastp.number || bastpId}.pdf`);
    } catch (err) {
      console.error("Error generating BASTP PDF:", err);
      setError(err instanceof Error ? err.message : "Failed to generate PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={loading}
        className={className}
      >
        {loading ? (
          <Loader className="w-4 h-4 animate-spin" />
        ) : (
          <Printer className="w-4 h-4" />
        )}
        {label}
      </button>

      {error && !showPreview && (
        <p className="mt-2 text-sm text-red-700 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </p>
      )}

      {showPreview && bastp && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg max-w-5xl w-full my-8 shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-lg no-print z-10">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5" /> BASTP Print Preview
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Printer className="w-4 h-4" /> Print
                </button>
                <button
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloadingPdf ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {downloadingPdf ? "Generating..." : "Download"}
                </button>
                <button
                  onClick={handleClose}
                  className="text-gray-500 hover:text-gray-700 px-2"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {error && (
              <div className="p-4 no-print">
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {error}
                </div>
              </div>
            )}

            <div className="overflow-y-auto max-h-[80vh]">
              <BASTPPrint ref={printRef} bastp={bastp} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
