import { supabase } from "../lib/supabase";

/**
 * Lazily assigns a work order's "No." document print number (the printed
 * Perintah Kerja form's own serial number, distinct from shipyard_wo_number
 * and customer_wo_number) the first time its document is printed.
 *
 * Resets per calendar year of shipyard_wo_date, same query-max-then-increment
 * approach as suggestWorkOrderNumber() in workOrderNumbering.ts. Idempotent:
 * if the work order already has a wo_print_number, it's returned unchanged.
 */
export async function ensureWorkOrderPrintNumber(
  workOrderId: number,
  shipyardWoDate: string,
  existingPrintNumber: number | null | undefined,
): Promise<number> {
  if (existingPrintNumber != null) return existingPrintNumber;

  const year = shipyardWoDate.split("-")[0];

  const { data, error } = await supabase
    .from("work_order")
    .select("wo_print_number, shipyard_wo_date")
    .is("deleted_at", null)
    .not("wo_print_number", "is", null)
    .gte("shipyard_wo_date", `${year}-01-01`)
    .lte("shipyard_wo_date", `${year}-12-31`);

  if (error) throw error;

  const maxNumber = (data || []).reduce(
    (max, row) => (row.wo_print_number! > max ? row.wo_print_number! : max),
    0,
  );
  const nextNumber = maxNumber + 1;

  const { error: updateError } = await supabase
    .from("work_order")
    .update({ wo_print_number: nextNumber })
    .eq("id", workOrderId);

  if (updateError) throw updateError;

  return nextNumber;
}
