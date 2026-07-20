export type ReadinessFormStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED";

export interface ReadinessChecklistItem {
  id: number;
  section: string;
  section_label: string;
  item_text: string;
  display_order: number;
}

export interface ReadinessFormResponse {
  id: number;
  readiness_form_id: number;
  checklist_item_id: number;
  is_compliant: boolean | null;
  explanation: string | null;
}

export interface ReadinessApprovalRole {
  id: number;
  party: "VESSEL_OWNER" | "SHIPYARD";
  role_code: string;
  role_label: string;
  action_label: string;
  display_order: number;
}

export interface ReadinessFormApproval {
  id: number;
  readiness_form_id: number;
  approval_role_id: number;
  signer_name: string | null;
  signed_date: string | null;
}

export interface VesselReadinessForm {
  id: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  project_id: number;
  vessel_id: number;
  docking_date: string | null;
  owner_name: string | null;
  last_cargo_info: string | null;
  gas_test_document_url: string | null;
  gas_test_storage_path: string | null;
  status: ReadinessFormStatus;
  user_id: number;
}
