import { CheckCircle2, MinusCircle } from "lucide-react";
import { READINESS_STATUS } from "./readinessStatus";

// Who has checked a project, at a glance: PPIC (approved the docking plan the
// project came from) and HSSE (approves the project's readiness form). Each
// is a word and an icon as well as a tint. A project that did not come from a
// plan has no PPIC step, which the tag says instead of looking unchecked.

const HSSE_LABEL: Record<string, string> = {
  NONE: "No form yet",
  DRAFT: "Form in draft",
  SUBMITTED: "Awaiting review",
  NEEDS_CLARIFICATION: "Needs clarification",
  APPROVED: "Approved",
};

export interface PlanApproval {
  id: number;
  approved_at: string | null;
}

const tagBase = "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium";

export function ApprovalTags({
  plan,
  readinessStatus,
  className = "",
}: {
  plan: PlanApproval | null;
  readinessStatus: string | null | undefined;
  className?: string;
}) {
  const status = READINESS_STATUS[readinessStatus || "NONE"] ?? READINESS_STATUS.NONE;
  const hsseLabel = HSSE_LABEL[readinessStatus || "NONE"] ?? status.label;
  const approvedOn = plan?.approved_at
    ? new Date(plan.approved_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className={`flex flex-col items-start gap-1 ${className}`}>
      {plan ? (
        <span
          className={`${tagBase} bg-emerald-50 text-emerald-800`}
          title={approvedOn ? `Plan approved by PPIC on ${approvedOn}` : "Plan approved by PPIC"}
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          PPIC · Plan approved
        </span>
      ) : (
        <span
          className={`${tagBase} bg-slate-100 text-slate-700`}
          title="This project did not come from a docking plan, so PPIC has no plan to approve"
        >
          <MinusCircle className="h-3.5 w-3.5" aria-hidden="true" />
          PPIC · Not required
        </span>
      )}
      <span className={`${tagBase} ${status.className}`}>
        <status.Icon className="h-3.5 w-3.5" aria-hidden="true" />
        HSSE · {hsseLabel}
      </span>
    </div>
  );
}
