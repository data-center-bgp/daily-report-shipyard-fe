export const WORK_TYPE_OPTIONS = [
  "Docking",
  "Docking - IS (Intermediate Survey)",
  "Docking - AS (Annual Survey)",
  "Docking - SS (Special Survey)",
  "Repair",
  "New Building",
];

// The three kinds of work the app tells apart on screen: every "Docking - ..."
// type is Docking, "New Building" is its own, and anything else (including a
// blank or legacy value) is Repair.
export type WorkTypeGroup = "Docking" | "New Building" | "Repair";

export const workTypeGroup = (workType: string): WorkTypeGroup =>
  workType.startsWith("Docking")
    ? "Docking"
    : workType === "New Building"
      ? "New Building"
      : "Repair";

// Every kind of work in a list of work types, in a fixed order. A BASTP has no
// type of its own: it takes the types of the work orders behind its work
// details, so one that spans two kinds of work shows both.
const WORK_TYPE_GROUP_ORDER: WorkTypeGroup[] = ["Docking", "Repair", "New Building"];

export const workTypeGroupsOf = (
  workTypes: (string | null | undefined)[],
): WorkTypeGroup[] => {
  const found = new Set(workTypes.map((t) => workTypeGroup(t ?? "")));
  return WORK_TYPE_GROUP_ORDER.filter((g) => found.has(g));
};

export const WORK_TYPE_GROUP_STYLE: Record<WorkTypeGroup, string> = {
  Docking: "bg-indigo-100 text-indigo-700",
  "New Building": "bg-amber-100 text-amber-800",
  Repair: "bg-teal-100 text-teal-700",
};
