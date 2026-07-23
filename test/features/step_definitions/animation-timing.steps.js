import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { classifiedGrid } from '../support/board-reader.js';
import { findHighlight } from './interaction.steps.js';
import { loadMagicGems } from '../../support/load-src.js';

const { hasMatch, applySwap } = loadMagicGems([
  new URL('../../../src/gems.js', import.meta.url),
  new URL('../../../src/board.js', import.meta.url),
  new URL('../../../src/resolution.js', import.meta.url),
]);

function findAdjacentSwap(grid, wantMatch) {
  const size = grid.length;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (col + 1 < size) {
        const a = { row, col };
        const b = { row, col: col + 1 };
        if (hasMatch(applySwap(grid, a, b)) === wantMatch) return { a, b };
      }
      if (row + 1 < size) {
        const a = { row, col };
        const b = { row: row + 1, col };
        if (hasMatch(applySwap(grid, a, b)) === wantMatch) return { a, b };
      }
    }
  }
  throw new Error(`could not find an adjacent swap on the live board with wantMatch=${wantMatch}`);
}

function directionKey(from, to) {
  if (to.row === from.row + 1) return 'ArrowDown';
  if (to.row === from.row - 1) return 'ArrowUp';
  if (to.col === from.col + 1) return 'ArrowRight';
  if (to.col === from.col - 1) return 'ArrowLeft';
  throw new Error(`cells are not orthogonally adjacent: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
}

async function moveCursorTo(page, from, to) {
  const verticalKey = to.row > from.row ? 'ArrowDown' : 'ArrowUp';
  for (let i = 0; i < Math.abs(to.row - from.row); i++) await page.keyboard.press(verticalKey);
  const horizontalKey = to.col > from.col ? 'ArrowRight' : 'ArrowLeft';
  for (let i = 0; i < Math.abs(to.col - from.col); i++) await page.keyboard.press(horizontalKey);
}

async function pressSwap(page, a, b) {
  const [cursor] = await findHighlight(page, 'cursor');
  await moveCursorTo(page, cursor, a);
  await page.keyboard.press(' ');
  await page.keyboard.press(directionKey(a, b));
}

Then('the shatter fragments originate only from the cells the live commit actually cleared', { timeout: 10000 }, async function () {
  // A multi-step cascade spawns fragments at different real times (one cascade
  // phase per step), so a single snapshot can miss earlier steps' fragments that
  // already fell off-screen or later steps' that haven't spawned yet. Accumulate
  // origin cells (tagged at spawn time, immune to position drift) across the
  // whole cascade instead of sampling once. The expected set is read from the
  // live page's own committed step log (its refills are real random draws, so
  // independently recomputing the cascade would use different randomness and
  // could disagree on any step past the first).
  const originCells = await this.page.evaluate(() => new Promise((resolve) => {
    const seen = new Set();
    function tick() {
      for (const f of window.MagicGems.getActiveFragments()) {
        seen.add(`${f.originRow},${f.originCol}`);
      }
      if (window.MagicGems.isAnimating() || window.MagicGems.getActiveFragments().length > 0) {
        requestAnimationFrame(tick);
      } else {
        resolve([...seen]);
      }
    }
    tick();
  }));
  const expectedClearedCells = await this.page.evaluate(() =>
    window.MagicGems.getLastCommitSteps()
      .flatMap((s) => s.clearEvents)
      .map((e) => `${e.row},${e.col}`)
  );
  assert.ok(expectedClearedCells.length > 0, 'sanity: the committed swap must actually produce at least one cleared cell');
  assert.deepEqual(new Set(originCells), new Set(expectedClearedCells), 'fragment origin cells must exactly match the cells the live game actually cleared');
});

When('I commit that swap and time how long the visual swap phase takes', async function () {
  const { a, b } = this.foundSwap;
  await pressSwap(this.page, a, b);
  const t0 = Date.now();
  await this.page.keyboard.press(' ');
  await this.page.waitForFunction(
    () => window.MagicGems.getAnimationPhase() !== 'swap',
    null,
    { timeout: 3000 }
  );
  this.swapPhaseDurationMs = Date.now() - t0;
});

Then('the visual swap phase took at least {int} ms', function (ms) {
  assert.ok(
    this.swapPhaseDurationMs >= ms,
    `expected the visual swap to take at least ${ms}ms, took ${this.swapPhaseDurationMs}ms`
  );
});

When('I commit that swap and time how long the board takes to settle after the swap', async function () {
  const { a, b } = this.foundSwap;
  await pressSwap(this.page, a, b);
  await this.page.keyboard.press(' ');
  await this.page.waitForFunction(
    () => window.MagicGems.getAnimationPhase() === 'cascade',
    null,
    { timeout: 3000 }
  );
  const t0 = Date.now();
  await this.page.waitForFunction(
    () => window.MagicGems.getAnimationPhase() !== 'cascade',
    null,
    { timeout: 5000 }
  );
  this.cascadeDurationMs = Date.now() - t0;
});

Then('the board took at least {int} ms to settle after the swap', function (ms) {
  assert.ok(
    this.cascadeDurationMs >= ms,
    `expected the fall/refill settling to take at least ${ms}ms, took ${this.cascadeDurationMs}ms`
  );
});

When('I commit that swap and watch whether fragments appear before the swap phase ends', async function () {
  const { a, b } = this.foundSwap;
  await pressSwap(this.page, a, b);
  await this.page.keyboard.press(' ');
  this.fragmentsAppearedDuringSwap = await this.page.evaluate(() => new Promise((resolve) => {
    function check() {
      if (window.MagicGems.getAnimationPhase() !== 'swap') {
        resolve(false);
        return;
      }
      if (window.MagicGems.getActiveFragments().length > 0) {
        resolve(true);
        return;
      }
      requestAnimationFrame(check);
    }
    check();
  }));
});

Then('no fragments appeared before the swap phase ended', function () {
  assert.equal(
    this.fragmentsAppearedDuringSwap,
    false,
    'fragments appeared while the swap was still visually in progress, before the match resolved'
  );
});

When('I commit {int} matching swaps in a row, each settling before the next', { timeout: 30000 }, async function (rounds) {
  this.allRoundsSettledValid = true;
  for (let i = 0; i < rounds; i++) {
    const grid = await classifiedGrid(this.page);
    const { a, b } = findAdjacentSwap(grid, true);
    await pressSwap(this.page, a, b);
    await this.page.keyboard.press(' ');
    await this.page.waitForFunction(
      () => window.MagicGems.getActiveFragments().length === 0 && !window.MagicGems.isAnimating(),
      null,
      { timeout: 5000 }
    );
    const settledGrid = await classifiedGrid(this.page);
    const noMatch = hasMatch(settledGrid) === false;
    const fullyPopulated = settledGrid.every((row) => row.every((cell) => cell !== null));
    this.allRoundsSettledValid = this.allRoundsSettledValid && noMatch && fullyPopulated;
  }
});

Then('every round settled into a valid, match-free, fully-populated board', function () {
  assert.equal(this.allRoundsSettledValid, true, 'at least one round left an unresolved match or an empty/unrecognizable cell');
});
