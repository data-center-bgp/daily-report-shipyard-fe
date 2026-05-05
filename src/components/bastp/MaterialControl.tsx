import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { ActivityLogService } from "../../services/activityLogService";
import type {
  MaterialControlWithDetails,
  MaterialList,
  MaterialDensity,
} from "../../types/materialControl.types";
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
  Search,
  Minus,
  ChevronDown,
} from "lucide-react";

interface MaterialControlProps {
  bastpId: number;
  workDetailsId: number;
  workDetailsDescription: string;
  onClose?: () => void;
}

interface MaterialEntry {
  tempId: string;
  material_id: number;
  materialSearchTerm: string;
  material_density_id: number;
  length: number;
  width: number;
  thickness: number;
  density: number;
  amount: number;
  total_amount: number;
  uom: string;
}

const UOM_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: "m", label: "m", description: "Meter (length)" },
  { value: "kg", label: "kg", description: "Kilogram (mass)" },
  { value: "pcs", label: "pcs", description: "Pieces (count)" },
];

// Each dimension is in millimeters; multiply by 0.001 to convert to meters.
// If a dimension is missing (0 or falsy), it's skipped (treated as 1) so the
// material can have 1, 2, or 3 dimensions and amount is still applied.
const DIM_FACTOR = 0.001;

const calcTotal = (
  length: number,
  width: number,
  thickness: number,
  density: number,
  amount: number,
) => {
  const l = length > 0 ? length * DIM_FACTOR : 1;
  const w = width > 0 ? width * DIM_FACTOR : 1;
  const t = thickness > 0 ? thickness * DIM_FACTOR : 1;
  const d = density > 0 ? density : 1;
  const a = amount > 0 ? amount : 0;
  return l * w * t * d * a;
};

