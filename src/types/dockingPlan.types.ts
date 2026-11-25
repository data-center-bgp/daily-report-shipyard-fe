export type PlanStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "NEEDS_CLARIFICATION"
  | "APPROVED"
  | "CONVERTED";

export type ReviewerRole = "PPIC" | "HSSE";
export type ReviewDecision = "APPROVED" | "RETURNED";

export interface PlanVessel {
  id: number;
  name: string;
  type: string | null;
  company: string | null;
}

export interface PlanRow {
  id: number;
  created_at: string;
  plan_name: string;
  vessel_id: number;
  docking_type: string | null;
  target_docking_date: string;
  notes: string | null;
  status: PlanStatus;
  revision_no: number;
  submitted_at: string | null;
  approved_at: string | null;
  reopened_reason: string | null;
  reopened_at: string | null;
  converted_project_id: number | null;
  converted_at: string | null;
  user_id: number;
  vessel: PlanVessel | null;
  author: { name: string | null } | null;
  converted_project: { readiness_form: { status: string } | null } | null;
}

export interface PlanWorkDetail {
  id: number;
  plan_work_order_id: number;
  description: string;
  work_scope_id: number | null;
  location_id: number | null;
  quantity: number | null;
  uom: string | null;
  planned_start_date: string | null;
  target_close_date: string | null;
  notes: string | null;
  sort_order: number;
  work_scope: { work_scope: string } | null;
  location: { location: string } | null;
}

export interface PlanWorkOrder {
  id: number;
  plan_id: number;
  work_location: string | null;
  customer_wo_number: string | null;
  notes: string | null;
  sort_order: number;
  converted_work_order_id: number | null;
  work_details: PlanWorkDetail[];
}

export interface PlanReviewNote {
  id: number;
  plan_work_order_id: number | null;
  plan_work_detail_id: number | null;
  note: string;
}

export interface PlanReview {
  id: number;
  revision_no: number;
  reviewer_role: ReviewerRole;
  decision: ReviewDecision;
  general_note: string | null;
  reviewed_at: string;
  reviewer: { name: string | null } | null;
  notes: PlanReviewNote[];
}

export interface PlanBundle {
  plan: PlanRow;
  workOrders: PlanWorkOrder[];
  reviews: PlanReview[];
}
