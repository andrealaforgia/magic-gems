(function (global) {
  'use strict';

  const FRAGMENT_COUNT = 8;
  const LATERAL_SPEED_RANGE = 60; // px/sec, spread either side of straight down
  const MIN_FALL_SPEED = 20; // px/sec downward at the moment of the break
  const FALL_SPEED_RANGE = 40; // px/sec, added on top of MIN_FALL_SPEED
  const GRAVITY_ACCEL = 300; // px/sec^2

  function createFragments(centerX, centerY, color) {
    const fragments = [];
    for (let i = 0; i < FRAGMENT_COUNT; i++) {
      fragments.push({
        x: centerX,
        y: centerY,
        vx: (Math.random() * 2 - 1) * LATERAL_SPEED_RANGE,
        vy: MIN_FALL_SPEED + Math.random() * FALL_SPEED_RANGE,
        color,
      });
    }
    return fragments;
  }

  function updateFragments(fragments, dtSeconds) {
    return fragments.map((f) => {
      const vy = f.vy + GRAVITY_ACCEL * dtSeconds;
      return {
        ...f,
        x: f.x + f.vx * dtSeconds,
        y: f.y + vy * dtSeconds,
        vy,
      };
    });
  }

  function pruneOffscreen(fragments, boundaryY) {
    return fragments.filter((f) => f.y <= boundaryY);
  }

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.createFragments = createFragments;
  global.MagicGems.updateFragments = updateFragments;
  global.MagicGems.pruneOffscreen = pruneOffscreen;
})(typeof window !== 'undefined' ? window : globalThis);
