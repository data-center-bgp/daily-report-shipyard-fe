import { supabase } from "../lib/supabase";

/**
 * Saves a work order's "No." document print number (the printed Perintah
 * Kerja / Kick Off Meeting form's own serial number, distinct from
 * shipyard_wo_number and customer_wo_number).
 *
 * The number is typed in by hand: the staff's own paper documents are
 * numbered separately and the automatic sequence didn't line up with them.
 * Pass null to clear it. Throws a readable Error when another work order of
 * the same year already uses that number.
 */
export async function saveWorkOrderPrintNumber(
  workOrderId: number,
  printNumber: number | null,
): Promise<void> {
  const { error } = await supabase
    .from("work_order")
    .update({ wo_print_number: printNumber })
    .eq("id", workOrderId);

  if (error) {
    if (error.code === "23505") {
      throw new Error(
        `No. ${printNumber} is already used by another work order this year — pick a different number.`,
      );
    }
    throw error;
  }
}
