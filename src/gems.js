(function (global) {
  'use strict';

  const GEM_TYPES = Object.freeze([
    'blue-teardrop',
    'green-octagon',
    'orange-hexagon',
    'purple-triangle',
    'red-square',
    'silver-octagon',
    'yellow-diamond',
  ]);

  // Approximate average colour of each gem's sprite art. Gems themselves render
  // from the sprite images (see render.js), not these colours; this palette only
  // tints the shatter fragments (shatter.js/main.js) to roughly match.
  const GEM_COLORS = Object.freeze({
    'blue-teardrop': '#218ec2',
    'green-octagon': '#3ab722',
    'orange-hexagon': '#bb6312',
    'purple-triangle': '#a712a7',
    'red-square': '#c72129',
    'silver-octagon': '#a2a2a2',
    'yellow-diamond': '#a8a818',
  });

  global.MagicGems = global.MagicGems || {};
  global.MagicGems.GEM_TYPES = GEM_TYPES;
  global.MagicGems.GEM_COLORS = GEM_COLORS;
})(typeof window !== 'undefined' ? window : globalThis);
