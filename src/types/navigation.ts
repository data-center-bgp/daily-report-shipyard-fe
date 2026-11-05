/**
 * Where a details page should send the user back to. The page that opens it
 * passes this as router `state.from` (a list with its tab/filters in `state`,
 * or another details page with its own `from` nested inside), and the
 * details page's Back button and its child pages hand it on, so "Back" ends
 * where the user started instead of on a fresh list.
 */
export interface ReturnTarget {
  path: string;
  state?: unknown;
}

/** Reads `state.from` off a router location's state, if there is one. */
export const returnTargetFrom = (state: unknown): ReturnTarget | undefined =>
  (state as { from?: ReturnTarget } | null)?.from;
