-- Signature/stamp images for printed documents live in the private
-- shipyard_signatures bucket (created and filled from the Supabase
-- dashboard, one file per person named "<Full Name>.png").
--
-- This Supabase project is shared with the company's other apps, so
-- "authenticated" alone would let their users read these too. Reads are
-- limited to active Daily Report Shipyard users: admin_caller_role() only
-- returns a role for a non-deleted profile in this app's schema.
--
-- No insert/update/delete policies on purpose — signatures can only be
-- changed from the dashboard, never through the app.

create policy "Shipyard app users can view signatures"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'shipyard_signatures'
    and daily_report_shipyard.admin_caller_role() is not null
  );
