import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import type {
  GeneralServiceInput,
  GeneralServiceType,
} from "../../types/generalService.types";
import {
  UOM_LABEL,
  formatTons,
  isFixedQuantityUom,
} from "../../utils/generalServices";

interface ServiceGroup {
  number: string | null;
  title: string;
  codes: string[];
}

// Same order and grouping as the standard docking quotation: a numbered block
// per service, with the lines that belong under it indented. Any service type
// not listed here (including ones added later) shows under "Other services".
const SERVICE_GROUPS: ServiceGroup[] = [
  {
    number: "1",
    title: "Docking",
    codes: [
      "DOCKING_UNDOCKING",
      "TUG_BOAT_ASSISTANCE",
      "DOCK_MOORING_ASSISTANCE",
      "BLOCK_ARRANGEMENT",
      "VESSEL_ON_DOCK",
      "BERTHING BEFORE DOCKING",
      "BERTHING AFTER DOCKING",
      "DOCKING",
      "UNDOCKING",
    ],
  },
  { number: "2", title: "Docking Report / SN", codes: ["DOCKING_REPORT"] },
  {
    number: "3",
    title: "Electrical Supply",
    codes: ["ELECTRICAL_SUPPLY", "SHORE_POWER_CONNECTION"],
  },
  { number: "4", title: "Security Service", codes: ["SECURITY_SERVICE"] },
  { number: "5", title: "Toilet Service", codes: ["TOILET_SERVICES"] },
  { number: "6", title: "Trash Bin Service", codes: ["TRASH_BIN_SERVICE"] },
  {
    number: "7",
    title: "Facilities & Amenities and Operators",
    codes: ["SARFAS_AND_OPERATORS"],
  },
  {
    number: "8",
    title: "Asistensi Penggunaan Alat Pendukung Kerja",
    codes: ["WORK_EQUIPMENT_ASSISTANCE"],
  },
];

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";

export interface GeneralServicesPickerProps {
  serviceTypes: GeneralServiceType[];
  selectedServices: GeneralServiceInput[];
  onToggle: (serviceTypeId: number) => void;
  onStartDateChange: (serviceTypeId: number, value: string) => void;
  onCloseDateChange: (serviceTypeId: number, value: string) => void;
  onRemarksChange: (serviceTypeId: number, value: string) => void;
  onFixedQuantityChange: (serviceTypeId: number, value: string) => void;
  onTonEntryChange: (
    index: number,
    patch: { supply_date?: string; quantity?: string; remarks?: string },
  ) => void;
  onAddTonEntry: (serviceTypeId: number) => void;
  onRemoveTonEntry: (index: number) => void;
}

