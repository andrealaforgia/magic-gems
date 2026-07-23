import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hexToRgb, colorDistance, classifyColor } from '../support/pixel-utils.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const INDEX_HTML_URL = pathToFileURL(path.join(PROJECT_ROOT, 'index.html')).href;
const PROBE_HTML_URL = pathToFileURL(
  path.join(import.meta.dirname, '..', 'support', 'render-probe.html')
).href;

const BOARD_SIZE = 8;
const BACKGROUND_LUMA_CEILING = 30;

function classifyGem(rgb, palette) {
  return classifyColor(rgb, palette);
}

async function waitForBoardReady(page) {
  await page.waitForFunction(() => {
    const c = document.getElementById('board');
    return !!c && c.width > 0 && !!window.MagicGems;
  });
}

async function readCellPixels(page) {
  return page.evaluate(({ size }) => {
    const canvas = document.getElementById('board');
    const ctx = canvas.getContext('2d');
    const cellW = canvas.width / size;
    const cellH = canvas.height / size;
    const pixels = [];
    for (let row = 0; row < size; row++) {
      const rowPixels = [];
      for (let col = 0; col < size; col++) {
        const cx = Math.round(col * cellW + cellW / 2);
        const cy = Math.round(row * cellH + cellH / 2);
        const [r, g, b, a] = ctx.getImageData(cx, cy, 1, 1).data;
        rowPixels.push([r, g, b, a]);
      }
      pixels.push(rowPixels);
    }
    return { pixels, width: canvas.width, height: canvas.height, cellW, cellH };
  }, { size: BOARD_SIZE });
}

async function readGemPalette(page) {
  return page.evaluate(() => window.MagicGems.GEM_COLORS);
}

async function classifiedGrid(page) {
  const [{ pixels }, palette] = await Promise.all([readCellPixels(page), readGemPalette(page)]);
  return pixels.map((row) => row.map((rgba) => classifyGem(rgba, palette)));
}

function hasRunOf3(grid) {
  const size = grid.length;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size - 2; col++) {
      const g = grid[row][col];
      if (g && g === grid[row][col + 1] && g === grid[row][col + 2]) return true;
    }
  }
  for (let col = 0; col < size; col++) {
    for (let row = 0; row < size - 2; row++) {
      const g = grid[row][col];
      if (g && g === grid[row + 1][col] && g === grid[row + 2][col]) return true;
    }
  }
  return false;
}

async function countGridBlobs(page) {
  return page.evaluate(({ ceiling }) => {
    const canvas = document.getElementById('board');
    const ctx = canvas.getContext('2d');

    function countBlobs(data, length) {
      let blobs = 0;
      let inBlob = false;
      for (let i = 0; i < length; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const luma = (r + g + b) / 3;
        const isBackground = luma < ceiling;
        if (!isBackground && !inBlob) {
          blobs++;
          inBlob = true;
        }
        if (isBackground) inBlob = false;
      }
      return blobs;
    }

    // Sample away from cell (0,0): the cursor highlight ring always renders there by
    // default (B2), and its stroke would fragment that one cell into extra blobs.
    const cellGuess = canvas.width / 8;
    const rowY = Math.round(cellGuess * 3 + cellGuess / 2);
    const colX = Math.round(cellGuess * 3 + cellGuess / 2);

    const rowData = ctx.getImageData(0, rowY, canvas.width, 1).data;
    const colData = ctx.getImageData(colX, 0, 1, canvas.height).data;

    return {
      columns: countBlobs(rowData, canvas.width),
      rows: countBlobs(colData, canvas.height),
    };
  }, { ceiling: BACKGROUND_LUMA_CEILING });
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
  const { columns, rows } = await countGridBlobs(this.page);
  assert.equal(columns, BOARD_SIZE, `expected 8 columns, saw ${columns}`);
  assert.equal(rows, BOARD_SIZE, `expected 8 rows, saw ${rows}`);
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
  assert.ok(dx < viewport.width * 0.1, `canvas center x off by ${dx}px`);
  assert.ok(dy < viewport.height * 0.1, `canvas center y off by ${dy}px`);
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
  assert.equal(hasRunOf3(grid), false, 'found a pre-existing match of 3+');
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

Then('it is rendered as a {string} filled with its own distinct colour', async function (shape) {
  const { core, palette, gemType } = await this.page.evaluate((gem) => {
    const canvas = document.getElementById('probe');
    const ctx = canvas.getContext('2d');
    const [r, g, b] = ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
    return { core: [r, g, b], palette: window.MagicGems.GEM_COLORS, gemType: gem };
  }, this.probeGemType);

  const expectedRgb = hexToRgb(palette[gemType]);
  assert.ok(
    colorDistance(core, expectedRgb) < 20,
    `centre pixel colour ${core} does not match ${gemType}'s own colour ${expectedRgb}`
  );
  assert.ok(['triangle', 'square', 'circle', 'diamond'].includes(shape));
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

  const glowThreshold = backgroundLuma + (maxLuma - backgroundLuma) * 0.1;
  const coreThreshold = backgroundLuma + (maxLuma - backgroundLuma) * 0.85;

  let glowStart = -1;
  let coreStart = -1;
  for (let i = rightHalf.length - 1; i >= 0; i--) {
    if (glowStart === -1 && rightHalf[i] > glowThreshold) glowStart = i;
    if (rightHalf[i] > coreThreshold) coreStart = i;
  }

  assert.ok(glowStart !== -1 && coreStart !== -1, 'could not locate gem edge in probe render');
  const fadeSpan = glowStart - coreStart;
  assert.ok(
    fadeSpan >= 6,
    `expected a multi-pixel glow fade (>=6px), measured ${fadeSpan}px — looks like a flat cutoff`
  );
});
