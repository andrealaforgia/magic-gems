import { test } from 'node:test';
import assert from 'node:assert';
import handler from '../../api/magic-gems/session.js';
import { sessionKey } from '../../api/magic-gems/_upstash.js';

const CONFIGURED_ENV = { UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 'tok' };

// A minimal in-memory stand-in for Upstash's own REST contract (get/set),
// enough to drive the real handler end to end without a live store. Exposes
// its own store so a test can seed a collision directly, without that seed
// itself consuming a pinned random sequence meant for the handler's own call.
function fakeUpstash() {
  const store = new Map();
  async function fetchImpl(url, options = {}) {
    const parsed = new URL(url);
    const [command, ...rest] = parsed.pathname.split('/').filter(Boolean);
    const key = decodeURIComponent(rest.join('/'));
    if (command === 'get') {
      return { json: async () => ({ result: store.has(key) ? store.get(key) : null }) };
    }
    if (command === 'set') {
      store.set(key, options.body);
      return { json: async () => ({ result: 'OK' }) };
    }
    return { json: async () => ({ error: `unsupported command ${command}` }) };
  }
  fetchImpl.store = store;
  return fetchImpl;
}

// Pins Math.random so generateSessionCode() deterministically produces each
// string in `codes`, in order, then falls back to real randomness.
function pinCodeSequence(t, codes) {
  const queue = [];
  for (const code of codes) {
    for (const ch of code) queue.push((ch.charCodeAt(0) - 65 + 0.5) / 26);
  }
  let i = 0;
  const realRandom = Math.random.bind(Math);
  const realMathRandom = Math.random;
  Math.random = () => (i < queue.length ? queue[i++] : realRandom());
  t.after(() => {
    Math.random = realMathRandom;
  });
}

function withEnv(t, env) {
  const keys = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN'];
  const previous = {};
  for (const key of keys) {
    previous[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, env);
  t.after(() => {
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, previous);
  });
}

function withFetch(t, fetchImpl) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
}

async function createViaHandler(hostName) {
  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', hostName }),
    })
  );
  return res.json();
}

test('POST create makes a new session with the host as its sole player', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const body = await createViaHandler('Alice');

  assert.equal(body.session.code.length, 10);
  assert.deepEqual(body.session.players, ['Alice']);
});

test('POST create returns a JSON content-type response', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', hostName: 'Alice' }),
    })
  );

  assert.equal(res.headers.get('Content-Type'), 'application/json');
});

test('create retries on a code collision rather than handing out an already-taken code', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  const fetchImpl = fakeUpstash();
  withFetch(t, fetchImpl);
  // Seeded directly (not through the handler) so this doesn't itself consume
  // the pinned random sequence below.
  fetchImpl.store.set(sessionKey('AAAAAAAAAA'), JSON.stringify({ code: 'AAAAAAAAAA', players: ['Zed'] }));
  pinCodeSequence(t, ['AAAAAAAAAA', 'BBBBBBBBBB']);

  const body = await createViaHandler('Alice');

  assert.equal(body.session.code, 'BBBBBBBBBB', 'expected the collision to force a retry onto the next generated code');
  assert.deepEqual(body.session.players, ['Alice']);
});

test('GET returns the previously created session by its code', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const created = await createViaHandler('Alice');
  const res = await handler.fetch(new Request(`https://x/api/magic-gems/session?code=${created.session.code}`));
  const body = await res.json();

  assert.deepEqual(body.session, created.session);
});

test('GET for a code the store has never seen returns a null session, not an error', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const res = await handler.fetch(new Request('https://x/api/magic-gems/session?code=NOSUCHCODE'));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.session, null);
});

test('GET with no code is rejected with 400 and a descriptive error, not silently ignored', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const res = await handler.fetch(new Request('https://x/api/magic-gems/session'));
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error, 'missing code');
});

test('POST join appends the second player and reports ok, with both real names', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const created = await createViaHandler('Alice');
  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'join', code: created.session.code, playerName: 'Bob' }),
    })
  );
  const body = await res.json();

  assert.equal(body.ok, true);
  assert.deepEqual(body.session.players, ['Alice', 'Bob']);
});

test('POST join against an unknown code reports not-found as a normal 200 result, not a 500', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'join', code: 'NOSUCHCODE', playerName: 'Bob' }),
    })
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, false);
  assert.equal(body.error, 'not-found');
});

test('POST join against an already-full session reports full', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const created = await createViaHandler('Alice');
  await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'join', code: created.session.code, playerName: 'Bob' }),
    })
  );
  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'join', code: created.session.code, playerName: 'Carol' }),
    })
  );
  const body = await res.json();

  assert.equal(body.ok, false);
  assert.equal(body.error, 'full');
});

test('a missing/misconfigured store surfaces a clear 500 error rather than hanging or crashing uncontrolled (E4)', async (t) => {
  withEnv(t, {});
  withFetch(t, fakeUpstash());

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', hostName: 'Alice' }),
    })
  );
  const body = await res.json();

  assert.equal(res.status, 500);
  assert.ok(/UPSTASH_REDIS_REST_URL|not configured/i.test(body.error), body.error);
});

test('an unknown action is rejected with 400 and a descriptive error', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'do-something-else' }),
    })
  );
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error, 'unknown action');
});

test('an unsupported HTTP method is rejected with 405 and a descriptive error', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const res = await handler.fetch(new Request('https://x/api/magic-gems/session', { method: 'DELETE' }));
  const body = await res.json();
  assert.equal(res.status, 405);
  assert.equal(body.error, 'method not allowed');
});
