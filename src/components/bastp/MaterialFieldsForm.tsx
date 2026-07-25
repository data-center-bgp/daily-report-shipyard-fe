import type { RefObject } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import type {
  MaterialList,
  MaterialDensity,
  MaterialControlFormData,
} from "../../types/materialControl.types";
import { UOM_OPTIONS } from "../../utils/materialCalculations";

export interface MaterialFieldsValues extends MaterialControlFormData {
  materialSearchTerm: string;
}

interface MaterialFieldsFormProps {
  values: MaterialFieldsValues;
  onFieldChange: (
    field: keyof MaterialControlFormData,
    value: number | string,
  ) => void;
  materialDensities: MaterialDensity[];

  // Material search
  filteredMaterials: MaterialList[];
  isMaterialDropdownOpen: boolean;
  materialSearchReadOnly?: boolean;
  onMaterialSearchChange: (value: string) => void;
  onMaterialSearchFocus: () => void;
  onMaterialSelect: (material: MaterialList) => void;
  onClearMaterialSearch: () => void;
  materialDropdownRef?: RefObject<HTMLDivElement> | null;

  // Density dropdown
  isDensityDropdownOpen: boolean;
  densitySearchTerm: string;
  onToggleDensityDropdown: () => void;
  onDensitySearchChange: (value: string) => void;
  onSelectDensity: (densityId: number) => void;

  dimensionsGridClass?: string;
}

/**
 * The material-search dropdown, density-type dropdown, dimension inputs,
 * UOM radio group, and total-amount readout — shared between the batch
 * add-material rows and the single edit form, which otherwise duplicated
 * this markup and behavior almost verbatim.
 */
