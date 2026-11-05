# LeadPilot AI Company Dashboard — Detailed Design Specification

**Status:** Design finalized; implementation not yet authorized by this document  
**Date:** 2026-11-04  
**Repository:** `victoryude482-rgb/leadpilot-ai1`  
**Branch:** `docs/ai-company-dashboard-design`  
**Product direction:** Extend the existing LeadPilot AI application; preserve existing capabilities.

## 1. Purpose and product vision

LeadPilot AI is to become a mobile-first AI business command centre that lets its owner research opportunities, coordinate AI employees, manage leads and customers, review proposed actions, and understand business performance from an Android phone.

The dashboard is an extension of the existing LeadPilot product, not a replacement. Existing lead discovery, lead scoring, research agents, WorkPilot, website and brand generation, outreach drafting, CRM workflows, Google Business Profile research, and optional Python agents must be preserved.

The product must remain free-tier compatible wherever practical. No paid provider, paid hosting plan, or external communication service may become mandatory for the dashboard foundation. The owner must approve external customer contact and spending.

### Product principles

1. Human ownership: AI proposes and prepares; the owner controls consequential actions.
2. Evidence before claims: distinguish verified facts, indexed public evidence, AI inference, and recommendations.
3. Least privilege: each user and AI employee receives only the permissions required.
4. Tenant isolation: one company's records are never visible to another company.
5. Mobile-first: primary workflows must be usable on narrow Android screens.
6. Honest state: never report a task, payment, message, deployment, or database write as successful unless confirmed.
7. Incremental delivery: build on the existing repository and database without destructive rewrites.

## 2. Confirmed technical decisions

| Area | Decision |
|---|---|
| Repository | Existing `victoryude482-rgb/leadpilot-ai1` |
| Framework | Existing Next.js 14, React 18 and TypeScript application |
| Authentication experience | New LeadPilot registration, sign-in, recovery and session experience |
| Identity provider | Existing Supabase Auth |
| Session model | Server-managed sessions using secure cookies and Supabase SSR-compatible integration |
| Database | Existing Supabase PostgreSQL project |
| Authorization | Company membership and role checks, enforced in application code and RLS |
| Existing agents | Preserve TypeScript agents and optional Python reasoning service |
| Cloudflare | Optional lightweight edge/scheduled support; not a replacement for Next.js or Python reasoning |
| Deployment | Keep current deployment arrangement; no forced migration |
| Cost | Free-tier-first; paid services are opt-in only |

### Authentication clarification

“New authentication system” means a new, complete LeadPilot authentication experience and secure application integration. Supabase Auth remains the underlying identity and credential service. LeadPilot must not implement its own password hashing or store raw passwords.

The inspected repository currently has a Supabase browser client in `src/auth/supabase-browser.ts`, a bearer-token helper in `src/auth/supabase-server.ts`, and an `AuthBar` component in `components/auth-bar.tsx`. The agent execution route currently accepts a bearer token and passes the validated Supabase user ID into the agent runtime. The new design replaces this browser-managed/bearer-only pattern with server-managed cookie sessions and consistent server-side authorization. Existing behavior must be mapped before removing old helpers.

## 3. Authentication and account lifecycle

### 3.1 Registration

Registration collects:
- Display name
- Email address
- Password
- Required acceptance of terms and privacy policy

Requirements:
- Validate and normalize email addresses.
- Require email verification before access to private company features.
- Enforce a minimum password length of 10 characters.
- Permit long passphrases and password managers.
- Avoid arbitrary composition rules that reduce usability.
- Do not store passwords in application tables, logs, analytics, or browser storage.
- Handle duplicate-account and provider errors without exposing sensitive account-existence information unnecessarily.
- After verification, guide the user to sign in and create their first company workspace.

If email confirmation is enabled in Supabase, the UI must support pending verification, resend verification, and changing the email address. It must not instruct operators to disable verification as a production workaround.

### 3.2 Sign-in

