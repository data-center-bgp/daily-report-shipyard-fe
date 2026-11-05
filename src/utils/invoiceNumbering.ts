import { suggestSequentialNumber, ROMAN_MONTHS } from "./documentNumbering";

/**
 * [####]/GAL-SMD/[Roman month]/[YYYY]
 * Same convention as suggestWorkOrderNumber: #### is one past the highest
 * sequence number already used for that year, computed from the invoice's
 * Invoice Date.
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

/**
 * The invoice number an existing invoice should carry after its Invoice Date
 * changes, or null when the number should be left alone.
 *
 * A new month only swaps the Roman month and keeps the sequence number, so
 * 287/GAL-SMD/X/2026 moved to November becomes 287/GAL-SMD/XI/2026. A new year
 * can't keep it (the sequence restarts every year), so it gets the next free
 * number of that year, unless the invoice was saved in that year, in which case
 * its own sequence comes back (so dragging the date to another year and back
 * doesn't lose the original number). A number that isn't in the standard
 * format was typed by hand and is never touched.
 *
 * `savedNumber` is the number the invoice had when it was loaded.
 */
export async function renumberForInvoiceDate(
  currentNumber: string,
  invoiceDate: string,
  savedNumber?: string | null,
): Promise<string | null> {
  const current = parseInvoiceNumber(currentNumber);
  if (!current) return null;

  const [newYear, newMonth] = invoiceDate.split("-");
  const newRoman = ROMAN_MONTHS[parseInt(newMonth, 10) - 1];
  if (!/^\d{4}$/.test(newYear) || !newRoman) return null;

  if (newYear === current.year) {
    return newRoman === current.roman
      ? null
      : withMonth(current, newRoman);
  }

  const saved = savedNumber ? parseInvoiceNumber(savedNumber) : null;
  if (saved && saved.year === newYear) return withMonth(saved, newRoman);

  return suggestInvoiceNumber(invoiceDate);
}

interface ParsedInvoiceNumber {
  parts: string[];
  roman: string;
  year: string;
}

function parseInvoiceNumber(number: string): ParsedInvoiceNumber | null {
  const parts = number.trim().split("/");
  if (parts.length < 4) return null;

  const year = parts[parts.length - 1];
  const roman = parts[parts.length - 2];
  if (!/^\d+$/.test(parts[0]) || !/^\d{4}$/.test(year)) return null;
  if (!ROMAN_MONTHS.includes(roman)) return null;

  return { parts, roman, year };
}

function withMonth(number: ParsedInvoiceNumber, roman: string): string {
  return [...number.parts.slice(0, -2), roman, number.year].join("/");
}