export default function GeneralServicesPicker({
  serviceTypes,
  selectedServices,
  onToggle,
  onStartDateChange,
  onCloseDateChange,
  onRemarksChange,
  onFixedQuantityChange,
  onTonEntryChange,
  onAddTonEntry,
  onRemoveTonEntry,
}: GeneralServicesPickerProps) {
  const byCode = new Map(serviceTypes.map((t) => [t.service_code, t]));
  const placed = new Set<number>();
  const groups = SERVICE_GROUPS.map((g) => {
    const items = g.codes
      .map((code) => byCode.get(code))
      .filter((t): t is GeneralServiceType => !!t);
    items.forEach((t) => placed.add(t.id));
    return { ...g, items };
  });
  const others = serviceTypes.filter((t) => !placed.has(t.id));
  if (others.length > 0) {
    groups.push({
      number: null,
      title: "Other services",
      codes: [],
      items: others,
    });
  }

  const renderInputs = (serviceType: GeneralServiceType) => {
    const serviceData = selectedServices.find(
      (s) => s.service_type_id === serviceType.id,
    );

    if (serviceType.uom === "ton") {
      const deliveries = selectedServices
        .map((s, index) => ({ s, index }))
        .filter(({ s }) => s.service_type_id === serviceType.id);
      const totalTons = deliveries.reduce(
        (sum, { s }) => sum + (Number(s.quantity) || 0),
        0,
      );
      return (
        <div className="space-y-3">
          {deliveries.map(({ s, index }, n) => (
            <div
              key={index}
              className="rounded-lg border border-blue-200 bg-white p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Delivery {n + 1}
                </span>
                {deliveries.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveTonEntry(index)}
                    className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Supply Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={s.start_date || ""}
                    onChange={(e) =>
                      onTonEntryChange(index, { supply_date: e.target.value })
                    }
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quantity (ton) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={s.quantity || ""}
                    onChange={(e) =>
                      onTonEntryChange(index, { quantity: e.target.value })
                    }
                    className={inputClass}
                    placeholder="e.g. 12.5"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Remarks (Optional)
                  </label>
                  <input
                    type="text"
                    value={s.remarks || ""}
                    onChange={(e) =>
                      onTonEntryChange(index, { remarks: e.target.value })
                    }
                    className={inputClass}
                    placeholder="Add notes..."
                  />
                </div>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => onAddTonEntry(serviceType.id)}
              className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Add delivery
            </button>
            <span className="text-sm text-gray-700">
              {deliveries.length}{" "}
              {deliveries.length === 1 ? "delivery" : "deliveries"} · Total{" "}
              <strong>{formatTons(totalTons)} ton</strong>
            </span>
          </div>
        </div>
      );
    }

    if (isFixedQuantityUom(serviceType.uom)) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity ({UOM_LABEL[serviceType.uom]}){" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={serviceData?.quantity || ""}
              onChange={(e) =>
                onFixedQuantityChange(serviceType.id, e.target.value)
              }
              className={inputClass}
              placeholder="1"
              required
            />
            <p className="text-xs text-gray-500 mt-1">No dates needed</p>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Remarks (Optional)
            </label>
            <input
              type="text"
              value={serviceData?.remarks || ""}
              onChange={(e) => onRemarksChange(serviceType.id, e.target.value)}
              className={inputClass}
              placeholder="Add notes..."
            />
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={serviceData?.start_date || ""}
              onChange={(e) =>
                onStartDateChange(serviceType.id, e.target.value)
              }
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Close Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={serviceData?.close_date || ""}
              onChange={(e) =>
                onCloseDateChange(serviceType.id, e.target.value)
              }
              min={serviceData?.start_date}
              className={inputClass}
              required
            />
            {serviceData?.start_date &&
              serviceData?.close_date &&
              new Date(serviceData.close_date) <
                new Date(serviceData.start_date) && (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Close date cannot be
                  before start date
                </p>
              )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Total Days
            </label>
            <input
              type="number"
              value={serviceData?.total_days || 0}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
              placeholder="Auto-calculated"
            />
            <p className="text-xs text-gray-500 mt-1">
              Auto-calculated from dates
            </p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Remarks (Optional)
          </label>
          <input
            type="text"
            value={serviceData?.remarks || ""}
            onChange={(e) => onRemarksChange(serviceType.id, e.target.value)}
            className={inputClass}
            placeholder="Add notes..."
          />
        </div>
      </div>
    );
  };

  const renderRow = (
    serviceType: GeneralServiceType,
    options: { sub: boolean; bold: boolean },
  ) => {
    const isSelected = selectedServices.some(
      (s) => s.service_type_id === serviceType.id,
    );
    const fixed = isFixedQuantityUom(serviceType.uom);
    return (
      <div
        key={serviceType.id}
        className={`rounded-md border transition-colors ${
          isSelected
            ? "border-blue-500 bg-blue-50"
            : "border-transparent hover:bg-gray-50"
        }`}
      >
        <label className="flex items-center gap-3 px-3 py-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle(serviceType.id)}
            className="w-5 h-5 shrink-0 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
          />
          {options.sub && (
            <span className="text-gray-400 -mr-1" aria-hidden="true">
              └
            </span>
          )}
          <span
            className={`flex-1 min-w-0 text-sm text-gray-900 ${
              options.bold ? "font-semibold" : "font-medium"
            }`}
          >
            {serviceType.service_name}
          </span>
          {/* Yellow: the quantity depends on the dates (as highlighted in the
              quotation); grey: a fixed quantity. */}
          <span
            className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
              fixed
                ? "bg-gray-100 text-gray-600"
                : "bg-yellow-100 text-yellow-800"
            }`}
          >
            {UOM_LABEL[serviceType.uom] ?? serviceType.uom}
          </span>
        </label>
        {isSelected && (
          <div className="px-3 pb-3 sm:pl-11">{renderInputs(serviceType)}</div>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-gray-300 overflow-hidden">
      <div className="flex items-center gap-3 bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-900 border-b border-gray-300">
        <span className="w-6">I</span>
        <span>GENERAL SERVICES</span>
      </div>
      <div className="divide-y divide-gray-200">
        {groups.map((group) => {
          // A block with one line (Security Service, Toilet Service, ...) is
          // just that line, numbered; a block with several gets a heading and
          // its lines indented beneath it.
          const single = group.items.length === 1;
          return (
            <div key={group.title} className="px-2 py-1.5">
              {single ? (
                <div className="flex items-start gap-2">
                  <span className="w-6 shrink-0 pt-2 pl-1 text-sm font-semibold text-gray-700">
                    {group.number}
                  </span>
                  <div className="flex-1 min-w-0">
                    {renderRow(group.items[0], { sub: false, bold: true })}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 px-1 py-1.5 text-sm font-semibold text-gray-900">
                    <span className="w-6 shrink-0 pl-1 text-gray-700">
                      {group.number}
                    </span>
                    <span>{group.title}</span>
                  </div>
                  <div className="space-y-0.5 pl-8">
                    {group.items.map((item) =>
                      renderRow(item, { sub: true, bold: false }),
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