Email and password sign-in is required for the first release. The screen includes:
- Email and password fields
- Show/hide password control
- Forgot-password link
- Registration link
- Clear loading, success, and error states
- Redirect to the user's company workspace after successful authentication

Do not redirect authenticated users back to a public sign-in screen. Preserve a safe internal return path when redirecting after login; reject external redirect URLs to prevent open redirects.

### 3.3 Email verification

- Verification links must resolve to a controlled LeadPilot callback route.
- Validate the Supabase verification token server-side.
- Handle expired or invalid links with a recoverable screen.
- Allow resending verification email with rate limits.
- Do not grant private workspace access before the required verification state is satisfied.

### 3.4 Password recovery and change

Recovery flow:
1. User submits an email address.
2. LeadPilot responds with a generic confirmation message.
3. Supabase sends a recovery link if the account/provider permits it.
4. The callback validates the recovery session.
5. User enters and confirms a new password.
6. The application updates the credential through Supabase Auth.
7. Existing sessions are revoked where supported and the user is required to authenticate again.

Authenticated users must also have a change-password flow. Sensitive account changes should require recent authentication where supported.

### 3.5 Session handling

Use the supported Supabase SSR cookie integration appropriate to the installed package versions. Do not assume a particular package API until dependencies and lockfile are inspected.

Requirements:
- Server-readable session cookies.
- HttpOnly cookies for session credentials wherever supported by the chosen Supabase SSR flow.
- Secure cookies in production.
- Appropriate SameSite policy and path/domain scope.
- Refresh-token rotation and refresh handling through the supported SSR middleware/client pattern.
- Server-side validation for protected pages and APIs.
- Sign-out clears the server session and client auth state.
- Expired or invalid sessions return the user to sign-in.
- Never store access or refresh tokens in localStorage or sessionStorage.
- Never place tokens in URLs, logs, error messages, or analytics.
- CSRF protections appropriate to cookie-authenticated state-changing requests.
- Avoid caching personalized or authenticated responses in shared caches.

### 3.6 Account lifecycle and security controls

Initial scope:
- Sign up
- Verify email
- Sign in
- Sign out
- Recover password
- Change password
- View basic profile
- Request account deletion

Later scope:
- Multi-factor authentication
- Social sign-in providers
- Session/device management UI
- Team invitations and granular custom roles

Account deletion must be a deliberate, confirmed workflow. It must explain what happens to company data and respect legal/retention requirements. Do not silently cascade-delete records that may be required for audit or financial integrity.

### 3.7 Abuse protection

Apply rate limits to registration, sign-in, password recovery, verification resend, and other sensitive endpoints. Use server/edge controls with safe fallback behavior. Avoid permanent account lockout that attackers can exploit. Return generic authentication errors where detailed errors would enable account enumeration.

## 4. Authorization and company tenancy

Authentication establishes identity. Authorization determines what the identity may do.

### 4.1 Roles

| Role | Initial permission model |
|---|---|
| Owner | Full control of company settings, members, data and approvals |
| Admin | Manage permitted company operations and members, but cannot override owner-only controls |
| Member | Use assigned operational features |
| Viewer | Read permitted company information |

The first user-created company is owned by that user. Team-management screens may be delivered later, but the schema and authorization model must support membership from the beginning.

### 4.2 Tenant isolation

Every company-owned record must carry a company relationship, directly or through a safely enforced parent relationship. Relevant data includes:
- Leads and CRM records
- Research reports
- Agent tasks and execution results
- AI employee configurations
- Approval requests
- Activity events
- Financial records
- Company settings and integrations

The browser must never be trusted to assert its own user ID, role, or company membership. Server code must derive identity from the validated session and resolve active company membership from the database.

All tenant-owned tables must have RLS enabled and tested. Policies must use authenticated identity and membership relationships, not a user-supplied company ID alone. Service-role credentials must remain server-only; code using a service role must explicitly enforce tenant authorization before reads or writes.

### 4.3 Active company

The data model should support multiple companies per user even if the first release creates only one. The active company selection must be validated against the user's memberships on every server request. Changing the active company must not grant access to an unowned tenant.

