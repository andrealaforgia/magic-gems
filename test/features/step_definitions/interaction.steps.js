import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { classifyColor } from '../support/pixel-utils.js';

const BOARD_SIZE = 8;

async function readHighlightGrid(page) {
  return page.evaluate(({ size }) => {
    const canvas = document.getElementById('board');
    const ctx = canvas.getContext('2d');
    const cellSize = canvas.width / size;
    const inset = window.MagicGems.HIGHLIGHT_RING_INSET;
    const samples = [];
    for (let row = 0; row < size; row++) {
      const rowSamples = [];
      for (let col = 0; col < size; col++) {
        const x = Math.round(col * cellSize + inset);
        const y = Math.round(row * cellSize + cellSize / 2);
        const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
        rowSamples.push([r, g, b]);
      }
      samples.push(rowSamples);
    }
    return { samples, palette: window.MagicGems.HIGHLIGHT_COLORS };
  }, { size: BOARD_SIZE });
}

async function findHighlight(page, type) {
  const { samples, palette } = await readHighlightGrid(page);
  const found = [];
  for (let row = 0; row < samples.length; row++) {
    for (let col = 0; col < samples[row].length; col++) {
      if (classifyColor(samples[row][col], palette) === type) {
        found.push({ row, col });
      }
    }
  }
  return found;
}

async function readClassifiedGrid(page) {
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
        const [r, g, b] = ctx.getImageData(cx, cy, 1, 1).data;
        rowPixels.push([r, g, b]);
      }
      pixels.push(rowPixels);
    }
    return { pixels, palette: window.MagicGems.GEM_COLORS };
  }, { size: BOARD_SIZE }).then(({ pixels, palette }) =>
    pixels.map((row) => row.map((rgb) => classifyColor(rgb, palette)))
  );
}

When('I press {string}', async function (key) {
  await this.page.keyboard.press(key);
});

Given('I record the classified gem grid', async function () {
  this.recordedGemGrid = await readClassifiedGrid(this.page);
});

Then('the classified gem grid is unchanged from the recorded one', async function () {
  const current = await readClassifiedGrid(this.page);
  assert.deepEqual(current, this.recordedGemGrid, 'the board gems changed during interaction');
});

Then('the cursor highlight is at cell {int},{int}', async function (row, col) {
  const found = await findHighlight(this.page, 'cursor');
  assert.equal(found.length, 1, `expected exactly one cursor highlight, found ${found.length}`);
  assert.deepEqual(found[0], { row, col }, `cursor highlight at ${JSON.stringify(found[0])}, expected {row:${row},col:${col}}`);
});

Then('the selection highlight is at cell {int},{int}', async function (row, col) {
  const found = await findHighlight(this.page, 'selection');
  assert.equal(found.length, 1, `expected exactly one selection highlight, found ${found.length}`);
  assert.deepEqual(found[0], { row, col });
});

Then('the target highlight is at cell {int},{int}', async function (row, col) {
  const found = await findHighlight(this.page, 'target');
  assert.equal(found.length, 1, `expected exactly one target highlight, found ${found.length}`);
  assert.deepEqual(found[0], { row, col });
});

Then('no target highlight is present', async function () {
  const found = await findHighlight(this.page, 'target');
  assert.equal(found.length, 0, `expected no target highlight, found ${found.length}`);
});

Then('no selection or target highlight is present', async function () {
  const selection = await findHighlight(this.page, 'selection');
  const target = await findHighlight(this.page, 'target');
  assert.equal(selection.length, 0, 'expected no selection highlight');
  assert.equal(target.length, 0, 'expected no target highlight');
});

Then('the selection highlight colour is distinct from the cursor highlight colour', async function () {
  const { palette } = await readHighlightGrid(this.page);
  assert.notEqual(palette.selection, palette.cursor);
});

Then('the target highlight colour is distinct from both the cursor and selection highlight colours', async function () {
  const { palette } = await readHighlightGrid(this.page);
  assert.notEqual(palette.target, palette.cursor);
  assert.notEqual(palette.target, palette.selection);
});
