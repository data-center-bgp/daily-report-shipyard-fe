import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  Pencil,
  type LucideIcon,
} from "lucide-react";

// Readiness of a project, as a word and an icon as well as a tint, so the
// colour is never the only thing telling statuses apart. Shared by the
// projects list and the project details page.
export interface ReadinessStatus {
  label: string;
  className: string;
  Icon: LucideIcon;
}

export const READINESS_STATUS: Record<string, ReadinessStatus> = {
  NONE: {
    label: "No form yet",
    className: "bg-slate-100 text-slate-700",
    Icon: CircleDashed,
  },
  DRAFT: {
    label: "Draft",
    className: "bg-slate-100 text-slate-800",
    Icon: Pencil,
  },
  SUBMITTED: {
    label: "Awaiting HSSE review",
    className: "bg-amber-50 text-amber-900",
    Icon: Clock,
  },
  NEEDS_CLARIFICATION: {
    label: "Needs clarification",
    className: "bg-orange-50 text-orange-900",
    Icon: AlertTriangle,
  },
  APPROVED: {
    label: "Approved",
    className: "bg-emerald-50 text-emerald-800",
    Icon: CheckCircle2,
  },
};