## 5. Application experience and screens

### 5.1 Public and authentication screens

- Public landing page
- Registration
- Sign in
- Email verification pending/success/error
- Password recovery request
- Password reset
- Account/profile settings
- Access denied and service unavailable states

### 5.2 First-run onboarding

After first successful sign-in:
1. Check whether the user has a company membership.
2. If none exists, guide them to create their company.
3. Collect company name and optional business description, website, industry and location.
4. Create company and Owner membership in a transaction or safe server-side sequence.
5. Redirect to the company overview.

Do not create a fake/demo company or seed fake leads/revenue. New users start with an empty workspace and clear next steps.

### 5.3 Company overview

Show:
- Active company
- Lead count
- Customer count
- Pending approvals
- Running and failed tasks
- Revenue based on recorded payment evidence
- Recent activity
- Recommended next action

Empty states should explain how to begin without inventing activity.

### 5.4 AI employees

Initial roles:
- Company Manager: coordinates tasks and prioritizes work.
- Opportunity Researcher: researches demand, competition, segments and risks.
- Lead Researcher: discovers and qualifies potential customers.
- Website Builder: drafts website structures, copy and visual assets.
- Sales Analyst: analyzes pipeline and prepares recommendations.
- Finance Assistant: organizes financial records and summaries.

Each employee profile includes purpose, capabilities, status, permitted tools, execution limits, task history and approval requirements. AI employees do not receive unrestricted credentials or authority.

### 5.5 Opportunity research

Research requests can cover market demand, customer segments, competitors, pricing hypotheses, business models, public prospects and risks.

Every report must record:
- Query and scope
- Creation time
- Sources and source timestamps where available
- Verified facts
- Publicly indexed evidence
- AI inferences
- Confidence/limitations
- Recommendations and proposed next steps

Do not present a single provider's advertised price as an industry average. Clearly label estimates and hypotheses.

### 5.6 Approval centre

Approval cards must show:
- Exact action proposed
- Requesting agent/task
- Target recipient or affected resource
- Message/content/payload preview where relevant
- Evidence and reason
- Expected cost, if any
- Expiration time
- Approve and reject controls
- Execution result after approval

Approvals must be scoped to one immutable action payload. If the payload changes, the previous approval is invalid and a new approval is required.

### 5.7 Customers, CRM and finance

Reuse existing CRM and revenue attribution structures wherever possible. Provide customer, deal, activity, and financial views without creating competing records.

Revenue is recorded only from confirmed payment evidence or a trusted payment-provider event. Forecasts and AI estimates must be displayed separately from realized revenue.

### 5.8 Activity and task history

Provide task lifecycle, timestamps, agent identity, inputs/outputs as safe, redacted summaries, errors and action/approval references. Secrets, passwords, access tokens and sensitive headers must never be stored in activity logs.

## 6. AI task lifecycle and orchestration

Normal task lifecycle:

`CREATED → QUEUED → RUNNING → COMPLETED | FAILED | CANCELLED`

Approval-gated lifecycle:

`RUNNING → AWAITING_APPROVAL → APPROVED | REJECTED | EXPIRED → EXECUTING → COMPLETED | FAILED`

Rules:
- Persist task state transitions.
- Use idempotency keys for operations that may be retried.
- Enforce approval at the server immediately before the external side effect.
- Re-check user membership and authorization at execution time.
- A rejected, expired, or revoked approval cannot execute.
- Retries must not duplicate messages, payments, publishing, or other side effects.
- Mark a task completed only after confirming the result.
- Store failure details without leaking secrets.
- Do not claim an external action succeeded when the provider response is ambiguous.

Existing TypeScript orchestration remains authoritative for authentication, CRM transitions, approvals, persistence, outbound communications and UI APIs. Existing Python agents remain optional reasoning workers when configured. TypeScript fallbacks must continue to work when Python is unavailable.

## 7. External action policy

