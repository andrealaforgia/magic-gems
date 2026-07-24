(function (global) {
  'use strict';

  // Matches the shipped rotation sequence (frame-00..14.png per identity).
  const FRAME_COUNT = 15;
  // How many full rotations the one-off revive highlight spins through before
  // settling (SPEC 8.3.1) - chosen so progress=1 lands exactly back on frame 0,
  // the same static face every other gem rests on.
  const REVIVE_SPIN_ROTATIONS = 2;

  function reviveSpinFrameIndex(progress) {
    const totalSteps = FRAME_COUNT * REVIVE_SPIN_ROTATIONS;
    const clamped = Math.max(0, Math.min(1, progress));
    return Math.floor(clamped * totalSteps) % FRAME_COUNT;
  }

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.FRAME_COUNT = FRAME_COUNT;
  global.MagicGems.reviveSpinFrameIndex = reviveSpinFrameIndex;
})(typeof window !== 'undefined' ? window : globalThis);
