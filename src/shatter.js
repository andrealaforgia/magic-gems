(function (global) {
  'use strict';

  const FRAGMENT_COUNT = 8;
  const LATERAL_SPEED_RANGE = 60; // px/sec, spread either side of straight down
  const MIN_FALL_SPEED = 20; // px/sec downward at the moment of the break
  const FALL_SPEED_RANGE = 40; // px/sec, added on top of MIN_FALL_SPEED
  const GRAVITY_ACCEL = 300; // px/sec^2

  // How the shattered gem's own sprite is diced into FRAGMENT_COUNT pieces: a
  // gapless, non-overlapping grid (4x2 = 8) over its full bounding box, so every
  // pixel of the source art ends up in exactly one fragment (SPEC 9.2.2 - fragments
  // read as pieces of the gem's own sprite, not an unrelated flat colour).
  const FRAGMENT_GRID_COLS = 4;
  const FRAGMENT_GRID_ROWS = 2;

  function computeSourceTile(index, imgWidth, imgHeight) {
    const col = index % FRAGMENT_GRID_COLS;
    const row = Math.floor(index / FRAGMENT_GRID_COLS);
    const tileWidth = imgWidth / FRAGMENT_GRID_COLS;
    const tileHeight = imgHeight / FRAGMENT_GRID_ROWS;
    return { sx: col * tileWidth, sy: row * tileHeight, sw: tileWidth, sh: tileHeight };
  }

  // randomFn is injectable (defaulting to the ambient Math.random, unchanged
  // for single-player) so a caller whose Math.random is temporarily swapped
  // for deterministic replay purposes (MP4-MOVES) can route these purely
  // cosmetic draws through a separate, non-deterministic source instead -
  // see main.js's own cosmeticRandom for why that separation matters.
  function createFragments(centerX, centerY, randomFn = Math.random) {
    const fragments = [];
    for (let i = 0; i < FRAGMENT_COUNT; i++) {
      fragments.push({
        x: centerX,
        y: centerY,
        vx: (randomFn() * 2 - 1) * LATERAL_SPEED_RANGE,
        vy: MIN_FALL_SPEED + randomFn() * FALL_SPEED_RANGE,
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
  global.MagicGems.computeSourceTile = computeSourceTile;
})(typeof window !== 'undefined' ? window : globalThis);
