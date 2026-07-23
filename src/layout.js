(function (global) {
  'use strict';

  const VIEWPORT_HEIGHT_RATIO = 0.8;

  function computeCellSize(viewportWidth, viewportHeight, boardSize) {
    const targetBoardSize = Math.min(viewportHeight * VIEWPORT_HEIGHT_RATIO, viewportWidth);
    return Math.floor(targetBoardSize / boardSize);
  }

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.computeCellSize = computeCellSize;
})(typeof window !== 'undefined' ? window : globalThis);
