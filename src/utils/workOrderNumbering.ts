import { suggestSequentialNumber } from "./documentNumbering";

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
  return suggestSequentialNumber(
    "work_order",
    "shipyard_wo_number",
    shipyardWoDate,
    "WO-PPIC/GAL-PL",
  );
}
