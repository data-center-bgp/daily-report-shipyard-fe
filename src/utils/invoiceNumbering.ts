import { suggestSequentialNumber } from "./documentNumbering";

/**
 * [####]/GAL-SMD/[Roman month]/[YYYY]
 * Same convention as suggestWorkOrderNumber: #### is one past the highest
 * sequence number already used for that year, computed from the invoice's
 * BASTP Collection Date (falls back to today if that isn't set yet).
 */
export async function suggestInvoiceNumber(
  invoiceDate: string,
): Promise<string> {
  return suggestSequentialNumber(
    "invoice_details",
    "invoice_number",
    invoiceDate,
    "GAL-SMD",
  );
}
