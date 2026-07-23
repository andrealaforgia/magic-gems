import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { classifiedGrid } from '../support/board-reader.js';
import { loadMagicGems } from '../../support/load-src.js';

const BOARD_SIZE = 8;

const { hasMatch, applySwap } = loadMagicGems([
  new URL('../../../src/gems.js', import.meta.url),
  new URL('../../../src/board.js', import.meta.url),
  new URL('../../../src/resolution.js', import.meta.url),
]);

// A 3x3 Latin square: at exactly match-length wide/tall, a run of 3 needs all 3
// cells in a row/column to match, which no single swap of this fixture can produce
// (see test/unit/resolution.test.js for the full proof). Verified directly against
// hasMatch/hasAnyValidMove before being relied on here.
const STUCK_BOARD = [
  ['purple-triangle', 'red-square', 'green-circle'],
  ['red-square', 'green-circle', 'purple-triangle'],
  ['green-circle', 'purple-triangle', 'red-square'],
];

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

Given('I locate an adjacent swap that would produce a match on the live board', async function () {
  const grid = await classifiedGrid(this.page);
  this.foundSwap = findAdjacentSwap(grid, true);
});

Given('I locate an adjacent swap that would not produce a match on the live board', async function () {
  const grid = await classifiedGrid(this.page);
  this.foundSwap = findAdjacentSwap(grid, false);
});

When('I commit that swap', async function () {
  const { a, b } = this.foundSwap;
  const cursor = this.currentCursor ?? { row: 0, col: 0 };

  await moveCursorTo(this.page, cursor, a);
  await this.page.keyboard.press(' ');
  await this.page.keyboard.press(directionKey(a, b));
  await this.page.keyboard.press(' ');

  this.currentCursor = a;
});

Then('the page shows no score or counter element', async function () {
  const visibleElementCount = await this.page.evaluate(
    () => document.body.querySelectorAll(':not(script)').length
  );
  const bodyText = await this.page.evaluate(() => document.body.innerText.trim());
  assert.equal(visibleElementCount, 1, 'expected only the canvas as a visible element in the page body');
  assert.equal(bodyText, '', 'expected no visible text (a score/counter) anywhere on the page');
});

When('I apply the live page\'s own ensurePlayable to a known stuck board', async function () {
  this.reshuffledResult = await this.page.evaluate(
    (stuckBoard) => window.MagicGems.ensurePlayable(stuckBoard),
    STUCK_BOARD
  );
});

Then('the reshuffled result has no pre-existing match', async function () {
  const result = await this.page.evaluate(
    (board) => window.MagicGems.hasMatch(board),
    this.reshuffledResult
  );
  assert.equal(result, false);
});

Then('the reshuffled result has at least one valid move', async function () {
  const result = await this.page.evaluate(
    (board) => window.MagicGems.hasAnyValidMove(board),
    this.reshuffledResult
  );
  assert.equal(result, true);
});
