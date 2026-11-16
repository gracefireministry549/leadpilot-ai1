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
2. Treat the company foundation and its subsequent hardening/compatibility migrations as the candidate fresh-install path.
3. Verify every dependency in the application code and every later migration before declaring that path canonical.
4. Resolve the duplicate legacy `004` prefix without erasing the migration history needed by any existing environments.
5. Keep the file-storage migration last in the fresh-install sequence.
6. Apply the reconciled sequence first to a disposable Supabase project, then validate tables, foreign keys, grants, RLS policies, triggers, and application integration before production cutover.

## Changes made during this audit

- Added `file_objects_user_created_idx` on `(user_id, created_at desc)`, which supports the per-user newest-first listing query and also covers the `user_id` foreign-key lookup.
- Applied that additive index migration to the inspected Supabase project.
- No application tables were dropped or rewritten.
- No legacy migration was deleted or replayed.
- No production deployment or database cutover was performed.

## Deployment blocker

The post-merge Cloudflare workflow reached typecheck and tests successfully (82 tests passed), but stopped because these repository secrets are missing:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The Cloudflare deploy step was skipped. A successful pull-request dry-run is not evidence of a production deployment.
