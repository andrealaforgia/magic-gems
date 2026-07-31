import { test } from 'node:test';
import assert from 'node:assert';
import { loadMagicGems } from '../support/load-src.js';

// QA review (commit 5d7de4c): a fast, deterministic test at the client
// boundary - the E2E scenario (mp4.feature) proves this same wire shape
// against a real running match, but that's the only test exercising this
// code path, and it's slow and coupled to real autoplay timing. This proves
// the same guarantee (does sendSnapshot build the right request body) near-
// instantly, with synthetic cursor/selection state and no real network call.
function fakeFetch(capturedRequests) {
  return async (url, options) => {
    capturedRequests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };
}

test('sendSnapshot posts the board, score, sequence, cursor, selection, target, and cursorPath in one request body', async () => {
  const capturedRequests = [];
  const { createRestSessionClient } = loadMagicGems([new URL('../../src/session-api-client.js', import.meta.url)], {
    fetchImpl: fakeFetch(capturedRequests),
  });
  const client = createRestSessionClient();
  const board = [['red-square']];
  const cursor = { row: 2, col: 5 };
  const selection = { row: 1, col: 5 };
  const target = { row: 1, col: 6 };
  const cursorPath = [{ row: 2, col: 4, dtMs: 0, moveSeq: 0 }, { row: 2, col: 5, dtMs: 180, moveSeq: 1 }];

  await client.sendSnapshot('ABCDEFGHIJ', 'Alice', board, 120, 3, cursor, selection, target, cursorPath);

  assert.equal(capturedRequests.length, 1);
  assert.deepEqual(capturedRequests[0].body, {
    action: 'snapshot',
    code: 'ABCDEFGHIJ',
    playerName: 'Alice',
    board,
    score: 120,
    sequence: 3,
    cursor,
    selection,
    target,
    cursorPath,
  });
});

test('sendSnapshot posts a null selection and a null target as-is, not fabricating a cell', async () => {
  const capturedRequests = [];
  const { createRestSessionClient } = loadMagicGems([new URL('../../src/session-api-client.js', import.meta.url)], {
    fetchImpl: fakeFetch(capturedRequests),
  });
  const client = createRestSessionClient();

  await client.sendSnapshot('ABCDEFGHIJ', 'Alice', [['red-square']], 0, 0, { row: 0, col: 0 }, null, null, []);

  assert.equal(capturedRequests[0].body.selection, null);
  assert.equal(capturedRequests[0].body.target, null);
});

test('sendSnapshot posts an empty cursorPath as-is when the cursor has not moved since the last send', async () => {
  const capturedRequests = [];
  const { createRestSessionClient } = loadMagicGems([new URL('../../src/session-api-client.js', import.meta.url)], {
    fetchImpl: fakeFetch(capturedRequests),
  });
  const client = createRestSessionClient();

  await client.sendSnapshot('ABCDEFGHIJ', 'Alice', [['red-square']], 0, 0, { row: 0, col: 0 }, null, null, []);

  assert.deepEqual(capturedRequests[0].body.cursorPath, []);
});
