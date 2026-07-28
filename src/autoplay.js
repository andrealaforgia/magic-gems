(function (global) {
  'use strict';

  const { findAllValidMoves } = global.MagicGems;

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

  // SPEC 12.2/12.5: emulates a player performing exactly one valid move from
  // the current cursor position - move to the gem, select it, aim at its
  // orthogonal partner, commit. AUTOPLAY-RANDOM-CHOICE: picked uniformly at
  // random among ALL currently-available valid moves (not always the
  // raster-order-first one), so two independent autoplay runs from the same
  // board don't mirror each other. Pure: returns the key sequence to play,
  // one at a time, at whatever pace the caller chooses; touches no DOM/game
  // state itself.
  //
  // MP4-FIX class of bug, reincarnated and caught before landing: during a
  // match, the ambient Math.random IS the session-seeded generator driving
  // real refills (SPEC 13.3.1) - drawing this move choice from it too would
  // intersperse extra draws the opponent's own replica (which only ever
  // advances its mirrored seeded stream via actually-replayed moves) never
  // makes, permanently desyncing every refill from that point on. randomFn
  // defaults to Math.random for single-player (never seeded) but the match
  // closure passes its own independent, never-swapped cosmeticRandom instead
  // - the same seam already established for shatter-fragment velocities.
  function planAutoplaySteps(board, cursor, randomFn = Math.random) {
    const moves = findAllValidMoves(board);
    if (moves.length === 0) return [];
    const move = moves[Math.floor(randomFn() * moves.length)];
    return [...pathKeys(cursor, move.a), ' ', directionKey(move.a, move.b), ' '];
  }

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.planAutoplaySteps = planAutoplaySteps;
})(typeof window !== 'undefined' ? window : globalThis);
