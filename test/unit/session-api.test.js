import { test } from 'node:test';
import assert from 'node:assert';
import handler, { RATE_LIMIT_MAX_REQUESTS } from '../../api/magic-gems/session.mjs';
import { sessionKey } from '../../api/magic-gems/_upstash.mjs';

const CONFIGURED_ENV = { UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 'tok' };

// A minimal in-memory stand-in for Upstash's own REST contract (get/set),
// enough to drive the real handler end to end without a live store. Exposes
// its own store so a test can seed a collision directly, without that seed
// itself consuming a pinned random sequence meant for the handler's own call.
function fakeUpstash() {
  const store = new Map();
  const rateLimitCounts = new Map();
  async function fetchImpl(url, options = {}) {
    const parsed = new URL(url);
    if (parsed.pathname === '/pipeline') {
      const [, rateLimitKey] = JSON.parse(options.body)[0];
      const count = (rateLimitCounts.get(rateLimitKey) || 0) + 1;
      rateLimitCounts.set(rateLimitKey, count);
      return { json: async () => [{ result: count }, { result: 1 }] };
    }
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
  fetchImpl.rateLimitCounts = rateLimitCounts;
  return fetchImpl;
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
  // generateSessionCode now draws from a real CSPRNG (L1, commit 023dece),
  // so the exact code it produces can no longer be pinned - instead, this
  // forces a collision on whichever code the real generator happens to draw
  // by making the very first store lookup report "already taken", regardless
  // of which key it's for, then falling back to the real fake store for
  // every call after. This still directly proves the retry loop: if it
  // didn't retry, the final session's own code would be whatever the FIRST
  // draw was, and the store would only have been written to once.
  let getCalls = 0;
  withFetch(t, async (url, options) => {
    if (new URL(url).pathname.startsWith('/get/')) {
      getCalls++;
      if (getCalls === 1) {
        return { json: async () => ({ result: JSON.stringify({ code: 'COLLIDES', players: ['Zed'] }) }) };
      }
    }
    return fetchImpl(url, options);
  });

  const body = await createViaHandler('Alice');

  assert.equal(getCalls, 2, 'expected exactly one collision check before the successful retry');
  assert.equal(body.session.code.length, 10);
  assert.deepEqual(body.session.players, ['Alice']);
  assert.equal(fetchImpl.store.size, 1, 'expected exactly one session actually written - the retried code, not the collided one');
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

// MP-RECONNECT/SPEC 13.2.6: a player who left and comes back under their own
// existing name reclaims their place, rather than being turned away as full.
test('POST join with a name already in an already-full session reconnects instead of reporting full', async (t) => {
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
      body: JSON.stringify({ action: 'join', code: created.session.code, playerName: 'Bob' }),
    })
  );
  const body = await res.json();

  assert.equal(body.ok, true);
  assert.deepEqual(body.session.players, ['Alice', 'Bob']);
});

// MP4: each client publishes its own board+score for the other to read.
function validBoardFixture() {
  return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 'red-square'));
}

test('publish records the caller\'s board and score under their own name in the session', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  const fetchImpl = fakeUpstash();
  withFetch(t, fetchImpl);
  const created = await createViaHandler('Alice');

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'publish', code: created.session.code, playerName: 'Alice', board: validBoardFixture(), score: 42 }),
    })
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.session.states.Alice, { board: validBoardFixture(), score: 42 });
});

test('a successful publish is actually persisted, not just echoed back in its own response', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  const fetchImpl = fakeUpstash();
  withFetch(t, fetchImpl);
  const created = await createViaHandler('Alice');

  await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'publish', code: created.session.code, playerName: 'Alice', board: validBoardFixture(), score: 42 }),
    })
  );

  const getRes = await handler.fetch(
    new Request(`https://x/api/magic-gems/session?code=${created.session.code}`)
  );
  const getBody = await getRes.json();
  assert.deepEqual(getBody.session.states.Alice, { board: validBoardFixture(), score: 42 });
});

test('publish refuses a name that is not actually one of the session\'s own players, as a normal 200 result, not a 500', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  const fetchImpl = fakeUpstash();
  withFetch(t, fetchImpl);
  const created = await createViaHandler('Alice');

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'publish', code: created.session.code, playerName: 'Mallory', board: validBoardFixture(), score: 0 }),
    })
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, false);
  assert.equal(body.error, 'not-a-player');
});

