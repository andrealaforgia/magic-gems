import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  hexToRgb,
  colorDistance,
  classifyShape,
  OWN_COLOR_MATCH_TOLERANCE,
  VIEWPORT_CENTER_TOLERANCE_RATIO,
  GLOW_EDGE_LUMA_FRACTION,
  CORE_EDGE_LUMA_FRACTION,
  MIN_GLOW_FADE_SPAN_PX,
} from '../support/pixel-utils.js';
import { waitForBoardReady, classifiedGrid } from '../support/board-reader.js';
import { loadMagicGems } from '../../support/load-src.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const INDEX_HTML_URL = pathToFileURL(path.join(PROJECT_ROOT, 'index.html')).href;
const PROBE_HTML_URL = pathToFileURL(
  path.join(import.meta.dirname, '..', 'support', 'render-probe.html')
).href;

const BOARD_SIZE = 8;

// Reuse the real production match-detection algorithm (not a hand-rolled
// reimplementation) against the classified grid read from live canvas pixels.
const { hasMatch } = loadMagicGems([
  new URL('../../../src/gems.js', import.meta.url),
  new URL('../../../src/board.js', import.meta.url),
]);

// Verifying "8x8 grid" by scanning a row/column of pixels for blob boundaries turns
// out to be structurally fragile: a highlight ring can sit anywhere depending on
// interaction state, and no fixed pixel margin around it reliably separates its own
// antialiasing fringe from a genuine, narrow inter-cell background gap without either
// missing the fringe or swallowing real cell boundaries (verified empirically: this
// broke at more than one board size). A highlight ring is always drawn inset from a
// cell's edges and never reaches its exact centre, so instead this reuses the
// per-cell-centre classification already relied on elsewhere (readCellPixels/
// classifiedGrid) — those samples are structurally immune to any highlight overlay —
// combined with a highlight-immune dimension check (square canvas, evenly divisible
// into 8 whole-pixel cells, per SPEC 3.1's fixed, non-configurable grid size).
async function measureGridDimensions(page) {
  const [{ width, height }, grid] = await Promise.all([
    page.evaluate(() => {
      const canvas = document.getElementById('board');
      return { width: canvas.width, height: canvas.height };
    }),
    classifiedGrid(page),
  ]);
  return {
    isSquare: width === height,
    evenlyDivisible: width % BOARD_SIZE === 0,
    allCellsClassified: grid.every((row) => row.every((gem) => gem !== null)),
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
  const { isSquare, evenlyDivisible, allCellsClassified } = await measureGridDimensions(this.page);
  assert.ok(isSquare, 'canvas is not square');
  assert.ok(evenlyDivisible, 'canvas width is not evenly divisible into 8 whole-pixel cells');
  assert.ok(allCellsClassified, 'not every one of the 64 assumed cell positions holds a recognizable gem');
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

Then("the board's 64 cells show gem colours that map to all six known gem types", async function () {
  const grid = await classifiedGrid(this.page);
  const seen = new Set(grid.flat());
  assert.equal(seen.size, 6, `expected 6 distinct gem types, saw ${seen.size}: ${[...seen]}`);
});

Then('the board contains no horizontal or vertical run of 3 or more identical gems', async function () {
  const grid = await classifiedGrid(this.page);
  assert.equal(hasMatch(grid), false, 'found a pre-existing match of 3+');
});

Then('the new arrangement differs from the previous one', async function () {
  const grid = await classifiedGrid(this.page);
  assert.notDeepEqual(grid, this.previousGrid, 'reload produced an identical arrangement');
});

Given('a single {string} gem is drawn in isolation', async function (gemType) {
  await this.page.goto(PROBE_HTML_URL);
  await this.page.waitForFunction(() => typeof window.__drawSingleGem === 'function');
  await this.page.evaluate((gem) => window.__drawSingleGem(gem, 64), gemType);
  this.probeGemType = gemType;
});

// Same 3 offsets classifyShape queries, in the same order, so pre-fetching every
// sample from the real canvas and feeding them back sequentially reproduces exactly
// what classifyShape would see live (it may short-circuit before using them all).
const SHAPE_PROBE_OFFSET_RATIOS = [
  [0.6, 0],
  [0.75, 0.75],
  [0, -0.97],
];

Then('it is rendered as a {string} filled with its own distinct colour', async function (expectedShape) {
  const { core, alphaSamples, palette, gemType, r } = await this.page.evaluate(
    ({ gem, offsetRatios }) => {
      const canvas = document.getElementById('probe');
      const ctx = canvas.getContext('2d');
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const radius = 64 * 0.3; // matches render.js's GEM_RADIUS_RATIO at cellSize=64
      const alphaAt = (dx, dy) =>
        ctx.getImageData(Math.round(cx + dx), Math.round(cy + dy), 1, 1).data[3];
      const [r, g, b] = ctx.getImageData(cx, cy, 1, 1).data;
      return {
        core: [r, g, b],
        alphaSamples: offsetRatios.map(([rx, ry]) => alphaAt(rx * radius, ry * radius)),
        palette: window.MagicGems.GEM_COLORS,
        gemType: gem,
        r: radius,
      };
    },
    { gem: this.probeGemType, offsetRatios: SHAPE_PROBE_OFFSET_RATIOS }
  );

  const expectedRgb = hexToRgb(palette[gemType]);
  assert.ok(
    colorDistance(core, expectedRgb) < OWN_COLOR_MATCH_TOLERANCE,
    `centre pixel colour ${core} does not match ${gemType}'s own colour ${expectedRgb}`
  );

  let nextSample = 0;
  const actualShape = classifyShape(() => alphaSamples[nextSample++], r);
  assert.equal(
    actualShape,
    expectedShape,
    `sampled shape geometry for ${gemType} looks like a ${actualShape}, expected ${expectedShape}`
  );
});

Then('a soft glow halo fades outward from its edge, not a flat cutoff', async function () {
  const row = await this.page.evaluate(() => {
    const canvas = document.getElementById('probe');
    const ctx = canvas.getContext('2d');
    const y = Math.round(canvas.height / 2);
    const data = ctx.getImageData(0, y, canvas.width, 1).data;
    const luma = [];
    for (let x = 0; x < canvas.width; x++) {
      luma.push((data[x * 4] + data[x * 4 + 1] + data[x * 4 + 2]) / 3);
    }
    return luma;
  });

  const mid = Math.floor(row.length / 2);
  const rightHalf = row.slice(mid);
  const maxLuma = Math.max(...rightHalf);
  const backgroundLuma = row[row.length - 1];

  const glowThreshold = backgroundLuma + (maxLuma - backgroundLuma) * GLOW_EDGE_LUMA_FRACTION;
  const coreThreshold = backgroundLuma + (maxLuma - backgroundLuma) * CORE_EDGE_LUMA_FRACTION;

  let glowStart = -1;
  let coreStart = -1;
  for (let i = rightHalf.length - 1; i >= 0; i--) {
    if (glowStart === -1 && rightHalf[i] > glowThreshold) glowStart = i;
    if (rightHalf[i] > coreThreshold) coreStart = i;
  }

  assert.ok(glowStart !== -1 && coreStart !== -1, 'could not locate gem edge in probe render');
  const fadeSpan = glowStart - coreStart;
  assert.ok(
    fadeSpan >= MIN_GLOW_FADE_SPAN_PX,
    `expected a multi-pixel glow fade (>=${MIN_GLOW_FADE_SPAN_PX}px), measured ${fadeSpan}px — looks like a flat cutoff`
  );
});
