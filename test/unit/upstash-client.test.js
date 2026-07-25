import { test } from 'node:test';
import assert from 'node:assert';
import {
  resolveConfig,
  sessionKey,
  getStoredSession,
  setStoredSession,
  checkRateLimit,
  SESSION_TTL_SECONDS,
  RATE_LIMIT_KEY_PREFIX,
} from '../../api/magic-gems/_upstash.mjs';

function withFetch(t, fetchImpl) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
}

test('resolveConfig prefers the standard UPSTASH_* env vars', () => {
  assert.deepEqual(resolveConfig({ UPSTASH_REDIS_REST_URL: 'u', UPSTASH_REDIS_REST_TOKEN: 't' }), {
    url: 'u',
    token: 't',
  });
});

test('resolveConfig falls back to Vercel KV integration env var names', () => {
  assert.deepEqual(resolveConfig({ KV_REST_API_URL: 'u2', KV_REST_API_TOKEN: 't2' }), {
    url: 'u2',
    token: 't2',
  });
});

test('resolveConfig throws a clear, descriptive error when neither pair is present (E4)', () => {
  assert.throws(() => resolveConfig({}), /UPSTASH_REDIS_REST_URL|not configured/i);
});

test('resolveConfig throws when only the URL half of a pair is present, not just when both are missing', () => {
  assert.throws(() => resolveConfig({ UPSTASH_REDIS_REST_URL: 'u' }), /not configured/i);
});

test('resolveConfig throws when only the token half of a pair is present', () => {
  assert.throws(() => resolveConfig({ UPSTASH_REDIS_REST_TOKEN: 't' }), /not configured/i);
});

test('sessionKey namespaces a code under this project\'s own prefix, distinct from a bare code', () => {
  assert.equal(sessionKey('ABC'), 'magic-gems:session:ABC');
});

test('SESSION_TTL_SECONDS is exactly one hour', () => {
  assert.equal(SESSION_TTL_SECONDS, 3600);
});

test('getStoredSession issues an authenticated GET against /get/<key> and parses the stored JSON', async (t) => {
  const calls = [];
  withFetch(t, async (url, options) => {
    calls.push({ url, options });
    return { json: async () => ({ result: JSON.stringify({ code: 'ABC', players: ['Alice'] }) }) };
  });

  const session = await getStoredSession({ UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 'tok' }, 'ABC');

  assert.deepEqual(session, { code: 'ABC', players: ['Alice'] });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes(`/get/${encodeURIComponent(sessionKey('ABC'))}`), calls[0].url);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer tok');
});

test('getStoredSession returns null for a code the store has never seen', async (t) => {
  withFetch(t, async () => ({ json: async () => ({ result: null }) }));
  const session = await getStoredSession({ UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 'tok' }, 'NONE');
  assert.equal(session, null);
});

test('getStoredSession surfaces a store-reported error instead of swallowing it', async (t) => {
  withFetch(t, async () => ({ json: async () => ({ error: 'WRONGPASS' }) }));
  await assert.rejects(
    () => getStoredSession({ UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 'tok' }, 'ABC'),
    /WRONGPASS/
  );
});

test('setStoredSession issues an authenticated POST with an EX TTL and the session as the raw body', async (t) => {
  const calls = [];
  withFetch(t, async (url, options) => {
    calls.push({ url, options });
    return { json: async () => ({ result: 'OK' }) };
  });

  await setStoredSession(
    { UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 'tok' },
    { code: 'ABC', players: ['Alice'] }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'POST');
  assert.ok(calls[0].url.includes(`EX=${SESSION_TTL_SECONDS}`), calls[0].url);
  assert.equal(calls[0].options.body, JSON.stringify({ code: 'ABC', players: ['Alice'] }));
  assert.equal(calls[0].options.headers.Authorization, 'Bearer tok');
});

test('setStoredSession surfaces a store-reported error instead of swallowing it', async (t) => {
  withFetch(t, async () => ({ json: async () => ({ error: 'OOM command not allowed' }) }));
  await assert.rejects(
    () => setStoredSession({ UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 'tok' }, { code: 'ABC', players: ['Alice'] }),
    /OOM/
  );
});

test('checkRateLimit issues an authenticated pipeline INCR+EXPIRE(NX) against the namespaced bucket key', async (t) => {
  const calls = [];
  withFetch(t, async (url, options) => {
    calls.push({ url, options });
    return { json: async () => [{ result: 1 }, { result: 1 }] };
  });

  await checkRateLimit({ UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 'tok' }, '1.2.3.4', 20, 60);

  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith('/pipeline'), calls[0].url);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer tok');
  const commands = JSON.parse(calls[0].options.body);
  assert.deepEqual(commands[0], ['INCR', `${RATE_LIMIT_KEY_PREFIX}1.2.3.4`]);
  assert.deepEqual(commands[1], ['EXPIRE', `${RATE_LIMIT_KEY_PREFIX}1.2.3.4`, 60, 'NX']);
});

test('checkRateLimit fails closed (treats it as exceeded) rather than throwing on a malformed empty pipeline response', async (t) => {
  withFetch(t, async () => ({ json: async () => [] }));
  const within = await checkRateLimit({ UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 'tok' }, '1.2.3.4', 20, 60);
  assert.equal(within, false);
});

test('checkRateLimit reports within-limit while the count is at or below the limit', async (t) => {
  withFetch(t, async () => ({ json: async () => [{ result: 20 }, { result: 1 }] }));
  const within = await checkRateLimit({ UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 'tok' }, '1.2.3.4', 20, 60);
  assert.equal(within, true);
});

test('checkRateLimit reports exceeded once the count goes past the limit', async (t) => {
  withFetch(t, async () => ({ json: async () => [{ result: 21 }, { result: 1 }] }));
  const within = await checkRateLimit({ UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 'tok' }, '1.2.3.4', 20, 60);
  assert.equal(within, false);
});

test('checkRateLimit surfaces a store-reported error instead of swallowing it', async (t) => {
  withFetch(t, async () => ({ json: async () => [{ error: 'WRONGPASS' }] }));
  await assert.rejects(
    () => checkRateLimit({ UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 'tok' }, '1.2.3.4', 20, 60),
    /WRONGPASS/
  );
});
