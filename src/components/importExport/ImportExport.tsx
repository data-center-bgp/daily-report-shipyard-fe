import { useState, useRef, useEffect } from "react";
import {
  exportVesselData,
  generateCSV,
  downloadFile,
  type ExportOptions,
} from "../../utils/exportHandler";
import {
  importData,
  parseCSV,
  getEntitySchema,
  type ImportableEntity,
  type ImportOptions,
  type ImportResult,
} from "../../utils/importHandler";
import { supabase } from "../../lib/supabase";

interface Vessel {
  id: number;
  name: string;
  company: string;
}

export default function ImportExport() {
  const [activeTab, setActiveTab] = useState<"export" | "import">("export");
  const [selectedEntity, setSelectedEntity] =
    useState<ImportableEntity>("vessels");
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: "csv",
    filters: undefined,
  });
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    overwrite: false,
    skipDuplicates: true,
    validateOnly: false,
  });
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [selectedVessels, setSelectedVessels] = useState<number[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load vessels for filtering
  const loadVessels = async () => {
    const { data } = await supabase
      .from("vessel")
      .select("id, name, company")
      .is("deleted_at", null)
      .order("name");

    setVessels(data || []);
  };

  useEffect(() => {
    loadVessels();
  }, []);

  const importEntityOptions: {
    value: ImportableEntity;
    label: string;
    description: string;
  }[] = [
    {
      value: "vessels",
      label: "Vessels",
      description: "Basic vessel information (name, type, company, IMO, etc.)",
    },
    {
      value: "work_orders",
      label: "Work Orders",
      description: "Work order records with vessel references",
    },
    {
      value: "work_details",
      label: "Work Details",
      description: "Work detail records with work order references",
    },
    {
      value: "work_progress",
      label: "Work Progress",
      description: "Progress records with work detail references",
    },
    {
      value: "invoice_details",
      label: "Invoice Details",
      description: "Invoice records with work order references",
    },
  ];

  const handleExport = async () => {
    setLoading(true);
    try {
      const options = {
        ...exportOptions,
        filters:
          selectedVessels.length > 0
            ? { vesselIds: selectedVessels }
            : undefined,
      };

      const exportResult = await exportVesselData(options);
      const content = generateCSV(exportResult.data);

      downloadFile(content, exportResult.filename, "text/csv");

      const vesselText =
        selectedVessels.length > 0
          ? `for ${selectedVessels.length} selected vessel(s)`
          : "for all vessels";

      alert(
        `Successfully exported ${exportResult.totalRecords} records of comprehensive vessel data ${vesselText}`
      );
    } catch (error: any) {
      console.error("Export error:", error);
      alert(`Export failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleVesselSelect = (vesselId: number) => {
    setSelectedVessels((prev) => {
      if (prev.includes(vesselId)) {
        return prev.filter((id) => id !== vesselId);
      } else {
        return [...prev, vesselId];
      }
    });
  };

  const handleSelectAllVessels = () => {
    if (selectedVessels.length === vessels.length) {
      setSelectedVessels([]);
    } else {
      setSelectedVessels(vessels.map((v) => v.id));
    }
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportFile(file);

    try {
      const text = await file.text();
      let data: any[];

      if (file.name.endsWith(".csv")) {
        data = parseCSV(text);
      } else {
        throw new Error("Unsupported file format. Please use CSV files only.");
      }

      setPreviewData(data.slice(0, 5));
    } catch (error: any) {
      alert(`File parsing failed: ${error.message}`);
      setImportFile(null);
      setPreviewData([]);
    }
  };

  const handleImport = async () => {
    if (!importFile || !previewData.length) {
      alert("Please select a valid file first");
      return;
    }

    setLoading(true);
    try {
      const text = await importFile.text();
      const data = parseCSV(text);

      const result = await importData(selectedEntity, data, importOptions);
      setImportResult(result);
    } catch (error: any) {
      setImportResult({
        success: false,
        message: `Import failed: ${error.message}`,
        importedCount: 0,
        errors: [error.message],
        skippedCount: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const clearImport = () => {
    setImportFile(null);
    setPreviewData([]);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const schema = getEntitySchema(selectedEntity);
  const selectedEntityOption = importEntityOptions.find(
    (e) => e.value === selectedEntity
  );

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Import & Export Data
        </h1>
        <p className="text-gray-600">
          Export comprehensive vessel data or import data for specific entities
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab("export")}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === "export"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              📤 Export Data
            </button>
            <button
              onClick={() => setActiveTab("import")}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === "import"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              📥 Import Data
            </button>
          </nav>
        </div>
      </div>

      {activeTab === "export" ? (
        /* Export Section - Simplified to only comprehensive export */
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Export Comprehensive Vessel Data
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Export Configuration */}
            <div className="space-y-6">
              {/* Vessel Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filter by Vessels
                </label>
                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">
                      {selectedVessels.length} of {vessels.length} vessels
                      selected
                    </span>
                    <button
                      onClick={handleSelectAllVessels}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      {selectedVessels.length === vessels.length
                        ? "Deselect All"
                        : "Select All"}
                    </button>
                  </div>
                  {selectedVessels.length === 0 && (
                    <p className="text-sm text-orange-600">
                      No vessels selected - will export all vessels
                    </p>
                  )}
                </div>

                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                  {vessels.map((vessel) => (
                    <label
                      key={vessel.id}
                      className="flex items-center p-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedVessels.includes(vessel.id)}
                        onChange={() => handleVesselSelect(vessel.id)}
                        className="mr-3"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{vessel.name}</div>
                        <div className="text-xs text-gray-500">
                          {vessel.company}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Export Button */}
              <button
                onClick={handleExport}
                disabled={loading}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Exporting...
                  </>
                ) : (
                  <>📤 Export Comprehensive Data as CSV</>
                )}
              </button>
            </div>

            {/* Export Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">
                Export Information
              </h3>
              <div className="space-y-2 text-sm text-gray-600">
                <p>
                  <strong>Data Type:</strong> Comprehensive Vessel Data
                </p>
                <p>
                  <strong>Format:</strong> CSV
                </p>
                {selectedVessels.length > 0 ? (
                  <p>
                    <strong>Vessels:</strong> {selectedVessels.length} selected
                  </p>
                ) : (
                  <p>
                    <strong>Scope:</strong> All vessels
                  </p>
                )}

                <div className="bg-blue-50 p-3 rounded mt-3">
                  <p className="font-medium text-blue-900 mb-1">
                    Comprehensive Export includes:
                  </p>
                  <ul className="text-xs text-blue-800 space-y-1">
                    <li>
                      • Vessel information (name, type, company, IMO, flag,
                      built year)
                    </li>
                    <li>
                      • Work order details (customer/shipyard numbers, dates,
                      status)
                    </li>
                    <li>
                      • Work details (descriptions, estimated hours,
                      departments)
                    </li>
                    <li>
                      • Progress records (percentages, dates, storage paths,
                      evidence URLs)
                    </li>
                    <li>• Verification status and details</li>
                    <li>
                      • Invoice information (numbers, amounts, payment status)
                    </li>
                  </ul>
                  <p className="text-xs text-blue-700 mt-2 font-medium">
                    💡 All data is joined and flattened into a single CSV for
                    comprehensive analysis
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Import Section */
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Import Data
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Import Configuration */}
            <div className="space-y-6">
              {/* Entity Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Data Type
                </label>
                <select
                  value={selectedEntity}
                  onChange={(e) =>
                    setSelectedEntity(e.target.value as ImportableEntity)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {importEntityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {selectedEntityOption?.description}
                </p>
              </div>

              {/* File Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select CSV File
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Supported format: CSV only
                </p>
              </div>

              {/* Import Options */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Import Options
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={importOptions.overwrite}
                      onChange={(e) =>
                        setImportOptions((prev) => ({
                          ...prev,
                          overwrite: e.target.checked,
                        }))
                      }
                      className="mr-2"
                    />
                    Overwrite existing records
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={importOptions.skipDuplicates}
                      onChange={(e) =>
                        setImportOptions((prev) => ({
                          ...prev,
                          skipDuplicates: e.target.checked,
                        }))
                      }
                      className="mr-2"
                    />
                    Skip duplicate records
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={importOptions.validateOnly}
                      onChange={(e) =>
                        setImportOptions((prev) => ({
                          ...prev,
                          validateOnly: e.target.checked,
                        }))
                      }
                      className="mr-2"
                    />
                    Validate only (don't import)
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={handleImport}
                  disabled={loading || !importFile}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Processing...
                    </>
                  ) : (
                    <>📥 Import Data</>
                  )}
                </button>
                <button
                  onClick={clearImport}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Preview/Results */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">
                {previewData.length > 0 ? "Data Preview" : "Import Information"}
              </h3>

              {previewData.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Showing first 5 rows of {importFile?.name}
                  </p>
                  <div className="bg-white rounded border overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          {Object.keys(previewData[0] || {}).map((key) => (
                            <th
                              key={key}
                              className="px-2 py-1 text-left font-medium text-gray-500"
                            >
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.map((row, index) => (
                          <tr key={index} className="border-t">
                            {Object.values(row).map((value: any, cellIndex) => (
                              <td
                                key={cellIndex}
                                className="px-2 py-1 text-gray-900"
                              >
                                {String(value).substring(0, 30)}
                                {String(value).length > 30 && "..."}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-600">
                  <p className="mb-2">Select a CSV file to see preview</p>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">
                      Required Fields for {selectedEntityOption?.label}:
                    </h4>
                    <div className="bg-white rounded p-2">
                      {schema.map((field) => (
                        <span
                          key={field}
                          className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded mr-1 mb-1 text-xs"
                        >
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Import Results */}
              {importResult && (
                <div
                  className={`mt-4 p-3 rounded ${
                    importResult.success
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  <h4 className="font-medium mb-2">Import Results</h4>
                  <p className="text-sm mb-2">{importResult.message}</p>
                  <div className="text-xs space-y-1">
                    <p>Imported: {importResult.importedCount} records</p>
                    <p>Skipped: {importResult.skippedCount} records</p>
                    {importResult.errors.length > 0 && (
                      <div>
                        <p className="font-medium">Errors:</p>
                        <ul className="list-disc list-inside ml-2">
                          {importResult.errors
                            .slice(0, 3)
                            .map((error, index) => (
                              <li key={index}>{error}</li>
                            ))}
                          {importResult.errors.length > 3 && (
                            <li>
                              ... and {importResult.errors.length - 3} more
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Help Section */}
      <div className="mt-8 bg-blue-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">
          📚 Help & Guidelines
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-blue-800">
          <div>
            <h4 className="font-medium mb-3">Export Guidelines:</h4>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <strong>Comprehensive Data:</strong> Exports all related data in
                a single flattened CSV file
              </li>
              <li>
                <strong>Vessel Selection:</strong> Use vessel filter to focus on
                specific vessels or leave empty for all vessels
              </li>
              <li>
                <strong>File Naming:</strong> Files include vessel name(s) and
                date for easy identification
              </li>
              <li>
                <strong>Large Exports:</strong> May take several minutes
                depending on data volume
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-3">Import Guidelines:</h4>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <strong>Single Entities Only:</strong> Import individual entity
                data, not comprehensive exports
              </li>
              <li>
                <strong>Column Names:</strong> Must match the required fields
                exactly (case-sensitive)
              </li>
              <li>
                <strong>Validation:</strong> Use "Validate only" to check data
                structure before importing
              </li>
              <li>
                <strong>Safety:</strong> Always backup your data before large
                imports
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
