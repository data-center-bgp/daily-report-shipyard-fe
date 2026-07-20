import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { ActivityLogService } from "../../services/activityLogService";
import { useAuth } from "../../hooks/useAuth";
import type {
  ReadinessChecklistItem,
  ReadinessApprovalRole,
  ReadinessFormStatus,
} from "../../types/readiness.types";
import {
  ArrowLeft,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  Loader,
  FileText,
} from "lucide-react";

interface ResponseState {
  is_compliant: boolean | null;
  explanation: string;
}

interface ApprovalState {
  signer_name: string;
  signed_date: string;
}

interface ProjectInfo {
  id: number;
  project_name: string;
  vessel: { id: number; name: string; type: string; company: string } | null;
}

function computeStatus(
  responses: Record<number, ResponseState>,
  approvals: Record<number, ApprovalState>,
  totalItems: number,
  totalRoles: number,
): ReadinessFormStatus {
  const answeredCount = Object.values(responses).filter(
    (r) => r.is_compliant !== null,
  ).length;
  const signedCount = Object.values(approvals).filter(
    (a) => a.signer_name.trim() && a.signed_date,
  ).length;

  if (signedCount === totalRoles && totalRoles > 0) return "APPROVED";
  if (answeredCount === totalItems && totalItems > 0) return "PENDING_APPROVAL";
  return "DRAFT";
}

