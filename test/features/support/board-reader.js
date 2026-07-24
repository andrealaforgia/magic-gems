import { classifyColor } from './pixel-utils.js';

const BOARD_SIZE = 8;

export async function waitForBoardReady(page) {
  await page.waitForFunction(() => {
    const c = document.getElementById('board');
    const sprites = window.MagicGems && window.MagicGems.getSpriteImages && window.MagicGems.getSpriteImages();
    return !!c && c.width > 0 && !!sprites;
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

// The gem body is real sprite art, not a flat fill colour (SG1), so there's no
// palette constant to read - it renders each gem type through the live page's own
// drawGem/loaded sprites, at the board's real cell size, and samples what actually
// comes out. That's the true on-screen colour, not a guess at one.
export async function readGemPalette(page) {
  return page.evaluate(({ size }) => {
    const { GEM_TYPES, drawGem, getSpriteImages } = window.MagicGems;
    const canvas = document.getElementById('board');
    const cellSize = canvas.width / size;
    const sprites = getSpriteImages();
    const probe = document.createElement('canvas');
    probe.width = cellSize;
    probe.height = cellSize;
    const ctx = probe.getContext('2d');
    const half = Math.floor(cellSize / 2);
    const palette = {};
    for (const gemType of GEM_TYPES) {
      ctx.clearRect(0, 0, cellSize, cellSize);
      drawGem(ctx, gemType, cellSize / 2, cellSize / 2, cellSize, sprites);
      const [r, g, b] = ctx.getImageData(half, half, 1, 1).data;
      palette[gemType] = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    }
    return palette;
  }, { size: BOARD_SIZE });
}

export async function classifiedGrid(page) {
  const [{ pixels }, palette] = await Promise.all([readCellPixels(page), readGemPalette(page)]);
  return pixels.map((row) => row.map((rgba) => classifyColor(rgba, palette)));
}
