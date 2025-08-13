import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase, type WorkOrder } from "../../lib/supabase";

export default function UploadPermit() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [filteredWorkOrders, setFilteredWorkOrders] = useState<WorkOrder[]>([]);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(
    null
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedWorkOrderId = searchParams.get("work_order_id");

  useEffect(() => {
    fetchWorkOrders();
  }, []);

  useEffect(() => {
    if (preselectedWorkOrderId && workOrders.length > 0) {
      const preselected = workOrders.find(
        (wo) => wo.id?.toString() === preselectedWorkOrderId
      );
      if (preselected) {
        setSelectedWorkOrder(preselected);
      }
    }
  }, [preselectedWorkOrderId, workOrders]);

  useEffect(() => {
    // Filter work orders based on search term
    const filtered = workOrders.filter((wo) => {
      const searchLower = searchTerm.toLowerCase();
      return (
        wo.customer_wo_number.toLowerCase().includes(searchLower) ||
        wo.shipyard_wo_number.toLowerCase().includes(searchLower) ||
        wo.vessel?.name?.toLowerCase().includes(searchLower) ||
        wo.vessel?.type?.toLowerCase().includes(searchLower) ||
        wo.vessel?.company?.toLowerCase().includes(searchLower) ||
        wo.wo_location.toLowerCase().includes(searchLower)
      );
    });
    setFilteredWorkOrders(filtered);
  }, [searchTerm, workOrders]);

  const fetchWorkOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("work_order")
        .select(
          `
          *,
          vessel:vessel_id (
            name,
            type,
            company
          )
        `
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setWorkOrders(data || []);
    } catch (err) {
      console.error("Error fetching work orders:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file || !selectedWorkOrder?.id) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Upload file to storage
      const fileName = `permit-${selectedWorkOrder.id}-${Date.now()}-${
        file.name
      }`;
      const folderPath = `wo-${selectedWorkOrder.id}`;
      const filePath = `${folderPath}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("work-order-files")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          metadata: {
            uploaded_by: user.email || "unknown",
            original_name: file.name,
            upload_date: new Date().toISOString(),
            file_type: "permit",
          },
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("work-order-files")
        .getPublicUrl(filePath);

      // Create or update permit record
      const permitData = {
        work_order_id: selectedWorkOrder.id,
        user_id: user.id,
        document_url: urlData.publicUrl,
        is_uploaded: true,
      };

      // Check if permit already exists
      const { data: existingPermit, error: checkError } = await supabase
        .from("permit_to_work")
        .select("id")
        .eq("work_order_id", selectedWorkOrder.id)
        .single();

      if (checkError && checkError.code !== "PGRST116") {
        throw checkError;
      }

      if (existingPermit) {
        // Update existing permit
        const { error: updateError } = await supabase
          .from("permit_to_work")
          .update({
            document_url: urlData.publicUrl,
            is_uploaded: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingPermit.id);

        if (updateError) throw updateError;
      } else {
        // Create new permit
        const { error: insertError } = await supabase
          .from("permit_to_work")
          .insert([permitData]);

        if (insertError) throw insertError;
      }

      setSuccess("Permit uploaded successfully!");

      // Reset form
      setSelectedWorkOrder(null);
      setSearchTerm("");
      event.target.value = "";

      // Navigate back after a delay
      setTimeout(() => {
        navigate("/permits");
      }, 2000);
    } catch (err) {
      console.error("Error uploading permit:", err);
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading work orders...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Upload Permit to Work
          </h1>
          <p className="text-gray-600">
            Select a work order and upload permit documents
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-green-600">{success}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Work Order Selection */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Select Work Order
              </h2>

              {/* Search Bar */}
              <div className="relative mb-4">
                <input
                  type="text"
                  placeholder="Search work orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="absolute left-3 top-2.5 text-gray-400">🔍</div>
              </div>
            </div>

            {/* Work Orders List */}
            <div className="max-h-96 overflow-y-auto">
              {filteredWorkOrders.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  {searchTerm
                    ? "No work orders match your search."
                    : "No work orders available."}
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {filteredWorkOrders.map((wo) => (
                    <button
                      key={wo.id}
                      onClick={() => setSelectedWorkOrder(wo)}
                      className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                        selectedWorkOrder?.id === wo.id
                          ? "bg-blue-50 border-r-4 border-blue-500"
                          : ""
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="text-sm font-medium text-blue-600">
                              {wo.customer_wo_number}
                            </span>
                            <span className="text-sm text-gray-500">•</span>
                            <span className="text-sm text-gray-600">
                              {wo.shipyard_wo_number}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {wo.vessel?.name}
                          </p>
                          <div className="flex items-center space-x-4 mt-1">
                            <span className="text-xs text-gray-500">
                              {wo.vessel?.type}
                            </span>
                            <span className="text-xs text-gray-500">
                              {wo.vessel?.company}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            📍 {wo.wo_location}
                          </p>
                        </div>
                        {selectedWorkOrder?.id === wo.id && (
                          <div className="flex-shrink-0 ml-2">
                            <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                              <span className="text-white text-xs">✓</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Upload Section */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-6">
                Upload Permit Document
              </h2>

              {selectedWorkOrder ? (
                <div className="space-y-6">
                  {/* Selected Work Order Info */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-2">
                      Selected Work Order
                    </h4>
                    <div className="text-sm text-blue-800 space-y-1">
                      <div>
                        <strong>Customer WO:</strong>{" "}
                        {selectedWorkOrder.customer_wo_number}
                      </div>
                      <div>
                        <strong>Shipyard WO:</strong>{" "}
                        {selectedWorkOrder.shipyard_wo_number}
                      </div>
                      <div>
                        <strong>Vessel:</strong>{" "}
                        {selectedWorkOrder.vessel?.name} (
                        {selectedWorkOrder.vessel?.type})
                      </div>
                      <div>
                        <strong>Company:</strong>{" "}
                        {selectedWorkOrder.vessel?.company}
                      </div>
                      <div>
                        <strong>Location:</strong>{" "}
                        {selectedWorkOrder.wo_location}
                      </div>
                    </div>
                  </div>

                  {/* File Upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Permit Document *
                    </label>
                    <div className="relative">
                      <input
                        type="file"
                        onChange={handleFileUpload}
                        disabled={uploading}
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-3 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Supported formats: PDF, DOC, DOCX, JPG, PNG (Max 10MB)
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end space-x-4">
                    <button
                      onClick={() => navigate("/permits")}
                      disabled={uploading}
                      className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() =>
                        (
                          document.querySelector(
                            'input[type="file"]'
                          ) as HTMLInputElement
                        )?.click()
                      }
                      disabled={uploading}
                      className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {uploading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Uploading...
                        </>
                      ) : (
                        <>📤 Upload Permit</>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📋</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No Work Order Selected
                  </h3>
                  <p className="text-gray-500">
                    Please select a work order from the list to upload a permit
                    document.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
