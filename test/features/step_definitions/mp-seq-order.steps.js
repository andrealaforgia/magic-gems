import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { HELD_UPDATE_TIMEOUT_MS } from '../../../api/magic-gems/_session-logic.mjs';
import { findAdjacentSwap, directionKey, moveCursorTo } from './mp3.steps.js';

const BOARD_SIZE = 8;
function makeBoard(fill) {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(fill));
}

// SPEC 13.4.1/13.4.2: deliberately engineers out-of-order/dropped delivery by
// injecting a real, hand-crafted request directly against this same live
// match's own session - over the same real wire (and the same context-level
// mock, installSessionApiMock) the first page's own genuine sends already
// used earlier in the scenario, rather than a hand-narrated fake. Reuses the
// code/playerName captured by mp4.steps.js's own "I record the first page's
// own sent snapshot payloads" step, from that page's first genuine send.
When(
  'the first page injects a crafted snapshot with sequence {int}, board fill {string}, and score {int}',
  async function (sequence, fill, score) {
    assert.ok(
      this.sentSnapshotPayloads && this.sentSnapshotPayloads.length > 0,
      'expected at least one genuine sent snapshot to have been recorded first, to borrow its code/playerName'
    );
    const { code, playerName } = this.sentSnapshotPayloads[0];
    const board = makeBoard(fill);
    this.lastInjectedSnapshotResult = await this.pageA.evaluate(
      async ({ code, playerName, sequence, board, score }) => {
        const res = await fetch('/api/magic-gems/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'snapshot',
            code,
            playerName,
            board,
            score,
            sequence,
            cursor: { row: 0, col: 0 },
            selection: null,
          }),
        });
        return res.json();
      },
      { code, playerName, sequence, board, score }
    );
  }
);

// MP-SEQ-HARDEN/SPEC 13.4.1-13.4.4 (hardening, ahead of slice 3), E1/E6: the
// forged-sequence attack must be refused outright, never merely queued -
// distinguishes this from "held" in the very same response shape E2 hardens.
Then('the injected snapshot is refused, not accepted', function () {
  assert.ok(this.lastInjectedSnapshotResult, 'expected a previously injected snapshot response to check');
  assert.equal(
    this.lastInjectedSnapshotResult.ok,
    false,
    `expected the forged snapshot to be refused, got ${JSON.stringify(this.lastInjectedSnapshotResult)}`
  );
});

Then('the injected snapshot is accepted, not refused', function () {
  assert.ok(this.lastInjectedSnapshotResult, 'expected a previously injected snapshot response to check');
  assert.equal(
    this.lastInjectedSnapshotResult.ok,
    true,
    `expected the snapshot to be accepted, got ${JSON.stringify(this.lastInjectedSnapshotResult)}`
  );
});

// MP-SEQ-HARDEN (reopened): a real, controlled elapsed-time gap between
// rounds of the repeated-attack proof - not incidental test overhead, so the
// margin against the production ceiling (anchored to real elapsed time) is
// deliberate and legible rather than accidental.
Given('a real {int} second delay passes', async function (seconds) {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
});

Given("I record the second page's own remote board and score", async function () {
  this.recordedRemote = await this.pageB.evaluate(() => ({
    board: window.MagicGems.getMatchRemoteBoard(),
    score: window.MagicGems.getMatchRemoteScore(),
  }));
});

// Deliberately shorter than HELD_UPDATE_TIMEOUT_MS (the server's own bounded
// wait, SPEC 13.4.2) - a wait long enough that ordinary polling would have
// picked up a wrongly-applied out-of-order update if the ordering guarantee
// (13.4.1) didn't hold, but short enough that a legitimate skip-ahead
// recovery could never fire first and mask the very defect this proves.
const SUSTAINED_UNCHANGED_WAIT_MS = Math.floor(HELD_UPDATE_TIMEOUT_MS * 0.7);

// QA review (commit de091f3): a single check at the end of the wait left
// only a slim margin against the production timeout under CI load, and
// couldn't have caught a change that happened and then (coincidentally)
// reverted before that one check. Samples throughout the window instead, so
// every poll cycle in range gets its own chance to catch a wrongly-applied
// out-of-order update, not just the last one.
Then("the second page's remote match board and score stay unchanged from what was recorded, for a sustained period", async function () {
  assert.ok(this.recordedRemote, 'expected a previously recorded remote board/score to compare against');
  const deadline = Date.now() + SUSTAINED_UNCHANGED_WAIT_MS;
  do {
    const current = await this.pageB.evaluate(() => ({
      board: window.MagicGems.getMatchRemoteBoard(),
      score: window.MagicGems.getMatchRemoteScore(),
    }));
    assert.deepEqual(
      current.board,
      this.recordedRemote.board,
      'expected the remote board to stay at the last in-order update, never jumping ahead of a held predecessor'
    );
    assert.equal(
      current.score,
      this.recordedRemote.score,
      'expected the remote score to stay at the last in-order update, never jumping ahead of a held predecessor'
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
  } while (Date.now() < deadline);
});

Then(
  "the second page's remote match board and score eventually show board fill {string} and score {int}",
  { timeout: HELD_UPDATE_TIMEOUT_MS + 15000 },
  async function (fill, score) {
    const expectedBoard = makeBoard(fill);
    const deadline = Date.now() + HELD_UPDATE_TIMEOUT_MS + 10000;
    let current;
    do {
      current = await this.pageB.evaluate(() => ({
        board: window.MagicGems.getMatchRemoteBoard(),
        score: window.MagicGems.getMatchRemoteScore(),
      }));
      if (JSON.stringify(current.board) === JSON.stringify(expectedBoard) && current.score === score) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    } while (Date.now() < deadline);

    assert.deepEqual(current.board, expectedBoard, `expected the remote board to end up showing fill "${fill}", got ${JSON.stringify(current.board[0])}`);
    assert.equal(current.score, score, `expected the remote score to end up at ${score}, got ${current.score}`);
  }
);

Then('no error or failure state is shown on either page', async function () {
  assert.deepEqual(this.consoleErrors, [], 'expected no console errors on the first page from the skip-ahead recovery');
  const [visibleA, visibleB] = await Promise.all([
    this.pageA.evaluate(() => !document.getElementById('match').hidden),
    this.pageB.evaluate(() => !document.getElementById('match').hidden),
  ]);
  assert.ok(visibleA, 'expected the first page to still show its match view, not an error/exit screen');
  assert.ok(visibleB, 'expected the second page to still show its match view, not an error/exit screen');
});

Then("the first page can still make a fresh move that increases its own local score", async function () {
  const before = await this.pageA.evaluate(() => window.MagicGems.getMatchScore());
  const grid = await this.pageA.evaluate(() => window.MagicGems.getMatchBoard());
  const { a, b } = findAdjacentSwap(grid, true);
  const { cursor } = await this.pageA.evaluate(() => window.MagicGems.getMatchInteractionState());

  await moveCursorTo(this.pageA, cursor, a);
  await this.pageA.keyboard.press(' ');
  await this.pageA.keyboard.press(directionKey(a, b));
  await this.pageA.keyboard.press(' ');

  await this.pageA.waitForFunction((baseline) => window.MagicGems.getMatchScore() > baseline, before, { timeout: 5000 });
  const after = await this.pageA.evaluate(() => window.MagicGems.getMatchScore());
  assert.ok(after > before, `expected local play to still work after the skip-ahead recovery: was ${before}, now ${after}`);
});
