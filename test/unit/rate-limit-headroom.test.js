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
// polling, pushing the REAL combined rate back over the limit. Checks the
// sum of both, not polling alone, so this specific class of regression can't
// silently reintroduce itself in either direction again.
const { SESSION_POLL_INTERVAL_MS, SESSION_PUBLISH_INTERVAL_MS } = loadMagicGems([
  new URL('../../src/session-api-client.js', import.meta.url),
]);

test('the client\'s real combined poll+publish rate stays comfortably under the server\'s own rate limit', () => {
  const pollsPerWindow = (RATE_LIMIT_WINDOW_SECONDS * 1000) / SESSION_POLL_INTERVAL_MS;
  const publishesPerWindow = (RATE_LIMIT_WINDOW_SECONDS * 1000) / SESSION_PUBLISH_INTERVAL_MS;
  const combinedPerWindow = pollsPerWindow + publishesPerWindow;
  assert.ok(
    combinedPerWindow * 2 <= RATE_LIMIT_MAX_REQUESTS,
    `expected at least 2x headroom: client's combined poll+publish is ${combinedPerWindow}/window, limit is ${RATE_LIMIT_MAX_REQUESTS}/window`
  );
});
