import { suggestSequentialNumber } from "./documentNumbering";

/**
 * [####]/HR-PPIC/[Roman month]/[YYYY]
 * Same convention as suggestWorkOrderNumber: #### is one past the highest
 * sequence number already used for that year, computed from the BASTP Date.
 */
export async function suggestBastpNumber(bastpDate: string): Promise<string> {
  return suggestSequentialNumber("bastp", "number", bastpDate, "HR-PPIC");
}
