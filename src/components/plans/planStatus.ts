import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Pencil,
  Rocket,
  type LucideIcon,
} from "lucide-react";
import type { PlanStatus } from "../../types/dockingPlan.types";

// A plan's status as a word and an icon as well as a tint, so colour is never
// the only thing telling the states apart (same approach as readinessStatus).
export interface PlanStatusStyle {
  label: string;
  className: string;
  Icon: LucideIcon;
}

export const PLAN_STATUS: Record<PlanStatus, PlanStatusStyle> = {
  DRAFT: {
    label: "Draft",
    className: "bg-slate-100 text-slate-800",
    Icon: Pencil,
  },
  SUBMITTED: {
    label: "Awaiting review",
    className: "bg-amber-50 text-amber-900",
    Icon: Clock,
  },
  NEEDS_CLARIFICATION: {
    label: "Sent back",
    className: "bg-orange-50 text-orange-900",
    Icon: AlertTriangle,
  },
  APPROVED: {
    label: "Approved",
    className: "bg-emerald-50 text-emerald-800",
    Icon: CheckCircle2,
  },
  CONVERTED: {
    label: "Converted to project",
    className: "bg-blue-50 text-blue-900",
    Icon: Rocket,
  },
};

export const PLAN_STATUS_ORDER: PlanStatus[] = [
  "SUBMITTED",
  "NEEDS_CLARIFICATION",
  "DRAFT",
  "APPROVED",
  "CONVERTED",
];

export const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 disabled:hover:bg-blue-700 sm:min-h-10";
export const secondaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 sm:min-h-10";
export const dangerButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-700 bg-white px-4 text-sm font-medium text-red-800 transition-colors hover:bg-red-50 disabled:opacity-50 sm:min-h-10";
export const fieldClass =
  "min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-500 focus:border-blue-700 sm:min-h-10 sm:text-sm";
