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
  return `${vesselCompany}-${vesselName}-${dockingType}-${year}-${String(seq).padStart(2, "0")}`;
}
