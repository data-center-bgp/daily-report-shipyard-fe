import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Pencil, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { ActivityLogService } from "../../services/activityLogService";
import { WORK_TYPE_OPTIONS } from "../../constants/workTypes";
import {
  buildRenamedProjectName,
  getNextSuffixForVessel,
  getProjectNameSuffix,
} from "../../utils/projectNaming";
import SearchableSelect from "../common/SearchableSelect";

interface VesselRow {
  id: number;
  name: string;
  type: string;
  company: string | null;
}

export interface RenameProjectTarget {
  id: number;
  project_name: string;
  docking_type: string | null;
  created_at: string;
  vessel: { id: number; name: string; type: string; company: string };
}

export interface RenamedProject {
  project_name: string;
  docking_type: string;
  vessel: { id: number; name: string; type: string; company: string };
}

/**
 * Renames a project by choosing instead of typing: pick the vessel from the
 * vessel list and the jenis docking from the same list used when creating a
 * project, and the name is built from them.
 *
 * Picking a different vessel moves the whole project to it (its work orders,
 * readiness form and additional-WO requests follow) — that goes through the
 * rename_project database function so it either all happens or none of it
 * does. A rename on the same vessel is a plain update.
 */
export default function RenameProjectModal({
  project,
  onClose,
  onRenamed,
}: {
  project: RenameProjectTarget;
  onClose: () => void;
  onRenamed: (updated: RenamedProject) => void;
}) {
  const [vessels, setVessels] = useState<VesselRow[]>([]);
  const [vesselId, setVesselId] = useState(project.vessel.id);
  const [dockingType, setDockingType] = useState(project.docking_type ?? "");
  const [ownSuffix, setOwnSuffix] = useState<string | null>(null);
  const [movedSuffix, setMovedSuffix] = useState<string | null>(null);
  const [workOrderCount, setWorkOrderCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vesselChanged = vesselId !== project.vessel.id;

  // The vessel list, the project's own year/sequence tail, and how many work
  // orders a move would carry along.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [vesselRes, suffix, woRes] = await Promise.all([
          supabase
            .from("vessel")
            .select("id, name, type, company")
            .is("deleted_at", null)
            .order("name", { ascending: true }),
          getProjectNameSuffix({
            project_name: project.project_name,
            vessel_id: project.vessel.id,
            created_at: project.created_at,
          }),
          supabase
            .from("work_order")
            .select("id", { count: "exact", head: true })
            .eq("project_id", project.id)
            .is("deleted_at", null),
        ]);
        if (cancelled) return;
        if (vesselRes.error) throw vesselRes.error;
        setVessels((vesselRes.data as VesselRow[]) ?? []);
        setOwnSuffix(suffix);
        setWorkOrderCount(woRes.count ?? 0);
      } catch (err) {
        console.error("Error preparing rename:", err);
        if (!cancelled) setError("Could not load the vessel list.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project]);

  // A different vessel gets its own next sequence number for the project's year.
  useEffect(() => {
    if (!vesselChanged || ownSuffix === null) {
      setMovedSuffix(null);
      return;
    }
    let cancelled = false;
    const year = Number(ownSuffix.slice(1, 5)) || new Date().getFullYear();
    getNextSuffixForVessel(vesselId, year, project.id)
      .then((s) => !cancelled && setMovedSuffix(s))
      .catch(() => !cancelled && setError("Could not prepare the new name."));
    return () => {
      cancelled = true;
    };
  }, [vesselChanged, vesselId, ownSuffix, project.id]);

  const vesselOptions = useMemo(
    () =>
      vessels.map((v) => ({
        id: v.id,
        label: v.company ? `${v.name} (${v.company})` : v.name,
      })),
    [vessels],
  );

  const selectedVessel: VesselRow | null =
    vessels.find((v) => v.id === vesselId) ??
    (vesselId === project.vessel.id ? project.vessel : null);

  // A project made before the docking list was settled can carry a value that
  // isn't in it — keep it selectable so opening this never silently changes it.
  const dockingOptions =
    project.docking_type && !WORK_TYPE_OPTIONS.includes(project.docking_type)
      ? [project.docking_type, ...WORK_TYPE_OPTIONS]
      : WORK_TYPE_OPTIONS;

  const suffix = vesselChanged ? movedSuffix : ownSuffix;
  const newName =
    dockingType && selectedVessel && suffix !== null
      ? buildRenamedProjectName(selectedVessel, dockingType, suffix)
      : null;
  const unchanged =
    !vesselChanged &&
    newName === project.project_name &&
    dockingType === (project.docking_type ?? "");

  const handleSave = async () => {
    if (!newName || !selectedVessel || unchanged) return;
    setSaving(true);
    setError(null);
    try {
      const { data: clash, error: clashError } = await supabase
        .from("projects")
        .select("id")
        .eq("project_name", newName)
        .neq("id", project.id)
        .is("deleted_at", null)
        .limit(1);
      if (clashError) throw clashError;
      if (clash && clash.length > 0) {
        setError("Another project already uses this name.");
        setSaving(false);
        return;
      }

      let saved;
      if (vesselChanged) {
        const { data, error: rpcError } = await supabase.rpc("rename_project", {
          p_project_id: project.id,
          p_project_name: newName,
          p_docking_type: dockingType,
          p_vessel_id: selectedVessel.id,
        });
        if (rpcError) throw rpcError;
        saved = data;
      } else {
        const { data, error: updateError } = await supabase
          .from("projects")
          .update({
            project_name: newName,
            docking_type: dockingType,
            updated_at: new Date().toISOString(),
          })
          .eq("id", project.id)
          .select()
          .single();
        if (updateError) throw updateError;
        saved = data;
      }

      await ActivityLogService.logActivity({
        action: "update",
        tableName: "projects",
        recordId: project.id,
        oldData: {
          project_name: project.project_name,
          docking_type: project.docking_type,
          vessel_id: project.vessel.id,
        },
        newData: saved,
        description: vesselChanged
          ? `Renamed project ${project.project_name} to ${newName} and moved it from ${project.vessel.name} to ${selectedVessel.name}`
          : `Renamed project ${project.project_name} to ${newName}`,
      });

      onRenamed({
        project_name: newName,
        docking_type: dockingType,
        vessel: {
          id: selectedVessel.id,
          name: selectedVessel.name,
          type: selectedVessel.type,
          company: selectedVessel.company ?? "",
        },
      });
    } catch (err) {
      console.error("Error renaming project:", err);
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err && "message" in err
            ? String((err as { message: unknown }).message)
            : "Failed to rename project";
      setError(
        /rename_project/.test(message) && /function|schema cache/i.test(message)
          ? "Changing the vessel needs the rename_project database function, which hasn't been applied yet. Ask your administrator to run the latest migration."
          : message,
      );
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-white rounded-lg max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Rename project"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Pencil className="w-5 h-5" /> Rename Project
          </h3>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vessel <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              value={vesselId}
              onChange={(id) => id && setVesselId(id)}
              options={vesselOptions}
              placeholder={
                vessels.length === 0 ? "Loading vessels..." : "Search vessel..."
              }
              className="w-full"
            />
          </div>

          {vesselChanged && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
              <p>
                This moves the project from{" "}
                <span className="font-medium">{project.vessel.name}</span> to{" "}
                <span className="font-medium">{selectedVessel?.name}</span>,
                together with its work orders
                {workOrderCount ? ` (${workOrderCount})` : ""}, its readiness
                form and any additional work order requests. This isn&apos;t
                possible once any of its work details are in a BASTP.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Jenis Docking <span className="text-red-500">*</span>
            </label>
            <select
              value={dockingType}
              onChange={(e) => setDockingType(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select Jenis Docking</option>
              {dockingOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="block text-sm font-medium text-gray-700 mb-1">
              New project name
            </p>
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-medium text-blue-900 break-words min-h-[2.5rem]">
              {newName ?? (
                <span className="font-normal text-blue-700/70">
                  {!dockingType
                    ? "Choose a jenis docking to see the name"
                    : "Preparing..."}
                </span>
              )}
            </div>
            {newName && newName !== project.project_name && (
              <p className="text-xs text-gray-500 mt-1 break-words">
                Currently: {project.project_name}
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !newName || unchanged}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {vesselChanged ? "Move & rename" : "Save name"}
          </button>
        </div>
      </div>
    </div>
  );
}
