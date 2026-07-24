import { supabase } from "../lib/supabase";

const ROMAN_MONTHS = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
];

/**
 * [####]/WO-PPIC/GAL-PL/[Roman month]/[YYYY]
 * #### is one past the highest sequence number already used for that year,
 * shared across regular and additional work orders. Year/month come from the
 * Shipyard WO Date the admin picked, not today's date, so a backdated WO
 * lands in the right year's sequence.
 */
export async function suggestWorkOrderNumber(
  shipyardWoDate: string,
): Promise<string> {
  const [yearStr, monthStr] = shipyardWoDate.split("-");
  const year = parseInt(yearStr, 10);
  const roman = ROMAN_MONTHS[parseInt(monthStr, 10) - 1];

  const { data, error } = await supabase
    .from("work_order")
    .select("shipyard_wo_number")
    .is("deleted_at", null)
    .like("shipyard_wo_number", `%/${year}`);

  if (error) throw error;

  const maxSeq = (data || []).reduce((max, row) => {
    const match = row.shipyard_wo_number?.match(/^(\d+)\//);
    const n = match ? parseInt(match[1], 10) : NaN;
    return !Number.isNaN(n) && n > max ? n : max;
  }, 0);

  return `${String(maxSeq + 1).padStart(4, "0")}/WO-PPIC/GAL-PL/${roman}/${year}`;
}
