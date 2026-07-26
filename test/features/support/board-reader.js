import { classifyColor, CLASSIFY_TOLERANCE } from './pixel-utils.js';

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

// AUTOPLAY-LEGALITY: cross-checks the ACTUAL RENDERED PIXELS (what a player
// really sees) against the logical board at the exact same instant - the one
// layer neither a pure-logic check nor a sound-cue check can catch. Returns
// null while genuinely animating (rendered/logical legitimately differ
// mid-transition, by design) or the list of any mismatched cells otherwise.
//
// Deliberately a SINGLE synchronous page.evaluate, not two separate
// round-trips (e.g. classifiedGrid + a separate board read) - two round
// trips can straddle the game's own live ticking in between them, producing
// a spurious "mismatch" that's really just two reads of two different
// instants, not a real bug. window.MagicGems.getBoard() and .isAnimating()
// are single-player-only observability seams (this check is scoped to
// single-player, matching AUTOPLAY-LEGALITY's own acceptance).
export async function renderedVsLogicalMismatches(page, palette, tolerance = CLASSIFY_TOLERANCE) {
  return page.evaluate(
    ({ paletteArg, toleranceArg, size }) => {
      if (window.MagicGems.isAnimating()) return null;
      function hexToRgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
      function colorDistance([r1, g1, b1], [r2, g2, b2]) {
        return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
      }
      function classify(rgb) {
        let best = null;
        let bestDist = Infinity;
        for (const [key, hex] of Object.entries(paletteArg)) {
          const d = colorDistance(rgb, hexToRgb(hex));
          if (d < bestDist) {
            bestDist = d;
            best = key;
          }
        }
        return bestDist < toleranceArg ? best : null;
      }
      const board = window.MagicGems.getBoard();
      const canvas = document.getElementById('board');
      const ctx = canvas.getContext('2d');
      const cellW = canvas.width / size;
      const cellH = canvas.height / size;
      const mismatches = [];
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          const cx = Math.round(col * cellW + cellW / 2);
          const cy = Math.round(row * cellH + cellH / 2);
          const [r, g, b] = ctx.getImageData(cx, cy, 1, 1).data;
          const rendered = classify([r, g, b]);
          if (rendered !== board[row][col]) {
            mismatches.push({ row, col, logical: board[row][col], rendered });
          }
        }
      }
      return mismatches;
    },
    { paletteArg: palette, toleranceArg: tolerance, size: BOARD_SIZE }
  );
}
