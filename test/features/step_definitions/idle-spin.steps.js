import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { classifiedFrameGrid } from '../support/board-reader.js';
import { loadMagicGems } from '../../support/load-src.js';

// Reuse the real production frame count, not a hand-copied duplicate.
const { FRAME_COUNT } = loadMagicGems([new URL('../../../src/spin.js', import.meta.url)]);

const SHORT_REAL_INTERVAL_MS = 700;
const ONE_SECOND_MS = 1000;
// Generous upper bound on how many rotation frames a gem may advance through in
// ~1 real second and still count as "slow and gentle" (SPEC 9.1.1/9.3) - a fast
// whirl/flicker would blow past this easily; the deliberate pace this project
// ships with advances only a couple of frames in that window.
const MAX_MODEST_FRAME_ADVANCE = 6;

Then("the board's cells show more than one distinct rotation frame at the same moment", async function () {
  const grid = await classifiedFrameGrid(this.page);
  const frames = new Set(grid.flat().filter(Boolean).map((cell) => cell.frame));
  assert.ok(frames.size > 1, `expected more than one distinct rotation frame across the board at once, saw only: ${[...frames]}`);
});

Then('the gem at cell {int},{int} shows a different rotation frame after a short real interval', async function (row, col) {
  const before = await classifiedFrameGrid(this.page);
  await this.page.waitForTimeout(SHORT_REAL_INTERVAL_MS);
  const after = await classifiedFrameGrid(this.page);

  assert.equal(after[row][col].gemType, before[row][col].gemType, 'the gem identity itself must not change, only its rotation frame');
  assert.notEqual(
    after[row][col].frame,
    before[row][col].frame,
    `expected cell (${row},${col})'s rotation frame to change over ${SHORT_REAL_INTERVAL_MS}ms - it looks frozen at frame ${before[row][col].frame}`
  );
});

Then('the gem at cell {int},{int} advances through only a modest few rotation frames over a one-second interval', async function (row, col) {
  const before = await classifiedFrameGrid(this.page);
  await this.page.waitForTimeout(ONE_SECOND_MS);
  const after = await classifiedFrameGrid(this.page);

  const advanced = (after[row][col].frame - before[row][col].frame + FRAME_COUNT) % FRAME_COUNT;
  assert.ok(advanced >= 1, 'expected the gem to have advanced at least one frame over a full second - it looks frozen');
  assert.ok(
    advanced <= MAX_MODEST_FRAME_ADVANCE,
    `expected only a modest few frames advanced over ~1s (a slow, deliberate pace), saw ${advanced} frames - looks like a fast whirl`
  );
});
