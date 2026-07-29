/**
 * Shared "is this work order fully completed" rule, used everywhere a work
 * order needs to be classified as in-progress vs. done: a work order is
 * fully completed once every one of its active (non-cancelled) work details
 * has reached 100% progress. One with no active work details at all isn't
 * considered complete — there's nothing to show as done.
 */
export interface WorkDetailCompletionFields {
  cancelled_at?: string | null;
  current_progress: number;
}

export function isWorkOrderFullyCompleted(
  workDetails: WorkDetailCompletionFields[],
): boolean {
  const active = workDetails.filter((d) => !d.cancelled_at);
  if (active.length === 0) return false;
  return active.every((d) => d.current_progress === 100);
}