export default function ReadinessForm() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { isReadOnly } = useAuth();

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [formId, setFormId] = useState<number | null>(null);
  const [checklistItems, setChecklistItems] = useState<ReadinessChecklistItem[]>(
    [],
  );
  const [approvalRoles, setApprovalRoles] = useState<ReadinessApprovalRole[]>([]);

  const [headerData, setHeaderData] = useState({
    docking_date: "",
    owner_name: "",
    last_cargo_info: "",
  });
  const [responses, setResponses] = useState<Record<number, ResponseState>>({});
  const [approvals, setApprovals] = useState<Record<number, ApprovalState>>({});
  const [gasTestDoc, setGasTestDoc] = useState<{
    url: string | null;
    storagePath: string | null;
  }>({ url: null, storagePath: null });
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedStatus, setSavedStatus] = useState<ReadinessFormStatus | null>(
    null,
  );

  const isEditMode = formId !== null;

  const loadData = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);

      const [{ data: projectData, error: projectError }, { data: items }, { data: roles }] =
        await Promise.all([
          supabase
            .from("projects")
            .select(
              "id, project_name, readiness_form_id, vessel:vessel_id ( id, name, type, company )",
            )
            .eq("id", projectId)
            .is("deleted_at", null)
            .single(),
          supabase
            .from("readiness_checklist_items")
            .select("*")
            .order("display_order", { ascending: true }),
          supabase
            .from("readiness_approval_roles")
            .select("*")
            .order("display_order", { ascending: true }),
        ]);

      if (projectError) throw projectError;
      setProject(projectData as any);
      setChecklistItems(items || []);
      setApprovalRoles(roles || []);

      const initialResponses: Record<number, ResponseState> = {};
      (items || []).forEach((item) => {
        initialResponses[item.id] = { is_compliant: null, explanation: "" };
      });

      const initialApprovals: Record<number, ApprovalState> = {};
      (roles || []).forEach((role) => {
        initialApprovals[role.id] = { signer_name: "", signed_date: "" };
      });

      const { data: existingForm, error: formError } = await supabase
        .from("vessel_readiness_forms")
        .select("*")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .maybeSingle();

      if (formError) throw formError;

      if (existingForm) {
        setFormId(existingForm.id);
        setHeaderData({
          docking_date: existingForm.docking_date || "",
          owner_name: existingForm.owner_name || "",
          last_cargo_info: existingForm.last_cargo_info || "",
        });
        setGasTestDoc({
          url: existingForm.gas_test_document_url,
          storagePath: existingForm.gas_test_storage_path,
        });
        setSavedStatus(existingForm.status);

        const { data: existingResponses } = await supabase
          .from("readiness_form_responses")
          .select("*")
          .eq("readiness_form_id", existingForm.id);

        (existingResponses || []).forEach((r) => {
          initialResponses[r.checklist_item_id] = {
            is_compliant: r.is_compliant,
            explanation: r.explanation || "",
          };
        });

        const { data: existingApprovals } = await supabase
          .from("readiness_form_approvals")
          .select("*")
          .eq("readiness_form_id", existingForm.id);

        (existingApprovals || []).forEach((a) => {
          initialApprovals[a.approval_role_id] = {
            signer_name: a.signer_name || "",
            signed_date: a.signed_date || "",
          };
        });
      } else {
        setFormId(null);
      }

      setResponses(initialResponses);
      setApprovals(initialApprovals);
    } catch (err) {
      console.error("Error loading readiness form:", err);
      setError(err instanceof Error ? err.message : "Failed to load readiness form");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const setResponse = (itemId: number, patch: Partial<ResponseState>) => {
    setResponses((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...patch },
    }));
  };

  const setApproval = (roleId: number, patch: Partial<ApprovalState>) => {
    setApprovals((prev) => ({
      ...prev,
      [roleId]: { ...prev[roleId], ...patch },
    }));
  };

  const handleDocumentUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !formId) return;

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("❌ File size must be less than 10MB");
      return;
    }

    const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      alert("❌ Only PDF, JPG, and PNG files are allowed");
      return;
    }

    try {
      setUploadingDoc(true);

      if (gasTestDoc.storagePath) {
        await supabase.storage.from("bastp").remove([gasTestDoc.storagePath]);
      }

      const fileExt = file.name.split(".").pop();
      const fileName = `${formId}_${Date.now()}.${fileExt}`;
      const filePath = `readiness-documents/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("bastp")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("bastp")
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("vessel_readiness_forms")
        .update({
          gas_test_document_url: publicUrlData.publicUrl,
          gas_test_storage_path: filePath,
          updated_at: new Date().toISOString(),
        })
        .eq("id", formId);
      if (updateError) throw updateError;

      setGasTestDoc({ url: publicUrlData.publicUrl, storagePath: filePath });
    } catch (err) {
      console.error("Error uploading gas test document:", err);
      alert(
        `❌ Failed to upload document: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;

    setSubmitting(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      if (!profile) throw new Error("User profile not found");

      const status = computeStatus(
        responses,
        approvals,
        checklistItems.length,
        approvalRoles.length,
      );

      if (isEditMode && formId) {
        const { data: oldForm } = await supabase
          .from("vessel_readiness_forms")
          .select("*")
          .eq("id", formId)
          .single();

        const { error: updateError } = await supabase
          .from("vessel_readiness_forms")
          .update({
            docking_date: headerData.docking_date || null,
            owner_name: headerData.owner_name.trim() || null,
            last_cargo_info: headerData.last_cargo_info.trim() || null,
            status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", formId);
        if (updateError) throw updateError;

        await supabase
          .from("readiness_form_responses")
          .delete()
          .eq("readiness_form_id", formId);
        await supabase
          .from("readiness_form_approvals")
          .delete()
          .eq("readiness_form_id", formId);

        await supabase.from("readiness_form_responses").insert(
          checklistItems.map((item) => ({
            readiness_form_id: formId,
            checklist_item_id: item.id,
            is_compliant: responses[item.id]?.is_compliant ?? null,
            explanation: responses[item.id]?.explanation.trim() || null,
          })),
        );

        await supabase.from("readiness_form_approvals").insert(
          approvalRoles.map((role) => ({
            readiness_form_id: formId,
            approval_role_id: role.id,
            signer_name: approvals[role.id]?.signer_name.trim() || null,
            signed_date: approvals[role.id]?.signed_date || null,
          })),
        );

        await ActivityLogService.logActivity({
          action: "update",
          tableName: "vessel_readiness_forms",
          recordId: formId,
          oldData: oldForm || undefined,
          newData: { ...headerData, status, id: formId },
          description: `Updated readiness form for project ${project.project_name} (status: ${status})`,
        });

        setSavedStatus(status);
      } else {
        const { data: newForm, error: insertError } = await supabase
          .from("vessel_readiness_forms")
          .insert({
            project_id: project.id,
            vessel_id: project.vessel?.id,
            docking_date: headerData.docking_date || null,
            owner_name: headerData.owner_name.trim() || null,
            last_cargo_info: headerData.last_cargo_info.trim() || null,
            status,
            user_id: profile.id,
          })
          .select()
          .single();
        if (insertError) throw insertError;

        await supabase.from("readiness_form_responses").insert(
          checklistItems.map((item) => ({
            readiness_form_id: newForm.id,
            checklist_item_id: item.id,
            is_compliant: responses[item.id]?.is_compliant ?? null,
            explanation: responses[item.id]?.explanation.trim() || null,
          })),
        );

        await supabase.from("readiness_form_approvals").insert(
          approvalRoles.map((role) => ({
            readiness_form_id: newForm.id,
            approval_role_id: role.id,
            signer_name: approvals[role.id]?.signer_name.trim() || null,
            signed_date: approvals[role.id]?.signed_date || null,
          })),
        );

        const { error: linkError } = await supabase
          .from("projects")
          .update({ readiness_form_id: newForm.id, updated_at: new Date().toISOString() })
          .eq("id", project.id);
        if (linkError) throw linkError;

        await ActivityLogService.logActivity({
          action: "create",
          tableName: "vessel_readiness_forms",
          recordId: newForm.id,
          newData: newForm,
          description: `Created readiness form for project ${project.project_name} (status: ${status})`,
        });

        setFormId(newForm.id);
        setSavedStatus(status);
      }
    } catch (err) {
      console.error("Error saving readiness form:", err);
      setError(err instanceof Error ? err.message : "Failed to save readiness form");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading readiness form...</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Project not found.</p>
        </div>
      </div>
    );
  }

  const vesselOwnerRoles = approvalRoles.filter((r) => r.party === "VESSEL_OWNER");
  const shipyardRoles = approvalRoles.filter((r) => r.party === "SHIPYARD");

  const sections = Array.from(new Set(checklistItems.map((i) => i.section))).map(
    (section) => ({
      section,
      label: checklistItems.find((i) => i.section === section)?.section_label || section,
      items: checklistItems.filter((i) => i.section === section),
    }),
  );

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <button
          onClick={() => navigate(`/projects/${project.id}`)}
          className="text-gray-600 hover:text-gray-900 flex items-center gap-2 mb-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Project
        </button>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardCheck className="w-7 h-7 text-blue-600" /> Vessel Readiness
          Form
        </h1>
        <p className="text-gray-600 mt-1">
          FM-OPS-04-11 — {project.project_name} • {project.vessel?.name}
        </p>
        {savedStatus && (
          <span
            className={`inline-flex items-center mt-2 px-2 py-1 rounded text-xs font-medium ${
              savedStatus === "APPROVED"
                ? "bg-green-100 text-green-700"
                : savedStatus === "PENDING_APPROVAL"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-700"
            }`}
          >
            Status: {savedStatus.replace("_", " ")}
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Vessel Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Docking / Berthing Date
              </label>
              <input
                type="date"
                value={headerData.docking_date}
                onChange={(e) =>
                  setHeaderData((prev) => ({ ...prev, docking_date: e.target.value }))
                }
                disabled={isReadOnly}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Owner
              </label>
              <input
                type="text"
                value={headerData.owner_name}
                onChange={(e) =>
                  setHeaderData((prev) => ({ ...prev, owner_name: e.target.value }))
                }
                disabled={isReadOnly}
                placeholder="Vessel owner / operating company"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Checklist sections */}
        {sections.map((section) => (
          <div key={section.section} className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {section.label}
            </h2>
            <div className="space-y-4">
              {section.items.map((item) => {
                const response = responses[item.id] || {
                  is_compliant: null,
                  explanation: "",
                };
                return (
                  <div
                    key={item.id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <p className="text-sm text-gray-900 mb-3">{item.item_text}</p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => setResponse(item.id, { is_compliant: true })}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                          response.is_compliant === true
                            ? "bg-green-600 text-white border-green-600"
                            : "border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        Ya
                      </button>
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => setResponse(item.id, { is_compliant: false })}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                          response.is_compliant === false
                            ? "bg-red-600 text-white border-red-600"
                            : "border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        Tidak
                      </button>
                    </div>
                    {response.is_compliant === false && (
                      <input
                        type="text"
                        value={response.explanation}
                        onChange={(e) =>
                          setResponse(item.id, { explanation: e.target.value })
                        }
                        disabled={isReadOnly}
                        placeholder="Bila tidak, jelaskan..."
                        className="mt-3 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Last cargo info + gas test document */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Additional Information
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Informasi terkait muatan terakhir kapal
            </label>
            <textarea
              value={headerData.last_cargo_info}
              onChange={(e) =>
                setHeaderData((prev) => ({ ...prev, last_cargo_info: e.target.value }))
              }
              disabled={isReadOnly}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {isEditMode && (
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Gas Tester Result (form FR-02-01)
              </label>
              {gasTestDoc.url ? (
                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg mb-3">
                  <p className="text-sm font-medium text-green-900">
                    Document uploaded
                  </p>
                  <a
                    href={gasTestDoc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    View Document
                  </a>
                </div>
              ) : (
                <p className="text-xs text-gray-500 mb-2">
                  Attach the Gas Tester result (PDF, JPG, or PNG)
                </p>
              )}
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleDocumentUpload}
                disabled={uploadingDoc || isReadOnly}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              {uploadingDoc && (
                <div className="flex items-center gap-2 text-blue-600 mt-2">
                  <Loader className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Uploading...</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Approvals */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Sign-off
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            All 9 sign-offs must be filled in before this form counts as
            approved.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-2">
                Telah Dipenuhi dan Disetujui oleh Pihak Kapal/Owner
              </h3>
              <div className="space-y-4">
                {vesselOwnerRoles.map((role) => (
                  <ApprovalRow
                    key={role.id}
                    role={role}
                    value={approvals[role.id] || { signer_name: "", signed_date: "" }}
                    onChange={(patch) => setApproval(role.id, patch)}
                    disabled={isReadOnly}
                  />
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-2">
                Telah Diterima dan Disetujui oleh Pihak Galangan
              </h3>
              <div className="space-y-4">
                {shipyardRoles.map((role) => (
                  <ApprovalRow
                    key={role.id}
                    role={role}
                    value={approvals[role.id] || { signer_name: "", signed_date: "" }}
                    onChange={(patch) => setApproval(role.id, patch)}
                    disabled={isReadOnly}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {!isReadOnly && (
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />{" "}
                  {isEditMode ? "Update Readiness Form" : "Save Readiness Form"}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/projects/${project.id}`)}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

function ApprovalRow({
  role,
  value,
  onChange,
  disabled,
}: {
  role: ReadinessApprovalRole;
  value: ApprovalState;
  onChange: (patch: Partial<ApprovalState>) => void;
  disabled: boolean;
}) {
  const filled = value.signer_name.trim() && value.signed_date;
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-900">{role.role_label}</p>
        {filled && <CheckCircle2 className="w-4 h-4 text-green-600" />}
      </div>
      <p className="text-xs text-gray-500 mb-2">{role.action_label}</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="Name"
          value={value.signer_name}
          onChange={(e) => onChange({ signer_name: e.target.value })}
          disabled={disabled}
          className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="date"
          value={value.signed_date}
          onChange={(e) => onChange({ signed_date: e.target.value })}
          disabled={disabled}
          max={new Date().toISOString().split("T")[0]}
          className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}