export default function MaterialControl({
  bastpId,
  workDetailsId,
  workDetailsDescription,
  onClose,
}: MaterialControlProps) {
  const { isReadOnly } = useAuth();
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
    material_density_id: 0,
    length: 0,
    width: 0,
    thickness: 0,
    density: 0,
    amount: 0,
    total_amount: 0,
    uom: "",
  });

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
  }, [workDetailsId, bastpId]);

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
      material_density_id: 0,
      length: 0,
      width: 0,
      thickness: 0,
      density: 0,
      amount: 0,
      total_amount: 0,
      uom: "",
    };
    setMaterialEntries([...materialEntries, newEntry]);
  };

  // Remove a material entry
  const removeMaterialEntry = (tempId: string) => {
    setMaterialEntries(
      materialEntries.filter((entry) => entry.tempId !== tempId),
    );
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
        const updated = { ...entry, [field]: value };
        if (
          ["length", "width", "thickness", "density", "amount"].includes(
            field as string,
          )
        ) {
          updated.total_amount = calcTotal(
            updated.length,
            updated.width,
            updated.thickness,
            updated.density,
            updated.amount,
          );
        }
        return updated;
      }),
    );
  };

  const handleEditCalcChange = (field: string, value: number) => {
    setEditFormData((prev) => {
      const updated = { ...prev, [field]: value };
      updated.total_amount = calcTotal(
        updated.length,
        updated.width,
        updated.thickness,
        updated.density,
        updated.amount,
      );
      return updated;
    });
  };

  const handleDensityTypeChangeForEntry = (
    tempId: string,
    densityId: number,
  ) => {
    const selected = materialDensities.find((d) => d.id === densityId);
    setMaterialEntries(
      materialEntries.map((entry) => {
        if (entry.tempId !== tempId) return entry;
        const updated = {
          ...entry,
          material_density_id: densityId,
          density: selected?.density ?? entry.density,
        };
        updated.total_amount = calcTotal(
          updated.length,
          updated.width,
          updated.thickness,
          updated.density,
          updated.amount,
        );
        return updated;
      }),
    );
  };

  const handleEditDensityTypeChange = (densityId: number) => {
    const selected = materialDensities.find((d) => d.id === densityId);
    setEditFormData((prev) => {
      const updated = {
        ...prev,
        material_density_id: densityId,
        density: selected?.density ?? prev.density,
      };
      updated.total_amount = calcTotal(
        updated.length,
        updated.width,
        updated.thickness,
        updated.density,
        updated.amount,
      );
      return updated;
    });
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
        const updated = {
          ...entry,
          material_id: material.id,
          materialSearchTerm: displayText,
          material_density_id: densityId,
          density: densityVal,
        };
        updated.total_amount = calcTotal(
          updated.length,
          updated.width,
          updated.thickness,
          updated.density,
          updated.amount,
        );
        return updated;
      }),
    );
    setActiveDropdownId(null);
  };

  // Edit mode handlers
  const handleEditMaterialSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditFormData({ ...editFormData, materialSearchTerm: e.target.value });
    setActiveDropdownId("edit");
  };

  const handleEditMaterialSelect = (material: MaterialList) => {
    const displayText = material.specification
      ? `${material.material} ${material.specification}`
      : material.material;
    const densityId = material.material_density_id || 0;
    const densityVal = material.material_density?.density || 0;
    setEditFormData((prev) => {
      const updated = {
        ...prev,
        material_id: material.id,
        materialSearchTerm: displayText,
        material_density_id: densityId,
        density: densityVal,
        uom: prev.uom || "",
      };
      updated.total_amount = calcTotal(
        updated.length,
        updated.width,
        updated.thickness,
        updated.density,
        updated.amount,
      );
      return updated;
    });
    setActiveDropdownId(null);
  };

  const handleClearEditMaterialSearch = () => {
    setEditFormData({
      ...editFormData,
      material_id: 0,
      materialSearchTerm: "",
    });
    setActiveDropdownId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (editingId) {
      // Edit mode validation
      if (!editFormData.material_id) {
        setError("Please select a material");
        return;
      }
      if (editFormData.amount <= 0) {
        setError("Amount must be greater than 0");
        return;
      }
      if (!editFormData.uom.trim()) {
        setError("Unit of measurement is required");
        return;
      }
    } else {
      // Batch add mode validation
      if (materialEntries.length === 0) {
        setError("Please add at least one material");
        return;
      }

      for (let i = 0; i < materialEntries.length; i++) {
        const entry = materialEntries[i];
        console.log(`=== Validating Material #${i + 1} ===`);
        console.log("Entry:", entry);
        console.log("Material ID:", entry.material_id);

        if (!entry.material_id || entry.material_id === 0) {
          setError(
            `Material #${i + 1}: Please click on a material from the dropdown list to select it`,
          );
          return;
        }
        if (entry.amount <= 0) {
          setError(`Material #${i + 1}: Amount must be greater than 0`);
          return;
        }
        if (!entry.uom.trim()) {
          setError(`Material #${i + 1}: Unit of measurement is required`);
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
            length: editFormData.length || null,
            width: editFormData.width || null,
            thickness: editFormData.thickness || null,
            density: editFormData.density || null,
            amount: editFormData.amount,
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
          length: entry.length || null,
          width: entry.width || null,
          thickness: entry.thickness || null,
          density: entry.density || null,
          amount: entry.amount,
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
      length: material.length || 0,
      width: material.width || 0,
      thickness: material.thickness || 0,
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
      material_density_id: 0,
      length: 0,
      width: 0,
      thickness: 0,
      density: 0,
      amount: 0,
      total_amount: 0,
      uom: "",
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
          {!isReadOnly && !showForm && (
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
      {showForm && !isReadOnly && (
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

                      {/* Material Search */}
                      <div
                        className="relative"
                        ref={
                          activeDropdownId === entry.tempId
                            ? materialDropdownRef
                            : null
                        }
                      >
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Select Material{" "}
                          <span className="text-red-600">*</span>
                          {entry.material_id > 0 && (
                            <span className="ml-2 text-xs text-green-600 font-normal">
                              ✓ Selected
                            </span>
                          )}
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={entry.materialSearchTerm}
                            onChange={(e) => {
                              if (entry.material_id === 0) {
                                updateMaterialEntry(
                                  entry.tempId,
                                  "materialSearchTerm",
                                  e.target.value,
                                );
                                setActiveDropdownId(entry.tempId);
                              }
                            }}
                            onFocus={() => {
                              if (entry.material_id === 0) {
                                setActiveDropdownId(entry.tempId);
                              }
                            }}
                            placeholder="Search materials..."
                            readOnly={entry.material_id > 0}
                            className={`w-full px-3 py-2 pl-10 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                              entry.material_id > 0
                                ? "border-green-500 bg-green-50"
                                : "border-gray-300"
                            }`}
                          />
                          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                          {entry.materialSearchTerm && (
                            <button
                              type="button"
                              onClick={() => {
                                updateMaterialEntry(
                                  entry.tempId,
                                  "materialSearchTerm",
                                  "",
                                );
                                updateMaterialEntry(
                                  entry.tempId,
                                  "material_id",
                                  0,
                                );
                              }}
                              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Dropdown */}
                        {activeDropdownId === entry.tempId &&
                          getFilteredMaterials(entry.materialSearchTerm)
                            .length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {getFilteredMaterials(
                                entry.materialSearchTerm,
                              ).map((material: MaterialList) => (
                                <div
                                  key={material.id}
                                  onClick={() =>
                                    handleMaterialSelectForEntry(
                                      entry.tempId,
                                      material,
                                    )
                                  }
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
                          {entry.material_density_id > 0 && (
                            <span className="ml-2 text-xs text-green-600 font-normal">
                              ✓ Auto-filled
                            </span>
                          )}
                        </label>
                        <div className="relative">
                          {densityOpenId === entry.tempId && (
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setDensityOpenId(null)}
                            />
                          )}
                          {/* Trigger */}
                          <button
                            type="button"
                            onClick={() =>
                              setDensityOpenId(
                                densityOpenId === entry.tempId
                                  ? null
                                  : entry.tempId,
                              )
                            }
                            className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                          >
                            {entry.material_density_id > 0 ? (
                              (() => {
                                const sel = materialDensities.find(
                                  (d) => d.id === entry.material_density_id,
                                );
                                return sel ? (
                                  <span className="flex items-center gap-2 min-w-0">
                                    <span className="font-medium text-gray-900 truncate">
                                      {sel.name}
                                    </span>
                                    <span className="text-gray-400 flex-shrink-0 text-xs">
                                      {sel.density} {sel.unit}
                                    </span>
                                  </span>
                                ) : null;
                              })()
                            ) : (
                              <span className="text-gray-400">
                                Select density type...
                              </span>
                            )}
                            <ChevronDown
                              className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${
                                densityOpenId === entry.tempId
                                  ? "rotate-180"
                                  : ""
                              }`}
                            />
                          </button>
                          {/* Dropdown panel */}
                          {densityOpenId === entry.tempId && (
                            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                              <div className="p-2 border-b border-gray-100">
                                <div className="relative">
                                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                  <input
                                    type="text"
                                    autoFocus
                                    value={
                                      densitySearchTerms[entry.tempId] ?? ""
                                    }
                                    onChange={(e) =>
                                      setDensitySearchTerms((prev) => ({
                                        ...prev,
                                        [entry.tempId]: e.target.value,
                                      }))
                                    }
                                    placeholder="Search density..."
                                    className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                                  />
                                </div>
                              </div>
                              <div className="max-h-48 overflow-y-auto">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleDensityTypeChangeForEntry(
                                      entry.tempId,
                                      0,
                                    );
                                    setDensityOpenId(null);
                                  }}
                                  className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                                    !entry.material_density_id
                                      ? "bg-blue-50 text-blue-700"
                                      : "text-gray-700"
                                  }`}
                                >
                                  <span className="font-medium">None</span>
                                  <span className="text-xs text-gray-400">
                                    Manual entry
                                  </span>
                                </button>
                                {materialDensities
                                  .filter((d) =>
                                    d.name
                                      .toLowerCase()
                                      .includes(
                                        (
                                          densitySearchTerms[entry.tempId] ?? ""
                                        ).toLowerCase(),
                                      ),
                                  )
                                  .map((d) => (
                                    <button
                                      key={d.id}
                                      type="button"
                                      onClick={() => {
                                        handleDensityTypeChangeForEntry(
                                          entry.tempId,
                                          d.id,
                                        );
                                        setDensityOpenId(null);
                                      }}
                                      className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                                        entry.material_density_id === d.id
                                          ? "bg-blue-50 text-blue-700"
                                          : "text-gray-700"
                                      }`}
                                    >
                                      <span className="font-medium">
                                        {d.name}
                                      </span>
                                      <span className="text-xs text-gray-400">
                                        {d.density} {d.unit}
                                      </span>
                                    </button>
                                  ))}
                                {materialDensities.filter((d) =>
                                  d.name
                                    .toLowerCase()
                                    .includes(
                                      (
                                        densitySearchTerms[entry.tempId] ?? ""
                                      ).toLowerCase(),
                                    ),
                                ).length === 0 && (
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
                          Dimensions in <span className="font-medium">mm</span>{" "}
                          (auto-converted to meters; leave blank if not
                          applicable)
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Length (mm)
                            </label>
                            <input
                              type="number"
                              step="0.0001"
                              value={entry.length || ""}
                              onChange={(e) =>
                                updateMaterialEntry(
                                  entry.tempId,
                                  "length",
                                  parseFloat(e.target.value) || 0,
                                )
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
                              value={entry.width || ""}
                              onChange={(e) =>
                                updateMaterialEntry(
                                  entry.tempId,
                                  "width",
                                  parseFloat(e.target.value) || 0,
                                )
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
                              value={entry.thickness || ""}
                              onChange={(e) =>
                                updateMaterialEntry(
                                  entry.tempId,
                                  "thickness",
                                  parseFloat(e.target.value) || 0,
                                )
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
                          {entry.material_density_id > 0 && (
                            <span className="ml-1 text-xs text-amber-600 font-normal">
                              override
                            </span>
                          )}
                        </label>
                        <input
                          type="number"
                          step="0.0001"
                          value={entry.density || ""}
                          onChange={(e) =>
                            updateMaterialEntry(
                              entry.tempId,
                              "density",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="0"
                          min="0"
                        />
                      </div>

                      {/* Amount, UOM, Total */}
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Amount <span className="text-red-600">*</span>
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={entry.amount || ""}
                            onChange={(e) =>
                              updateMaterialEntry(
                                entry.tempId,
                                "amount",
                                parseFloat(e.target.value) || 0,
                              )
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
                              const active = entry.uom === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  role="radio"
                                  aria-checked={active}
                                  title={opt.description}
                                  onClick={() =>
                                    updateMaterialEntry(
                                      entry.tempId,
                                      "uom",
                                      opt.value,
                                    )
                                  }
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
                              entry.total_amount
                                ? Number(entry.total_amount.toFixed(6))
                                : 0
                            }
                            readOnly
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-semibold"
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Edit Mode - Show single material form */}
            {editingId && (
              <div className="space-y-4">
                <div
                  className="relative"
                  ref={activeDropdownId === "edit" ? materialDropdownRef : null}
                >
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Material <span className="text-red-600">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={editFormData.materialSearchTerm}
                      onChange={handleEditMaterialSearch}
                      onFocus={() => setActiveDropdownId("edit")}
                      placeholder="Search materials..."
                      className="w-full px-3 py-2 pl-10 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    {editFormData.materialSearchTerm && (
                      <button
                        type="button"
                        onClick={handleClearEditMaterialSearch}
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {activeDropdownId === "edit" &&
                    getFilteredMaterials(editFormData.materialSearchTerm)
                      .length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {getFilteredMaterials(
                          editFormData.materialSearchTerm,
                        ).map((material: MaterialList) => (
                          <div
                            key={material.id}
                            onClick={() => handleEditMaterialSelect(material)}
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Material Density Type
                    {editFormData.material_density_id > 0 && (
                      <span className="ml-2 text-xs text-green-600 font-normal">
                        ✓ Auto-filled
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    {editDensityOpen && (
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => {
                          setEditDensityOpen(false);
                          setEditDensitySearch("");
                        }}
                      />
                    )}
                    {/* Trigger */}
                    <button
                      type="button"
                      onClick={() => setEditDensityOpen((o) => !o)}
                      className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    >
                      {editFormData.material_density_id > 0 ? (
                        (() => {
                          const sel = materialDensities.find(
                            (d) => d.id === editFormData.material_density_id,
                          );
                          return sel ? (
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="font-medium text-gray-900 truncate">
                                {sel.name}
                              </span>
                              <span className="text-gray-400 flex-shrink-0 text-xs">
                                {sel.density} {sel.unit}
                              </span>
                            </span>
                          ) : null;
                        })()
                      ) : (
                        <span className="text-gray-400">
                          Select density type...
                        </span>
                      )}
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${
                          editDensityOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {/* Dropdown panel */}
                    {editDensityOpen && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                        <div className="p-2 border-b border-gray-100">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                            <input
                              type="text"
                              autoFocus
                              value={editDensitySearch}
                              onChange={(e) =>
                                setEditDensitySearch(e.target.value)
                              }
                              placeholder="Search density..."
                              className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => {
                              handleEditDensityTypeChange(0);
                              setEditDensityOpen(false);
                              setEditDensitySearch("");
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                              !editFormData.material_density_id
                                ? "bg-blue-50 text-blue-700"
                                : "text-gray-700"
                            }`}
                          >
                            <span className="font-medium">None</span>
                            <span className="text-xs text-gray-400">
                              Manual entry
                            </span>
                          </button>
                          {materialDensities
                            .filter((d) =>
                              d.name
                                .toLowerCase()
                                .includes(editDensitySearch.toLowerCase()),
                            )
                            .map((d) => (
                              <button
                                key={d.id}
                                type="button"
                                onClick={() => {
                                  handleEditDensityTypeChange(d.id);
                                  setEditDensityOpen(false);
                                  setEditDensitySearch("");
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 ${
                                  editFormData.material_density_id === d.id
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
                          {materialDensities.filter((d) =>
                            d.name
                              .toLowerCase()
                              .includes(editDensitySearch.toLowerCase()),
                          ).length === 0 && (
                            <p className="text-center text-sm text-gray-400 py-3">
                              No matches
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500 mb-1">
                    Dimensions in <span className="font-medium">mm</span>{" "}
                    (auto-converted to meters; leave blank if not applicable)
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Length (mm)
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        value={editFormData.length || ""}
                        onChange={(e) =>
                          handleEditCalcChange(
                            "length",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Width (mm)
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        value={editFormData.width || ""}
                        onChange={(e) =>
                          handleEditCalcChange(
                            "width",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Thickness (mm)
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        value={editFormData.thickness || ""}
                        onChange={(e) =>
                          handleEditCalcChange(
                            "thickness",
                            parseFloat(e.target.value) || 0,
                          )
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                        min="0"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Density (g/cm³)
                    {editFormData.material_density_id > 0 && (
                      <span className="ml-1 text-xs text-amber-600 font-normal">
                        override
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={editFormData.density || ""}
                    onChange={(e) =>
                      handleEditCalcChange(
                        "density",
                        parseFloat(e.target.value) || 0,
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Amount <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editFormData.amount}
                      onChange={(e) =>
                        handleEditCalcChange(
                          "amount",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                      required
                      min="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Unit of Measurement{" "}
                      <span className="text-red-600">*</span>
                    </label>
                    <div
                      role="radiogroup"
                      aria-label="Unit of measurement"
                      className="inline-flex w-full rounded-lg border border-gray-300 bg-gray-50 p-1 gap-1"
                    >
                      {UOM_OPTIONS.map((opt) => {
                        const active = editFormData.uom === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            title={opt.description}
                            onClick={() =>
                              setEditFormData({
                                ...editFormData,
                                uom: opt.value,
                              })
                            }
                            className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Total Amount
                    </label>
                    <input
                      type="number"
                      value={
                        editFormData.total_amount
                          ? Number(editFormData.total_amount.toFixed(6))
                          : 0
                      }
                      readOnly
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-semibold"
                    />
                  </div>
                </div>
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
                  {!isReadOnly && (
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
                    {!isReadOnly && (
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
    </div>
  );
}