| Action | Automatic | Owner approval |
|---|---:|---:|
| Public research | Yes | No |
| Internal analysis/report | Yes | No |
| Draft a website | Yes | No |
| Draft an email/WhatsApp message | Yes | No |
| Save an internal CRM note | Yes, if authorized | No |
| Send email or WhatsApp | No | Yes |
| Publish a website or public post | No | Yes |
| Spend money or purchase a service | No | Yes |
| Refund or issue credit | No | Yes |
| Change subscription/billing | No | Yes |
| Delete company or important data | No | Yes, with confirmation |

Approval does not waive provider policy, law, or access controls. No agent may use an owner's credentials to bypass these rules.

## 8. Data model and migration strategy

The following are proposed logical entities, not a mandate to create duplicates. Inspect existing migrations, tables and application repositories before writing migrations.

| Entity/table | Purpose |
|---|---|
| Supabase `auth.users` | Identity and credentials, managed by Supabase |
| `profiles` | User display name and profile preferences |
| `companies` | Company workspace |
| `company_members` | User/company relationship and role |
| `company_tasks` | Dashboard task lifecycle, if no suitable task table exists |
| `employee_profiles` | AI employee role and capability configuration |
| `approval_requests` | Immutable proposed action and approval decision |
| `activity_events` | Audit/activity history |
| `research_reports` | Persisted research evidence and recommendations |
| `financial_entries` | Verified financial records and attribution |

### Required data practices

- UUID primary keys where consistent with existing schema.
- Foreign keys and indexes on ownership and lookup columns.
- UTC timestamps.
- Explicit status constraints/enums.
- Unique constraints for idempotency and membership.
- RLS enabled for tenant-owned tables.
- Minimal personal data.
- No passwords, raw tokens, API keys or secret headers in application tables.
- Retention and deletion behavior documented.
- Migrations must be additive and non-destructive unless separately approved.

Before implementation, inspect the actual Supabase schema and all existing migrations. Reuse current leads, CRM, agent memory, tasks and revenue tables where they already meet requirements. Do not assume the proposed names exist.

## 9. API and server boundaries

All private API handlers must:
1. Read and validate the server-managed session.
2. Resolve the authenticated user.
3. Resolve and verify company membership and role.
4. Validate request shape and input limits.
5. Perform authorized work.
6. Persist outcomes and audit events where applicable.
7. Return safe, non-sensitive errors.

Never trust client-supplied `userId`, role, ownership, approval state or provider result. Use server-side schemas and validation. State-changing cookie-authenticated endpoints must have CSRF protection appropriate to the selected Next.js/Supabase integration.

The existing `/api/agents/run` route must be migrated to the same server session and company authorization pattern. Anonymous agent execution must not accidentally create or mutate private company records. Preserve any intentionally public research mode only after documenting its limits and abuse protections.

## 10. Security requirements

Release-blocking:
1. Protected pages and private APIs require valid authentication.
2. Every tenant-scoped operation verifies company membership and role.
3. RLS prevents cross-tenant reads and writes.
4. Service-role keys are never exposed to the browser.
5. Cookies are configured securely in production.
6. CSRF and open-redirect protections are present where applicable.
7. Sensitive endpoints are rate-limited.
8. Tokens, passwords and secrets are excluded from logs.
9. Approval is checked server-side immediately before external execution.
10. Idempotency prevents duplicate side effects.
11. Database migrations preserve existing production data.
12. Account and company deletion cannot bypass retention or confirmation rules.

## 11. Failure and recovery behavior

| Failure | Expected behavior |
|---|---|
| Supabase unavailable | Fail closed for private access; show service-unavailable state |
| Invalid/expired session | Deny private access and offer sign-in |
| Verification link expired | Show recoverable state and resend option |
| Email delivery fails | Explain delivery failure without claiming success |
| Database unavailable | Do not claim writes were saved |
| AI provider unavailable | Use configured fallback or report failure |
| Python worker unavailable | Use TypeScript fallback where supported |
| Research source unavailable | Mark source unavailable; do not fabricate evidence |
| Approval expired/rejected | Block execution |
| External action response ambiguous | Mark outcome unknown/pending reconciliation; do not blindly retry |
| Duplicate task delivery | Enforce idempotency |
| Rate limit reached | Return retry guidance without bypassing protection |

