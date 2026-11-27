import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { workTypeGroup } from "../constants/workTypes";

// The shipyard runs two kinds of work side by side: Docking and Repair, and
// New Building. Work Orders, Work Details and Work Progress each exist twice,
// one list per section, over the same tables: a work order belongs to New
// Building when its work type is "New Building" (src/constants/workTypes.ts).
//
//   Docking and Repair   /work-orders   /work-details   /work-progress
//   New Building         /new-building/work-orders   .../work-details   .../work-progress
//
// The pages that open from a list (a vessel's work orders, add or edit a work
// order, work detail or progress report) are shared by both sections. They
// remember which section the user came from so that Back, Save and the menu
// highlight return to the right list.

export type WorkSection = "standard" | "newBuilding";

export const NEW_BUILDING_BASE = "/new-building";

// The same split for a database filter. New Building is an exact match;
// Docking and Repair is everything else, including a work order with no type.
export const NEW_BUILDING_WORK_TYPE = "New Building";
export const STANDARD_WORK_TYPE_FILTER = `work_type.is.null,work_type.neq."${NEW_BUILDING_WORK_TYPE}"`;
export const STANDARD_DOCKING_TYPE_FILTER = `docking_type.is.null,docking_type.neq."${NEW_BUILDING_WORK_TYPE}"`;

const STORAGE_KEY = "workSection";

// The three list pages that exist once per section.
const LIST_PATHS = ["/work-orders", "/work-details", "/work-progress"];

// Pages opened from those lists, shared by both sections.
const SHARED_PREFIXES = [
  "/vessel/",
  "/add-work-order",
  "/edit-work-order/",
  "/work-order/",
  "/work-details/",
  "/add-work-details",
  "/edit-work-details/",
  "/add-work-progress",
  "/work-progress/",
];

const isNewBuildingPath = (pathname: string) =>
  pathname === NEW_BUILDING_BASE || pathname.startsWith(`${NEW_BUILDING_BASE}/`);

const isSharedPath = (pathname: string) =>
  SHARED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

const readStored = (): WorkSection => {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "newBuilding"
      ? "newBuilding"
      : "standard";
  } catch {
    return "standard";
  }
};

const resolveSection = (pathname: string): WorkSection => {
  if (isNewBuildingPath(pathname)) return "newBuilding";
  if (LIST_PATHS.includes(pathname)) return "standard";
  // A page opened from a list keeps the section of the list it came from.
  if (isSharedPath(pathname)) return readStored();
  return "standard";
};

// Which section the current page belongs to, plus helpers for pages that link
// back to a list.
export function useWorkSection() {
  const { pathname } = useLocation();
  const section = resolveSection(pathname);

  // Remember the section on every page that decides it, so the shared pages
  // opened next can read it. Shared pages leave it as it is.
  useEffect(() => {
    if (isSharedPath(pathname)) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, section);
    } catch {
      // Storage can be blocked; the section then falls back to Docking and Repair.
    }
  }, [pathname, section]);

  const isNewBuilding = section === "newBuilding";

  // "/work-orders" in the current section: the list a shared page returns to.
  const listPath = (path: "/work-orders" | "/work-details" | "/work-progress") =>
    isNewBuilding ? `${NEW_BUILDING_BASE}${path}` : path;

  return { section, isNewBuilding, listPath };
}

// Whether a work order of this type is listed in the section.
export const workTypeInSection = (
  workType: string | null | undefined,
  section: WorkSection,
) =>
  (workTypeGroup(workType ?? "") === "New Building") ===
  (section === "newBuilding");
