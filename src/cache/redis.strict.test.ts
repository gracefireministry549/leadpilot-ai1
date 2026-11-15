import assert from 'node:assert/strict';
import test from 'node:test';
import { rateLimitStrict } from './redis';

test('strict limiter denies when shared Redis is not configured', async () => {
  const result = await rateLimitStrict('outreach:test', 1, 60, {});
  assert.equal(result.allowed, false);
  assert.equal(result.remaining, 0);
  assert.equal(result.backend, 'memory');
});

test('strict limiter uses Redis and permits only the configured count', async () => {
  let count = 0;
  const fetchMock: typeof fetch = async () => {
    count += 1;
    return new Response(JSON.stringify({ result: count === 1 ? 1 : 'OK' }), { status: 200 });
  };
  const result = await rateLimitStrict(
    'outreach:test',
    1,
    60,
    { UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'test-token' },
    fetchMock,
  );
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 0);
  assert.equal(result.backend, 'redis');
  assert.equal(count, 2);
});

test('strict limiter denies when Redis is unavailable', async () => {
  const fetchMock: typeof fetch = async () => {
    throw new Error('Redis unavailable');
  };
  const result = await rateLimitStrict(
    'outreach:test',
    10,
    60,
    { UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'test-token' },
    fetchMock,
  );
  assert.equal(result.allowed, false);
  assert.equal(result.remaining, 0);
  assert.equal(result.backend, 'redis');
});
