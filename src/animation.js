(function (global) {
  'use strict';

  function clampProgress(elapsedMs, durationMs) {
    if (durationMs <= 0) return 1;
    return Math.max(0, Math.min(1, elapsedMs / durationMs));
  }

  function lerp(from, to, progress) {
    return from + (to - from) * progress;
  }

  function interpolatePoint(fromX, fromY, toX, toY, progress) {
    return { x: lerp(fromX, toX, progress), y: lerp(fromY, toY, progress) };
  }

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.clampProgress = clampProgress;
  global.MagicGems.lerp = lerp;
  global.MagicGems.interpolatePoint = interpolatePoint;
})(typeof window !== 'undefined' ? window : globalThis);
