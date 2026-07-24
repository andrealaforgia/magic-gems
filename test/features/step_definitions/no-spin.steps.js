import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

const BOARD_SIZE = 8;
const SAMPLE_COUNT = 3;
const SAMPLE_INTERVAL_MS = 200;

async function readCellPixel(page, row, col) {
  return page.evaluate(
    ({ row, col, size }) => {
      const canvas = document.getElementById('board');
      const ctx = canvas.getContext('2d');
      const cellSize = canvas.width / size;
      const cx = Math.round(col * cellSize + cellSize / 2);
      const cy = Math.round(row * cellSize + cellSize / 2);
      return Array.from(ctx.getImageData(cx, cy, 1, 1).data);
    },
    { row, col, size: BOARD_SIZE }
  );
}

async function readBoardPixels(page) {
  return page.evaluate(({ size }) => {
    const canvas = document.getElementById('board');
    const ctx = canvas.getContext('2d');
    const cellSize = canvas.width / size;
    const grid = [];
    for (let row = 0; row < size; row++) {
      const rowPixels = [];
      for (let col = 0; col < size; col++) {
        const cx = Math.round(col * cellSize + cellSize / 2);
        const cy = Math.round(row * cellSize + cellSize / 2);
        rowPixels.push(Array.from(ctx.getImageData(cx, cy, 1, 1).data));
      }
      grid.push(rowPixels);
    }
    return grid;
  }, { size: BOARD_SIZE });
}

Then('the gem at cell {int},{int} shows an identical appearance across repeated samples over a real interval', async function (row, col) {
  const first = await readCellPixel(this.page, row, col);
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    await this.page.waitForTimeout(SAMPLE_INTERVAL_MS);
    const next = await readCellPixel(this.page, row, col);
    assert.deepEqual(
      next,
      first,
      `expected cell (${row},${col}) to stay visually identical while at rest - changed on sample ${i + 1}`
    );
  }
});

Then('every cell on the board shows an identical appearance across repeated samples over a real interval', async function () {
  const before = await readBoardPixels(this.page);
  await this.page.waitForTimeout(SAMPLE_INTERVAL_MS * SAMPLE_COUNT);
  const after = await readBoardPixels(this.page);
  assert.deepEqual(
    after,
    before,
    'expected the entire resting board to stay pixel-identical over a real interval - found a change somewhere'
  );
});
