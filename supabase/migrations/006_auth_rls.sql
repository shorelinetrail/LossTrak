-- Enable Row Level Security with authenticated-only access.
--
-- DEPLOYMENT ORDER MATTERS:
--   1. Create the shared login user in Supabase Dashboard → Authentication → Users
--      (email + password, "Auto Confirm User" enabled).
--   2. Deploy the app build that includes the /login page and auth proxy.
--   3. THEN run this migration. Until it runs, the anon key retains access,
--      so the live app keeps working during the rollout.
--
-- After this migration, unauthenticated (anon) clients can no longer read or
-- write any table; signed-in users have full access.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sites',
    'plants',
    'loss_categories',
    'loss_subcategories',
    'loss_detail_codes',
    'daily_logs',
    'loss_entries',
    'app_config'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS authenticated_full_access ON %I', t);
    EXECUTE format(
      'CREATE POLICY authenticated_full_access ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;
