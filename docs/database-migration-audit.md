# LeadPilot database migration audit

Date: 2026-11-16

## Live target inspected

Supabase project: `crkwzloblmdvqzckwhdm`

At inspection time, the application schema contained only `public.file_objects`. The Supabase migration history contained:

- `20261116150431_private_user_file_storage`
- `20261116152201_file_objects_user_created_index`

There were zero Auth users in this project at the time of inspection. This means it is not yet a populated production database, but it does not make blind migration replay safe.

## Findings in the repository

### Legacy migration set

The files `001_leads.sql` through `010_agent_memory.sql` represent an account-scoped schema. They create or assume tables such as `businesses`, `leads`, `agent_schedules`, `revenue_events`, and `payment_transactions`, using `account_id` ownership in several places.

Two files share the same numeric migration prefix:

- `004_businesses.sql`
- `004_full_lead_pipeline.sql`

They are not a safe, uniquely versioned Supabase migration sequence.

### Company-based migration set

The newer migration `20261104210000_company_command_center_foundation.sql` creates a company-scoped schema, including `businesses` and `leads`, and uses company memberships and role checks for access control.

The later compatibility migration `20261104240000_existing_features_company_compatibility.sql` adds `account_id` to the company-based `businesses` and `leads` tables and recreates supporting tables used by older application features.

This indicates the newer company-based set is intended to establish the base schema before compatibility is applied. Running the legacy table-creation migrations first would collide with the company foundation, which creates some of the same tables without `IF NOT EXISTS`.

## Recommended migration strategy

1. Do not replay `001`–`010` ahead of the company foundation.
2. The candidate fresh-install chain is the timestamped company foundation and its later hardening/compatibility migrations, followed by the file-storage and file-index migrations. The exact ordered list is enforced in CI by applying these migrations to a disposable PostgreSQL database.
3. The legacy `001`–`010` files are not part of that candidate chain. The two `004` files share a version prefix, so a generic `supabase db push` across the current directory is not yet a safe migration mechanism.
4. Do not rename or delete legacy migrations until migration history from every previously deployed environment has been reconciled; changing filenames can make already-applied versions appear missing or new.
5. The CI fresh-install test verifies expected tables, RLS enablement, private bucket configuration, file index, auth profile trigger, and privileged RPC grants. It is a PostgreSQL contract test, not a full Supabase Auth/Storage service emulator.
6. Before production cutover, run the same chain on a disposable Supabase project/branch and validate the real Auth, Storage, API, and app flows. Do not apply the chain to the current project until its deployment target and migration history are explicitly confirmed.

## Changes made during this audit

- Added `file_objects_user_created_idx` on `(user_id, created_at desc)`, which supports the per-user newest-first listing query and also covers the `user_id` foreign-key lookup.
- Applied that additive index migration to the inspected Supabase project.
- No application tables were dropped or rewritten.
- No legacy migration was deleted or replayed.
- Added a disposable-Postgres fresh-install test for the complete timestamped company-based chain; it is being run in GitHub Actions.
- No production deployment or database cutover was performed.

## Deployment blocker

The post-merge Cloudflare workflow reached typecheck and tests successfully (82 tests passed), but stopped because these repository secrets are missing:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The Cloudflare Worker `leadpilot-ai` was inspected through the connected Cloudflare account and currently has no secret bindings. The application uses `SUPABASE_SERVICE_ROLE_KEY` in server-only revenue, outreach, and Paystack webhook paths. The deployment workflow now requires this GitHub secret and passes it to Wrangler using a short-lived, permission-restricted secrets file during deployment. It also validates `CLOUDFLARE_ACCOUNT_ID`. The public Supabase URL and publishable key remain required build inputs.

Cloudflare's documented `wrangler deploy --secrets-file` path is used to attach the runtime secret without committing it. See [Cloudflare Worker secrets documentation](https://developers.cloudflare.com/workers/configuration/secrets/). The deploy remains blocked until the required GitHub repository secrets exist.
