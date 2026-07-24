import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { VIEWPORT_CENTER_TOLERANCE_RATIO, BACKGROUND_LUMA_CEILING } from '../support/pixel-utils.js';
import { waitForBoardReady, classifiedGrid } from '../support/board-reader.js';
import { loadMagicGems } from '../../support/load-src.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const INDEX_HTML_URL = pathToFileURL(path.join(PROJECT_ROOT, 'index.html')).href;

const BOARD_SIZE = 8;

// Reuse the real production match-detection algorithm (not a hand-rolled
// reimplementation) against the classified grid read from live canvas pixels.
const { hasMatch } = loadMagicGems([
  new URL('../../../src/gems.js', import.meta.url),
  new URL('../../../src/board.js', import.meta.url),
]);

// Verifying "8x8 grid" by scanning a full row/column of pixels for blob boundaries
// turns out to be structurally fragile: a highlight ring can sit anywhere depending
// on interaction state, and no fixed pixel margin around it reliably separates its
// own antialiasing fringe from a genuine, narrow inter-cell background gap without
// either missing the fringe or swallowing real cell boundaries (verified
// empirically: this broke at more than one board size). Rather than either scanning
// a whole line (fragile) or trusting divisibility alone (not independently
// empirical), this samples one targeted midpoint between two assumed-adjacent cell
// centres — at row/col index 3, far from the default cursor ring at cell (0,0) — and
// confirms it reads as background. That's a real, structural signal that two
// distinct cells actually exist there, not an assumption, while staying immune to
// the highlight-overlap problem since it never samples near cell (0,0)'s edges.
async function measureGridDimensions(page) {
  const SAFE_INDEX = 3;
  const [{ width, height, midpointLumas }, grid] = await Promise.all([
    page.evaluate(({ size, safeIndex }) => {
      const canvas = document.getElementById('board');
      const ctx = canvas.getContext('2d');
      const cellSize = canvas.width / size;
      const cellCenter = safeIndex * cellSize + cellSize / 2;
      const nextCenter = (safeIndex + 1) * cellSize + cellSize / 2;
      const midpoint = Math.round((cellCenter + nextCenter) / 2);
      const horizontal = ctx.getImageData(midpoint, Math.round(cellCenter), 1, 1).data;
      const vertical = ctx.getImageData(Math.round(cellCenter), midpoint, 1, 1).data;
      const luma = ([r, g, b]) => (r + g + b) / 3;
      return {
        width: canvas.width,
        height: canvas.height,
        midpointLumas: { horizontal: luma(horizontal), vertical: luma(vertical) },
      };
    }, { size: BOARD_SIZE, safeIndex: SAFE_INDEX }),
    classifiedGrid(page),
  ]);
  return {
    isSquare: width === height,
    evenlyDivisible: width % BOARD_SIZE === 0,
    allCellsClassified: grid.every((row) => row.every((gem) => gem !== null)),
    hasHorizontalGap: midpointLumas.horizontal < BACKGROUND_LUMA_CEILING,
    hasVerticalGap: midpointLumas.vertical < BACKGROUND_LUMA_CEILING,
  };
}

Given('I open {string} directly as a file:\\/\\/ URL with no server or build step', async function (_file) {
  await this.page.goto(INDEX_HTML_URL);
  await waitForBoardReady(this.page);
});

When('I open {string} again as a fresh file:\\/\\/ page load', async function (_file) {
  this.previousGrid = await classifiedGrid(this.page);
  await this.page.reload();
  await waitForBoardReady(this.page);
});

Then('the page renders an HTML5 canvas element for the board', async function () {
  const tagName = await this.page.evaluate(
    () => document.getElementById('board')?.tagName
  );
  assert.equal(tagName, 'CANVAS');
});

Then('no console errors were raised while loading', function () {
  assert.deepEqual(this.consoleErrors, []);
});

Then('the canvas represents an 8 by 8 grid of 64 cells', async function () {
  const { isSquare, evenlyDivisible, allCellsClassified, hasHorizontalGap, hasVerticalGap } =
    await measureGridDimensions(this.page);
  assert.ok(isSquare, 'canvas is not square');
  assert.ok(evenlyDivisible, 'canvas width is not evenly divisible into 8 whole-pixel cells');
  assert.ok(allCellsClassified, 'not every one of the 64 assumed cell positions holds a recognizable gem');
  assert.ok(hasHorizontalGap, 'no background gap found between two assumed-adjacent cells horizontally');
  assert.ok(hasVerticalGap, 'no background gap found between two assumed-adjacent cells vertically');
});

Then('the canvas is positioned in the central part of the viewport', async function () {
  const rect = await this.page.evaluate(() =>
    document.getElementById('board').getBoundingClientRect()
  );
  const viewport = this.page.viewportSize();
  const canvasCenter = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const viewportCenter = { x: viewport.width / 2, y: viewport.height / 2 };
  const dx = Math.abs(canvasCenter.x - viewportCenter.x);
  const dy = Math.abs(canvasCenter.y - viewportCenter.y);
  assert.ok(dx < viewport.width * VIEWPORT_CENTER_TOLERANCE_RATIO, `canvas center x off by ${dx}px`);
  assert.ok(dy < viewport.height * VIEWPORT_CENTER_TOLERANCE_RATIO, `canvas center y off by ${dy}px`);
});

Then('all 64 cells contain exactly one recognizable gem colour each', async function () {
  const grid = await classifiedGrid(this.page);
  for (const row of grid) {
    for (const gem of row) {
      assert.ok(gem !== null, 'found a cell that is empty/unrecognizable');
    }
  }
});

Then("the board's 64 cells show gem colours that map to all seven known gem types", async function () {
  const grid = await classifiedGrid(this.page);
  const seen = new Set(grid.flat());
  assert.equal(seen.size, 7, `expected 7 distinct gem types, saw ${seen.size}: ${[...seen]}`);
});

Then('the board contains no horizontal or vertical run of 3 or more identical gems', async function () {
  const grid = await classifiedGrid(this.page);
  assert.equal(hasMatch(grid), false, 'found a pre-existing match of 3+');
});

Then('the new arrangement differs from the previous one', async function () {
  const grid = await classifiedGrid(this.page);
  assert.notDeepEqual(grid, this.previousGrid, 'reload produced an identical arrangement');
});
