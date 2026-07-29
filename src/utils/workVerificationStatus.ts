/**
 * Shared logic for the verification approve/send-back workflow.
 *
 * work_verification is an append-only history table: every review (approve
 * or send back) is its own row. The "current state" of a work detail is
 * always derived from its LATEST (by created_at) non-deleted row — never
 * from "does any row exist," since a rejected item can later be approved.
 */

export type VerificationStatus = "APPROVED" | "REJECTED";

export interface VerificationRecord {
  id: number;
  work_details_id: number;
  status: VerificationStatus;
  created_at: string;
  verification_date: string;
  verification_notes?: string | null;
  deleted_at?: string | null;
  user_id?: number | null;
  is_auto_verified?: boolean;
  profiles?: { id: number; name: string; email: string } | null;
}

/**
 * A completed work detail that hasn't been manually reviewed within this
 * long gets auto-approved instead of waiting indefinitely for the
 * Operation Head. See 20260729130000_work_verification_auto_approval.sql.
 */
export const AUTO_VERIFY_DEADLINE_MS = 2 * 24 * 60 * 60 * 1000;

export const AUTO_VERIFY_NOTE =
  "Automatically approved — Operation Head did not review this within 2 days of it reaching 100% progress.";

/**
 * Whether a completed-but-unreviewed work detail has been sitting long
 * enough to qualify for auto-approval. Callers must already have confirmed
 * the item is actually pending (not approved, not open for rework).
 */
export function isPastAutoVerifyDeadline(
  latestProgressCreatedAt: string | null | undefined,
): boolean {
  if (!latestProgressCreatedAt) return false;
  return (
    Date.now() - new Date(latestProgressCreatedAt).getTime() >=
    AUTO_VERIFY_DEADLINE_MS
  );
}

/** Minimal shape the helpers below actually need — callers can select just these columns. */
export interface VerificationStatusFields {
  work_details_id: number;
  status: VerificationStatus;
  created_at: string;
  deleted_at?: string | null;
}

/** Latest non-deleted verification record per work_details_id. */
export function getLatestVerificationByWorkDetails<
  T extends VerificationStatusFields,
>(records: T[]): Map<number, T> {
  const latest = new Map<number, T>();
  for (const record of records) {
    if (record.deleted_at) continue;
    const current = latest.get(record.work_details_id);
    if (
      !current ||
      new Date(record.created_at).getTime() >
        new Date(current.created_at).getTime()
    ) {
      latest.set(record.work_details_id, record);
    }
  }
  return latest;
}

export function isApproved(
  record: VerificationStatusFields | undefined,
): boolean {
  return record?.status === "APPROVED";
}

/**
 * A work detail is open for rework when it was sent back and the shipyard
 * hasn't logged a new progress report since — i.e. the rejection is still
 * the most recent event. Once a newer progress report lands, the item goes
 * back into the normal "awaiting review" state automatically.
 *
 * Only needs status + created_at (not the full VerificationStatusFields) so
 * callers who already scoped their query to one work_details_id — and so
 * never selected that column — don't need to fake it.
 */
export function isOpenForRework(
  latestVerification:
    | { status: VerificationStatus; created_at: string }
    | undefined,
  latestProgressCreatedAt: string | null | undefined,
): boolean {
  if (!latestVerification || latestVerification.status !== "REJECTED") {
    return false;
  }
  if (!latestProgressCreatedAt) return true;
  return (
    new Date(latestVerification.created_at).getTime() >
    new Date(latestProgressCreatedAt).getTime()
  );
}

/** Whether this work detail has ever been sent back, regardless of current state. */
export function hasRejectionHistory<T extends VerificationStatusFields>(
  records: T[],
  workDetailsId: number,
): boolean {
  return records.some(
    (r) =>
      r.work_details_id === workDetailsId &&
      !r.deleted_at &&
      r.status === "REJECTED",
  );
}
