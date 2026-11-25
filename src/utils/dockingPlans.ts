import { supabase } from "../lib/supabase";
import { ActivityLogService } from "../services/activityLogService";
import type {
  PlanBundle,
  PlanReview,
  PlanRow,
  PlanWorkOrder,
  ReviewDecision,
  ReviewerRole,
} from "../types/dockingPlan.types";

const PLAN_SELECT = `
  id, created_at, plan_name, vessel_id, docking_type, target_docking_date, notes,
  status, revision_no, submitted_at, approved_at, reopened_reason, reopened_at,
  converted_project_id, converted_at, user_id,
  vessel:vessel_id ( id, name, type, company ),
  author:user_id ( name ),
  converted_project:converted_project_id ( readiness_form:readiness_form_id ( status ) )
`;

const bySort = <T extends { sort_order: number; id: number }>(a: T, b: T) =>
  a.sort_order - b.sort_order || a.id - b.id;

// One plan with its work orders, their work details and the review history.
export async function loadPlan(planId: number): Promise<PlanBundle> {
  const [planRes, woRes, reviewRes] = await Promise.all([
    supabase
      .from("docking_plans")
      .select(PLAN_SELECT)
      .eq("id", planId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("docking_plan_work_orders")
      .select(
        `
        id, plan_id, work_location, customer_wo_number, notes, sort_order,
        converted_work_order_id,
        work_details:docking_plan_work_details (
          id, plan_work_order_id, description, work_scope_id, location_id,
          quantity, uom, planned_start_date, target_close_date, notes, sort_order,
          work_scope:work_scope_id ( work_scope ),
          location:location_id ( location )
        )
      `,
      )
      .eq("plan_id", planId)
      .is("deleted_at", null)
      .is("docking_plan_work_details.deleted_at", null),
    supabase
      .from("docking_plan_reviews")
      .select(
        `
        id, revision_no, reviewer_role, decision, general_note, reviewed_at,
        reviewer:reviewed_by ( name ),
        notes:docking_plan_review_notes (
          id, plan_work_order_id, plan_work_detail_id, note
        )
      `,
      )
      .eq("plan_id", planId)
      .is("deleted_at", null)
      .order("reviewed_at", { ascending: false }),
  ]);

  if (planRes.error) throw planRes.error;
  if (woRes.error) throw woRes.error;
  if (reviewRes.error) throw reviewRes.error;
  if (!planRes.data) throw new Error("This plan was not found.");

  const workOrders = ((woRes.data as unknown as PlanWorkOrder[]) || [])
    .map((wo) => ({ ...wo, work_details: [...wo.work_details].sort(bySort) }))
    .sort(bySort);

  return {
    plan: planRes.data as unknown as PlanRow,
    workOrders,
    reviews: (reviewRes.data as unknown as PlanReview[]) || [],
  };
}

// The workflow functions refuse anything the signed-in role or the plan's
// current state does not allow, and say why; the message is shown as is.
async function callPlanRpc(
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

export async function submitPlan(plan: PlanRow): Promise<void> {
  await callPlanRpc("submit_docking_plan", { p_plan_id: plan.id });
  await ActivityLogService.logActivity({
    action: "update",
    tableName: "docking_plans",
    recordId: plan.id,
    oldData: { status: plan.status },
    newData: { status: "SUBMITTED", revision_no: plan.revision_no + 1 },
    description: `Submitted plan ${plan.plan_name} for review`,
  });
}

export async function reviewPlan(
  plan: PlanRow,
  params: {
    reviewerRole: ReviewerRole;
    decision: ReviewDecision;
    generalNote: string;
    lineNotes: { work_order_id?: number; work_detail_id?: number; note: string }[];
  },
): Promise<void> {
  await callPlanRpc("review_docking_plan", {
    p_plan_id: plan.id,
    p_reviewer_role: params.reviewerRole,
    p_decision: params.decision,
    p_general_note: params.generalNote.trim() || null,
    p_line_notes: params.lineNotes,
  });
  await ActivityLogService.logActivity({
    action: "update",
    tableName: "docking_plans",
    recordId: plan.id,
    oldData: { status: plan.status },
    newData: { reviewer_role: params.reviewerRole, decision: params.decision },
    description: `${params.reviewerRole} ${
      params.decision === "APPROVED" ? "approved" : "sent back"
    } plan ${plan.plan_name}`,
  });
}

export async function reopenPlan(plan: PlanRow, reason: string): Promise<void> {
  await callPlanRpc("reopen_docking_plan", {
    p_plan_id: plan.id,
    p_reason: reason,
  });
  await ActivityLogService.logActivity({
    action: "update",
    tableName: "docking_plans",
    recordId: plan.id,
    oldData: { status: plan.status },
    newData: { status: "DRAFT", reason },
    description: `Reopened approved plan ${plan.plan_name}: ${reason}`,
  });
}

export interface ConvertWorkOrderInput {
  plan_work_order_id: number;
  shipyard_wo_number: string;
  shipyard_wo_date: string;
  customer_wo_date: string | null;
  kapro_id: number | null;
}

// Returns the id of the new project.
export async function convertPlan(
  plan: PlanRow,
  projectName: string,
  workOrders: ConvertWorkOrderInput[],
): Promise<number> {
  const projectId = (await callPlanRpc("convert_docking_plan", {
    p_plan_id: plan.id,
    p_project_name: projectName,
    p_work_orders: workOrders,
  })) as number;
  await ActivityLogService.logActivity({
    action: "update",
    tableName: "docking_plans",
    recordId: plan.id,
    oldData: { status: plan.status },
    newData: { status: "CONVERTED", converted_project_id: projectId },
    description: `Converted plan ${plan.plan_name} into project ${projectName}`,
  });
  return projectId;
}

// ── Dates ───────────────────────────────────────────────────────────────────

// Plan dates are plain dates (YYYY-MM-DD): read them as local days so the
// day never shifts with the time zone.
const toLocalDate = (value: string) => new Date(`${value}T00:00:00`);

export function formatPlanDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  return toLocalDate(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// "in 9 weeks", "in 3 days", "today", "2 weeks ago".
export function describeLead(value: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round(
    (toLocalDate(value).getTime() - today.getTime()) / 86_400_000,
  );
  if (days === 0) return "today";
  const abs = Math.abs(days);
  const text =
    abs >= 14 ? `${Math.round(abs / 7)} weeks` : `${abs} day${abs === 1 ? "" : "s"}`;
  return days > 0 ? `in ${text}` : `${text} ago`;
}

// What the author still has to fix before the plan can be submitted.
export function planGaps(workOrders: PlanWorkOrder[]): string[] {
  const gaps: string[] = [];
  if (workOrders.length === 0) {
    gaps.push("Add at least one work order.");
    return gaps;
  }
  workOrders.forEach((wo, i) => {
    if (wo.work_details.length === 0) {
      gaps.push(`Work order ${i + 1} has no work details yet.`);
    }
  });
  return gaps;
}
