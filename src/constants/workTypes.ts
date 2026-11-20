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

export const WORK_TYPE_GROUP_STYLE: Record<WorkTypeGroup, string> = {
  Docking: "bg-indigo-100 text-indigo-700",
  "New Building": "bg-amber-100 text-amber-800",
  Repair: "bg-teal-100 text-teal-700",
};
