import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { ActivityLogService } from "../../services/activityLogService";
import type {
  MaterialControlWithDetails,
  MaterialList,
  MaterialDensity,
  MaterialControlFormData,
  CalcMode,
} from "../../types/materialControl.types";
import MaterialFieldsForm from "./MaterialFieldsForm";
import { calcTotalForMode, CALC_MODE_OPTIONS } from "../../utils/materialCalculations";
import type { MaterialsStatus } from "../../types/bastp.types";
import {
  Package,
  Plus,
  Edit,
  Trash2,
  X,
  Save,
  AlertTriangle,
  FileText,
  Loader,
  Minus,
  CheckCircle2,
  Undo2,
} from "lucide-react";

const emptyMaterialFields = {
  material_density_id: 0,
  calc_mode: "DIMENSIONAL" as CalcMode,
  length: 0,
  width: 0,
  thickness: 0,
  area: 0,
  layers: 0,
  diameter: 0,
  density: 0,
  amount: 0,
  total_amount: 0,
  uom: "",
};

interface CalcFieldsShape {
  calc_mode: CalcMode;
  length: number;
  width: number;
  thickness: number;
  area: number;
  layers: number;
  diameter: number;
  density: number;
  amount: number;
  total_amount: number;
  uom: string;
}

// Recomputes total_amount (and, for modes with an auto-resolved unit, uom)
// from the current field values. COUNT's uom stays whatever the caller set
// (Ls/pcs is a user choice, not derived).
function withRecalculatedTotal<T extends CalcFieldsShape>(fields: T): T {
  const { total, uom } = calcTotalForMode(fields.calc_mode, fields);
  return {
    ...fields,
    total_amount: total,
    uom: uom !== null ? uom : fields.uom,
  };
}

interface MaterialControlProps {
  bastpId: number;
  workDetailsId: number;
  workDetailsDescription: string;
  onClose?: () => void;
  // True once the parent BASTP is READY_FOR_INVOICE or INVOICED — its
  // materials are financially committed and shouldn't change anymore.
  locked?: boolean;
}

interface MaterialEntry extends MaterialControlFormData {
  tempId: string;
  materialSearchTerm: string;
}

interface SubmissionRecord {
  id: number;
  materials_status: MaterialsStatus;
  materials_submitted_at: string | null;
  materials_submitted_by: number | null;
}

