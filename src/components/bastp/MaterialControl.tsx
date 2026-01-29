import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import type {
  MaterialControlWithDetails,
  MaterialList,
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
  size: string;
  amount: number;
  uom: string;
}

export default function MaterialControl({
  bastpId,
  workDetailsId,
  workDetailsDescription,
  onClose,
}: MaterialControlProps) {
  const { isReadOnly } = useAuth();
  const [materials, setMaterials] = useState<MaterialControlWithDetails[]>([]);
  const [materialLists, setMaterialLists] = useState<MaterialList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Multiple material entries for batch addition
  const [materialEntries, setMaterialEntries] = useState<MaterialEntry[]>([]);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const materialDropdownRef = useRef<HTMLDivElement>(null);

  // Category display
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  // Single edit form state (for editing existing materials)
  const [editFormData, setEditFormData] = useState({
    material_id: 0,
    materialSearchTerm: "",
    size: "",
    amount: 0,
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
    fetchMaterials();
  }, [workDetailsId, bastpId]);

  const fetchMaterialLists = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("material_lists")
        .select("*")
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
            category
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
      size: "",
      amount: 0,
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
      materialEntries.map((entry) =>
        entry.tempId === tempId ? { ...entry, [field]: value } : entry,
      ),
    );
  };

  // Handle material selection for a specific entry
  const handleMaterialSelectForEntry = (
    tempId: string,
    material: MaterialList,
  ) => {
    console.log("=== Material Selected ===");
    console.log("TempID:", tempId);
    console.log("Material:", material);
    console.log("Material ID:", material.id);

    const displayText = material.specification
      ? `${material.material} ${material.specification}`
      : material.material;

    console.log("Display Text:", displayText);

    // Update both fields in a single operation to avoid state race condition
    setMaterialEntries(
      materialEntries.map((entry) =>
        entry.tempId === tempId
          ? {
              ...entry,
              material_id: material.id,
              materialSearchTerm: displayText,
            }
          : entry,
      ),
    );
    setActiveDropdownId(null);

    console.log("Material selection complete");
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
    setEditFormData({
      ...editFormData,
      material_id: material.id,
      materialSearchTerm: displayText,
      uom: editFormData.uom || "",
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
        const { error: updateError } = await supabase
          .from("material_control")
          .update({
            material_id: editFormData.material_id,
            size: editFormData.size.trim() || null,
            amount: editFormData.amount,
            uom: editFormData.uom.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId);

        if (updateError) throw updateError;
      } else {
        // Create multiple materials
        const materialsToInsert = materialEntries.map((entry) => ({
          material_id: entry.material_id,
          size: entry.size.trim() || null,
          amount: entry.amount,
          uom: entry.uom.trim(),
          work_details_id: workDetailsId,
          bastp_id: bastpId,
        }));

        const { error: insertError } = await supabase
          .from("material_control")
          .insert(materialsToInsert);

        if (insertError) throw insertError;
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
      size: material.size || "",
      amount: material.amount,
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

      const { error: deleteError } = await supabase
        .from("material_control")
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (deleteError) throw deleteError;

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
      size: "",
      amount: 0,
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

                      {/* Size, Amount, UOM */}
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Size
                          </label>
                          <input
                            type="text"
                            value={entry.size}
                            onChange={(e) =>
                              updateMaterialEntry(
                                entry.tempId,
                                "size",
                                e.target.value,
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g., 10mm"
                          />
                        </div>
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
                          <input
                            type="text"
                            value={entry.uom}
                            onChange={(e) =>
                              updateMaterialEntry(
                                entry.tempId,
                                "uom",
                                e.target.value,
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="kg, pcs"
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Size
                    </label>
                    <input
                      type="text"
                      value={editFormData.size}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          size: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., 10mm x 2m"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Amount <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editFormData.amount}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          amount: parseFloat(e.target.value) || 0,
                        })
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
                    <input
                      type="text"
                      value={editFormData.uom}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          uom: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., kg, pcs, m"
                      required
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
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
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600">
                        {material.size || "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm font-semibold text-gray-900">
                        {material.amount.toLocaleString()}
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
