import { classifyColor } from './pixel-utils.js';

const BOARD_SIZE = 8;

export async function waitForBoardReady(page) {
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

export async function classifiedGrid(page) {
  const [{ pixels }, palette] = await Promise.all([readCellPixels(page), readGemPalette(page)]);
  return pixels.map((row) => row.map((rgba) => classifyColor(rgba, palette)));
}
