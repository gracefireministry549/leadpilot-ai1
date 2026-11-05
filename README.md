# LeadPilot AI

Free-first B2B lead intelligence, work discovery and AI business-building workspace.

## Current capabilities

- Lead discovery, verification and transparent 0–100 scoring
- Trend and opportunity research agents
- Scheduled agent runs
- **WorkPilot AI**: discovers public/indexed opportunities across Indeed, Upwork, Freelancer and Fiverr, deduplicates and ranks them, explains the client problem, proposes a solution, creates an implementation plan and drafts an approval-ready proposal
- **AI Website & Brand Agent**: creates a JSON-first website structure and logo asset; with `TOGETHER_API_KEY` it can use Together AI image generation, otherwise it produces a deterministic SVG fallback
- Personalized outreach drafts
- CRM workflow and revenue attribution

## GBP agents

- **GBP Audit** checks public directory evidence for missing websites, unreachable websites, missing phone/address/category and scores listing health. By default this is an inference from public directory data, not a direct read of a Google Business Profile. Setting `GOOGLE_PLACES_API_KEY` enables the optional Google Places Text Search check.
- **GBP Outreach** creates personalized, approval-first drafts that mention only the specific issues found by the audit. It uses the existing outreach eligibility guard and never sends by itself.
- **GBP Fix** creates a concrete fix plan only after a lead reaches `CUSTOMER`. Before that status it returns `withheld, deal not closed`. When delivered for a closed deal, the handoff can attribute the won event to `gbp-fix`.

## Agent architecture

LeadPilot uses a **TypeScript control plane + optional Python reasoning workforce**. TypeScript remains authoritative for authentication, CRM/status transitions, human approval, persistence, revenue events, outbound communication and web UI. Python handles reasoning-heavy research/problem-solving workloads when `PYTHON_AGENT_URL` is configured.

The first Python-backed agents are **WorkPilot, Trend Finder, Opportunity Finder, Tender Finder and E-commerce Opportunity**. Website/Brand, GBP, Outreach and CRM side-effect layers remain TypeScript until their Python reasoning modules can be introduced without weakening the existing business rules. Every Python call has a TypeScript fallback, so the main app still works with no Python service configured.

### Running the Python worker

The worker is dependency-free and lives in `services/python-agents`. Run it with:

```bash
python services/python-agents/service.py
```

It listens on `PORT` (default `8000`) and exposes `GET /health` and `POST /run`. Deploy it as a small Render web service, then set `PYTHON_AGENT_URL` on the Next.js service to its public URL. If the worker is unavailable, LeadPilot automatically uses its TypeScript implementations.

## Agent safety and evidence

LeadPilot distinguishes between **verified facts**, **publicly indexed evidence**, and **AI inferences**. Agents must not fabricate leads, contacts, prices, completed actions or Google Business Profile facts. External actions are approval-first. Outreach sending requires a signed-in user and explicit human approval.

## Environment

- `TOGETHER_API_KEY` is optional. Without it, logo generation falls back to a locally generated SVG.
- `GOOGLE_PLACES_API_KEY` is optional. Without it, GBP Audit uses the free public-directory path.
- `SUPABASE_SERVICE_ROLE_KEY` enables server-side lead persistence and the Supabase agent memory bus. Without it, the app falls back to in-memory adapters.
- `RESEND_API_KEY` and `OUTREACH_FROM_EMAIL` are optional. Without them, approval-first email sending returns a clear configuration error and does not send anything.
- `PYTHON_AGENT_URL` is optional. It enables the Python reasoning workforce. `PYTHON_AGENT_TIMEOUT_MS` controls its request timeout.


## Company command centre

The company workspace is built around a company membership boundary and a first-party Supabase Auth experience.

### Local setup

1. Install Node.js 20 or later.
2. Copy `.env.example` to `.env.local`.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SITE_URL`.
4. For persistent server-side lead discovery and agent memory, set `SUPABASE_SERVICE_ROLE_KEY` as a server-only secret. Never expose it with a `NEXT_PUBLIC_` prefix.
5. In Supabase Auth, enable email/password sign-in and email confirmation. Add `<your-site-origin>/auth/callback` to the allowed redirect URLs.
6. Run `npm install`, `npm run typecheck`, `npm test`, `npm run lint` and `npm run build`.

New users register, verify their email, sign in, and create their first company. The first member becomes Owner and six default AI employee profiles are provisioned.

### Workspace routes

- `/workspace`: company overview, AI workforce, task activity, approvals and verified finance summary
- `/workspace/agents`: employee status and task queue
- `/workspace/research`: execute supported agents and save their output
- `/workspace/reports`: saved research and evidence
- `/workspace/approvals`: request, approve or reject consequential actions
- `/workspace/crm`: company leads and manual lead entry
- `/workspace/finance`: expense/revenue records; entries start unverified and only Owner/Admin can mark them verified
- `/settings/account`: account deletion request

### Security and operational limits

- Browser authentication uses Supabase SSR cookie sessions. Private server routes resolve the user with `auth.getUser()`; browser-supplied user IDs and company IDs are not trusted.
- Company membership and role checks are enforced by Postgres RLS. Viewers are read-only; employee configuration, approval decisions and finance verification require Owner/Admin.
- The private rate-limit counter table and payment-event deduplication table are kept outside the exposed `public` schema. Supabase Auth provider rate limits remain enabled; application-specific distributed rate limiting still needs a production edge/server limiter before high-volume public signup.
- Approval records capture the requested action and owner decision. Approval does not itself send an email, publish content or spend money; execution must be separately implemented behind a one-time approval check.
- Finance entries are not treated as actual cash received until an Owner/Admin verifies them against supporting evidence. CRM "won" events are pipeline attribution, not proof of payment.
- Team invitations, MFA/social login, full audit export, and automatic account erasure are not implemented in this milestone.
- Do not deploy until all GitHub Actions checks pass and production environment secrets/redirect URLs have been configured.
