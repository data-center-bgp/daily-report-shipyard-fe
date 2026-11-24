import { useId, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react";
import type { PlanRow } from "../../types/dockingPlan.types";
import type { PlanImportPreview } from "../../utils/planImport";
import { Modal, type LookupOption } from "./PlanDialogs";
import { primaryButton, secondaryButton } from "./planStatus";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_LISTED = 30;

// Upload an Excel file of work orders and work details, check it, then add it
// to the plan. Nothing is saved until the file has no errors and Import is
// pressed. The Excel libraries are loaded only when this dialog is used.
export function PlanImportDialog({
  plan,
  existingWorkOrderCount,
  scopes,
  locations,
  onClose,
  onImported,
}: {
  plan: PlanRow;
  existingWorkOrderCount: number;
  scopes: LookupOption[];
  locations: LookupOption[];
  onClose: () => void;
  onImported: (counts: { workOrders: number; details: number }) => void;
}) {
  const fileId = useId();
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PlanImportPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listsReady = scopes.length > 0 && locations.length > 0;

  const downloadTemplate = async () => {
    try {
      setError(null);
      const { generatePlanTemplateXLSX } = await import("../../utils/planImport");
      const bytes = await generatePlanTemplateXLSX(scopes, locations);
      const blob = new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "docking_plan_import_template.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The template could not be created.");
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setPreview(null);
    setError(null);
    if (!file) {
      setFileName(null);
      return;
    }
    setFileName(file.name);
    if (!/\.xlsx$/i.test(file.name)) {
      setError("Upload an .xlsx file. Download the template to start from.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("This file is over 5 MB. Remove anything that is not part of the template.");
      return;
    }
    try {
      setReading(true);
      const { readPlanWorkbook } = await import("../../utils/planImport");
      setPreview(readPlanWorkbook(await file.arrayBuffer(), scopes, locations));
    } catch (err) {
      setError(err instanceof Error ? err.message : "This file could not be read.");
    } finally {
      setReading(false);
    }
  };

  const handleImport = async () => {
    if (!preview || preview.errors.length > 0 || preview.workOrders.length === 0) return;
    try {
      setImporting(true);
      setError(null);
      const { importIntoPlan } = await import("../../utils/planImport");
      onImported(await importIntoPlan(plan, preview, existingWorkOrderCount));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The import did not work. Nothing was added.");
      setImporting(false);
    }
  };

  const detailsPerRef = new Map<string, number>();
  preview?.details.forEach((d) => {
    const key = d.ref.trim().toLowerCase();
    detailsPerRef.set(key, (detailsPerRef.get(key) ?? 0) + 1);
  });

  const canImport = !!preview && preview.errors.length === 0 && preview.workOrders.length > 0;
  const where = (issue: { sheet: string; row: number | null }) =>
    issue.row ? `${issue.sheet}, row ${issue.row}` : issue.sheet;

  return (
    <Modal title="Import from Excel" onClose={onClose} wide>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <p className="text-sm text-slate-700">
            Fill in the template with work orders and the work details under them, then upload it.
            Everything in the file is added to this plan. Work orders already in the plan stay as
            they are.
          </p>

          <div>
            <button
              type="button"
              onClick={downloadTemplate}
              disabled={!listsReady}
              className={secondaryButton}
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Download template
            </button>
            {!listsReady && (
              <p className="mt-2 text-sm text-slate-600">Loading the location and scope lists.</p>
            )}
          </div>

          <div>
            <label htmlFor={fileId} className="mb-1 block text-sm font-medium text-slate-700">
              Excel file (.xlsx)
            </label>
            <input
              id={fileId}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFile}
              disabled={!listsReady || importing}
              className="block min-h-11 w-full cursor-pointer rounded-md border border-slate-400 bg-white text-sm text-slate-900 file:mr-3 file:min-h-11 file:cursor-pointer file:border-0 file:bg-slate-100 file:px-4 file:text-sm file:font-medium file:text-slate-900 hover:file:bg-slate-200"
            />
          </div>

          {reading && (
            <p role="status" className="flex items-center gap-2 text-sm text-slate-700">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking {fileName}
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </p>
          )}

          {preview && (
            <div className="space-y-3" aria-live="polite">
              {preview.errors.length > 0 ? (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    {preview.errors.length} problem{preview.errors.length === 1 ? "" : "s"} to fix in the file.
                    Nothing has been added.
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {preview.errors.slice(0, MAX_LISTED).map((issue, i) => (
                      <li key={i}>
                        <span className="font-medium">{where(issue)}:</span> {issue.message}
                      </li>
                    ))}
                  </ul>
                  {preview.errors.length > MAX_LISTED && (
                    <p className="mt-2">and {preview.errors.length - MAX_LISTED} more.</p>
                  )}
                  <p className="mt-2">Fix these in Excel, then choose the file again.</p>
                </div>
              ) : (
                <p className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  The file is ready: {preview.workOrders.length} work order
                  {preview.workOrders.length === 1 ? "" : "s"} and {preview.details.length} work detail
                  {preview.details.length === 1 ? "" : "s"}.
                </p>
              )}

              {preview.warnings.length > 0 && (
                <ul className="list-disc space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 pl-8 text-sm text-amber-950">
                  {preview.warnings.slice(0, MAX_LISTED).map((issue, i) => (
                    <li key={i}>
                      <span className="font-medium">{where(issue)}:</span> {issue.message}
                    </li>
                  ))}
                </ul>
              )}

              {preview.workOrders.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Work orders in the file</h3>
                  <ul className="mt-1 divide-y divide-slate-200 rounded-md border border-slate-200 text-sm">
                    {preview.workOrders.map((wo) => (
                      <li key={wo.rowNumber} className="flex flex-wrap justify-between gap-x-4 gap-y-1 p-2">
                        <span className="font-medium text-slate-900">
                          {wo.ref}
                          <span className="font-normal text-slate-700">
                            {wo.work_location ? ` · ${wo.work_location}` : ""}
                            {wo.customer_wo_number ? ` · Customer WO ${wo.customer_wo_number}` : ""}
                          </span>
                        </span>
                        <span className="text-slate-700">
                          {detailsPerRef.get(wo.ref.trim().toLowerCase()) ?? 0} work detail
                          {(detailsPerRef.get(wo.ref.trim().toLowerCase()) ?? 0) === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 p-3">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!canImport || importing}
            className={primaryButton}
          >
            {importing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {importing ? "Importing" : "Import into plan"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
