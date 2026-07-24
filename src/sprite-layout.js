(function (global) {
  'use strict';

  // How much of a cell a gem sprite fills, leaving a small margin so adjacent
  // sprites never visually touch (SPEC 3.3, 3.4).
  const GEM_SPRITE_FIT_RATIO = 0.86;

  function computeSpriteDrawRect(imgWidth, imgHeight, cx, cy, cellSize, fitRatio) {
    const box = cellSize * fitRatio;
    const scale = Math.min(box / imgWidth, box / imgHeight);
    const width = imgWidth * scale;
    const height = imgHeight * scale;
    return { x: cx - width / 2, y: cy - height / 2, width, height };
  }

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.GEM_SPRITE_FIT_RATIO = GEM_SPRITE_FIT_RATIO;
  global.MagicGems.computeSpriteDrawRect = computeSpriteDrawRect;
})(typeof window !== 'undefined' ? window : globalThis);
