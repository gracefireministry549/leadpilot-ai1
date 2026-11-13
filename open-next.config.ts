import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Every workspace page is force-dynamic and reads Supabase per request,
// so no incremental cache or KV binding is needed.
export default defineCloudflareConfig();
