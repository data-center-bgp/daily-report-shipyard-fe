import { useState, useEffect, useCallback, Fragment } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import type { BASTPWithDetails } from "../../types/bastp.types";
import { useAuth } from "../../hooks/useAuth";
import {
  ArrowLeft,
  Edit,
  FileText,
  AlertTriangle,
  FileEdit,
  CheckCircle2,
  DollarSign,
  FileCheck,
  Calendar,
  MapPin,
  User,
  Lock,
  Wrench,
  Lightbulb,
  Package,
  Undo2,
  Ban,
  Clock,
  Receipt,
  Eye,
  Loader,
} from "lucide-react";

export default function BASTPDetails() {
  const navigate = useNavigate();
  const { isBastpReadOnly } = useAuth();
  const { bastpId } = useParams<{ bastpId: string }>();

  const [bastp, setBastp] = useState<BASTPWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profilesMap, setProfilesMap] = useState<
    Record<number, { id: number; name: string; email: string }>
  >({});
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [uploadingFormPenawaran, setUploadingFormPenawaran] = useState(false);
  const [formPenawaranError, setFormPenawaranError] = useState<string | null>(
    null,
  );
  const [viewingFormPenawaran, setViewingFormPenawaran] = useState(false);

  // Once a BASTP is ready for (or already) invoicing, its composition and
  // materials are financially committed — Edit/Material Control lock so
  // nobody quietly changes what's being billed after the fact.
  const isLocked =
    bastp?.status === "READY_FOR_INVOICE" || bastp?.status === "INVOICED";
  // FINANCE and OP_HEAD consume/monitor BASTPs but shouldn't edit their
  // composition — see isBastpReadOnly (MANAGER + FINANCE + OP_HEAD).
  const canEditBastp = !isBastpReadOnly && !isLocked;

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
    bastp_work_details (
      id,
      deleted_at,
      materials_status,
      work_details:work_details_id (
        id,
        description,
        quantity,
        uom,
        cancelled_at,
        planned_start_date,
        target_close_date,
        pic,
        location:location_id (
          id,
          location
        ),
        work_scope:work_scope_id (
          id,
          work_scope
        ),
        work_verification (
          status,
          created_at,
          deleted_at
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
          )
        ),
        material_control (
          id,
          material_id,
          length,
          width,
          thickness,
          density,
          amount,
          total_amount,
          uom,
          deleted_at,
          material_list:material_id (
            id,
            material,
            specification,
            category
          ),
          material_density:material_density_id (
            id,
            name,
            density,
            unit
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
  `,
        )
        .eq("id", bastpId)
        .is("deleted_at", null)
        .single();

      if (fetchError) throw fetchError;

      // Names come from the get_all_profiles RPC rather than an embedded
      // profiles join — RLS silently nulls out a direct join to another
      // user's profile row, which left "Created By" blank everywhere.
      const { data: allProfiles, error: profilesError } =
        await supabase.rpc("get_all_profiles");
      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
      }
      const map: Record<number, { id: number; name: string; email: string }> =
        {};
      (allProfiles || []).forEach(
        (profile: { id: number; name: string; email: string }) => {
          map[profile.id] = profile;
        },
      );
      setProfilesMap(map);

      // Drop any soft-deleted link rows — bastp_work_details is currently
      // hard-deleted on edit, but the column exists, so don't trust it stays
      // that way.
      const cleanedData = {
        ...data,
        bastp_work_details: (data.bastp_work_details || []).filter(
          (bwd: { deleted_at: string | null }) => !bwd.deleted_at,
        ),
      };
      setBastp(cleanedData);

      if (data.status === "INVOICED") {
        const { data: invoice } = await supabase
          .from("invoice_details")
          .select("id")
          .eq("bastp_id", bastpId)
          .is("deleted_at", null)
          .maybeSingle();
        setInvoiceId(invoice?.id ?? null);
      }
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
      { bg: string; text: string; icon: React.ReactElement }
    > = {
      DRAFT: {
        bg: "bg-gray-100",
        text: "text-gray-700",
        icon: <FileEdit className="w-3 h-3" />,
      },
      VERIFIED: {
        bg: "bg-blue-100",
        text: "text-blue-700",
        icon: <CheckCircle2 className="w-3 h-3" />,
      },
      READY_FOR_INVOICE: {
        bg: "bg-green-100",
        text: "text-green-700",
        icon: <DollarSign className="w-3 h-3" />,
      },
      INVOICED: {
        bg: "bg-emerald-100",
        text: "text-emerald-700",
        icon: <FileCheck className="w-3 h-3" />,
      },
    };

    const config = statusConfig[status] || statusConfig.DRAFT;
    return (
      <span
        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${config.bg} ${config.text}`}
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

  // Latest (non-deleted) review status for one work detail's own
  // work_verification history — this array is already scoped to a single
  // work detail via the relationship, so no need for the cross-work-detail
  // grouping helper.
  const getLatestReviewStatus = (
    records:
      | { status: "APPROVED" | "REJECTED"; created_at: string; deleted_at: string | null }[]
      | undefined,
  ) => {
    return (records || [])
      .filter((r) => !r.deleted_at)
      .sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )[0]?.status;
  };

  const reviewCounts = (bastp?.bastp_work_details || []).reduce(
    (acc, bwd) => {
      // Cancelled work details never need review — don't count them as
      // "pending," which would misleadingly suggest they're blocking the
      // BASTP from progressing.
      if (bwd.work_details?.cancelled_at) {
        acc.cancelled += 1;
        return acc;
      }
      const status = getLatestReviewStatus(bwd.work_details?.work_verification);
      if (status === "APPROVED") acc.approved += 1;
      else if (status === "REJECTED") acc.rejected += 1;
      else acc.pending += 1;
      return acc;
    },
    { approved: 0, rejected: 0, pending: 0, cancelled: 0 },
  );

  // Materials-submission progress toward READY_FOR_INVOICE — cancelled work
  // details are exempt from needing materials, same reasoning as review.
  const materialsCounts = (bastp?.bastp_work_details || []).reduce(
    (acc, bwd) => {
      if (bwd.work_details?.cancelled_at) {
        acc.cancelled += 1;
        return acc;
      }
      if (bwd.materials_status === "SUBMITTED") acc.submitted += 1;
      else acc.draft += 1;
      return acc;
    },
    { submitted: 0, draft: 0, cancelled: 0 },
  );

  const handleFormPenawaranUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !bastp) return;

    if (file.type !== "application/pdf") {
      setFormPenawaranError("Only PDF files are allowed for Form Penawaran");
      event.target.value = "";
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setFormPenawaranError("File size must be less than 10MB");
      event.target.value = "";
      return;
    }

    try {
      setUploadingFormPenawaran(true);
      setFormPenawaranError(null);

      if (bastp.form_penawaran_storage_path) {
        await supabase.storage
          .from("bastp")
          .remove([bastp.form_penawaran_storage_path]);
      }

      const filePath = `form-penawaran/${bastp.id}_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("bastp")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("bastp")
        .update({
          form_penawaran_storage_path: filePath,
          form_penawaran_uploaded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", bastp.id);

      if (updateError) throw updateError;

      await fetchBastpDetails();
    } catch (err) {
      console.error("Error uploading Form Penawaran:", err);
      setFormPenawaranError(
        err instanceof Error ? err.message : "Failed to upload Form Penawaran",
      );
    } finally {
      setUploadingFormPenawaran(false);
      event.target.value = "";
    }
  };

  const handleViewFormPenawaran = async () => {
    if (!bastp?.form_penawaran_storage_path) return;

    try {
      setViewingFormPenawaran(true);
      setFormPenawaranError(null);

      const { data, error } = await supabase.storage
        .from("bastp")
        .createSignedUrl(bastp.form_penawaran_storage_path, 300);

      if (error) throw error;

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Error viewing Form Penawaran:", err);
      setFormPenawaranError("Failed to open Form Penawaran. Please try again.");
    } finally {
      setViewingFormPenawaran(false);
    }
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
            <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
            <p className="text-red-700 font-medium">
              {error || "BASTP not found"}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate("/bastp")}
          className="mt-4 flex items-center gap-2 text-blue-600 hover:text-blue-800"
        >
          <ArrowLeft className="w-4 h-4" /> Back to BASTP List
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
          {canEditBastp ? (
            <>
              <button
                onClick={() => navigate(`/bastp/edit/${bastp.id}`)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Edit className="w-4 h-4" /> Edit
              </button>
              <button
                onClick={() => navigate(`/bastp/${bastp.id}/materials`)}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <Package className="w-4 h-4" /> Material Control
              </button>
            </>
          ) : (
            isLocked &&
            !isBastpReadOnly && (
              <span className="flex items-center gap-2 text-sm text-gray-500 bg-gray-100 px-3 py-2 rounded-lg">
                <Lock className="w-4 h-4" /> Locked — already{" "}
                {bastp.status === "INVOICED" ? "invoiced" : "ready for invoice"}
              </span>
            )
          )}
          <button
            onClick={() => navigate("/bastp")}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
          >
            <ArrowLeft className="w-4 h-4" /> Back to List
          </button>
        </div>
      </div>

      {/* BASTP Information */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5" /> BASTP Information
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
            <p className="text-gray-900">
              {profilesMap[bastp.user_id]?.name || "Unknown"}
            </p>
            <p className="text-sm text-gray-600">
              {profilesMap[bastp.user_id]?.email}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              BASTP Date
            </label>
            <p className="text-gray-900">{formatDate(bastp.date)}</p>
          </div>
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
              {invoiceId && (
                <button
                  onClick={() => navigate(`/invoices/${invoiceId}`)}
                  className="mt-1 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                >
                  <Receipt className="w-3.5 h-3.5" /> View Invoice
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Form Penawaran */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5" /> Form Penawaran
          </h3>
          {bastp.form_penawaran_storage_path && (
            <button
              onClick={handleViewFormPenawaran}
              disabled={viewingFormPenawaran}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {viewingFormPenawaran ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              View Form Penawaran
            </button>
          )}
        </div>
        {bastp.form_penawaran_storage_path ? (
          <p className="text-sm text-gray-600">
            Uploaded on{" "}
            {formatDate(bastp.form_penawaran_uploaded_at || "")}
          </p>
        ) : (
          <p className="text-sm text-gray-600">
            Required (PDF) before this BASTP can become ready for invoice.
          </p>
        )}
        {canEditBastp && (
          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {bastp.form_penawaran_storage_path ? "Replace" : "Upload"} Form
              Penawaran (PDF)
            </label>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFormPenawaranUpload}
              disabled={uploadingFormPenawaran}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            {uploadingFormPenawaran && (
              <div className="flex items-center gap-2 text-blue-600 mt-2">
                <Loader className="w-4 h-4 animate-spin" />
                <span className="text-sm">Uploading...</span>
              </div>
            )}
          </div>
        )}
        {formPenawaranError && (
          <p className="mt-3 text-sm text-red-700 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> {formPenawaranError}
          </p>
        )}
      </div>

      {/* Work Orders Summary */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5" /> Work Orders Included (
            {uniqueWorkOrders.length})
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
                    <div className="flex items-center gap-2 text-sm text-gray-900">
                      <Calendar className="w-4 h-4" />
                      {formatDate(wo.shipyard_wo_date)}
                    </div>
                  </div>
                )}
                {wo.customer_wo_date && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Customer WO Date
                    </label>
                    <div className="flex items-center gap-2 text-sm text-gray-900">
                      <Calendar className="w-4 h-4" />
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
                    <div className="flex items-center gap-2 text-sm text-gray-900">
                      <MapPin className="w-4 h-4" />
                      {wo.work_location}
                    </div>
                  </div>
                )}
                {wo.kapro && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      KAPRO
                    </label>
                    <div className="flex items-center gap-2 text-sm text-gray-900">
                      <User className="w-4 h-4" />
                      {wo.kapro.kapro_name}
                    </div>
                  </div>
                )}
                {wo.user_id && profilesMap[wo.user_id] && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Created By
                    </label>
                    <div className="text-sm text-gray-900">
                      {profilesMap[wo.user_id].name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {profilesMap[wo.user_id].email}
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
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Wrench className="w-5 h-5" /> Work Details (
              {bastp.bastp_work_details?.length || 0})
            </h2>
            {bastp.status === "DRAFT" && reviewCounts.pending + reviewCounts.rejected > 0 && (
              <p className="text-sm text-gray-500 mt-1">
                {reviewCounts.approved} of{" "}
                {reviewCounts.approved + reviewCounts.pending + reviewCounts.rejected}{" "}
                approved
                {reviewCounts.rejected > 0 &&
                  ` • ${reviewCounts.rejected} sent back for rework`}
                {reviewCounts.cancelled > 0 &&
                  ` • ${reviewCounts.cancelled} cancelled`}
                {" — this is why the BASTP hasn't moved past Draft."}
              </p>
            )}
            {bastp.status === "VERIFIED" &&
              (materialsCounts.draft > 0 ||
                !bastp.form_penawaran_storage_path) && (
                <p className="text-sm text-gray-500 mt-1">
                  {materialsCounts.draft > 0 &&
                    `${materialsCounts.submitted} of ${
                      materialsCounts.submitted + materialsCounts.draft
                    } work details have submitted materials`}
                  {materialsCounts.cancelled > 0 &&
                    ` • ${materialsCounts.cancelled} cancelled`}
                  {materialsCounts.draft > 0 &&
                    !bastp.form_penawaran_storage_path &&
                    " • "}
                  {!bastp.form_penawaran_storage_path &&
                    "Form Penawaran not yet uploaded"}
                  {" — this is why the BASTP isn't ready for invoice yet."}
                </p>
              )}
          </div>
          <button
            onClick={() =>
              bastp.status === "VERIFIED"
                ? navigate(`/bastp/${bastp.id}/materials`)
                : navigate("/work-verification")
            }
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 whitespace-nowrap"
          >
            {bastp.status === "VERIFIED"
              ? "Manage Materials →"
              : "Review in Work Verification →"}
          </button>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Verification
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {bastp.bastp_work_details?.map((bwd, index) => {
                const materials = (
                  bwd.work_details?.material_control || []
                ).filter((m: any) => !m.deleted_at);
                const reviewStatus = getLatestReviewStatus(
                  bwd.work_details?.work_verification,
                );
                return (
                  <Fragment key={bwd.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900">
                          {bwd.work_details?.description}
                        </p>
                        {bwd.work_details?.work_scope && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {bwd.work_details.work_scope.work_scope}
                          </p>
                        )}
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
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />{" "}
                          {bwd.work_details?.location?.location || "-"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {bwd.work_details?.quantity} {bwd.work_details?.uom}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" /> {bwd.work_details?.pic}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                        <div>
                          Start:{" "}
                          {formatDate(
                            bwd.work_details?.planned_start_date || "",
                          )}
                        </div>
                        <div>
                          Target:{" "}
                          {formatDate(
                            bwd.work_details?.target_close_date || "",
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {bwd.work_details?.cancelled_at ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
                            <Ban className="w-3 h-3" /> Cancelled
                          </span>
                        ) : reviewStatus === "APPROVED" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            <CheckCircle2 className="w-3 h-3" /> Approved
                          </span>
                        ) : reviewStatus === "REJECTED" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            <Undo2 className="w-3 h-3" /> Needs Rework
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                            <Clock className="w-3 h-3" /> Pending Review
                          </span>
                        )}
                      </td>
                    </tr>
                    {/* Materials Row */}
                    {materials.length > 0 && (
                      <tr key={`${bwd.id}-materials`} className="bg-blue-50">
                        <td className="px-6 py-3" colSpan={8}>
                          <div className="flex items-start gap-2">
                            <Package className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="text-xs font-semibold text-blue-900 mb-2">
                                Materials Used ({materials.length})
                              </div>
                              <div className="bg-white rounded border border-blue-200 overflow-hidden">
                                <table className="min-w-full">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">
                                        Material
                                      </th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">
                                        Specification
                                      </th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">
                                        Length
                                      </th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">
                                        Width
                                      </th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">
                                        Thickness
                                      </th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">
                                        Density
                                      </th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">
                                        Amount
                                      </th>
                                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">
                                        Total
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {materials.map((material: any) => (
                                      <tr
                                        key={material.id}
                                        className="hover:bg-gray-50"
                                      >
                                        <td className="px-3 py-2 text-xs text-gray-900 font-medium">
                                          {material.material_list?.material ||
                                            "-"}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-gray-600">
                                          {material.material_list
                                            ?.specification || "-"}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-right text-gray-700">
                                          {material.length ?? "-"}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-right text-gray-700">
                                          {material.width ?? "-"}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-right text-gray-700">
                                          {material.thickness ?? "-"}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-right text-gray-700">
                                          {material.material_density?.name ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 mr-1">
                                              {material.material_density.name}
                                            </span>
                                          ) : null}
                                          {material.density ?? "-"}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-right font-semibold text-blue-700">
                                          {material.amount} {material.uom}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-right font-semibold text-blue-700">
                                          {material.total_amount != null
                                            ? Number(
                                                material.total_amount.toFixed(
                                                  4,
                                                ),
                                              ).toLocaleString()
                                            : "-"}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
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
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <Wrench className="w-5 h-5" /> General Services
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
                          (b.service_type?.display_order || 0),
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
                <p className="text-sm text-blue-800 flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0" />{" "}
                  <span>
                    <strong>Note:</strong> Total days includes both start and
                    close dates. Pricing information is managed by Finance
                    during invoice creation.
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}

    </div>
  );
}
