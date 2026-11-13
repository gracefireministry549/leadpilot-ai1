/**
 * Cache and rate limiting for agents.
 *
 * Uses Upstash Redis over its REST API, which works from Cloudflare Workers (no TCP sockets).
 * Without UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN it falls back to a per-instance
 * in-memory map, which is fine for development but is NOT shared between Worker instances.
 */
type Env = Record<string, string | undefined>;
type FetchLike = typeof fetch;

export type CacheBackend = 'redis' | 'memory';

const memory = new Map<string, { value: string; expiresAt: number }>();

function redisConfig(env: Env) {
  const url = env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/$/, '');
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

export function cacheBackend(env: Env = process.env): CacheBackend {
  return redisConfig(env) ? 'redis' : 'memory';
}

async function command(env: Env, fetchImpl: FetchLike, args: Array<string | number>): Promise<unknown> {
  const config = redisConfig(env);
  if (!config) throw new Error('Redis is not configured');
  const response = await fetchImpl(config.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(2500),
  });
  const body = (await response.json().catch(() => ({}))) as { result?: unknown; error?: string };
  if (!response.ok || body.error) throw new Error(body.error ?? `Redis responded ${response.status}`);
  return body.result;
}

function sweep(now: number) {
  if (memory.size < 500) return;
  for (const [key, entry] of memory) if (entry.expiresAt <= now) memory.delete(key);
}

export async function cacheGet(key: string, env: Env = process.env, fetchImpl: FetchLike = fetch): Promise<string | null> {
  if (redisConfig(env)) {
    try {
      const value = await command(env, fetchImpl, ['GET', key]);
      return typeof value === 'string' ? value : null;
    } catch {
      return null; // a cache outage must never break an agent run
    }
  }
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry.value;
}

export async function cacheSet(key: string, value: string, ttlSeconds: number, env: Env = process.env, fetchImpl: FetchLike = fetch): Promise<void> {
  const ttl = Math.max(1, Math.floor(ttlSeconds));
  if (redisConfig(env)) {
    try {
      await command(env, fetchImpl, ['SET', key, value, 'EX', ttl]);
    } catch {
      /* best effort */
    }
    return;
  }
  const now = Date.now();
  sweep(now);
  memory.set(key, { value, expiresAt: now + ttl * 1000 });
}

export async function cacheDelete(key: string, env: Env = process.env, fetchImpl: FetchLike = fetch): Promise<void> {
  if (redisConfig(env)) {
    try {
      await command(env, fetchImpl, ['DEL', key]);
    } catch {
      /* best effort */
    }
    return;
  }
  memory.delete(key);
}

export type RateLimitResult = { allowed: boolean; remaining: number; backend: CacheBackend };

/** Fixed-window limiter. Fails open if Redis is unreachable so an outage cannot lock users out. */
export async function rateLimit(key: string, limit: number, windowSeconds: number, env: Env = process.env, fetchImpl: FetchLike = fetch): Promise<RateLimitResult> {
  if (redisConfig(env)) {
    try {
      const count = Number(await command(env, fetchImpl, ['INCR', key]));
      if (count === 1) await command(env, fetchImpl, ['EXPIRE', key, windowSeconds]);
      return { allowed: count <= limit, remaining: Math.max(0, limit - count), backend: 'redis' };
    } catch {
      return { allowed: true, remaining: limit, backend: 'redis' };
    }
  }
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.expiresAt <= now) {
    memory.set(key, { value: '1', expiresAt: now + windowSeconds * 1000 });
    return { allowed: limit >= 1, remaining: Math.max(0, limit - 1), backend: 'memory' };
  }
  const count = Number(entry.value) + 1;
  entry.value = String(count);
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), backend: 'memory' };
}

/** Stable short hash for cache keys (Web Crypto, available on Workers and Node). */
export async function hashKey(...parts: string[]): Promise<string> {
  const data = new TextEncoder().encode(parts.join('\u0000'));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).slice(0, 12).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
