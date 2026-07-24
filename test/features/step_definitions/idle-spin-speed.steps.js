import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { classifiedFrameGrid } from '../support/board-reader.js';
import { loadMagicGems } from '../../support/load-src.js';

// Reuse the real production timing constants, not a hand-copied duplicate.
const { FRAME_COUNT, FRAME_DURATION_MS } = loadMagicGems([new URL('../../../src/spin.js', import.meta.url)]);

const ROTATION_WAIT_MS = FRAME_DURATION_MS * FRAME_COUNT; // one target full rotation
// Generous allowance for real scheduling/event-loop jitter around a single
// requestAnimationFrame-driven interval, expressed in frames rather than a raw ms
// bound so it scales with whatever FRAME_DURATION_MS is currently tuned to.
const FRAME_JITTER_TOLERANCE = 3;

Then('the gem at cell {int},{int} completes roughly one full rotation every 1.5 seconds', async function (row, col) {
  const before = await classifiedFrameGrid(this.page);
  const t0 = Date.now();
  await this.page.waitForTimeout(ROTATION_WAIT_MS);
  const after = await classifiedFrameGrid(this.page);
  const elapsedMs = Date.now() - t0;

  const observedAdvance = (after[row][col].frame - before[row][col].frame + FRAME_COUNT) % FRAME_COUNT;
  const expectedAdvance = (elapsedMs / FRAME_DURATION_MS) % FRAME_COUNT;
  const rawDiff = Math.abs(observedAdvance - expectedAdvance);
  const wrappedDiff = Math.min(rawDiff, FRAME_COUNT - rawDiff);

  assert.ok(
    wrappedDiff <= FRAME_JITTER_TOLERANCE,
    `expected roughly ${expectedAdvance.toFixed(1)} frames advanced for a ~${ROTATION_WAIT_MS}ms rotation, observed ${observedAdvance} - pace looks off`
  );
});