test('publish against an unknown code reports not-found as a normal 200 result, not a 500', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'publish', code: 'NOSUCHCODE', playerName: 'Alice', board: validBoardFixture(), score: 0 }),
    })
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, false);
  assert.equal(body.error, 'not-found');
});

test('publish rejects a malformed code with 400, never reaching the store', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'publish', code: 'not-a-code', playerName: 'Alice', board: validBoardFixture(), score: 0 }),
    })
  );
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error, 'code must be exactly 10 uppercase letters');
});

test('publish rejects an oversized playerName with 400', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());
  const created = await createViaHandler('Alice');

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'publish', code: created.session.code, playerName: 'B'.repeat(21), board: validBoardFixture(), score: 0 }),
    })
  );
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error, 'playerName must be a string between 1 and 20 characters');
});

test('publish rejects a board that is not an 8x8 array of short strings with 400', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());
  const created = await createViaHandler('Alice');

  async function publishBoard(board) {
    const res = await handler.fetch(
      new Request('https://x/api/magic-gems/session', {
        method: 'POST',
        body: JSON.stringify({ action: 'publish', code: created.session.code, playerName: 'Alice', board, score: 0 }),
      })
    );
    return { status: res.status, body: await res.json() };
  }

  const tooFewRows = await publishBoard([['red-square']]);
  assert.equal(tooFewRows.status, 400);

  const notAnArray = await publishBoard('not-a-board');
  assert.equal(notAnArray.status, 400);
  assert.equal(notAnArray.body.error, 'board must be an array of 8 rows');

  // Every row is individually valid (array of 8 short strings) - only the
  // outer row-count is wrong - so this can't be caught by the per-row checks
  // below, only by the board-level length check itself.
  const wrongRowCount = await publishBoard(Array.from({ length: 9 }, () => Array(8).fill('red-square')));
  assert.equal(wrongRowCount.status, 400);

  // A row that isn't an array - unguarded, a string row's own characters
  // could otherwise slip past a per-cell check too, so this can only be
  // caught by the row's own Array.isArray check.
  const rowNotAnArray = [...Array.from({ length: 7 }, () => Array(8).fill('red-square')), '12345678'];
  const rowNotAnArrayResult = await publishBoard(rowNotAnArray);
  assert.equal(rowNotAnArrayResult.status, 400);

  // A row with only 7 valid cells - short by exactly one, with every cell
  // otherwise valid - so only the row-length check itself can catch it.
  const tooFewCells = [...Array.from({ length: 7 }, () => Array(8).fill('red-square')), Array(7).fill('red-square')];
  const tooFewCellsResult = await publishBoard(tooFewCells);
  assert.equal(tooFewCellsResult.status, 400);

  const nonStringCell = [[42, ...Array(7).fill('red-square')], ...Array.from({ length: 7 }, () => Array(8).fill('red-square'))];
  const nonStringCellResult = await publishBoard(nonStringCell);
  assert.equal(nonStringCellResult.status, 400);

  // Security review (commit be737cd), Finding 2: shape/length alone let any
  // string through, including one that isn't a real gem - which broke the
  // opponent's remote rendering irrecoverably for the rest of the match.
  const notARealGem = await publishBoard([
    ['not-a-real-gem', ...Array(7).fill('red-square')],
    ...Array.from({ length: 7 }, () => Array(8).fill('red-square')),
  ]);
  assert.equal(notARealGem.status, 400);
  assert.equal(notARealGem.body.error, 'each board cell must be a real gem type, or null for an empty cell');
});

test('publish accepts every real gem type, and null for an empty cell', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());
  const created = await createViaHandler('Alice');
  const realGemRow = ['blue-teardrop', 'green-octagon', 'orange-hexagon', 'purple-triangle', 'red-square', 'silver-octagon', 'yellow-diamond', null];
  const board = [realGemRow, ...Array.from({ length: 7 }, () => Array(8).fill('red-square'))];

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'publish', code: created.session.code, playerName: 'Alice', board, score: 0 }),
    })
  );
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
});