export default function MaterialFieldsForm({
  values,
  onFieldChange,
  materialDensities,
  filteredMaterials,
  isMaterialDropdownOpen,
  materialSearchReadOnly = false,
  onMaterialSearchChange,
  onMaterialSearchFocus,
  onMaterialSelect,
  onClearMaterialSearch,
  materialDropdownRef,
  isDensityDropdownOpen,
  densitySearchTerm,
  onToggleDensityDropdown,
  onDensitySearchChange,
  onSelectDensity,
  dimensionsGridClass = "grid grid-cols-1 md:grid-cols-3 gap-4",
}: MaterialFieldsFormProps) {
  const selectedDensity = materialDensities.find(
    (d) => d.id === values.material_density_id,
  );
  const filteredDensities = materialDensities.filter((d) =>
    d.name.toLowerCase().includes(densitySearchTerm.toLowerCase()),
  );

  return (
    <>
      {/* Material Search */}
      <div className="relative" ref={materialDropdownRef}>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Select Material <span className="text-red-600">*</span>
          {materialSearchReadOnly && values.material_id > 0 && (
            <span className="ml-2 text-xs text-green-600 font-normal">
              ✓ Selected
            </span>
          )}
        </label>
        <div className="relative">
          <input
            type="text"
            value={values.materialSearchTerm}
            onChange={(e) => {
              if (!materialSearchReadOnly || values.material_id === 0) {
                onMaterialSearchChange(e.target.value);
                onMaterialSearchFocus();
              }
            }}
            onFocus={() => {
              if (!materialSearchReadOnly || values.material_id === 0) {
                onMaterialSearchFocus();
              }
            }}
            placeholder="Search materials..."
            readOnly={materialSearchReadOnly && values.material_id > 0}
            className={`w-full px-3 py-2 pl-10 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              materialSearchReadOnly && values.material_id > 0
                ? "border-green-500 bg-green-50"
                : "border-gray-300"
            }`}
          />
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          {values.materialSearchTerm && (
            <button
              type="button"
              onClick={onClearMaterialSearch}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {isMaterialDropdownOpen && filteredMaterials.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {filteredMaterials.map((material) => (
              <div
                key={material.id}
                onClick={() => onMaterialSelect(material)}
                className="px-3 py-2 cursor-pointer hover:bg-blue-50"
              >
                <div className="font-medium text-gray-900">
                  {material.material}
                </div>
                {material.specification && (
                  <div className="text-sm text-gray-600">
                    {material.specification}
                  </div>
                )}
                {material.category && (
                  <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                    {material.category}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Material Density Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Material Density Type
          {values.material_density_id > 0 && (
            <span className="ml-2 text-xs text-green-600 font-normal">
              ✓ Auto-filled
            </span>
          )}
        </label>
        <div className="relative">
          {isDensityDropdownOpen && (
            <div
              className="fixed inset-0 z-10"
              onClick={onToggleDensityDropdown}
            />
          )}
          <button
            type="button"
            onClick={onToggleDensityDropdown}
            className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            {values.material_density_id > 0 && selectedDensity ? (
              <span className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-gray-900 truncate">
                  {selectedDensity.name}
                </span>
                <span className="text-gray-400 flex-shrink-0 text-xs">
                  {selectedDensity.density} {selectedDensity.unit}
                </span>
              </span>
            ) : (
              <span className="text-gray-400">Select density type...</span>
            )}
            <ChevronDown
              className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${
                isDensityDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          {isDensityDropdownOpen && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
              <div className="p-2 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    autoFocus
                    value={densitySearchTerm}
                    onChange={(e) => onDensitySearchChange(e.target.value)}
                    placeholder="Search density..."
                    className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => onSelectDensity(0)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                    !values.material_density_id
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700"
                  }`}
                >
                  <span className="font-medium">None</span>
                  <span className="text-xs text-gray-400">Manual entry</span>
                </button>
                {filteredDensities.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onSelectDensity(d.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                      values.material_density_id === d.id
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700"
                    }`}
                  >
                    <span className="font-medium">{d.name}</span>
                    <span className="text-xs text-gray-400">
                      {d.density} {d.unit}
                    </span>
                  </button>
                ))}
                {filteredDensities.length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-3">
                    No matches
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dimensions */}
      <div>
        <div className="text-xs text-gray-500 mb-1">
          Dimensions in <span className="font-medium">mm</span> (auto-converted
          to meters; leave blank if not applicable)
        </div>
        <div className={dimensionsGridClass}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Length (mm)
            </label>
            <input
              type="number"
              step="0.0001"
              value={values.length || ""}
              onChange={(e) =>
                onFieldChange("length", parseFloat(e.target.value) || 0)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="0"
              min="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Width (mm)
            </label>
            <input
              type="number"
              step="0.0001"
              value={values.width || ""}
              onChange={(e) =>
                onFieldChange("width", parseFloat(e.target.value) || 0)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="0"
              min="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Thickness (mm)
            </label>
            <input
              type="number"
              step="0.0001"
              value={values.thickness || ""}
              onChange={(e) =>
                onFieldChange("thickness", parseFloat(e.target.value) || 0)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="0"
              min="0"
            />
          </div>
        </div>
      </div>

      {/* Density (separate row, different unit) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Density (g/cm³)
          {values.material_density_id > 0 && (
            <span className="ml-1 text-xs text-amber-600 font-normal">
              override
            </span>
          )}
        </label>
        <input
          type="number"
          step="0.0001"
          value={values.density || ""}
          onChange={(e) =>
            onFieldChange("density", parseFloat(e.target.value) || 0)
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          placeholder="0"
          min="0"
        />
      </div>

      {/* Amount, UOM, Total */}
      <div className={dimensionsGridClass}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Amount <span className="text-red-600">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            value={values.amount || ""}
            onChange={(e) =>
              onFieldChange("amount", parseFloat(e.target.value) || 0)
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="0"
            min="0.01"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            UOM <span className="text-red-600">*</span>
          </label>
          <div
            role="radiogroup"
            aria-label="Unit of measurement"
            className="inline-flex w-full rounded-lg border border-gray-300 bg-gray-50 p-1 gap-1"
          >
            {UOM_OPTIONS.map((opt) => {
              const active = values.uom === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={opt.description}
                  onClick={() => onFieldChange("uom", opt.value)}
                  className={`flex-1 px-2 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    active
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-gray-700 hover:bg-white"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Total Amount
          </label>
          <input
            type="number"
            value={
              values.total_amount ? Number(values.total_amount.toFixed(6)) : 0
            }
            readOnly
            className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-semibold"
          />
        </div>
      </div>
    </>
  );
}
