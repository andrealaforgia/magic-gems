import { test } from 'node:test';
import assert from 'node:assert';
import { loadMagicGems } from '../support/load-src.js';
import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_SECONDS } from '../../api/magic-gems/session.mjs';

// Security review (commit 7b43738): the rate limit was originally tuned
// without checking it against the client's own already-shipped polling rate,
// and ended up BELOW it - silently stalling a real host's "waiting for a
// second player" screen. Ties the two constants together directly so a
// future change to either one that reintroduces the conflict fails this
// test, rather than only surfacing live.
const { SESSION_POLL_INTERVAL_MS } = loadMagicGems([new URL('../../src/session-api-client.js', import.meta.url)]);

test('the client\'s real polling rate stays comfortably under the server\'s own rate limit', () => {
  const pollsPerWindow = (RATE_LIMIT_WINDOW_SECONDS * 1000) / SESSION_POLL_INTERVAL_MS;
  assert.ok(
    pollsPerWindow * 2 <= RATE_LIMIT_MAX_REQUESTS,
    `expected at least 2x headroom: client polls ${pollsPerWindow}/window, limit is ${RATE_LIMIT_MAX_REQUESTS}/window`
  );
});
