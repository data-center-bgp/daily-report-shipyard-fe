import { useState, useEffect } from "react";
import {
  exportVesselData,
  generateCSV,
  downloadFile,
  type ExportOptions,
} from "../../utils/exportHandler";
import { supabase } from "../../lib/supabase";

interface Vessel {
  id: number;
  name: string;
  company: string;
}

export default function ExportData() {
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: "csv",
    filters: undefined,
  });
  const [loading, setLoading] = useState(false);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [selectedVessels, setSelectedVessels] = useState<number[]>([]);

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

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Export Data</h1>
        <p className="text-gray-600">
          Export comprehensive vessel data for analysis and reporting
        </p>
      </div>

      {/* Export Section */}
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
                    • Vessel information (name, type, company, IMO, flag, built
                    year)
                  </li>
                  <li>
                    • Work order details (customer/shipyard numbers, dates,
                    status)
                  </li>
                  <li>
                    • Work details (descriptions, estimated hours, departments)
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

      {/* Help Section */}
      <div className="mt-8 bg-blue-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">
          📚 Export Guidelines
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-blue-800">
          <div>
            <h4 className="font-medium mb-3">Data Structure:</h4>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <strong>Comprehensive Data:</strong> All related data in a
                single flattened CSV file
              </li>
              <li>
                <strong>Relational Structure:</strong> Vessel → Work Orders →
                Work Details → Progress
              </li>
              <li>
                <strong>Column Naming:</strong> Prefixed columns for easy
                identification (vessel_, wo_, wd_, progress_)
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-3">Best Practices:</h4>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <strong>Vessel Selection:</strong> Use vessel filter for focused
                exports or leave empty for all vessels
              </li>
              <li>
                <strong>File Naming:</strong> Files include vessel name(s) and
                date for easy identification
              </li>
              <li>
                <strong>Large Exports:</strong> May take several minutes
                depending on data volume
              </li>
              <li>
                <strong>Data Import:</strong> Use Supabase's native import
                features for data loading
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
