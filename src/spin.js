(function (global) {
  'use strict';

  // Matches the shipped rotation sequence (frame-00..14.png per identity).
  const FRAME_COUNT = 15;
  // A lively idle turn - roughly one full rotation every 1.5 seconds (SPEC 9.1.1)
  // - deliberately decoupled from the slower transition pace of SPEC 9.3.
  const FRAME_DURATION_MS = 100;

  // Coprime-ish multipliers spread each cell's starting point across the cycle so
  // neighbouring cells rarely land on the same frame at the same moment (SPEC
  // 9.1.1: gems read as out of phase with one another, not lockstep).
  const ROW_PHASE_STEP = 5;
  const COL_PHASE_STEP = 3;

  function phaseOffsetFrames(row, col) {
    return (row * ROW_PHASE_STEP + col * COL_PHASE_STEP) % FRAME_COUNT;
  }

  function currentFrameIndex(elapsedMs, row, col) {
    const ticks = Math.floor(elapsedMs / FRAME_DURATION_MS);
    return (ticks + phaseOffsetFrames(row, col)) % FRAME_COUNT;
  }

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.FRAME_COUNT = FRAME_COUNT;
  global.MagicGems.FRAME_DURATION_MS = FRAME_DURATION_MS;
  global.MagicGems.phaseOffsetFrames = phaseOffsetFrames;
  global.MagicGems.currentFrameIndex = currentFrameIndex;
})(typeof window !== 'undefined' ? window : globalThis);
