/**
 * Sanitizes a raw progress-percentage input as the user types, accepting a
 * comma as the decimal separator (matching the rest of the app's locale).
 * Returns the sanitized string to store, or null if the edit should be
 * rejected outright (a second comma, or a value outside 0-100).
 */
export function sanitizeProgressPercentageInput(
  rawValue: string,
): string | null {
  const formattedValue = rawValue.replace(/\./g, ",");
  const numericValue = formattedValue.replace(/[^0-9,]/g, "");

  const commaCount = (numericValue.match(/,/g) || []).length;
  if (commaCount > 1) return null;

  const parsedValue =
    numericValue === "" ? 0 : parseFloat(numericValue.replace(",", "."));

  if (
    numericValue === "" ||
    (!isNaN(parsedValue) && parsedValue >= 0 && parsedValue <= 100)
  ) {
    return numericValue;
  }

  return null;
}

/** Converts a comma-or-dot decimal progress percentage string to a number. */
export function parseProgressPercentage(value: string): number {
  if (!value) return 0;
  return parseFloat(value.replace(",", ".")) || 0;
}

/** Whether a progress-percentage form field currently holds a submittable value. */
export function isValidProgressPercentage(value: string): boolean {
  if (value === "") return false;
  const num = parseProgressPercentage(value);
  return !isNaN(num) && num >= 0 && num <= 100;
}

/** Formats a number as a progress-percentage display string (comma decimal). */
export function formatProgressPercentage(value: number): string {
  return value.toString().replace(".", ",");
}

/**
 * The current progress record out of a work detail's history: latest by
 * report_date, using created_at as a tiebreaker when multiple reports share
 * the same date (report_date is user-entered and often defaults to "today"
 * for every report logged that day, so ties are common).
 */
export function getLatestProgressRecord<
  T extends { report_date: string; created_at: string },
>(records: T[]): T | undefined {
  return [...records].sort((a, b) => {
    const dateDiff =
      new Date(b.report_date).getTime() - new Date(a.report_date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0];
}