test('publish rejects a non-finite, negative, or over-the-cap score with 400', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());
  const created = await createViaHandler('Alice');

  async function publishScore(score) {
    const res = await handler.fetch(
      new Request('https://x/api/magic-gems/session', {
        method: 'POST',
        body: JSON.stringify({ action: 'publish', code: created.session.code, playerName: 'Alice', board: validBoardFixture(), score }),
      })
    );
    return { status: res.status, body: await res.json() };
  }

  const negative = await publishScore(-1);
  assert.equal(negative.status, 400);
  assert.equal(negative.body.error, 'score must be a finite number between 0 and 1000000000');

  const nonNumber = await publishScore('lots');
  assert.equal(nonNumber.status, 400);

  const overCap = await publishScore(1e9 + 1);
  assert.equal(overCap.status, 400);
});

test('publish accepts a score exactly at the cap', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());
  const created = await createViaHandler('Alice');

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'publish', code: created.session.code, playerName: 'Alice', board: validBoardFixture(), score: 1e9 }),
    })
  );
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
});

test('a missing/misconfigured store surfaces a clear, handled 500 rather than hanging or crashing uncontrolled (E4)', async (t) => {
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
  assert.ok(body.error, 'expected a non-empty error message');
});

// Security review (commit 023dece), L2: an anonymous caller must never see
// internal failure detail (which can include the store's own error text) -
// but that detail must still be logged server-side, not silently dropped.
test('a 500 returns a generic client-facing message while logging the real detail server-side', async (t) => {
  withEnv(t, {});
  withFetch(t, fakeUpstash());
  const logCalls = [];
  const realConsoleError = console.error;
  console.error = (...args) => logCalls.push(args);
  t.after(() => {
    console.error = realConsoleError;
  });

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', hostName: 'Alice' }),
    })
  );
  const body = await res.json();

  assert.equal(res.status, 500);
  assert.equal(body.error, 'internal error');
  assert.equal(logCalls.length, 1, 'expected the real error to be logged exactly once server-side');
  assert.equal(logCalls[0][0], 'session function error:');
  const loggedText = logCalls[0].map(String).join(' ');
  assert.ok(/UPSTASH_REDIS_REST_URL|not configured/i.test(loggedText), loggedText);
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

// Security review (commit 023dece), M1: no server-side shape/length checks
// on hostName/playerName/code previously - the client's own maxlength
// attributes are UI-only and enforce nothing.
test('create rejects an oversized hostName with 400, never reaching the store', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  const fetchImpl = fakeUpstash();
  withFetch(t, fetchImpl);

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', hostName: 'A'.repeat(21) }),
    })
  );
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /hostName/i);
  assert.equal(fetchImpl.store.size, 0, 'expected the store to never be touched by a rejected request');
});

test('create rejects an empty or missing hostName with 400', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', { method: 'POST', body: JSON.stringify({ action: 'create' }) })
  );
  assert.equal(res.status, 400);
});

test('create rejects a non-string hostName with 400', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', hostName: 12345 }),
    })
  );
  assert.equal(res.status, 400);
});

test('create accepts a hostName at exactly the 1 and 20 character boundaries', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const short = await handler.fetch(
    new Request('https://x/api/magic-gems/session', { method: 'POST', body: JSON.stringify({ action: 'create', hostName: 'A' }) })
  );
  assert.equal(short.status, 200, 'expected a single-character name to be accepted');

  const long = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', hostName: 'A'.repeat(20) }),
    })
  );
  assert.equal(long.status, 200, 'expected exactly 20 characters to be accepted');
});

test('create rejects an exactly-empty-string hostName with 400 (not just missing/too-long)', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', { method: 'POST', body: JSON.stringify({ action: 'create', hostName: '' }) })
  );
  assert.equal(res.status, 400);
});

test('create rejects a hostName one character past the 20-character boundary', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', hostName: 'A'.repeat(21) }),
    })
  );
  assert.equal(res.status, 400);
});

test('join rejects a non-string code with 400 (not just a wrong-shape string)', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'join', code: 12345, playerName: 'Bob' }),
    })
  );
  assert.equal(res.status, 400);
});

