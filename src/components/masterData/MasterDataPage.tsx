import { useState } from "react";
import { Lock, Ship, MapPin, Wrench } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import VesselMasterData from "./VesselMasterData";
import LookupMasterData from "./LookupMasterData";

type Tab = "vessels" | "locations" | "workScopes";

const TABS: { key: Tab; label: string; icon: typeof Ship }[] = [
  { key: "vessels", label: "Vessels", icon: Ship },
  { key: "locations", label: "Locations", icon: MapPin },
  { key: "workScopes", label: "Work Scopes", icon: Wrench },
];

export default function MasterDataPage() {
  const { canAccess, isReadOnly } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("vessels");

  const canView = canAccess("masterData");

  if (!canView) {
    return (
      <div className="p-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 flex items-start gap-3">
          <Lock className="w-6 h-6 text-yellow-600 flex-shrink-0" />
          <div>
            <p className="text-yellow-900 font-medium">
              You don't have permission to view master data.
            </p>
            <p className="text-sm text-yellow-700 mt-1">
              This page is restricted to the Master, PPIC, and Manager roles.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Master Data</h1>
        <p className="text-gray-600 mt-1">
          Manage the vessel, location, and work scope records used throughout
          the app.
          {isReadOnly && " You have view-only access."}
        </p>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 pb-3 border-b-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === "vessels" && <VesselMasterData />}
      {activeTab === "locations" && (
        <LookupMasterData
          table="location"
          column="location"
          label="Location"
          placeholder="e.g. Dermaga 1"
        />
      )}
      {activeTab === "workScopes" && (
        <LookupMasterData
          table="work_scope"
          column="work_scope"
          label="Work Scope"
          placeholder="e.g. Sandblasting"
        />
      )}
    </div>
  );
}
