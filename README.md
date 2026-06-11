# LossTrak

Daily production loss accounting for chemical plants. Operations Engineers
record why production fell short of the Best Achievable Rate (BAR) each day;
Performance Engineers analyse the accumulated losses (Pareto, trends, period
comparison) on the Analysis page.

## Stack

- Next.js (App Router) + React, deployed on Vercel
- Supabase (Postgres + Auth) — the browser talks to Supabase directly;
  there are no API routes
- Tailwind CSS v4 + shadcn/ui, Recharts for charts
- Excel import/export via `xlsx`, chart PNG export via `html-to-image`

## Setup

1. Create a Supabase project and run the migrations in
   `supabase/migrations/` **in numeric order** in the SQL editor
   (see deployment notes below for 006).
2. Create the shared login user: Supabase Dashboard → Authentication →
   Users → Add user (email + password, enable "Auto Confirm User").
3. Copy `.env.local.example` to `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. `npm install && npm run dev`

## Deployment notes (auth rollout)

Migration `006_auth_rls.sql` enables Row Level Security: anonymous clients
lose all access and only signed-in users can read/write. To roll out with
zero downtime on a live instance:

1. Create the shared login user (step 2 above).
2. Deploy the app build that includes `/login` and the auth proxy.
3. Then run migration 006. (Until it runs, the app keeps working
   without sign-in.)

Migration `007_entry_duration_audit.sql` (loss-entry `duration_hours` +
`updated_at`) must be applied **before** deploying any build that includes
duration capture on the daily entry page.

## Structure

- `/daily` — daily loss accounting (log table, per-day entry, bulk entry)
- `/reports/analysis` — interactive analysis: Pareto with drill-down,
  trend with previous-period comparison, filters, CSV/Excel/PNG export
- `/reports/{monthly,quarterly,yearly,table}` — fixed-period reports with
  Excel export
- `/admin` — sites & plants, loss-cause taxonomy, uploads, plant settings
- `src/lib/store.ts` — all Supabase data access
- `src/lib/reports/` — shared report aggregation, data hook, Excel export
