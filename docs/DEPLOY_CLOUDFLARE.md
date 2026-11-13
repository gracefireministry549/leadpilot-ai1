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

## Next.js version

The OpenNext adapter only supports Next.js 15.5.28 or later, so the app runs on Next.js 15 and React 19.
`cookies()`, `searchParams` and `params` are async in these versions and the pages already await them.

## Notes

- `GET /api/health` returns `{ ok: true }` and whether Supabase is configured. Use it to check a new deployment.
- Build with `cf:build`, not `next build`; the adapter wraps the Next.js build.
- All workspace pages are `force-dynamic`, so no KV or R2 binding is required.
- Payment and messaging webhooks (Paystack, Telegram, WhatsApp) must be re-pointed at the new URL.