export default function MaterialControl({
  bastpId,
  workDetailsId,
  workDetailsDescription,
  onClose,
  locked,
}: MaterialControlProps) {
  const { isBastpReadOnly, profile } = useAuth();
  // FINANCE and OP_HEAD consume/monitor BASTP materials but shouldn't edit
  // them (isBastpReadOnly), and a BASTP already financially committed
  // (locked) can't be touched by anyone regardless of role.
  const isLockedForEdit = isBastpReadOnly || !!locked;
  const [bwdRecord, setBwdRecord] = useState<SubmissionRecord | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const isSubmitted = bwdRecord?.materials_status === "SUBMITTED";
  // Once submitted, materials are finalized for the READY_FOR_INVOICE gate —
  // editing needs an explicit "reopen" first, same spirit as the BASTP-level
  // lock above.
  const canEditMaterials = !isLockedForEdit && !isSubmitted;
  const [materials, setMaterials] = useState<MaterialControlWithDetails[]>([]);
  const [materialLists, setMaterialLists] = useState<MaterialList[]>([]);
  const [materialDensities, setMaterialDensities] = useState<MaterialDensity[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Multiple material entries for batch addition
  const [materialEntries, setMaterialEntries] = useState<MaterialEntry[]>([]);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const materialDropdownRef = useRef<HTMLDivElement>(null);

  // Density dropdown state (batch form)
  const [densityOpenId, setDensityOpenId] = useState<string | null>(null);
  const [densitySearchTerms, setDensitySearchTerms] = useState<
    Record<string, string>
  >({});

  // Density dropdown state (edit form)
  const [editDensityOpen, setEditDensityOpen] = useState(false);
  const [editDensitySearch, setEditDensitySearch] = useState("");

  // Category display
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  // Single edit form state (for editing existing materials)
  const [editFormData, setEditFormData] = useState({
    material_id: 0,
    materialSearchTerm: "",
    ...emptyMaterialFields,
  });

  // Inline "create new material" flow — triggered from the search dropdown
  // when a typed material isn't found. `creatingMaterialFor` holds either a
  // batch entry's tempId or "edit", so the newly created material gets
  // auto-selected into whichever form triggered it.
  const [creatingMaterialFor, setCreatingMaterialFor] = useState<
    string | null
  >(null);
  const [newMaterialForm, setNewMaterialForm] = useState({
    material: "",
    specification: "",
    category: "",
    calc_mode: "DIMENSIONAL" as CalcMode,
  });
  const [creatingMaterialSaving, setCreatingMaterialSaving] = useState(false);
  const [creatingMaterialError, setCreatingMaterialError] = useState<
    string | null
  >(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        materialDropdownRef.current &&
        !materialDropdownRef.current.contains(event.target as Node)
      ) {
        setActiveDropdownId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    fetchMaterialLists();
    fetchMaterialDensities();
    fetchMaterials();
    fetchSubmissionStatus();
  }, [workDetailsId, bastpId]);

  const fetchSubmissionStatus = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("bastp_work_details")
        .select("id, materials_status, materials_submitted_at, materials_submitted_by")
        .eq("work_details_id", workDetailsId)
        .eq("bastp_id", bastpId)
        .is("deleted_at", null)
        .single();

      if (fetchError) throw fetchError;
      setBwdRecord(data);
    } catch (err) {
      console.error("Error fetching materials submission status:", err);
    }
  };

  const handleSubmitMaterials = async () => {
    if (!bwdRecord) return;
    if (
      materials.length === 0 &&
      !confirm(
        "No materials have been added for this work detail. Submit anyway to mark it as needing no materials?",
      )
    ) {
      return;
    }

    try {
      setStatusSaving(true);
      setError(null);

      const { data: updated, error: updateError } = await supabase
        .from("bastp_work_details")
        .update({
          materials_status: "SUBMITTED",
          materials_submitted_at: new Date().toISOString(),
          materials_submitted_by: profile?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", bwdRecord.id)
        .select("id, materials_status, materials_submitted_at, materials_submitted_by")
        .single();

      if (updateError) throw updateError;

      setBwdRecord(updated);
      await ActivityLogService.logActivity({
        action: "update",
        tableName: "bastp_work_details",
        recordId: bwdRecord.id,
        oldData: bwdRecord,
        newData: updated,
        description: `Submitted materials for ${workDetailsDescription}`,
      });
    } catch (err) {
      console.error("Error submitting materials:", err);
      setError(
        err instanceof Error ? err.message : "Failed to submit materials",
      );
    } finally {
      setStatusSaving(false);
    }
  };

  const handleReopenMaterials = async () => {
    if (!bwdRecord) return;

    try {
      setStatusSaving(true);
      setError(null);

      const { data: updated, error: updateError } = await supabase
        .from("bastp_work_details")
        .update({
          materials_status: "DRAFT",
          materials_submitted_at: null,
          materials_submitted_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", bwdRecord.id)
        .select("id, materials_status, materials_submitted_at, materials_submitted_by")
        .single();

      if (updateError) throw updateError;

      setBwdRecord(updated);
      await ActivityLogService.logActivity({
        action: "update",
        tableName: "bastp_work_details",
        recordId: bwdRecord.id,
        oldData: bwdRecord,
        newData: updated,
        description: `Reopened materials for editing for ${workDetailsDescription}`,
      });
    } catch (err) {
      console.error("Error reopening materials:", err);
      setError(
        err instanceof Error ? err.message : "Failed to reopen materials",
      );
    } finally {
      setStatusSaving(false);
    }
  };

  const fetchMaterialLists = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("material_lists")
        .select(
          "*, material_density:material_density_id(id, name, density, unit)",
        )
        .is("deleted_at", null)
        .order("category", { ascending: true })
        .order("material", { ascending: true });

      if (fetchError) throw fetchError;

      setMaterialLists(data || []);

      // Extract categories
      const categories = [
        ...new Set(data?.map((m) => m.category).filter(Boolean)),
      ];
      setAvailableCategories(categories as string[]);
    } catch (err) {
      console.error("Error fetching material lists:", err);
    }
  };

  const fetchMaterialDensities = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("material_densities")
        .select("*")
        .is("deleted_at", null)
        .order("name", { ascending: true });

      if (fetchError) throw fetchError;

      setMaterialDensities(data || []);
    } catch (err) {
      console.error("Error fetching material densities:", err);
    }
  };

  const fetchMaterials = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("material_control")
        .select(
          `
          *,
          material_list:material_id (
            id,
            material,
            specification,
            category,
            material_density_id
          ),
          material_density:material_density_id (
            id,
            name,
            density,
            unit
          ),
          work_details:work_details_id (
            id,
            description,
            quantity,
            uom
          )
        `,
        )
        .eq("work_details_id", workDetailsId)
        .eq("bastp_id", bastpId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      setMaterials(data || []);
    } catch (err) {
      console.error("Error fetching materials:", err);
      setError(err instanceof Error ? err.message : "Failed to load materials");
    } finally {
      setLoading(false);
    }
  };

  // Add new empty material entry
  const addMaterialEntry = () => {
    const newEntry: MaterialEntry = {
      tempId: `temp-${Date.now()}-${Math.random()}`,
      material_id: 0,
      materialSearchTerm: "",
      ...emptyMaterialFields,
    };
    setMaterialEntries([...materialEntries, newEntry]);
  };

  // Remove a material entry
  const removeMaterialEntry = (tempId: string) => {
    setMaterialEntries(
      materialEntries.filter((entry) => entry.tempId !== tempId),
    );
  };

  const RECALC_FIELDS = ["length", "width", "thickness", "area", "layers", "diameter", "density", "amount", "calc_mode"];

  // AREA has no meaningful "amount" of its own (the area itself is the
  // total) — the column is still not-null, so pin it to 1 whenever the mode
  // switches to AREA. COUNT's unit is free text, so a stale unit carried
  // over from another mode (e.g. "m2") is cleared rather than left looking
  // like a real choice.
  const applyCalcModeSideEffects = <
    T extends { calc_mode: CalcMode; amount: number; uom: string },
  >(
    field: string,
    updated: T,
  ): T => {
    if (field !== "calc_mode") return updated;
    if (updated.calc_mode === "AREA") return { ...updated, amount: 1 };
    if (updated.calc_mode === "COUNT") return { ...updated, uom: "" };
    return updated;
  };

  // Update a specific material entry field
  const updateMaterialEntry = (
    tempId: string,
    field: keyof MaterialEntry,
    value: any,
  ) => {
    setMaterialEntries(
      materialEntries.map((entry) => {
        if (entry.tempId !== tempId) return entry;
        const updated = applyCalcModeSideEffects(field as string, {
          ...entry,
          [field]: value,
        });
        if (RECALC_FIELDS.includes(field as string)) {
          return withRecalculatedTotal(updated);
        }
        return updated;
      }),
    );
  };

  // Recomputes the total for the dimension/density/amount fields — uom
  // passes through untouched for COUNT (a free-text unit stays a user
  // choice) and is auto-resolved otherwise, matching updateMaterialEntry's
  // behavior for the batch rows.
  const handleEditFieldChange = (
    field: keyof MaterialControlFormData,
    value: number | string,
  ) => {
    setEditFormData((prev) => {
      const updated = applyCalcModeSideEffects(field, { ...prev, [field]: value });
      if (RECALC_FIELDS.includes(field)) {
        return withRecalculatedTotal(updated);
      }
      return updated;
    });
  };

  const handleToggleEditDensityDropdown = () => {
    if (editDensityOpen) {
      setEditDensityOpen(false);
      setEditDensitySearch("");
    } else {
      setEditDensityOpen(true);
    }
  };

  const handleDensityTypeChangeForEntry = (
    tempId: string,
    densityId: number,
  ) => {
    const selected = materialDensities.find((d) => d.id === densityId);
    setMaterialEntries(
      materialEntries.map((entry) => {
        if (entry.tempId !== tempId) return entry;
        return withRecalculatedTotal({
          ...entry,
          material_density_id: densityId,
          density: selected?.density ?? entry.density,
        });
      }),
    );
  };

  const handleEditDensityTypeChange = (densityId: number) => {
    const selected = materialDensities.find((d) => d.id === densityId);
    setEditFormData((prev) =>
      withRecalculatedTotal({
        ...prev,
        material_density_id: densityId,
        density: selected?.density ?? prev.density,
      }),
    );
  };

  // Handle material selection for a specific entry
  const handleMaterialSelectForEntry = (
    tempId: string,
    material: MaterialList,
  ) => {
    const displayText = material.specification
      ? `${material.material} ${material.specification}`
      : material.material;

    const densityId = material.material_density_id || 0;
    const densityVal = material.material_density?.density || 0;

    setMaterialEntries(
      materialEntries.map((entry) => {
        if (entry.tempId !== tempId) return entry;
        return withRecalculatedTotal({
          ...entry,
          material_id: material.id,
          materialSearchTerm: displayText,
          calc_mode: material.calc_mode,
          material_density_id: densityId,
          density: densityVal,
          // AREA has no meaningful "amount" of its own (the area itself is
          // the total) — the column is still not-null, so pin it to 1.
          amount: material.calc_mode === "AREA" ? 1 : entry.amount,
        });
      }),
    );
    setActiveDropdownId(null);
  };

  // Edit mode handlers
  const handleEditMaterialSelect = (material: MaterialList) => {
    const displayText = material.specification
      ? `${material.material} ${material.specification}`
      : material.material;
    const densityId = material.material_density_id || 0;
    const densityVal = material.material_density?.density || 0;
    setEditFormData((prev) =>
      withRecalculatedTotal({
        ...prev,
        material_id: material.id,
        materialSearchTerm: displayText,
        calc_mode: material.calc_mode,
        material_density_id: densityId,
        density: densityVal,
        amount: material.calc_mode === "AREA" ? 1 : prev.amount,
      }),
    );
    setActiveDropdownId(null);
  };

  const handleClearEditMaterialSearch = () => {
    setEditFormData({
      material_id: 0,
      materialSearchTerm: "",
      ...emptyMaterialFields,
    });
    setActiveDropdownId(null);
  };

  // Inline "create new material" flow, triggered from MaterialFieldsForm's
  // dropdown. `forId` is a batch entry's tempId or "edit".
  const handleCreateMaterialClick = (forId: string, searchTerm: string) => {
    setCreatingMaterialFor(forId);
    setNewMaterialForm({
      material: searchTerm,
      specification: "",
      category: "",
      calc_mode: "DIMENSIONAL",
    });
    setCreatingMaterialError(null);
    setActiveDropdownId(null);
  };

  const handleCreateMaterialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaterialForm.material.trim()) {
      setCreatingMaterialError("Material name is required");
      return;
    }

    try {
      setCreatingMaterialSaving(true);
      setCreatingMaterialError(null);

      const { data: created, error: insertError } = await supabase
        .from("material_lists")
        .insert({
          material: newMaterialForm.material.trim(),
          specification: newMaterialForm.specification.trim() || null,
          category: newMaterialForm.category.trim() || null,
          calc_mode: newMaterialForm.calc_mode,
        })
        .select("*, material_density:material_density_id(id, name, density, unit)")
        .single();

      if (insertError) throw insertError;

      await ActivityLogService.logActivity({
        action: "create",
        tableName: "material_lists",
        recordId: created.id,
        newData: created,
        description: `Added new material "${created.material}" to master data`,
      });

      setMaterialLists((prev) => [...prev, created]);
      if (created.category) {
        setAvailableCategories((prev) =>
          prev.includes(created.category) ? prev : [...prev, created.category],
        );
      }

      if (creatingMaterialFor === "edit") {
        handleEditMaterialSelect(created);
      } else if (creatingMaterialFor) {
        handleMaterialSelectForEntry(creatingMaterialFor, created);
      }

      setCreatingMaterialFor(null);
    } catch (err) {
      console.error("Error creating material:", err);
      setCreatingMaterialError(
        err instanceof Error ? err.message : "Failed to create material",
      );
    } finally {
      setCreatingMaterialSaving(false);
    }
  };

  const validateMaterialFields = (
    fields: MaterialControlFormData,
    label: string,
  ): string | null => {
    if (!fields.material_id) {
      return `${label}: Please click on a material from the dropdown list to select it`;
    }
    if (fields.calc_mode === "AREA") {
      if (fields.area <= 0) {
        return `${label}: Area is required`;
      }
    } else if (fields.calc_mode === "CIRCULAR") {
      if (fields.diameter <= 0) {
        return `${label}: Diameter is required`;
      }
      if (fields.amount <= 0) {
        return `${label}: Amount must be greater than 0`;
      }
    } else if (fields.amount <= 0) {
      return `${label}: Amount must be greater than 0`;
    }
    if (!fields.uom.trim()) {
      return `${label}: Unit of measurement is required`;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (editingId) {
      const validationError = validateMaterialFields(editFormData, "Material");
      if (validationError) {
        setError(validationError);
        return;
      }
    } else {
      // Batch add mode validation
      if (materialEntries.length === 0) {
        setError("Please add at least one material");
        return;
      }

      for (let i = 0; i < materialEntries.length; i++) {
        const validationError = validateMaterialFields(
          materialEntries[i],
          `Material #${i + 1}`,
        );
        if (validationError) {
          setError(validationError);
          return;
        }
      }
    }

    try {
      setSaving(true);
      setError(null);

      if (editingId) {
        // Update existing material
        const oldMaterial = materials.find((m) => m.id === editingId);
        const { data: updatedData, error: updateError } = await supabase
          .from("material_control")
          .update({
            material_id: editFormData.material_id,
            material_density_id: editFormData.material_density_id || null,
            calc_mode: editFormData.calc_mode,
            length: editFormData.length || null,
            width: editFormData.width || null,
            thickness: editFormData.thickness || null,
            area: editFormData.area || null,
            layers: editFormData.layers || null,
            diameter: editFormData.diameter || null,
            density: editFormData.density || null,
            amount:
              editFormData.calc_mode === "AREA" ? 1 : editFormData.amount,
            total_amount: editFormData.total_amount || null,
            uom: editFormData.uom.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId)
          .select()
          .single();

        if (updateError) throw updateError;

        // Log the activity
        if (updatedData) {
          await ActivityLogService.logActivity({
            action: "update",
            tableName: "material_control",
            recordId: updatedData.id,
            oldData: oldMaterial,
            newData: updatedData,
            description: `Updated material control for ${workDetailsDescription}`,
          });
        }
      } else {
        // Create multiple materials
        const materialsToInsert = materialEntries.map((entry) => ({
          material_id: entry.material_id,
          material_density_id: entry.material_density_id || null,
          calc_mode: entry.calc_mode,
          length: entry.length || null,
          width: entry.width || null,
          thickness: entry.thickness || null,
          area: entry.area || null,
          layers: entry.layers || null,
          diameter: entry.diameter || null,
          density: entry.density || null,
          amount: entry.calc_mode === "AREA" ? 1 : entry.amount,
          total_amount: entry.total_amount || null,
          uom: entry.uom.trim(),
          work_details_id: workDetailsId,
          bastp_id: bastpId,
        }));

        const { data: insertedData, error: insertError } = await supabase
          .from("material_control")
          .insert(materialsToInsert)
          .select();

        if (insertError) throw insertError;

        // Log the activity for each created material
        if (insertedData && insertedData.length > 0) {
          for (const material of insertedData) {
            await ActivityLogService.logActivity({
              action: "create",
              tableName: "material_control",
              recordId: material.id,
              newData: material,
              description: `Added material control for ${workDetailsDescription}`,
            });
          }
        }
      }

      // Reset form and refresh list
      resetForm();
      await fetchMaterials();
    } catch (err) {
      console.error("Error saving material:", err);
      setError(err instanceof Error ? err.message : "Failed to save material");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (material: MaterialControlWithDetails) => {
    const materialList = materialLists.find(
      (m) => m.id === material.material_id,
    );

    const displayText = materialList
      ? materialList.specification
        ? `${materialList.material} ${materialList.specification}`
        : materialList.material
      : "";

    setEditFormData({
      material_id: material.material_id,
      materialSearchTerm: displayText,
      material_density_id: material.material_density_id || 0,
      calc_mode: material.calc_mode,
      length: material.length || 0,
      width: material.width || 0,
      thickness: material.thickness || 0,
      area: material.area || 0,
      layers: material.layers || 0,
      diameter: material.diameter || 0,
      density: material.density || 0,
      amount: material.amount,
      total_amount: material.total_amount || 0,
      uom: material.uom,
    });
    setMaterialEntries([]); // Clear batch entries when editing
    setEditingId(material.id);
    setShowForm(true);
    setError(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this material?")) {
      return;
    }

    try {
      setError(null);

      const materialToDelete = materials.find((m) => m.id === id);
      const { data: deletedData, error: deleteError } = await supabase
        .from("material_control")
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (deleteError) throw deleteError;

      // Log the activity
      if (deletedData) {
        await ActivityLogService.logActivity({
          action: "delete",
          tableName: "material_control",
          recordId: deletedData.id,
          oldData: materialToDelete,
          description: `Deleted material control for ${workDetailsDescription}`,
        });
      }

      await fetchMaterials();
    } catch (err) {
      console.error("Error deleting material:", err);
      setError(
        err instanceof Error ? err.message : "Failed to delete material",
      );
    }
  };

  const resetForm = () => {
    setEditFormData({
      material_id: 0,
      materialSearchTerm: "",
      ...emptyMaterialFields,
    });
    setMaterialEntries([]);
    setActiveDropdownId(null);
    setEditingId(null);
    setShowForm(false);
    setError(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
        <span className="ml-3 text-gray-600">Loading materials...</span>
      </div>
    );
  }

  // Helper function to filter materials based on search term and category
  // Helper function to format category names (capitalize words and replace underscores with spaces)
  const formatCategoryName = (category: string) => {
    return category
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const getFilteredMaterials = (searchTerm: string) => {
    return materialLists.filter((m) => {
      if (!searchTerm) return true;

      const searchLower = searchTerm.toLowerCase();

      // Combine material name and specification for searching
      const combinedText =
        `${m.material} ${m.specification || ""}`.toLowerCase();

      // Also search in category
      const categoryMatch = m.category?.toLowerCase().includes(searchLower);

      return combinedText.includes(searchLower) || categoryMatch;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5" /> Material Control
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            <FileText className="w-3 h-3 inline mr-1" />
            {workDetailsDescription}
          </p>
        </div>
        <div className="flex gap-2">
          {canEditMaterials && !showForm && (
            <button
              onClick={() => {
                setShowForm(true);
                addMaterialEntry(); // Start with one empty entry
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Material
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Materials Submission Status */}
      {bwdRecord && (
        <div
          className={`flex items-center justify-between p-4 rounded-lg border ${
            isSubmitted
              ? "bg-green-50 border-green-200"
              : "bg-yellow-50 border-yellow-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {isSubmitted ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-900">
                    Materials submitted
                  </p>
                  {bwdRecord.materials_submitted_at && (
                    <p className="text-xs text-green-700">
                      Submitted on{" "}
                      {new Date(
                        bwdRecord.materials_submitted_at,
                      ).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                <p className="text-sm font-medium text-yellow-900">
                  Draft — not yet submitted. This work detail blocks the
                  BASTP from becoming ready for invoice until submitted.
                </p>
              </>
            )}
          </div>
          {!isLockedForEdit && (
            <button
              onClick={isSubmitted ? handleReopenMaterials : handleSubmitMaterials}
              disabled={statusSaving}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isSubmitted
                  ? "bg-white border border-green-300 text-green-700 hover:bg-green-100"
                  : "bg-green-600 text-white hover:bg-green-700"
              }`}
            >
              {statusSaving ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : isSubmitted ? (
                <Undo2 className="w-4 h-4" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {isSubmitted ? "Reopen for Editing" : "Submit Materials"}
            </button>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && canEditMaterials && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-md font-semibold text-gray-900">
              {editingId ? "Edit Material" : "Add Materials"}
            </h4>
            {!editingId && materialEntries.length > 0 && (
              <button
                type="button"
                onClick={addMaterialEntry}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Another
              </button>
            )}
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Category Display (shown for both modes) */}
            {availableCategories.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Categories
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableCategories.map((cat) => (
                    <span
                      key={cat}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg"
                    >
                      {formatCategoryName(cat)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Batch Add Mode - Show multiple material entry rows */}
            {!editingId && (
              <div className="space-y-4">
                {materialEntries.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                    <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 mb-3">No materials added yet</p>
                    <button
                      type="button"
                      onClick={addMaterialEntry}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Add First Material
                    </button>
                  </div>
                ) : (
                  materialEntries.map((entry, index) => (
                    <div
                      key={entry.tempId}
                      className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-700">
                          Material #{index + 1}
                        </span>
                        {materialEntries.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMaterialEntry(entry.tempId)}
                            className="text-red-600 hover:text-red-800 transition-colors"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <MaterialFieldsForm
                        values={entry}
                        onFieldChange={(field, value) =>
                          updateMaterialEntry(entry.tempId, field, value)
                        }
                        materialDensities={materialDensities}
                        filteredMaterials={getFilteredMaterials(
                          entry.materialSearchTerm,
                        )}
                        isMaterialDropdownOpen={
                          activeDropdownId === entry.tempId
                        }
                        materialSearchReadOnly
                        onMaterialSearchChange={(value) =>
                          updateMaterialEntry(
                            entry.tempId,
                            "materialSearchTerm",
                            value,
                          )
                        }
                        onMaterialSearchFocus={() =>
                          setActiveDropdownId(entry.tempId)
                        }
                        onMaterialSelect={(material) =>
                          handleMaterialSelectForEntry(entry.tempId, material)
                        }
                        onClearMaterialSearch={() => {
                          updateMaterialEntry(
                            entry.tempId,
                            "materialSearchTerm",
                            "",
                          );
                          updateMaterialEntry(entry.tempId, "material_id", 0);
                        }}
                        materialDropdownRef={
                          activeDropdownId === entry.tempId
                            ? materialDropdownRef
                            : null
                        }
                        onCreateMaterialClick={(term) =>
                          handleCreateMaterialClick(entry.tempId, term)
                        }
                        isDensityDropdownOpen={densityOpenId === entry.tempId}
                        densitySearchTerm={
                          densitySearchTerms[entry.tempId] ?? ""
                        }
                        onToggleDensityDropdown={() =>
                          setDensityOpenId(
                            densityOpenId === entry.tempId
                              ? null
                              : entry.tempId,
                          )
                        }
                        onDensitySearchChange={(value) =>
                          setDensitySearchTerms((prev) => ({
                            ...prev,
                            [entry.tempId]: value,
                          }))
                        }
                        onSelectDensity={(densityId) => {
                          handleDensityTypeChangeForEntry(
                            entry.tempId,
                            densityId,
                          );
                          setDensityOpenId(null);
                        }}
                        dimensionsGridClass="grid grid-cols-3 gap-3"
                      />
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Edit Mode - Show single material form */}
            {editingId && (
              <div className="space-y-4">
                <MaterialFieldsForm
                  values={editFormData}
                  onFieldChange={handleEditFieldChange}
                  materialDensities={materialDensities}
                  filteredMaterials={getFilteredMaterials(
                    editFormData.materialSearchTerm,
                  )}
                  isMaterialDropdownOpen={activeDropdownId === "edit"}
                  onMaterialSearchChange={(value) =>
                    setEditFormData((prev) => ({
                      ...prev,
                      materialSearchTerm: value,
                    }))
                  }
                  onMaterialSearchFocus={() => setActiveDropdownId("edit")}
                  onMaterialSelect={handleEditMaterialSelect}
                  onClearMaterialSearch={handleClearEditMaterialSearch}
                  materialDropdownRef={
                    activeDropdownId === "edit" ? materialDropdownRef : null
                  }
                  onCreateMaterialClick={(term) =>
                    handleCreateMaterialClick("edit", term)
                  }
                  isDensityDropdownOpen={editDensityOpen}
                  densitySearchTerm={editDensitySearch}
                  onToggleDensityDropdown={handleToggleEditDensityDropdown}
                  onDensitySearchChange={setEditDensitySearch}
                  onSelectDensity={(densityId) => {
                    handleEditDensityTypeChange(densityId);
                    setEditDensityOpen(false);
                    setEditDensitySearch("");
                  }}
                />
              </div>
            )}

            {/* Form Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    {editingId ? "Updating..." : "Saving..."}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {editingId
                      ? "Update Material"
                      : `Save ${materialEntries.length} Material${materialEntries.length !== 1 ? "s" : ""}`}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Materials List */}
      {materials.length === 0 && !showForm ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg mb-2">No materials added yet</p>
          <p className="text-gray-400 text-sm">
            Add materials used for this work detail
          </p>
        </div>
      ) : materials.length > 0 ? (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Material Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Specification
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mode
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Area (m²)
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Length
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Width
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thickness
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Layers
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Diameter
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Density
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Amount
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    UOM
                  </th>
                  {canEditMaterials && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {materials.map((material) => (
                  <tr key={material.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {material.material_list?.material || "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {material.material_list?.category ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          {material.material_list.category}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600">
                        {material.material_list?.specification || "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {CALC_MODE_OPTIONS.find(
                          (m) => m.value === material.calc_mode,
                        )?.label || material.calc_mode}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm text-gray-600">
                        {material.area != null ? material.area : "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm text-gray-600">
                        {material.length != null ? material.length : "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm text-gray-600">
                        {material.width != null ? material.width : "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm text-gray-600">
                        {material.thickness != null ? material.thickness : "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm text-gray-600">
                        {material.layers != null ? material.layers : "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm text-gray-600">
                        {material.diameter != null ? material.diameter : "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {material.material_density ? (
                        <div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            {material.material_density.name}
                          </span>
                          <div className="text-sm text-gray-600 mt-1">
                            {material.density != null
                              ? `${material.density} ${material.material_density.unit}`
                              : "-"}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-600">
                          {material.density != null ? material.density : "-"}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm font-semibold text-gray-900">
                        {material.amount.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm font-semibold text-blue-700">
                        {material.total_amount != null
                          ? Number(
                              material.total_amount.toFixed(4),
                            ).toLocaleString()
                          : "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {material.uom}
                      </span>
                    </td>
                    {canEditMaterials && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(material)}
                            className="text-blue-600 hover:text-blue-800 transition-colors"
                            title="Edit material"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(material.id)}
                            className="text-red-600 hover:text-red-800 transition-colors"
                            title="Delete material"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              Total: <span className="font-semibold">{materials.length}</span>{" "}
              material{materials.length !== 1 ? "s" : ""} listed
            </div>
          </div>
        </div>
      ) : null}

      {creatingMaterialFor !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Create New Material
              </h3>
              <button
                type="button"
                onClick={() => setCreatingMaterialFor(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMaterialSubmit} className="p-4 space-y-4">
              {creatingMaterialError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-sm">{creatingMaterialError}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Material <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newMaterialForm.material}
                  onChange={(e) =>
                    setNewMaterialForm((prev) => ({
                      ...prev,
                      material: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Plat Besi"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Specification
                </label>
                <input
                  type="text"
                  value={newMaterialForm.specification}
                  onChange={(e) =>
                    setNewMaterialForm((prev) => ({
                      ...prev,
                      specification: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  list="material-category-suggestions"
                  value={newMaterialForm.category}
                  onChange={(e) =>
                    setNewMaterialForm((prev) => ({
                      ...prev,
                      category: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional"
                />
                <datalist id="material-category-suggestions">
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Calculation Mode <span className="text-red-600">*</span>
                </label>
                <select
                  value={newMaterialForm.calc_mode}
                  onChange={(e) =>
                    setNewMaterialForm((prev) => ({
                      ...prev,
                      calc_mode: e.target.value as CalcMode,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {CALC_MODE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {
                    CALC_MODE_OPTIONS.find(
                      (opt) => opt.value === newMaterialForm.calc_mode,
                    )?.description
                  }
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreatingMaterialFor(null)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingMaterialSaving}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingMaterialSaving ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Create Material
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
