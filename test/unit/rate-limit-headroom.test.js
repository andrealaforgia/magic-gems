import { test } from 'node:test';
import assert from 'node:assert';
import { loadMagicGems } from '../support/load-src.js';
import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_SECONDS } from '../../api/magic-gems/session.mjs';

// Security review (commit 7b43738): the rate limit was originally tuned
// without checking it against the client's own already-shipped polling rate,
// and ended up BELOW it - silently stalling a real host's "waiting for a
// second player" screen. Ties the constants together directly so a future
// change to any of them that reintroduces the conflict fails this test,
// rather than only surfacing live.
//
// Security review (commit be737cd), Finding 3: fixing that once wasn't
// enough - MP4 added its own publish traffic on top of the same client's
// polling, pushing the REAL combined rate back over the limit.
//
// QA review (commit 827ac6f): summing two specific named constants was the
// same fix pattern applied a second time, not a generalized one - a third
// traffic source could be added later without anyone remembering to update
// this test. Sums SESSION_CLIENT_INTERVALS_MS generically instead, so any
// future addition to that array is automatically covered.
const { SESSION_CLIENT_INTERVALS_MS } = loadMagicGems([new URL('../../src/session-api-client.js', import.meta.url)]);

test('the client\'s real combined traffic across every one of its own session intervals stays comfortably under the server\'s own rate limit', () => {
  const combinedPerWindow = SESSION_CLIENT_INTERVALS_MS.reduce(
    (sum, intervalMs) => sum + (RATE_LIMIT_WINDOW_SECONDS * 1000) / intervalMs,
    0
  );
  assert.ok(
    combinedPerWindow * 2 <= RATE_LIMIT_MAX_REQUESTS,
    `expected at least 2x headroom: client's combined traffic is ${combinedPerWindow}/window, limit is ${RATE_LIMIT_MAX_REQUESTS}/window`
  );
});
