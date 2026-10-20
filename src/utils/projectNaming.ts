import { supabase } from "../lib/supabase";

/**
 * [PERUSAHAAN]-[NAMA KAPAL]-[JENIS DOCKING]-[YYYY]-[##]
 * ## is the vessel's Nth project created in the current calendar year.
 */
export async function suggestProjectName(
  vesselId: number,
  vesselName: string,
  vesselCompany: string,
  dockingType: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("vessel_id", vesselId)
    .is("deleted_at", null)
    .gte("created_at", `${year}-01-01`)
    .lt("created_at", `${year + 1}-01-01`);

  const seq = (count ?? 0) + 1;
  return `${vesselCompany.trim()}-${vesselName.trim()}-${dockingType.trim()}-${year}-${String(seq).padStart(2, "0")}`;
}

const YEAR_SEQ_SUFFIX = /-(\d{4})-(\d{2,})$/;

/**
 * The "-YYYY-##" tail a renamed project keeps. A rename changes the company,
 * vessel and jenis docking parts of the name, never which project it is, so
 * the project's own year and sequence number carry over. Names that don't
 * follow the convention (older or hand-typed ones) fall back to the year the
 * project was created and its position among that vessel's projects that year.
 */
export async function getProjectNameSuffix(project: {
  project_name: string;
  vessel_id: number;
  created_at: string;
}): Promise<string> {
  const existing = project.project_name.match(YEAR_SEQ_SUFFIX);
  if (existing) return `-${existing[1]}-${existing[2]}`;

  const year = new Date(project.created_at).getFullYear();
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("vessel_id", project.vessel_id)
    .is("deleted_at", null)
    .gte("created_at", `${year}-01-01`)
    .lte("created_at", project.created_at);

  return `-${year}-${String(Math.max(count ?? 1, 1)).padStart(2, "0")}`;
}

/**
 * The tail for a project moving to a different vessel: that vessel's next
 * free sequence number in the project's year (the sequence is per vessel, so
 * carrying the old number over could collide with the new vessel's own).
 */
export async function getNextSuffixForVessel(
  vesselId: number,
  year: number,
  excludeProjectId: number,
): Promise<string> {
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("vessel_id", vesselId)
    .neq("id", excludeProjectId)
    .is("deleted_at", null)
    .gte("created_at", `${year}-01-01`)
    .lt("created_at", `${year + 1}-01-01`);

  return `-${year}-${String((count ?? 0) + 1).padStart(2, "0")}`;
}

/** [PERUSAHAAN]-[NAMA KAPAL]-[JENIS DOCKING] + the project's kept year/sequence tail. */
export function buildRenamedProjectName(
  vessel: { name: string; company: string | null },
  dockingType: string,
  suffix: string,
): string {
  // Some vessels have no company on record — leave that part out rather than
  // printing "null-".
  const company = vessel.company?.trim();
  return `${company ? `${company}-` : ""}${vessel.name.trim()}-${dockingType.trim()}${suffix}`;
}
