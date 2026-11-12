# Deploying LeadPilot AI to Cloudflare Workers

The app runs on Cloudflare Workers through the OpenNext adapter (`@opennextjs/cloudflare`).
Auth and data stay on Supabase; nothing about the database changes.

## One-time setup

1. In Cloudflare, create an API token with the **Edit Cloudflare Workers** template and note your Account ID.
2. In GitHub, add these repository secrets (Settings, Secrets and variables, Actions):
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. Set the server-side secrets on the Worker (they are never put in the repo). Only set the ones you use:

   ```sh
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put LEAD_PROVIDER_API_KEY
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put TOGETHER_API_KEY
   ```

   Plain values (for example `LEAD_PROVIDER_API_URL`, `OUTREACH_FROM_EMAIL`, `PYTHON_AGENT_URL`) can be added under `vars` in `wrangler.jsonc`.
4. In Supabase, Authentication, URL Configuration: add your `*.workers.dev` URL (or custom domain) to **Site URL** and **Redirect URLs**, including `/auth/callback`. Without this, login redirects fail.

## Deploy

Pushing to `main` runs `.github/workflows/deploy-cloudflare.yml`. To deploy by hand:

```sh
npm install
npm run cf:deploy
```

`npm run cf:preview` builds and serves the Worker locally so you can check it before deploying.

## Known limitation: Next.js 14

The adapter refuses Next.js 14 by default because the Next.js team no longer supports it, so `cf:build` passes
`--dangerouslyUseUnsupportedNextVersion`. This only silences the adapter's guard; it does not patch Next.js.
Plan an upgrade to a supported Next.js release (15 or later). That upgrade needs code changes
(`cookies()` and `searchParams` become async, and App Router requires React 19), so do it as its own change.

## Notes

- Build with `cf:build`, not `next build`; the adapter wraps the Next.js build.
- All workspace pages are `force-dynamic`, so no KV or R2 binding is required.
- Payment and messaging webhooks (Paystack, Telegram, WhatsApp) must be re-pointed at the new URL.
