import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { VIEWPORT_CENTER_TOLERANCE_RATIO } from '../support/pixel-utils.js';
import { waitForBoardReady, classifiedGrid } from '../support/board-reader.js';
import { loadMagicGems } from '../../support/load-src.js';
import { findHighlight } from './interaction.steps.js';

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
// own antialiasing fringe from a genuine cell boundary without either missing the
// fringe or swallowing real boundaries (verified empirically: this broke at more
// than one board size). Rather than scanning a whole line (fragile) or trusting
// divisibility alone (not independently empirical), this samples one cell and its
// right/below neighbours' own corners and confirms each neighbour's colour differs
// from it. Every orthogonally-adjacent pair of cells alternates between two
// distinct checkerboard shades (SPEC 3.5), so two real, distinct cells existing
// there shows up directly as two different sampled colours - a structural signal,
// not an assumption. Cursor/selection/target can highlight any cell depending on
// interaction state (not just a fixed default), so the pair sampled is picked
// dynamically to dodge whichever cells currently show a highlight ring, rather than
// assuming a fixed "safe" index (QA warning, commit 3c8f3b5).
async function measureGridDimensions(page) {
  const [cursor, selection, target] = await Promise.all([
    findHighlight(page, 'cursor'),
    findHighlight(page, 'selection'),
    findHighlight(page, 'target'),
  ]);
  const highlighted = new Set([...cursor, ...selection, ...target].map(({ row, col }) => `${row},${col}`));
  const isHighlighted = (row, col) => highlighted.has(`${row},${col}`);

  let horizontalPair = null;
  let verticalPair = null;
  for (let row = 0; row < BOARD_SIZE && (!horizontalPair || !verticalPair); row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (isHighlighted(row, col)) continue;
      if (!horizontalPair && col + 1 < BOARD_SIZE && !isHighlighted(row, col + 1)) {
        horizontalPair = { row, col };
      }
      if (!verticalPair && row + 1 < BOARD_SIZE && !isHighlighted(row + 1, col)) {
        verticalPair = { row, col };
      }
    }
  }
  if (!horizontalPair || !verticalPair) {
    throw new Error('could not find an unhighlighted adjacent cell pair to sample');
  }

  const [{ width, height, distinctNeighbours }, grid] = await Promise.all([
    page.evaluate(({ size, horizontalPair, verticalPair }) => {
      const canvas = document.getElementById('board');
      const ctx = canvas.getContext('2d');
      const cellSize = canvas.width / size;
      // A couple of pixels in from each cell's own top-left corner - reliably
      // outside the centred gem sprite (which leaves a margin of its own on every
      // side), so this reads the cell's checkerboard background specifically, not
      // whichever gem type happens to be sitting on it (two adjacent cells could
      // otherwise coincidentally hold the same gem type and same-colour by chance).
      const cornerOf = (row, col) => [col * cellSize + 2, row * cellSize + 2];
      const sample = ([x, y]) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data);
      const differs = (a, b) => a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2];
      return {
        width: canvas.width,
        height: canvas.height,
        distinctNeighbours: {
          horizontal: differs(
            sample(cornerOf(horizontalPair.row, horizontalPair.col)),
            sample(cornerOf(horizontalPair.row, horizontalPair.col + 1))
          ),
          vertical: differs(
            sample(cornerOf(verticalPair.row, verticalPair.col)),
            sample(cornerOf(verticalPair.row + 1, verticalPair.col))
          ),
        },
      };
    }, { size: BOARD_SIZE, horizontalPair, verticalPair }),
    classifiedGrid(page),
  ]);
  return {
    isSquare: width === height,
    evenlyDivisible: width % BOARD_SIZE === 0,
    allCellsClassified: grid.every((row) => row.every((gem) => gem !== null)),
    hasDistinctHorizontalNeighbour: distinctNeighbours.horizontal,
    hasDistinctVerticalNeighbour: distinctNeighbours.vertical,
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
  const { isSquare, evenlyDivisible, allCellsClassified, hasDistinctHorizontalNeighbour, hasDistinctVerticalNeighbour } =
    await measureGridDimensions(this.page);
  assert.ok(isSquare, 'canvas is not square');
  assert.ok(evenlyDivisible, 'canvas width is not evenly divisible into 8 whole-pixel cells');
  assert.ok(allCellsClassified, 'not every one of the 64 assumed cell positions holds a recognizable gem');
  assert.ok(hasDistinctHorizontalNeighbour, 'the assumed-adjacent cell to the right shows the same colour, not a distinct cell');
  assert.ok(hasDistinctVerticalNeighbour, 'the assumed-adjacent cell below shows the same colour, not a distinct cell');
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
