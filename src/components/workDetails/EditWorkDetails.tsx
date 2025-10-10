import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  uploadWorkPermitFile,
  validateWorkPermitFile,
  deleteWorkPermitFile,
} from "../../utils/uploadHandler";
import { openPermitFile } from "../../utils/urlHandler";

interface WorkDetailsData {
  id: number;
  work_order_id: number;
  description: string;
  location: string;
  planned_start_date: string;
  target_close_date: string;
  period_close_target: string;
  pic: string;
  work_permit_url?: string;
  storage_path?: string;
  actual_start_date?: string;
  actual_close_date?: string;
  work_order: {
    id: number;
    shipyard_wo_number: string;
    vessel: {
      id: number;
      name: string;
      type: string;
      company: string;
    };
  };
}

export default function EditWorkDetails() {
  const navigate = useNavigate();
  const { workDetailsId } = useParams<{ workDetailsId: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState({
    description: "",
    location: "",
    planned_start_date: "",
    target_close_date: "",
    period_close_target: "",
    pic: "",
    work_permit_url: "",
    storage_path: "",
  });

  // Original data for comparison
  const [originalData, setOriginalData] = useState<WorkDetailsData | null>(
    null
  );

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);

  // Fetch work details data
  const fetchWorkDetails = useCallback(async () => {
    if (!workDetailsId) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("work_details")
        .select(
          `
          *,
          work_order (
            id,
            shipyard_wo_number,
            vessel (
              id,
              name,
              type,
              company
            )
          )
        `
        )
        .eq("id", parseInt(workDetailsId))
        .single();

      if (error) throw error;

      if (!data) {
        throw new Error("Work details not found");
      }

      setOriginalData(data);
      setFormData({
        description: data.description || "",
        location: data.location || "",
        planned_start_date: data.planned_start_date || "",
        target_close_date: data.target_close_date || "",
        period_close_target: data.period_close_target || "",
        pic: data.pic || "",
        work_permit_url: data.work_permit_url || "",
        storage_path: data.storage_path || "",
      });
    } catch (err) {
      console.error("Error fetching work details:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load work details"
      );
    } finally {
      setLoading(false);
    }
  }, [workDetailsId]);

  useEffect(() => {
    fetchWorkDetails();
  }, [fetchWorkDetails]);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    // Validate file
    const validation = validateWorkPermitFile(file);
    if (!validation.isValid) {
      setFileError(validation.error || "Invalid file");
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setSelectedFile(file);
    setRemoveExistingFile(false); // Reset remove flag when new file is selected
  };

  // Remove selected file
  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Toggle remove existing file
  const handleRemoveExistingFile = () => {
    setRemoveExistingFile(!removeExistingFile);
    setSelectedFile(null); // Clear new file selection
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // View existing permit
  const handleViewPermit = async () => {
    if (!originalData?.storage_path) return;

    try {
      await openPermitFile(originalData.storage_path);
    } catch (err) {
      console.error("Error opening permit file:", err);
      alert("Failed to open permit file");
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    const errors: string[] = [];

    if (!formData.description.trim()) {
      errors.push("Description is required");
    }
    if (!formData.location.trim()) {
      errors.push("Location is required");
    }
    if (!formData.planned_start_date) {
      errors.push("Planned start date is required");
    }
    if (!formData.target_close_date) {
      errors.push("Target close date is required");
    }
    if (!formData.period_close_target.trim()) {
      errors.push("Period close target is required");
    }
    if (!formData.pic.trim()) {
      errors.push("Person in charge (PIC) is required");
    }

    // Date validation
    if (formData.planned_start_date && formData.target_close_date) {
      const startDate = new Date(formData.planned_start_date);
      const endDate = new Date(formData.target_close_date);
      if (startDate >= endDate) {
        errors.push("Target close date must be after planned start date");
      }
    }

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      setError(validationErrors.join(", "));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let newStoragePath: string | null = formData.storage_path || null;
      let newWorkPermitUrl: string | null = formData.work_permit_url || null;

      // Handle file operations
      if (removeExistingFile && originalData?.storage_path) {
        // Remove existing file
        await deleteWorkPermitFile(originalData.storage_path);
        newStoragePath = null;
        newWorkPermitUrl = null;
      }

      if (selectedFile) {
        // Upload new file
        setUploadProgress(true);

        // Generate custom path for the file
        const workOrderNumber =
          originalData?.work_order?.shipyard_wo_number || "unknown";
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const customPath = `work-orders/${workOrderNumber}/permits/${timestamp}_${selectedFile.name.replace(
          /[^a-zA-Z0-9.-]/g,
          "_"
        )}`;

        const uploadResult = await uploadWorkPermitFile(
          selectedFile,
          customPath
        );

        setUploadProgress(false);

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || "File upload failed");
        }

        // If we had an old file and uploaded a new one, delete the old one
        if (
          originalData?.storage_path &&
          originalData.storage_path !== uploadResult.storagePath
        ) {
          try {
            await deleteWorkPermitFile(originalData.storage_path);
          } catch (deleteErr) {
            console.warn("Failed to delete old permit file:", deleteErr);
            // Don't fail the whole operation if old file deletion fails
          }
        }

        newStoragePath = uploadResult.storagePath || null;
        newWorkPermitUrl = uploadResult.publicUrl || null;
      }

      // Prepare data for update
      const updateData = {
        description: formData.description.trim(),
        location: formData.location.trim(),
        planned_start_date: formData.planned_start_date,
        target_close_date: formData.target_close_date,
        period_close_target: formData.period_close_target.trim(),
        pic: formData.pic.trim(),
        work_permit_url: newWorkPermitUrl,
        storage_path: newStoragePath,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("work_details")
        .update(updateData)
        .eq("id", parseInt(workDetailsId!))
        .select()
        .single();

      if (error) {
        console.error("Database update error:", error);
        throw error;
      }

      // Navigate back to work details view
      navigate(`/work-details/${workDetailsId}`);
    } catch (err) {
      console.error("Error updating work details:", err);
      setError(
        err instanceof Error ? err.message : "Failed to update work details"
      );
    } finally {
      setSaving(false);
      setUploadProgress(false);
    }
  };

  const handleCancel = () => {
    navigate(`/work-details/${workDetailsId}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading work details...</span>
      </div>
    );
  }

  if (error && !originalData) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">
            Error Loading Work Details
          </h3>
          <p className="text-red-600 mt-1">{error}</p>
          <div className="flex gap-3 mt-4">
            <button
              onClick={fetchWorkDetails}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => navigate("/work-details")}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Back to List
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!originalData) {
    return (
      <div className="p-8">
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900">
            Work Details Not Found
          </h3>
          <p className="text-gray-500 mt-2">
            The work details you're looking for doesn't exist.
          </p>
          <button
            onClick={() => navigate("/work-details")}
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to List
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Edit Work Details
            </h1>
            <p className="text-gray-600 mt-2">
              Update work details for{" "}
              {originalData.work_order.shipyard_wo_number} on{" "}
              {originalData.work_order.vessel.name}
            </p>
          </div>
          <button
            onClick={handleCancel}
            className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Work Order Info */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center">
          <span className="text-lg mr-3">🏗️</span>
          <div>
            <div className="font-semibold text-blue-800">
              Work Order: {originalData.work_order.shipyard_wo_number}
            </div>
            <div className="text-sm text-blue-600">
              🚢 {originalData.work_order.vessel.name} (
              {originalData.work_order.vessel.type}) -{" "}
              {originalData.work_order.vessel.company}
            </div>
          </div>
        </div>
      </div>

      {/* Form Container */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Work Details Information
          </h2>
          <p className="text-sm text-gray-600">
            Update the work details information
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Error Display */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="text-red-800 font-medium">
                Please fix the following errors:
              </h3>
              <p className="text-red-600 mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Description */}
            <div className="md:col-span-2">
              <label
                htmlFor="description"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Work Description *
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Describe the specific work task in detail..."
                required
              />
            </div>

            {/* Location */}
            <div>
              <label
                htmlFor="location"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Location *
              </label>
              <input
                type="text"
                id="location"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Engine Room, Deck, Bridge, etc."
                required
              />
            </div>

            {/* Person in Charge */}
            <div>
              <label
                htmlFor="pic"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Person in Charge (PIC) *
              </label>
              <input
                type="text"
                id="pic"
                name="pic"
                value={formData.pic}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Name of responsible person"
                required
              />
            </div>

            {/* Planned Start Date */}
            <div>
              <label
                htmlFor="planned_start_date"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Planned Start Date *
              </label>
              <input
                type="date"
                id="planned_start_date"
                name="planned_start_date"
                value={formData.planned_start_date}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Target Close Date */}
            <div>
              <label
                htmlFor="target_close_date"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Target Close Date *
              </label>
              <input
                type="date"
                id="target_close_date"
                name="target_close_date"
                value={formData.target_close_date}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Period Close Target */}
            <div className="md:col-span-2">
              <label
                htmlFor="period_close_target"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Period Close Target *
              </label>
              <input
                type="text"
                id="period_close_target"
                name="period_close_target"
                value={formData.period_close_target}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., 2 weeks, 1 month, End of Q1, etc."
                required
              />
            </div>

            {/* Work Permit File Management */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Work Permit Document
              </label>

              {/* Existing File Display */}
              {originalData.storage_path && !removeExistingFile && (
                <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="text-green-600 mr-2">📄</span>
                      <div>
                        <div className="text-sm font-medium text-green-800">
                          Current Work Permit
                        </div>
                        <div className="text-xs text-green-600">
                          Uploaded and available
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleViewPermit}
                        className="text-blue-600 hover:text-blue-800 text-sm underline"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveExistingFile}
                        className="text-red-600 hover:text-red-800 text-sm underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Remove Existing File Warning */}
              {removeExistingFile && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="text-red-600 mr-2">⚠️</span>
                      <div>
                        <div className="text-sm font-medium text-red-800">
                          Work Permit Will Be Removed
                        </div>
                        <div className="text-xs text-red-600">
                          The current work permit will be deleted when you save
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRemoveExistingFile(false)}
                      className="text-blue-600 hover:text-blue-800 text-sm underline"
                    >
                      Keep File
                    </button>
                  </div>
                </div>
              )}

              {/* No Existing File */}
              {!originalData.storage_path && (
                <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center">
                    <span className="text-yellow-600 mr-2">⚠️</span>
                    <div>
                      <div className="text-sm font-medium text-yellow-800">
                        No Work Permit Uploaded
                      </div>
                      <div className="text-xs text-yellow-600">
                        Upload a work permit to start this work
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* File Upload Section */}
              <div className="mt-4">
                <div className="mb-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="work_permit_file"
                  />
                  <label
                    htmlFor="work_permit_file"
                    className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    📄{" "}
                    {originalData.storage_path
                      ? "Replace with New PDF"
                      : "Upload PDF File"}
                  </label>
                </div>

                {/* File Error */}
                {fileError && (
                  <div className="mt-2 text-sm text-red-600">{fileError}</div>
                )}

                {/* Selected File Display */}
                {selectedFile && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="text-blue-600 mr-2">📄</span>
                        <div>
                          <div className="text-sm font-medium text-blue-800">
                            {selectedFile.name}
                          </div>
                          <div className="text-xs text-blue-600">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB -
                            Ready to upload
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-500 mt-2">
                  Upload a PDF file containing the work permit or safety
                  authorization (max 10MB)
                </p>
              </div>
            </div>

            {/* Work Status Info (Read-only) */}
            {(originalData.actual_start_date ||
              originalData.actual_close_date) && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Work Status (Read-only)
                </label>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    {originalData.actual_start_date && (
                      <div>
                        <span className="font-medium text-gray-700">
                          Actual Start Date:
                        </span>
                        <div className="text-blue-600">
                          {new Date(
                            originalData.actual_start_date
                          ).toLocaleDateString()}
                        </div>
                      </div>
                    )}
                    {originalData.actual_close_date && (
                      <div>
                        <span className="font-medium text-gray-700">
                          Actual Close Date:
                        </span>
                        <div className="text-green-600">
                          {new Date(
                            originalData.actual_close_date
                          ).toLocaleDateString()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-4 mt-8 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              disabled={saving || uploadProgress}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploadProgress}
              className="px-8 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving || uploadProgress ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  {uploadProgress ? "Uploading file..." : "Saving..."}
                </>
              ) : (
                <>✅ Save Changes</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
