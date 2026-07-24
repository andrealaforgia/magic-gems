(function (global) {
  'use strict';

  function multiplierFraction(multiplier, maxMultiplier) {
    return Math.max(0, Math.min(1, multiplier / maxMultiplier));
  }

  // Hue runs 0 (red, empty) -> 120 (green, full), linearly with fraction, so the
  // colour shifts smoothly through the full spectrum in between rather than
  // jumping between two fixed tones (SPEC 10.8).
  function multiplierBarColor(fraction) {
    const clamped = Math.max(0, Math.min(1, fraction));
    const hue = 120 * clamped;
    return `hsl(${hue}, 70%, 45%)`;
  }

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.multiplierFraction = multiplierFraction;
  global.MagicGems.multiplierBarColor = multiplierBarColor;
})(typeof window !== 'undefined' ? window : globalThis);
