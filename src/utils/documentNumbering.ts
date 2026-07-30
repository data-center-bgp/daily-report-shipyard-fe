import { supabase } from "../lib/supabase";

export const ROMAN_MONTHS = [
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
 * Shared engine behind every auto-generated document number in this app
 * (Work Order, BASTP, Invoice) — all follow the same
 * "NNNN/<suffix>/<roman month>/<year>" shape. NNNN is one past the highest
 * sequence number already used for that calendar year (derived from
 * `date`), scoped to soft-deleted-aware rows in `table`.
 */
export async function suggestSequentialNumber(
  table: string,
  column: string,
  date: string,
  suffix: string,
): Promise<string> {
  const [yearStr, monthStr] = date.split("-");
  const year = parseInt(yearStr, 10);
  const roman = ROMAN_MONTHS[parseInt(monthStr, 10) - 1];

  const { data, error } = await supabase
    .from(table)
    .select(column)
    .is("deleted_at", null)
    .like(column, `%/${year}`);

  if (error) throw error;

  // `column` is a runtime string, so supabase-js can't infer the row shape
  // here — this helper is only ever called with a real text column.
  const rows = (data || []) as unknown as Record<string, unknown>[];

  const maxSeq = rows.reduce((max: number, row: Record<string, unknown>) => {
    const value = row[column];
    const match = typeof value === "string" ? value.match(/^(\d+)\//) : null;
    const n = match ? parseInt(match[1], 10) : NaN;
    return !Number.isNaN(n) && n > max ? n : max;
  }, 0);

  return `${String(maxSeq + 1).padStart(4, "0")}/${suffix}/${roman}/${year}`;
}
