import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  Download,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { ActivityLogService } from "../../services/activityLogService";
import {
  // Work Details
  generateTemplateCSV,
  generateTemplateXLSX,
  parseCSV,
  parseXLSX,
  validateRows,
  importWorkDetails,
  // Work Orders
  generateWorkOrderTemplateCSV,
  generateCombinedTemplateXLSX,
  parseWorkOrderCSV,
  parseWorkOrderXLSX,
  validateWORows,
  importWorkOrders,
  // Combined
  parseCombinedXLSX,
  type ValidatedImportRow,
  type ValidatedWORow,
  type ImportResult,
} from "../../utils/importHandler";
import { downloadFile } from "../../utils/exportHandler";

type Tab = "work-orders" | "work-details";
type ImportStep = "upload" | "preview" | "result";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadXLSX(buffer: Uint8Array, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-component: Preview Table for Work Orders ─────────────────────────────

function WOPreviewTable({ rows }: { rows: ValidatedWORow[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {[
                "Row",
                "Status",
                "Vessel",
                "Shipyard WO #",
                "WO Date",
                "Customer WO #",
                "Addl?",
                "Kapro",
                "Location",
                "Type",
              ].map((h) => (
                <th
                  key={h}
                  className="px-3 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {rows.map((row) => {
              const hasErrors = row.errors.length > 0;
              return (
                <>
                  <tr
                    key={`wo-row-${row.rowNumber}`}
                    className={hasErrors ? "bg-red-50" : "bg-green-50"}
                  >
                    <td className="px-3 py-2 text-gray-500">{row.rowNumber}</td>
                    <td className="px-3 py-2">
                      {hasErrors ? (
                        <XCircle className="w-4 h-4 text-red-500" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-800">
                      {row.vessel_name || <em className="text-gray-400">—</em>}
                    </td>
                    <td className="px-3 py-2 text-gray-800">
                      {row.shipyard_wo_number || (
                        <em className="text-gray-400">—</em>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-800">
                      {row.shipyard_wo_date}
                    </td>
                    <td className="px-3 py-2 text-gray-800">
                      {row.customer_wo_number || (
                        <em className="text-gray-400">—</em>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-800">
                      {row.is_additional_wo}
                    </td>
                    <td className="px-3 py-2 text-gray-800">
                      {row.kapro_name || <em className="text-gray-400">—</em>}
                    </td>
                    <td className="px-3 py-2 text-gray-800">
                      {row.work_location || (
                        <em className="text-gray-400">—</em>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-800">
                      {row.work_type || <em className="text-gray-400">—</em>}
                    </td>
                  </tr>
                  {hasErrors && (
                    <tr key={`wo-err-${row.rowNumber}`} className="bg-red-50">
                      <td />
                      <td colSpan={9} className="px-3 pb-2">
                        <ul className="text-xs text-red-600 list-disc list-inside space-y-0.5">
                          {row.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Sub-component: Preview Table for Work Details ────────────────────────────

function WDPreviewTable({ rows }: { rows: ValidatedImportRow[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {[
                "Row",
                "Status",
                "Vessel",
                "WO Number",
                "Description",
                "Location",
                "Work Scope",
                "Qty",
                "UOM",
                "Start Date",
                "Close Date",
                "Period",
              ].map((h) => (
                <th
                  key={h}
                  className="px-3 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {rows.map((row) => {
              const hasErrors = row.errors.length > 0;
              return (
                <>
                  <tr
                    key={`wd-row-${row.rowNumber}`}
                    className={hasErrors ? "bg-red-50" : "bg-green-50"}
                  >
                    <td className="px-3 py-2 text-gray-500">{row.rowNumber}</td>
                    <td className="px-3 py-2">
                      {hasErrors ? (
                        <XCircle className="w-4 h-4 text-red-500" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-800">
                      {row.vessel_name || <em className="text-gray-400">—</em>}
                    </td>
                    <td className="px-3 py-2 text-gray-800">
                      {row.work_order_number || (
                        <em className="text-gray-400">—</em>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-800 max-w-xs truncate">
                      {row.description || <em className="text-gray-400">—</em>}
                    </td>
                    <td className="px-3 py-2 text-gray-800">
                      {row.location || <em className="text-gray-400">—</em>}
                    </td>
                    <td className="px-3 py-2 text-gray-800">
                      {row.work_scope || <em className="text-gray-400">—</em>}
                    </td>
                    <td className="px-3 py-2 text-gray-800">{row.quantity}</td>
                    <td className="px-3 py-2 text-gray-800">{row.uom}</td>
                    <td className="px-3 py-2 text-gray-800">
                      {row.planned_start_date}
                    </td>
                    <td className="px-3 py-2 text-gray-800">
                      {row.target_close_date}
                    </td>
                    <td className="px-3 py-2 text-gray-800">
                      {row.period_close_target}
                    </td>
                  </tr>
                  {hasErrors && (
                    <tr key={`wd-err-${row.rowNumber}`} className="bg-red-50">
                      <td />
                      <td colSpan={11} className="px-3 pb-2">
                        <ul className="text-xs text-red-600 list-disc list-inside space-y-0.5">
                          {row.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Summary Banner ───────────────────────────────────────────────────────────

function SummaryBanner({
  total,
  valid,
  invalid,
}: {
  total: number;
  valid: number;
  invalid: number;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
        <p className="text-2xl font-bold text-gray-900">{total}</p>
        <p className="text-gray-500 text-sm">Total rows</p>
      </div>
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
        <p className="text-2xl font-bold text-green-700">{valid}</p>
        <p className="text-green-600 text-sm">Ready to import</p>
      </div>
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
        <p className="text-2xl font-bold text-red-700">{invalid}</p>
        <p className="text-red-600 text-sm">Rows with errors</p>
      </div>
    </div>
  );
}

// ─── Result Card ──────────────────────────────────────────────────────────────

function ResultCard({
  result,
  label,
  onReset,
  onNavigate,
  navigateLabel,
}: {
  result: ImportResult;
  label: string;
  onReset: () => void;
  onNavigate: () => void;
  navigateLabel: string;
}) {
  return (
    <div className="max-w-lg mx-auto mt-8">
      <div
        className={`rounded-xl p-8 text-center border ${
          result.successCount > 0
            ? "bg-green-50 border-green-200"
            : "bg-red-50 border-red-200"
        }`}
      >
        {result.successCount > 0 ? (
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
        ) : (
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        )}
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {result.successCount > 0 ? "Import Successful" : "Import Failed"}
        </h2>
        <p className="text-gray-600 mb-2">
          <span className="font-semibold text-green-700">
            {result.successCount}
          </span>{" "}
          {label}
          {result.successCount !== 1 ? "s" : ""} imported successfully.
        </p>
        {result.failedRows.length > 0 && (
          <div className="mt-4 text-left bg-red-100 border border-red-200 rounded-lg p-4">
            <p className="text-red-700 font-medium text-sm mb-2">
              Failed rows:
            </p>
            <ul className="text-xs text-red-600 list-disc list-inside space-y-1">
              {result.failedRows.map((f, i) => (
                <li key={i}>
                  {f.rowNumber > 0 ? `Row ${f.rowNumber}: ${f.error}` : f.error}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={onReset}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors text-sm"
          >
            Import Another File
          </button>
          <button
            onClick={onNavigate}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            {navigateLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({
  id,
  inputRef,
  validating,
  parseError,
  onChange,
}: {
  id: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  validating: boolean;
  parseError: string | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <>
      {parseError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-700 text-sm">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {parseError}
        </div>
      )}
      <label
        htmlFor={id}
        className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
          validating
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400"
        }`}
      >
        {validating ? (
          <>
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-3" />
            <p className="text-blue-600 font-medium">Validating data…</p>
          </>
        ) : (
          <>
            <Upload className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-gray-600 font-medium">
              Click to upload or drag and drop
            </p>
            <p className="text-gray-400 text-sm mt-1">CSV, XLSX or XLS</p>
          </>
        )}
        <input
          id={id}
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={onChange}
          disabled={validating}
        />
      </label>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function ImportData() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>("work-orders");

  // ─── Work Order state ──────────────────────────────────────────────────────
  const woFileRef = useRef<HTMLInputElement>(null);
  const [woStep, setWoStep] = useState<ImportStep>("upload");
  const [woFileName, setWoFileName] = useState("");
  const [woRows, setWoRows] = useState<ValidatedWORow[]>([]);
  const [woValidating, setWoValidating] = useState(false);
  const [woImporting, setWoImporting] = useState(false);
  const [woResult, setWoResult] = useState<ImportResult | null>(null);
  const [woParseError, setWoParseError] = useState<string | null>(null);

  // ─── Work Details state ────────────────────────────────────────────────────
  const wdFileRef = useRef<HTMLInputElement>(null);
  const [wdStep, setWdStep] = useState<ImportStep>("upload");
  const [wdFileName, setWdFileName] = useState("");
  const [wdRows, setWdRows] = useState<ValidatedImportRow[]>([]);
  const [wdValidating, setWdValidating] = useState(false);
  const [wdImporting, setWdImporting] = useState(false);
  const [wdResult, setWdResult] = useState<ImportResult | null>(null);
  const [wdParseError, setWdParseError] = useState<string | null>(null);

  // Role check
  const canImport = profile?.role === "PPIC" || profile?.role === "MASTER";

  if (!canImport) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">
            Only PPIC and MASTER users can import data.
          </p>
        </div>
      </div>
    );
  }

  // ─── Template downloads ────────────────────────────────────────────────────

  const handleDownloadCombinedXLSX = () =>
    downloadXLSX(
      generateCombinedTemplateXLSX(),
      "work_orders_and_details_template.xlsx",
    );

  const handleDownloadWOCSV = () =>
    downloadFile(
      generateWorkOrderTemplateCSV(),
      "work_orders_template.csv",
      "text/csv",
    );

  const handleDownloadWDXLSX = () =>
    downloadXLSX(generateTemplateXLSX(), "work_details_template.xlsx");

  const handleDownloadWDCSV = () =>
    downloadFile(
      generateTemplateCSV(),
      "work_details_template.csv",
      "text/csv",
    );

  // ─── Work Order upload ─────────────────────────────────────────────────────

  const handleWOFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isCSV = file.name.endsWith(".csv");
    const isXLSX = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
    if (!isCSV && !isXLSX) {
      setWoParseError(
        "Please upload a CSV (.csv) or Excel (.xlsx / .xls) file",
      );
      return;
    }
    setWoParseError(null);
    setWoFileName(file.name);
    setWoValidating(true);
    try {
      if (isXLSX) {
        const buffer = await file.arrayBuffer();
        const { read } = await import("xlsx");
        const wb = read(buffer, { type: "array" });
        if (wb.SheetNames.length >= 2) {
          // Combined template — populate both tabs
          const combined = parseCombinedXLSX(buffer);
          if (combined.woRows.length > 0) {
            const validatedWO = await validateWORows(combined.woRows);
            setWoRows(validatedWO);
            setWoStep("preview");
          } else {
            setWoParseError("No work order rows found in the first sheet.");
            setWoValidating(false);
            return;
          }
          if (combined.wdRows.length > 0) {
            const validatedWD = await validateRows(combined.wdRows);
            setWdRows(validatedWD);
            setWdFileName(file.name + " (Work Details sheet)");
            setWdStep("preview");
          }
        } else {
          const parsed = parseWorkOrderXLSX(buffer);
          if (parsed.length === 0) {
            setWoParseError(
              "No data rows found. Make sure the file has a header row and at least one data row.",
            );
            setWoValidating(false);
            return;
          }
          const validated = await validateWORows(parsed);
          setWoRows(validated);
          setWoStep("preview");
        }
      } else {
        const text = await file.text();
        const parsed = parseWorkOrderCSV(text);
        if (parsed.length === 0) {
          setWoParseError(
            "No data rows found. Make sure the file has a header row and at least one data row.",
          );
          setWoValidating(false);
          return;
        }
        const validated = await validateWORows(parsed);
        setWoRows(validated);
        setWoStep("preview");
      }
    } catch (err) {
      setWoParseError(
        err instanceof Error ? err.message : "Failed to parse file",
      );
    } finally {
      setWoValidating(false);
      if (woFileRef.current) woFileRef.current.value = "";
    }
  };

  const handleWOImport = async () => {
    setWoImporting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: userProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      if (profileError) throw profileError;
      const result = await importWorkOrders(woRows, userProfile.id);
      if (result.successCount > 0) {
        await ActivityLogService.logActivity({
          action: "create",
          tableName: "work_order",
          recordId: 0,
          newData: { imported_count: result.successCount },
          description: `Imported ${result.successCount} work order(s) via file`,
        });
      }
      setWoResult(result);
      setWoStep("result");
    } catch (err) {
      setWoResult({
        successCount: 0,
        failedRows: [
          {
            rowNumber: 0,
            error: err instanceof Error ? err.message : "Unknown error",
          },
        ],
      });
      setWoStep("result");
    } finally {
      setWoImporting(false);
    }
  };

  const resetWO = () => {
    setWoStep("upload");
    setWoRows([]);
    setWoFileName("");
    setWoResult(null);
    setWoParseError(null);
  };

  // ─── Work Details upload ───────────────────────────────────────────────────

  const handleWDFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isCSV = file.name.endsWith(".csv");
    const isXLSX = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
    if (!isCSV && !isXLSX) {
      setWdParseError(
        "Please upload a CSV (.csv) or Excel (.xlsx / .xls) file",
      );
      return;
    }
    setWdParseError(null);
    setWdFileName(file.name);
    setWdValidating(true);
    try {
      let parsed;
      if (isXLSX) {
        const buffer = await file.arrayBuffer();
        parsed = parseXLSX(buffer);
      } else {
        const text = await file.text();
        parsed = parseCSV(text);
      }
      if (parsed.length === 0) {
        setWdParseError(
          "No data rows found. Make sure the file has a header row and at least one data row.",
        );
        setWdValidating(false);
        return;
      }
      const validated = await validateRows(parsed);
      setWdRows(validated);
      setWdStep("preview");
    } catch (err) {
      setWdParseError(
        err instanceof Error ? err.message : "Failed to parse file",
      );
    } finally {
      setWdValidating(false);
      if (wdFileRef.current) wdFileRef.current.value = "";
    }
  };

  const handleWDImport = async () => {
    setWdImporting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: userProfile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      if (profileError) throw profileError;
      const result = await importWorkDetails(wdRows, userProfile.id);
      if (result.successCount > 0) {
        await ActivityLogService.logActivity({
          action: "create",
          tableName: "work_details",
          recordId: 0,
          newData: { imported_count: result.successCount },
          description: `Imported ${result.successCount} work detail(s) via file`,
        });
      }
      setWdResult(result);
      setWdStep("result");
    } catch (err) {
      setWdResult({
        successCount: 0,
        failedRows: [
          {
            rowNumber: 0,
            error: err instanceof Error ? err.message : "Unknown error",
          },
        ],
      });
      setWdStep("result");
    } finally {
      setWdImporting(false);
    }
  };

  const resetWD = () => {
    setWdStep("upload");
    setWdRows([]);
    setWdFileName("");
    setWdResult(null);
    setWdParseError(null);
  };

  // ─── Computed ──────────────────────────────────────────────────────────────

  const woValid = woRows.filter((r) => r.errors.length === 0).length;
  const woInvalid = woRows.filter((r) => r.errors.length > 0).length;
  const wdValid = wdRows.filter((r) => r.errors.length === 0).length;
  const wdInvalid = wdRows.filter((r) => r.errors.length > 0).length;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Import Data</h1>
            <p className="text-gray-600 mt-2">
              Bulk import work orders and work details from CSV or Excel files
            </p>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
      </div>

      {/* Combined template banner */}
      <div className="mb-6 bg-indigo-50 border border-indigo-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-indigo-900 text-sm">
            Want to import Work Orders + Work Details together?
          </p>
          <p className="text-indigo-700 text-xs mt-0.5">
            Download the combined Excel template (3 sheets). Fill in the Work
            Orders and Work Details sheets, then upload in the Work Orders tab —
            both will be validated automatically.
          </p>
        </div>
        <button
          onClick={handleDownloadCombinedXLSX}
          className="flex-shrink-0 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm"
        >
          <Download className="w-4 h-4" /> Combined Template (.xlsx)
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab("work-orders")}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "work-orders"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Work Orders
          {woStep === "preview" && (
            <span
              className={`ml-2 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                woInvalid > 0
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {woRows.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("work-details")}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "work-details"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Work Details
          {wdStep === "preview" && (
            <span
              className={`ml-2 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                wdInvalid > 0
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {wdRows.length}
            </span>
          )}
        </button>
      </div>

      {/* ── WORK ORDERS TAB ─────────────────────────────────────────────────── */}
      {activeTab === "work-orders" && (
        <div className="space-y-6">
          {woStep === "upload" && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <FileText className="w-8 h-8 text-blue-600 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold text-blue-900">
                      Step 1 — Download the Template
                    </h2>
                    <p className="text-blue-700 text-sm mt-1">
                      Vessel name must match an existing vessel exactly
                      (case-insensitive). Kapro name must match an existing
                      Kapro record or be left blank.
                    </p>
                    <div className="mt-3 text-sm text-blue-800">
                      <p className="font-medium mb-1">Required columns:</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                        {[
                          "vessel_name",
                          "shipyard_wo_number",
                          "shipyard_wo_date (YYYY-MM-DD)",
                        ].map((c) => (
                          <code
                            key={c}
                            className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-mono"
                          >
                            {c}
                          </code>
                        ))}
                      </div>
                      <p className="font-medium mt-2 mb-1">Optional columns:</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                        {[
                          "customer_wo_number",
                          "customer_wo_date",
                          "is_additional_wo",
                          "kapro_name",
                          "work_location",
                          "work_type",
                        ].map((c) => (
                          <code
                            key={c}
                            className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-mono"
                          >
                            {c}
                          </code>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        onClick={handleDownloadWOCSV}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
                      >
                        <Download className="w-4 h-4" /> Download CSV
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Step 2 — Upload your file
                </h2>
                <UploadZone
                  id="wo-upload"
                  inputRef={woFileRef}
                  validating={woValidating}
                  parseError={woParseError}
                  onChange={handleWOFileChange}
                />
              </div>
            </>
          )}

          {woStep === "preview" && (
            <>
              <SummaryBanner
                total={woRows.length}
                valid={woValid}
                invalid={woInvalid}
              />

              {woInvalid > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-yellow-800 text-sm">
                    Rows with errors will be <strong>skipped</strong>. Fix
                    errors in your file and re-upload to import all rows.
                  </p>
                </div>
              )}

              {wdStep === "preview" && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-center gap-2 text-sm text-indigo-800">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                  Combined file detected — {wdRows.length} work detail row
                  {wdRows.length !== 1 ? "s" : ""} also loaded. Review &amp;
                  import them in the{" "}
                  <button
                    onClick={() => setActiveTab("work-details")}
                    className="underline font-medium"
                  >
                    Work Details tab
                  </button>
                  .
                </div>
              )}

              <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-gray-700">
                  <FileText className="w-5 h-5 text-gray-400" />
                  <span className="font-medium text-sm">{woFileName}</span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={resetWO}
                    className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                  >
                    Re-upload
                  </button>
                  <button
                    onClick={handleWOImport}
                    disabled={woImporting || woValid === 0}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {woImporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Importing…
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" /> Import {woValid} Work
                        Order{woValid !== 1 ? "s" : ""}
                      </>
                    )}
                  </button>
                </div>
              </div>

              <WOPreviewTable rows={woRows} />
            </>
          )}

          {woStep === "result" && woResult && (
            <ResultCard
              result={woResult}
              label="work order"
              onReset={resetWO}
              onNavigate={() => navigate("/work-orders")}
              navigateLabel="Go to Work Orders"
            />
          )}
        </div>
      )}

      {/* ── WORK DETAILS TAB ────────────────────────────────────────────────── */}
      {activeTab === "work-details" && (
        <div className="space-y-6">
          {wdStep === "upload" && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <FileText className="w-8 h-8 text-blue-600 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h2 className="text-lg font-semibold text-blue-900">
                      Step 1 — Download the Template
                    </h2>
                    <p className="text-blue-700 text-sm mt-1">
                      Vessel name, work order number, location, and work scope
                      must match existing records exactly (case-insensitive).
                      The Excel template includes an Instructions sheet.
                    </p>
                    <div className="mt-3 text-sm text-blue-800">
                      <p className="font-medium mb-1">Required columns:</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                        {[
                          "vessel_name",
                          "work_order_number",
                          "description",
                          "location",
                          "work_scope",
                          "quantity",
                          "uom",
                          "planned_start_date (YYYY-MM-DD)",
                          "target_close_date (YYYY-MM-DD)",
                          "period_close_target",
                        ].map((c) => (
                          <code
                            key={c}
                            className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-mono"
                          >
                            {c}
                          </code>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        onClick={handleDownloadWDXLSX}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm"
                      >
                        <Download className="w-4 h-4" /> Download Excel (.xlsx)
                      </button>
                      <button
                        onClick={handleDownloadWDCSV}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
                      >
                        <Download className="w-4 h-4" /> Download CSV
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Step 2 — Upload your file
                </h2>
                <UploadZone
                  id="wd-upload"
                  inputRef={wdFileRef}
                  validating={wdValidating}
                  parseError={wdParseError}
                  onChange={handleWDFileChange}
                />
              </div>
            </>
          )}

          {wdStep === "preview" && (
            <>
              <SummaryBanner
                total={wdRows.length}
                valid={wdValid}
                invalid={wdInvalid}
              />

              {wdInvalid > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-yellow-800 text-sm">
                    Rows with errors will be <strong>skipped</strong>. Fix
                    errors in your file and re-upload to import all rows.
                  </p>
                </div>
              )}

              <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-gray-700">
                  <FileText className="w-5 h-5 text-gray-400" />
                  <span className="font-medium text-sm">{wdFileName}</span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={resetWD}
                    className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                  >
                    Re-upload
                  </button>
                  <button
                    onClick={handleWDImport}
                    disabled={wdImporting || wdValid === 0}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {wdImporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Importing…
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" /> Import {wdValid} Work
                        Detail{wdValid !== 1 ? "s" : ""}
                      </>
                    )}
                  </button>
                </div>
              </div>

              <WDPreviewTable rows={wdRows} />
            </>
          )}

          {wdStep === "result" && wdResult && (
            <ResultCard
              result={wdResult}
              label="work detail"
              onReset={resetWD}
              onNavigate={() => navigate("/work-details")}
              navigateLabel="Go to Work Details"
            />
          )}
        </div>
      )}
    </div>
  );
}
