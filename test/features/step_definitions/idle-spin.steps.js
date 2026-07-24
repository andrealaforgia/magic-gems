import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { classifiedFrameGrid } from '../support/board-reader.js';

const SHORT_REAL_INTERVAL_MS = 700;

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
