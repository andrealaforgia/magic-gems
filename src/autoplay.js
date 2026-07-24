(function (global) {
  'use strict';

  const { findValidMove } = global.MagicGems;

  // Vertical before horizontal (matches this project's own keyboard-driven
  // cursor movement precedent) - a straight orthogonal path from one cell to
  // an adjacent-reachable one, expressed as the real arrow-key names.
  function pathKeys(from, to) {
    const keys = [];
    const verticalKey = to.row > from.row ? 'ArrowDown' : 'ArrowUp';
    for (let i = 0; i < Math.abs(to.row - from.row); i++) keys.push(verticalKey);
    const horizontalKey = to.col > from.col ? 'ArrowRight' : 'ArrowLeft';
    for (let i = 0; i < Math.abs(to.col - from.col); i++) keys.push(horizontalKey);
    return keys;
  }

  // findValidMove (resolution.js) only ever returns a pair in raster order - its
  // second cell is always directly below or directly right of the first - so
  // those are the only two directions this ever needs to distinguish.
  function directionKey(from, to) {
    return to.row > from.row ? 'ArrowDown' : 'ArrowRight';
  }

  // SPEC 12.2: emulates a player performing exactly one valid move from the
  // current cursor position - move to the gem, select it, aim at its orthogonal
  // partner, commit. Pure: returns the key sequence to play, one at a time, at
  // whatever pace the caller chooses; touches no DOM/game state itself.
  function planAutoplaySteps(board, cursor) {
    const move = findValidMove(board);
    if (!move) return [];
    return [...pathKeys(cursor, move.a), ' ', directionKey(move.a, move.b), ' '];
  }

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.planAutoplaySteps = planAutoplaySteps;
})(typeof window !== 'undefined' ? window : globalThis);
