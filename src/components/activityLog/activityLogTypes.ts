// Shape returned by the admin_list_all_profiles RPC, narrowed to what the
// Activity Log tabs need. Includes deactivated profiles (deleted_at set) so
// a log row from someone since deactivated still resolves to a real name —
// callers filter out deactivated ones themselves where "registered
// employee" counts (e.g. User Aktif / User Tanpa Aksi) require it.
export interface TrackedProfile {
  id: number;
  name: string;
  role: string;
  deleted_at: string | null;
}
