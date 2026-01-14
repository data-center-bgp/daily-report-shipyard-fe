import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import type { BASTPWithDetails } from "../../types/bastp.types";
import { useAuth } from "../../hooks/useAuth";

export default function BASTPDetails() {
  const navigate = useNavigate();
  const { isReadOnly } = useAuth();
  const { bastpId } = useParams<{ bastpId: string }>();

  const [bastp, setBastp] = useState<BASTPWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingDocument, setViewingDocument] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);

  // Fetch BASTP details
  const fetchBastpDetails = useCallback(async () => {
    if (!bastpId) return;
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from("bastp")
        .select(
          `
    *,
    vessel:vessel_id (
      id,
      name,
      type,
      company
    ),
    profiles:user_id (
      id,
      name,
      email
    ),
    bastp_work_details (
      id,
      work_details:work_details_id (
        id,
        description,
        quantity,
        uom,
        planned_start_date,
        target_close_date,
        pic,
        location:location_id (
          id,
          location
        ),
        work_order:work_order_id (
          id,
          created_at,
          updated_at,
          vessel_id,
          shipyard_wo_number,
          shipyard_wo_date,
          customer_wo_number,
          customer_wo_date,
          user_id,
          is_additional_wo,
          kapro_id,
          work_location,
          work_type,
          kapro:kapro_id (
            id,
            kapro_name
          ),
          profiles:user_id (
            id,
            name,
            email
          )
        )
      )
    ),
    general_services (
      id,
      service_type_id,
      start_date,
      close_date,
      total_days,
      remarks,
      service_type:service_type_id (
        id,
        service_name,
        service_code,
        display_order
      )
    )
  `
        )
        .eq("id", bastpId)
        .is("deleted_at", null)
        .single();

      if (fetchError) throw fetchError;
      setBastp(data);
    } catch (err) {
      console.error("Error fetching BASTP details:", err);
      setError(err instanceof Error ? err.message : "Failed to load BASTP");
    } finally {
      setLoading(false);
    }
  }, [bastpId]);

  // Fetch BASTP details on mount
  useEffect(() => {
    fetchBastpDetails();
  }, [fetchBastpDetails]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      { bg: string; text: string; icon: string }
    > = {
      DRAFT: { bg: "bg-gray-100", text: "text-gray-700", icon: "📝" },
      VERIFIED: { bg: "bg-blue-100", text: "text-blue-700", icon: "✅" },
      READY_FOR_INVOICE: {
        bg: "bg-green-100",
        text: "text-green-700",
        icon: "💰",
      },
      INVOICED: { bg: "bg-emerald-100", text: "text-emerald-700", icon: "✓" },
    };

    const config = statusConfig[status] || statusConfig.DRAFT;
    return (
      <span
        className={`px-3 py-1 rounded-full text-sm font-medium ${config.bg} ${config.text}`}
      >
        {config.icon} {status.replace(/_/g, " ")}
      </span>
    );
  };

  // Get unique work orders from work details
  const getUniqueWorkOrders = () => {
    if (!bastp?.bastp_work_details) return [];
    const workOrdersMap = new Map();
    bastp.bastp_work_details.forEach((bwd) => {
      const wo = bwd.work_details?.work_order;
      if (wo && !workOrdersMap.has(wo.id)) {
        workOrdersMap.set(wo.id, {
          ...wo,
          workDetailsCount: 1,
        });
      } else if (wo) {
        const existing = workOrdersMap.get(wo.id);
        workOrdersMap.set(wo.id, {
          ...existing,
          workDetailsCount: existing.workDetailsCount + 1,
        });
      }
    });
    return Array.from(workOrdersMap.values());
  };

  const uniqueWorkOrders = bastp ? getUniqueWorkOrders() : [];

  // Generate signed URL and open modal
  const handleViewDocument = async () => {
    if (!bastp?.storage_path) return;

    try {
      setViewingDocument(true);

      // Generate fresh signed URL (valid for 5 minutes)
      const { data, error } = await supabase.storage
        .from("bastp")
        .createSignedUrl(bastp.storage_path, 300); // 5 minutes = 300 seconds

      if (error) throw error;

      // Set document URL and open modal
      setDocumentUrl(data.signedUrl);
      setShowDocumentModal(true);
    } catch (err) {
      console.error("Error viewing document:", err);
      alert("❌ Failed to view document. Please try again.");
    } finally {
      setViewingDocument(false);
    }
  };

  // Close modal
  const handleCloseModal = () => {
    setShowDocumentModal(false);
    setDocumentUrl(null);
  };

  // Detect file type
  const getFileType = () => {
    if (!bastp?.storage_path) return "unknown";
    const extension = bastp.storage_path.split(".").pop()?.toLowerCase();
    if (["pdf"].includes(extension || "")) return "pdf";
    if (["jpg", "jpeg", "png", "gif"].includes(extension || "")) return "image";
    return "unknown";
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading BASTP details...</span>
        </div>
      </div>
    );
  }

  if (error || !bastp) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <span className="text-red-600 mr-2">⚠️</span>
            <p className="text-red-700 font-medium">
              {error || "BASTP not found"}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate("/bastp")}
          className="mt-4 text-blue-600 hover:text-blue-800"
        >
          ← Back to BASTP List
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">BASTP Details</h1>
          <p className="text-gray-600 mt-2">{bastp.number}</p>
        </div>
        <div className="flex items-center gap-3">
          {!isReadOnly && (
            <button
              onClick={() => navigate(`/bastp/edit/${bastp.id}`)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              ✏️ Edit
            </button>
          )}
          <button
            onClick={() => navigate("/bastp")}
            className="text-blue-600 hover:text-blue-800"
          >
            ← Back to List
          </button>
        </div>
      </div>

      {/* BASTP Information */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            📋 BASTP Information
          </h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              BASTP Number
            </label>
            <p className="text-lg font-semibold text-gray-900">
              {bastp.number}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Status
            </label>
            {getStatusBadge(bastp.status)}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Vessel
            </label>
            <p className="text-gray-900 font-medium">{bastp.vessel?.name}</p>
            <p className="text-sm text-gray-600">
              {bastp.vessel?.type} • {bastp.vessel?.company}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Created By
            </label>
            <p className="text-gray-900">{bastp.profiles?.name}</p>
            <p className="text-sm text-gray-600">{bastp.profiles?.email}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              BASTP Date
            </label>
            <p className="text-gray-900">{formatDate(bastp.date)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Delivery Date
            </label>
            <p className="text-gray-900">{formatDate(bastp.delivery_date)}</p>
          </div>
          {bastp.bastp_upload_date && (
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Document Upload Date
              </label>
              <p className="text-gray-900">
                {formatDate(bastp.bastp_upload_date)}
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Total Work Details
            </label>
            <p className="text-gray-900 font-semibold">
              {bastp.total_work_details} items
            </p>
          </div>
          {bastp.is_invoiced && bastp.invoiced_date && (
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Invoiced Date
              </label>
              <p className="text-gray-900">{formatDate(bastp.invoiced_date)}</p>
            </div>
          )}
        </div>
        {/* Document Section */}
        {bastp.storage_path && (
          <div className="p-6 border-t border-gray-200 bg-green-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  📄 Signed Document
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Uploaded on {formatDate(bastp.bastp_upload_date || "")}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  🔒 Secure document - link expires after 5 minutes
                </p>
              </div>
              <button
                onClick={handleViewDocument}
                disabled={viewingDocument}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  viewingDocument
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                } text-white`}
              >
                {viewingDocument ? "Loading..." : "View Document 🔍"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Work Orders Summary */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            📋 Work Orders Included ({uniqueWorkOrders.length})
          </h2>
        </div>
        <div className="p-6 space-y-4">
          {uniqueWorkOrders.map((wo: any) => (
            <div
              key={wo.id}
              className="border border-gray-200 rounded-lg p-6 hover:border-blue-300 hover:shadow-md transition-all"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-gray-900">
                      {wo.shipyard_wo_number}
                    </h3>
                    <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded">
                      {wo.workDetailsCount} work item
                      {wo.workDetailsCount > 1 ? "s" : ""}
                    </span>
                    {wo.is_additional_wo && (
                      <span className="bg-orange-100 text-orange-800 text-xs font-medium px-2 py-1 rounded">
                        Additional WO
                      </span>
                    )}
                  </div>
                  {wo.customer_wo_number && (
                    <p className="text-sm text-gray-600">
                      Customer WO: {wo.customer_wo_number}
                    </p>
                  )}
                </div>
              </div>
              {/* Work Order Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                {wo.shipyard_wo_date && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Shipyard WO Date
                    </label>
                    <div className="flex items-center text-sm text-gray-900">
                      <span className="mr-2">📅</span>
                      {formatDate(wo.shipyard_wo_date)}
                    </div>
                  </div>
                )}
                {wo.customer_wo_date && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Customer WO Date
                    </label>
                    <div className="flex items-center text-sm text-gray-900">
                      <span className="mr-2">📅</span>
                      {formatDate(wo.customer_wo_date)}
                    </div>
                  </div>
                )}
                {wo.work_type && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Work Type
                    </label>
                    <div className="flex items-center">
                      <span className="bg-indigo-100 text-indigo-800 text-xs font-medium px-2 py-1 rounded">
                        {wo.work_type}
                      </span>
                    </div>
                  </div>
                )}
                {wo.work_location && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Work Location
                    </label>
                    <div className="flex items-center text-sm text-gray-900">
                      <span className="mr-2">📍</span>
                      {wo.work_location}
                    </div>
                  </div>
                )}
                {wo.kapro && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      KAPRO
                    </label>
                    <div className="flex items-center text-sm text-gray-900">
                      <span className="mr-2">👤</span>
                      {wo.kapro.kapro_name}
                    </div>
                  </div>
                )}
                {wo.profiles && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Created By
                    </label>
                    <div className="text-sm text-gray-900">
                      {wo.profiles.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {wo.profiles.email}
                    </div>
                  </div>
                )}
              </div>
              {/* Timestamps */}
              <div className="pt-4 border-t border-gray-100">
                <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
                  <div>
                    <span className="font-medium">Created:</span>{" "}
                    {formatDateTime(wo.created_at)}
                  </div>
                  <div>
                    <span className="font-medium">Updated:</span>{" "}
                    {formatDateTime(wo.updated_at)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Work Details List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            🔧 Work Details ({bastp.bastp_work_details?.length || 0})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Work Order
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Quantity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  PIC
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Schedule
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {bastp.bastp_work_details?.map((bwd, index) => (
                <tr key={bwd.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {index + 1}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900">
                      {bwd.work_details?.description}
                    </p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {bwd.work_details?.work_order?.shipyard_wo_number}
                    </div>
                    <div className="text-sm text-gray-500">
                      {bwd.work_details?.work_order?.customer_wo_number}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    📍 {bwd.work_details?.location?.location || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {bwd.work_details?.quantity} {bwd.work_details?.uom}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    👤 {bwd.work_details?.pic}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                    <div>
                      Start:{" "}
                      {formatDate(bwd.work_details?.planned_start_date || "")}
                    </div>
                    <div>
                      Target:{" "}
                      {formatDate(bwd.work_details?.target_close_date || "")}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* General Services Section */}
      {bastp?.general_services &&
        Array.isArray(bastp.general_services) &&
        bastp.general_services.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                🛠️ General Services
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Services used during vessel work
              </p>
            </div>
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Service Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Start Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Close Date
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        Total Days
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Remarks
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {bastp.general_services
                      .sort(
                        (a: any, b: any) =>
                          (a.service_type?.display_order || 0) -
                          (b.service_type?.display_order || 0)
                      )
                      .map((service: any, index: number) => (
                        <tr key={service.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {index + 1}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">
                              {service.service_type?.service_name}
                            </div>
                          </td>
                          {/* ✅ ADD: Start Date */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {service.start_date ? (
                                formatDate(service.start_date)
                              ) : (
                                <span className="text-gray-400 text-xs">
                                  Not set
                                </span>
                              )}
                            </div>
                          </td>
                          {/* ✅ ADD: Close Date */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {service.close_date ? (
                                formatDate(service.close_date)
                              ) : (
                                <span className="text-gray-400 text-xs">
                                  Not set
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                              {service.total_days} day
                              {service.total_days !== 1 ? "s" : ""}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-600">
                              {service.remarks || "-"}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Info Notice */}
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  💡 <strong>Note:</strong> Total days includes both start and
                  close dates. Pricing information is managed by Finance during
                  invoice creation.
                </p>
              </div>
            </div>
          </div>
        )}

      {/* Document Viewer Modal */}
      {showDocumentModal && documentUrl && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                📄 BASTP Document - {bastp.number}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-4">
              {getFileType() === "pdf" && (
                <iframe
                  src={documentUrl}
                  className="w-full h-[70vh] border-0"
                  title="BASTP Document"
                />
              )}
              {getFileType() === "image" && (
                <img
                  src={documentUrl}
                  alt="BASTP Document"
                  className="max-w-full h-auto mx-auto"
                />
              )}
              {getFileType() === "unknown" && (
                <div className="text-center py-12">
                  <p className="text-gray-600 mb-4">
                    Cannot preview this file type
                  </p>
                  <a
                    href={documentUrl}
                    download
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 inline-block"
                  >
                    Download Document
                  </a>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-200 flex justify-between items-center">
              <p className="text-xs text-gray-500">
                🔒 This link expires in 5 minutes
              </p>
              <div className="space-x-2">
                <a
                  href={documentUrl}
                  download
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 inline-block"
                >
                  ⬇️ Download
                </a>
                <button
                  onClick={handleCloseModal}
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
