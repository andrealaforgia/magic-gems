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

// The gem body is real sprite art, not a flat fill colour (SG1), and now
// continuously rotates through its own frames (SG2) - a single reference colour per
// gem type is no longer enough, since a spinning gem's own colour visibly shifts as
// it turns. So this renders every gem type at every one of its rotation frames
// through the live page's own drawGem/loaded sprites, at the board's real cell
// size, and samples what actually comes out - a live cell's pixel will always land
// near its true type's *some* frame, whichever the animation happens to be showing.
// Palette keys are "<gemType>#<frame>"; classifiedGrid strips the frame back off,
// since callers only care about identity, not which instant of the spin they caught.
export async function readGemPalette(page) {
  return page.evaluate(({ size }) => {
    const { GEM_TYPES, FRAME_COUNT, drawGem, getSpriteImages } = window.MagicGems;
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
      for (let frame = 0; frame < FRAME_COUNT; frame++) {
        ctx.clearRect(0, 0, cellSize, cellSize);
        drawGem(ctx, gemType, cellSize / 2, cellSize / 2, cellSize, sprites, frame);
        const [r, g, b] = ctx.getImageData(half, half, 1, 1).data;
        palette[`${gemType}#${frame}`] = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
      }
    }
    return palette;
  }, { size: BOARD_SIZE });
}

export async function classifiedGrid(page) {
  const [{ pixels }, palette] = await Promise.all([readCellPixels(page), readGemPalette(page)]);
  return pixels.map((row) =>
    row.map((rgba) => {
      const key = classifyColor(rgba, palette);
      return key ? key.split('#')[0] : null;
    })
  );
}

// Same real-pixel classification as classifiedGrid, but keeps the decoded rotation
// frame instead of discarding it - lets a test observe which point in its spin each
// cell's gem is actually showing right now, read straight from the render, not from
// the animation's own internal clock.
export async function classifiedFrameGrid(page) {
  const [{ pixels }, palette] = await Promise.all([readCellPixels(page), readGemPalette(page)]);
  return pixels.map((row) =>
    row.map((rgba) => {
      const key = classifyColor(rgba, palette);
      if (!key) return null;
      const [gemType, frame] = key.split('#');
      return { gemType, frame: Number(frame) };
    })
  );
}
