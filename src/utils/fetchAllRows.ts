/**
 * Supabase/PostgREST silently caps every response at max_rows (1000), so a
 * plain `.select()` on a growing table just drops the oldest rows with no
 * error. This pages through a query until it runs dry.
 *
 * The query must have a stable, unique-ish order (e.g. finish with
 * `.order("id")`) or rows can be skipped/duplicated between pages.
 */
const BATCH_SIZE = 1000;

export async function fetchAllRows<T>(
  buildQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += BATCH_SIZE) {
    const { data, error } = await buildQuery(from, from + BATCH_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < BATCH_SIZE) break;
  }
  return rows;
}