## 12. Testing and acceptance criteria

### Authentication
- Registration creates a Supabase Auth identity.
- Email verification is required for private workspace access.
- Duplicate/invalid registration is handled safely.
- Correct credentials create a session.
- Incorrect credentials are rejected.
- Recovery flow works end-to-end.
- Password change works.
- Session persists through refresh.
- Session refresh and expiry behave correctly.
- Sign-out clears session.
- Private routes redirect or return 401/403 appropriately.
- External redirect destinations are rejected.

### Authorization and tenancy
- A user can access only their own company memberships.
- A user cannot read another company's leads, tasks, reports, approvals or finance records.
- A member cannot perform owner-only operations.
- Forged client user/company IDs do not grant access.
- RLS tests cover select, insert, update and delete.
- Service-role operations enforce application authorization.

### Product behavior
- First login guides the user to create a company.
- New company starts empty; no fake revenue or seeded customer claims.
- Dashboard is usable on narrow Android screens.
- Existing LeadPilot agents and fallbacks remain functional.
- Tasks and reports persist.
- Rejected and expired approvals cannot execute.
- External actions require explicit approval.
- Revenue reflects confirmed payment evidence only.

### Engineering
- Typecheck passes.
- Lint passes.
- Existing tests pass.
- New auth, authorization, RLS and approval tests pass.
- Production build passes.
- Migration is reviewed for data preservation.
- Environment variables are documented and no secrets are committed.
- Mobile browser QA is completed.

## 13. Milestones

### Milestone 1 — Authentication foundation
New LeadPilot registration, login, email verification, recovery, secure server sessions, logout, protected routes, rate limits, profiles and authorization foundations.

### Milestone 2 — Company dashboard foundation
Company creation/onboarding, membership, company settings, mobile navigation, overview and empty states.

### Milestone 3 — AI employee management
Employee profiles, permissions, task assignment, execution limits, task status and history.

### Milestone 4 — Opportunity research
Research interface, saved reports, source/evidence tracking, recommendations and research history.

### Milestone 5 — Approval centre
Approval requests, immutable action payloads, approve/reject/expiry, execution guards, idempotency and audit history.

### Milestone 6 — CRM and finance
Customer and deal views, existing CRM integration, financial records and verified revenue attribution.

### Milestone 7 — Deployment and verification
Environment configuration, deployment, mobile QA, security review, RLS verification, regression tests and final production build.

Each milestone must be implemented and verified before it is marked complete. No milestone automatically authorizes merging into `main`.

## 14. Delivery and repository rules

- Work in `victoryude482-rgb/leadpilot-ai1`.
- Use a separate feature branch for changes.
- Preserve existing application behavior and data.
- Inspect existing schema and migrations before writing migrations.
- Do not introduce mandatory paid infrastructure.
- Do not commit secrets or local environment files.
- Keep changes reviewable and testable.
- Run typecheck, lint, tests and build as appropriate.
- Report exact verification results; do not claim checks passed unless they were run.
- Do not merge into `main` without explicit user approval.
- Provide GitHub links and Android-friendly instructions.

## 15. Out of scope for this design approval

This document does not authorize:
- Replacing the existing hosting provider.
- Migrating the database to a new provider.
- Introducing paid subscriptions or payment processing.
- Sending real customer messages.
- Publishing websites or public content.
- Spending money.
- Deleting existing customer data.
- Merging implementation branches into `main`.

## 16. Definition of done

The dashboard foundation is complete only when the specified authentication and authorization flows work, company data is isolated, existing LeadPilot features remain operational, sensitive actions are approval-gated, mobile workflows are usable, migrations preserve data, and all required checks have been run and reported accurately.

**Final design decision:** LeadPilot will have a new first-party authentication experience backed by Supabase Auth, server-managed sessions, company-level roles and database-enforced tenant isolation. The existing LeadPilot AI application and workforce will be extended rather than replaced.