test('join rejects a non-string code even when it would coerce to something matching the code pattern', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  // A single-element array's own default string coercion is just that one
  // element (no comma), so String(['AAAAAAAAAA']) === 'AAAAAAAAAA' - this
  // would slip past a pattern-only check that dropped its typeof guard,
  // unlike a plain number/boolean, whose string forms can never match
  // /^[A-Z]{10}$/ regardless of whether the guard runs.
  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'join', code: ['AAAAAAAAAA'], playerName: 'Bob' }),
    })
  );
  assert.equal(res.status, 400);
});

test('join rejects an oversized playerName with 400, never reaching the store', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  const fetchImpl = fakeUpstash();
  withFetch(t, fetchImpl);
  const created = await createViaHandler('Alice');

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'join', code: created.session.code, playerName: 'B'.repeat(21) }),
    })
  );
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /playerName/i);
  assert.deepEqual(JSON.parse(fetchImpl.store.get(sessionKey(created.session.code))).players, ['Alice']);
});

test('join rejects a malformed code (wrong shape) with 400, never reaching the store', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'join', code: 'not-a-real-code', playerName: 'Bob' }),
    })
  );
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /code/i);
});

test('GET rejects a malformed code (wrong shape) with 400', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  withFetch(t, fakeUpstash());

  const res = await handler.fetch(new Request('https://x/api/magic-gems/session?code=not-a-real-code'));
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /code/i);
});

// Security review (commit 023dece), M2: no per-caller throttle previously -
// every create/join/lookup cost a real store operation with no cap.
test('a caller past the per-IP rate limit is rejected with 429, never reaching the store', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  const fetchImpl = fakeUpstash();
  // Pre-fill this caller's own bucket to exactly the limit, so its next hit
  // is the one that tips over.
  fetchImpl.rateLimitCounts.set('magic-gems:ratelimit:9.9.9.9', RATE_LIMIT_MAX_REQUESTS);
  withFetch(t, fetchImpl);

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      headers: { 'x-forwarded-for': '9.9.9.9' },
      body: JSON.stringify({ action: 'create', hostName: 'Alice' }),
    })
  );
  const body = await res.json();

  assert.equal(res.status, 429);
  assert.ok(body.error, 'expected a descriptive error');
  assert.equal(fetchImpl.store.size, 0, 'expected the store to never be touched once rate-limited');
});

test('two different callers (by IP) are rate-limited independently', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  const fetchImpl = fakeUpstash();
  fetchImpl.rateLimitCounts.set('magic-gems:ratelimit:9.9.9.9', RATE_LIMIT_MAX_REQUESTS);
  withFetch(t, fetchImpl);

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      headers: { 'x-forwarded-for': '1.1.1.1' },
      body: JSON.stringify({ action: 'create', hostName: 'Alice' }),
    })
  );

  assert.equal(res.status, 200, 'a different caller must not inherit another IP\'s exhausted limit');
});

test('a caller whose x-forwarded-for has unusual but valid spacing is still correctly rate-limited by its own IP', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  const fetchImpl = fakeUpstash();
  // Pre-exhausts this caller's real IP address specifically - if it were
  // bucketed under some other, differently-formatted key instead, this
  // request would wrongly succeed instead of being turned away.
  fetchImpl.rateLimitCounts.set('magic-gems:ratelimit:2.2.2.2', RATE_LIMIT_MAX_REQUESTS);
  withFetch(t, fetchImpl);

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      // A space between the first address and its comma is unusual but
      // valid for this header.
      headers: { 'x-forwarded-for': '2.2.2.2 ,5.5.5.5' },
      body: JSON.stringify({ action: 'create', hostName: 'Alice' }),
    })
  );

  assert.equal(res.status, 429);
});

test('a caller with no x-forwarded-for header at all shares the "unknown" bucket', async (t) => {
  withEnv(t, CONFIGURED_ENV);
  const fetchImpl = fakeUpstash();
  fetchImpl.rateLimitCounts.set('magic-gems:ratelimit:unknown', RATE_LIMIT_MAX_REQUESTS);
  withFetch(t, fetchImpl);

  const res = await handler.fetch(
    new Request('https://x/api/magic-gems/session', {
      method: 'POST',
      body: JSON.stringify({ action: 'create', hostName: 'Alice' }),
    })
  );

  assert.equal(res.status, 429);
});
